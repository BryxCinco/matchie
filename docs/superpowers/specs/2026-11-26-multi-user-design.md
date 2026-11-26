# Multi-user Matchie (Approach A) — design

Date: 2026-11-26. Status: draft for approval.

## Intent

Matchie is a portfolio prototype. Today the app is single-user: one owner
account, sign-ups off in Supabase Auth, and every worker hard-wired to one
`MATCHIE_USER_ID`. The goal is to let a handful of invited people (friends,
recruiters looking at the portfolio) create their own account and use the
product for real, so the project shows working multi-tenancy: isolated data,
a fair split of a tiny LLM budget, and no leaks.

Success: an invited person signs up with a code, onboards, gets their own
scored matches on Discover each day, tracks applications, and cannot see or
spend anything that belongs to someone else. The owner's experience does not
get worse.

## Goals

1. Invite-only sign-up (owner hands out codes).
2. Workers serve every eligible user, not one: `ats-poller`,
   `score-matches`, `ghosting-checker`.
3. One shared LLM budget, split fairly and enforced on the server for both
   workers and interactive features (Paste JD, Analyze my resume).
4. Owner-only features are clearly labeled in the UI for other users.
5. Invited users can delete their own account and data.

## Non-goals

- Email tracking for other users. `email-poller` stays owner-only
  (`MATCHIE_USER_ID`). Forwarding-address ingestion (Approach C) is phase 2
  and needs a domain.
- Digest emails for other users. Resend's test sender only delivers to the
  Resend account owner, and there is no domain yet. `digest.ts` stays
  owner-only. Other users see new matches on Discover.
- Paid LLM tiers, billing, teams, admin dashboard UI.
- Scaling past roughly 10–20 users.

## Anti-goals (a failure even if it works)

- Storing any other user's mailbox password or API key.
- A signed-up stranger able to exhaust the owner's daily LLM budget.
- Any cross-user read or write (RLS or worker bug).
- PII in public Actions logs (user emails, names). User ids are fine, as today.

## Constraints

- Free-tier LLMs: about 50 calls a day in total across every feature.
- Public repo; Actions logs are public (CLAUDE.md rule 6).
- Workers run on Node 22 via type stripping (rule 3); Next.js 16 rules (rule 4).
- Migrations are additive: next file is `017_…` (rule 5).
- Demo account keeps working and stays excluded from LLM spend.

## Approaches considered

- **A. Invite-only, workers fan out, email stays owner-only** — chosen. Small,
  safe, shows tenancy and quota design; no credentials of others stored.
- **B. Per-user IMAP app passwords in Supabase Vault** — rejected: holding
  other people's Gmail credentials in a public-repo prototype is the
  liability a reviewer would notice first.
- **C. A plus per-user forwarding address for email** — deferred to phase 2;
  needs a domain and an inbound email service. The classifier and
  `apply_email_to_application` pipeline is reusable as is.

## Design

### 1. Invite-only sign-up

- New table `invite_codes (code text primary key, max_uses int, used_count
  int default 0, expires_at timestamptz null, created_at)`. RLS on with **no**
  policies (only service role / security-definer code touches it). Codes are
  created by the owner in the Supabase SQL editor (a short snippet goes in
  the README).
- Enable sign-ups in Supabase Auth, with email confirmation on.
- Enforcement in the database, not the UI: a Supabase **"before user
  created" auth hook** (Postgres function `public.hook_check_invite(event
  jsonb)`) reads `event->'user'->'user_metadata'->>'invite_code'`, atomically
  increments `used_count` when the code is valid, unexpired and under
  `max_uses`, and otherwise returns an error that rejects the sign-up.
  Execute granted only to `supabase_auth_admin`. The owner enables the hook
  in the dashboard (Auth → Hooks), a manual step.
- `app/login`: add a "Create account" mode beside sign-in with email,
  password and invite code. It calls `supabase.auth.signUp({ email, password,
  options: { data: { invite_code } } })` from the client. Error copy for a bad
  code is generic ("That invite code is not valid").
- After confirming, the user lands on `/onboarding` (existing flow).
- This knowingly reverses commit `58d25ba` (sign-in only). The invite hook
  replaces its reason: a stranger cannot create an account without a code.
  Supabase Auth's built-in sign-up and email rate limits stay on; no captcha
  for now (builder's call to revisit if abuse shows up).

### 2. LLM quota (the core of the design)

Decided with the owner: the owner has a **reserved** share nobody else can
touch, and background workers may never use all of an invited user's quota,
so Paste JD and Analyze always have calls left.

- New table `llm_usage (user_id uuid, day date, calls int default 0,
  worker_calls int default 0, primary key (user_id, day))`, RLS: users can
  **select** their own rows; no insert/update policies. `calls` is the total;
  `worker_calls` is the part spent by workers.
- New columns on `profiles`: `daily_llm_quota int null` (null = default) and
  `llm_reserved boolean not null default false`.
- New SQL function `public.consume_llm_quota(p_user_id uuid, p_calls int,
  p_worker boolean) returns boolean`, security definer, `search_path = ''`.
  It serializes on a transaction-scoped advisory lock (one per day) so
  concurrent callers cannot both pass at the cap, then checks:
  - **Reserved users** (the owner): only their own cap,
    `coalesce(daily_llm_quota, 25)`. Their calls do not touch the shared pool.
    Workers may spend at most 15 of them (reserved worker cap), so email
    classification and interactive use keep 10. This was added after the final
    review: without it, a 30-job scoring run could spend the owner's whole day.
    Email classification is charged as a non-worker call.
  - **Everyone else**, all of:
    - own cap: `coalesce(daily_llm_quota, 8)`;
    - when `p_worker`: `worker_calls + p_calls ≤ 5` (worker cap), so 3 are
      always left for interactive use;
    - shared pool: today's `calls` summed over non-reserved users
      `+ p_calls ≤ 45 − sum(daily_llm_quota of reserved users)` (about 20).

  If all pass it upserts `calls += p_calls` (and `worker_calls += p_calls`
  when `p_worker`) and returns true; otherwise false. "Today" is the date in
  `Asia/Manila`. Global 45, default 8, reserved default 25 and worker cap 5
  are constants at the top of the function. The owner's row is set to
  `llm_reserved = true` by the README snippet, not by the migration, so no
  real user id lands in the public repo.
- Grants: execute to `service_role` (workers). For interactive calls, a
  second wrapper `public.consume_my_llm_quota(p_calls int)` uses
  `(select auth.uid())`, always passes `p_worker = false`, refuses demo
  accounts, and is granted to `authenticated`, so the app never passes a
  user id.
- Charging happens **before** the call (reserve), not after. A failed call
  still counts; that is acceptable at this scale and prevents retry abuse.
- Call sites (each charges first; if false, it skips or returns an error):
  - `app/api/score-job/route.ts` and `[jobId]/route.ts`: 1 call; on refusal
    return 429 `{ error: "Daily AI limit reached. It resets at midnight (PH)." }`.
  - `discover/actions.ts` (batch scoring): 1 call per batch.
  - `workers/score-matches.ts`: 1 per job.
  - `workers/ghosting-checker.ts`: 1 per draft; on refusal use the plain
    template (already the fallback path).
  - `workers/email-poller.ts`: 1 per classified email, charged to the owner.
- `callLLM()` itself stays quota-agnostic (no user id or DB inside the
  router). A small helper in `lib/llm-quota.ts` wraps the RPC for both
  clients.
- UI: Discover and the dashboard show "AI calls left today: n" from
  `llm_usage` and the user's quota.

### 3. Workers

Shared helper `lib/worker-users.ts` (relative `.ts` imports): returns
eligible user ids = profiles where `is_demo = false`, that have a
`seeker_profiles` row. Workers log user ids and counts only.

- **ats-poller**: preferred places = union of `preferred_locations` of all
  eligible users (deduped, trimmed, length ≥ 2). Drops its
  `MATCHIE_USER_ID` dependency.
- **score-matches**: drops `MATCHIE_USER_ID`. Order users by least scoring
  today (fairness), then round-robin: each pass takes one job from each
  user's `shortlist_jobs(p_user_id, …)` until `MAX_SCORES_PER_RUN` total or
  every user is out of shortlist or quota (`consume_llm_quota(…, true)`
  returns false). Reserved users are served first in each pass, so the
  owner's scoring is not slowed by others. Keeps `SCORE_DELAY_MS` and the
  consecutive-failure stop. A user with no skills and no resume is skipped.
- **ghosting-checker**: already loops all users; only add the quota charge.
- **email-poller** and **digest**: unchanged in scope; `MATCHIE_USER_ID` now
  documented as "owner". Email-poller charges quota to the owner.
- **seed-demo**: unchanged.
- Workflows: `discovery.yml` no longer needs `MATCHIE_USER_ID` for
  ats-poller and score-matches; it keeps it for digest.

### 4. Owner-only labels

- Profile `is_owner` is **not** stored; owner-only features are those that
  depend on secrets. Settings shows an "Email tracking" card: for non-owners,
  "Owner-only in this prototype." The app knows the owner via a server-only
  env var `MATCHIE_OWNER_ID` on Vercel (same value as `MATCHIE_USER_ID`).
- Landing/About copy: mention invite-only accounts.

### 5. Self-service account deletion

Decided with the owner: invited users can delete their own account and data.

- Every user table already references `auth.users (id) on delete cascade`
  (002); `jobs.created_by` is `on delete set null`. The builder confirms the
  tables added after 002 (`llm_usage`, 005–016) cascade too.
- New SQL function `public.delete_my_account()`, security definer,
  `search_path = ''`: deletes `auth.users` where `id = (select auth.uid())`;
  refuses demo accounts (`profiles.is_demo`) and reserved accounts (the owner
  cannot delete themself by accident). Execute granted to `authenticated` only.
  This avoids importing `admin.ts` into `app/` (rule 2).
- Settings `DangerZone`: "Delete my account" with a typed confirmation
  ("delete"), then sign-out and redirect to `/`. Server action returns
  `{ error }` and also checks `isDemoAccount()`.
- Uploaded avatar files in storage are removed by the same action before the
  RPC (rows cascade; storage objects do not).
- Privacy page: one line saying users can delete their data in Settings.

### 6. Security checks to add

- Test that `consume_llm_quota` refuses past each cap (own, worker, shared
  pool), never lets others touch the reserved share, and is atomic under
  concurrent calls (two calls at cap − 1 → exactly one succeeds).
- Test that `delete_my_account` removes only the caller and refuses demo and
  reserved accounts.
- Test the invite hook: wrong, expired and used-up codes are rejected; a
  valid code increments once.
- Re-audit every `app/` query that reads `jobs`, `companies`, `matches`,
  `applications` for user scoping now that more than one real user exists
  (016 already fixed manual job visibility).
- `isDemoAccount()` checks stay; demo never consumes quota because it is
  refused earlier.

## Data flow

```
sign-up ─ invite code ─► auth hook ─► auth.users ─► handle_new_user ─► profiles
daily cron:
  ats-poller (union of preferred places) ─► jobs/job_sources
  ghosting-checker ─► consume_llm_quota per draft ─► callLLM
  score-matches ─► for users round-robin ─► consume_llm_quota ─► callLLM ─► matches
  digest ─► owner only
every 2h: email-poller ─► owner only ─► consume_llm_quota(owner)
app: Paste JD / Analyze ─► consume_my_llm_quota ─► callLLM
```

## Manual steps for the owner

1. Apply migration `017_multi_user.sql` to the hosted project.
2. Supabase dashboard: enable sign-ups, email confirmation, and the
   before-user-created hook pointing at `public.hook_check_invite`.
3. Run the README snippet to create invite codes and mark the owner
   `llm_reserved = true`.
4. Vercel: add `MATCHIE_OWNER_ID`.

## Left to the builder

- Exact quota numbers beyond the defaults above; component layout of the
  sign-up form and the quota badge (follow the "Editorial Night" utilities).
- Whether `lib/worker-users.ts` returns ids only or ids plus profile rows.
- Test file layout (follow `lib/**/*.test.ts`; SQL behavior can be tested
  through stubbed `fetch` like existing tests, or noted as manual checks).

## Revisit as it grows

- A domain unlocks digest for everyone and Approach C email forwarding.
- Beyond ~20 users the free LLM tier cannot give each user a useful daily
  quota; that is a paid-tier or bring-your-own-key decision.
