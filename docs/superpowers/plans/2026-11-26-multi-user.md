# Multi-user Matchie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let invited users sign up and use Matchie with their own data, a fair share of the LLM budget, and self-service deletion, while email tracking and the digest stay owner-only.

**Architecture:** One migration (`017_multi_user.sql`) adds invite codes, an auth hook, an `llm_usage` ledger with an atomic `consume_llm_quota()` function, and `delete_my_account()`. A thin `lib/llm-quota.ts` wraps the RPCs; every LLM call site charges before calling `callLLM()`. Workers drop `MATCHIE_USER_ID` (except email-poller and digest) and loop over eligible users round-robin.

**Tech Stack:** Next.js 16 (App Router, cacheComponents), Supabase Postgres/Auth/RLS, Node 22 workers on GitHub Actions, `node:test`, Zod v4.

**Spec:** `docs/superpowers/specs/2026-11-26-multi-user-design.md`

## Global Constraints

- Follow every rule in `CLAUDE.md`; the ones most at risk here are listed below.
- Do not commit unless the user asks. Each "Checkpoint" step means: run the checks, then stop for review. Do not run `git commit` on your own.
- Quota constants (top of `consume_llm_quota`): global `45`, default per-user `8`, reserved default `25`, worker cap `5`. "Today" = `(now() at time zone 'Asia/Manila')::date`.
- Never import `lib/supabase/admin.ts` from `app/`. The app calls only `consume_my_llm_quota`, `my_llm_quota_left` and `delete_my_account` (all use `auth.uid()`).
- Every SQL function: `set search_path = ''`, schema-qualified names, `revoke execute ... from public, anon, authenticated`, then grant only the needed role.
- Lib files imported by workers use relative `.ts` imports; no `enum`, `namespace`, parameter properties or inline regex modifiers.
- Workers log user ids and counts only; never an email, name or company.
- No real user id in any committed file (migrations, README, workflows).
- Update `lib/types/database.types.ts` by hand to match 017 (UTF-8).
- The user applies migration 017 and the dashboard steps; say so at the end.
- Copy: quota refusal message is exactly `Daily AI limit reached. It resets at midnight (PH time).`; bad invite code message is exactly `That invite code is not valid.`

## Review Focus

1. **Quota refused after a cache hit:** Paste JD on an already-scored JD must return the cached score without charging. Charge only right before `scoreJob()` (Task 3 test).
2. **Owner (reserved) user hits the shared pool:** a reserved user must still be served when the shared pool is full, and must never consume pool calls (Task 1 SQL check).
3. **Quota helper RPC error:** if `consume_*` errors (network, missing function before the migration is applied), fail closed. Treat it as refused, never as allowed (Task 2 test).
4. **Score worker with zero eligible users or all quotas exhausted:** it exits 0 with stats logged, not an error (Task 5 test on the interleave helper plus the worker's early return).
5. **Delete account while an avatar exists:** storage files are removed before the RPC; a storage failure must not block deletion of the data (Task 8: log `error.name`, continue).

---

### Task 1: Migration 017 and types

**Files:**
- Create: `supabase/migrations/017_multi_user.sql`
- Create: `supabase/checks/017_multi_user_checks.sql` (manual SQL checks, wrapped in `begin; … rollback;`)
- Modify: `lib/types/database.types.ts`

**Interfaces:**
- Produces (SQL):
  - table `public.invite_codes(code text pk, max_uses int not null default 1 check (max_uses > 0), used_count int not null default 0, expires_at timestamptz null, created_at timestamptz not null default now())`, RLS on, no policies.
  - table `public.llm_usage(user_id uuid references auth.users on delete cascade, day date, calls int not null default 0, worker_calls int not null default 0, primary key (user_id, day))`, RLS on, policy "Users read own usage" for select using `(select auth.uid()) = user_id`.
  - columns `profiles.daily_llm_quota int null check (daily_llm_quota >= 0)`, `profiles.llm_reserved boolean not null default false`.
  - `public.hook_check_invite(event jsonb) returns jsonb`: security definer; grant execute to `supabase_auth_admin` only. Reads `event->'user'->'user_metadata'->>'invite_code'` (trimmed). One `update … set used_count = used_count + 1 where code = $1 and used_count < max_uses and (expires_at is null or expires_at > now()) returning code`. Returns `'{}'::jsonb` on success, else `jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'That invite code is not valid.'))`.
  - `public.consume_llm_quota(p_user_id uuid, p_calls int, p_worker boolean) returns boolean`: security definer; grant to `service_role`. Takes `pg_advisory_xact_lock(hashtext('llm_usage:' || today))` first, then applies the spec rules (reserved: own cap `coalesce(daily_llm_quota, 25)` only; others: own cap `coalesce(daily_llm_quota, 8)`, worker cap 5 when `p_worker`, shared pool `45 - sum(coalesce(daily_llm_quota,25)) of reserved` over non-reserved users' `calls`). Demo users (`is_demo`) always false. `p_calls < 1` raises.
  - `public.consume_my_llm_quota(p_calls int) returns boolean`: security definer; calls the above with `(select auth.uid())`, `p_worker => false`; grant to `authenticated`.
  - `public.my_llm_quota_left() returns int`: security definer, `stable`; remaining interactive calls today for `auth.uid()` = for reserved: own cap − calls; for others: `least(own cap − calls, pool left)`, floored at 0; demo 0. Grant to `authenticated`.
  - `public.delete_my_account() returns void`: security definer; raises `'not allowed'` if the caller is demo or reserved; else `delete from auth.users where id = (select auth.uid())`. Grant to `authenticated`.
- Header comment explains why (multi-user, quota, reverse of 58d25ba sign-in-only).

- [ ] **Step 1:** Write `supabase/checks/017_multi_user_checks.sql`: inside `begin; … rollback;`, insert two fake `auth.users` rows (one reserved), set quotas, and `do $$ … assert … $$` blocks for: a non-reserved user is refused on call 9; worker calls refused after 5 while interactive still passes; the pool refuses when non-reserved calls reach `45 − 25`; the reserved user is still served then, and the pool sum is unchanged; demo is refused; the invite hook accepts a valid code once and rejects used-up, expired and unknown codes; `delete_my_account` is refused for reserved.
- [ ] **Step 2:** Write `017_multi_user.sql` per the Interfaces block. Before writing, grep migrations 003–016 for every `user_id` FK and confirm each references `auth.users … on delete cascade`, directly or through a cascading parent; any that does not gets an FK fix in 017.
- [ ] **Step 3:** Add the new tables, columns and functions to `lib/types/database.types.ts` (Row/Insert/Update for tables; `Args`/`Returns` under `Functions`).
- [ ] **Step 4:** Run `npx tsc --noEmit`. Expected: exit 0.
- [ ] **Step 5 (user):** The user applies 017 to the hosted project and runs the checks file in the SQL editor. Expected: no assertion errors. Continue with Tasks 2–9 meanwhile; they are tested with stubbed fetch.
- [ ] **Step 6:** Checkpoint.

### Task 2: `lib/llm-quota.ts`

**Files:**
- Create: `lib/llm-quota.ts`, `lib/llm-quota.test.ts`

**Interfaces:**
- Consumes: Task 1 RPC names and types.
- Produces:
  - `export const QUOTA_REFUSED = "Daily AI limit reached. It resets at midnight (PH time)."`
  - `export async function chargeUser(supabase: SupabaseClient<Database>, userId: string, calls: number, worker: boolean): Promise<boolean>` (service role; calls `consume_llm_quota`)
  - `export async function chargeMe(supabase: SupabaseClient<Database>, calls: number): Promise<boolean>` (calls `consume_my_llm_quota`)
  - `export async function quotaLeft(supabase: SupabaseClient<Database>): Promise<number>` (calls `my_llm_quota_left`; returns 0 on error)
- Relative imports with `.ts` (workers import it). On RPC error: `console.error("[quota] …", error.code)` and return `false`.

- [ ] **Step 1:** Write the tests. Use a real `createClient("http://supabase.test", "anon")` from `@supabase/supabase-js` with `globalThis.fetch` stubbed (same pattern as `lib/llm-router.test.ts`):
  - `chargeUser posts p_user_id, p_calls, p_worker to /rest/v1/rpc/consume_llm_quota and returns true on true`
  - `chargeUser returns false when the RPC returns false`
  - `chargeMe returns false (fails closed) on a 500 or 404 response`
  - `quotaLeft returns the number, and 0 on error`
- [ ] **Step 2:** Run `npm test`. Expected: the new tests FAIL (module not found).
- [ ] **Step 3:** Implement the module.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5:** Checkpoint.

### Task 3: Charge the interactive call sites and show the remaining calls

**Files:**
- Modify: `app/api/score-job/route.ts`, `app/api/score-job/[jobId]/route.ts`, `app/(dashboard)/discover/actions.ts`
- Modify: `app/(dashboard)/discover/page.tsx`, `app/(dashboard)/dashboard/page.tsx` (badge)
- Create: `app/(dashboard)/QuotaBadge.tsx` (async server component)

**Interfaces:**
- Consumes: `chargeMe`, `quotaLeft`, `QUOTA_REFUSED` (Task 2).

- [ ] **Step 1:** In both routes, call `chargeMe(supabase, 1)` after the demo check and **after** the cached-score early return, immediately before `scoreJob(…)`. On false, return `error(429, QUOTA_REFUSED)`.
- [ ] **Step 2:** In `analyzeResumeForJobs`, call `chargeMe(supabase, 1)` after `jobIds.length === 0` returns and before `scoreJobsBatch`. On false, return `{ ok: false, error: QUOTA_REFUSED }`.
- [ ] **Step 3:** `QuotaBadge`: reads `quotaLeft` inside `<Suspense>` and renders `AI calls left today: {n}` with existing utilities (`eyebrow` or a small `glass` pill). Render nothing for demo users (`isDemoUser()`). Place it beside the Paste JD form and the Analyze button.
- [ ] **Step 4:** Check `PasteJdForm.tsx` shows the 429 message; it already renders `error` from the response body. Verify by reading the code, and adjust only if it maps status codes to fixed text.
- [ ] **Step 5:** Run `npx tsc --noEmit && npm run lint && npm test`. Expected: all pass.
- [ ] **Step 6:** Checkpoint.

### Task 4: Eligible users and merged preferred places; ats-poller

**Files:**
- Create: `lib/worker-users.ts`, `lib/worker-users.test.ts`
- Modify: `workers/ats-poller.ts` (`loadPreferredPlaces`)

**Interfaces:**
- Produces:
  - `export type WorkerUser = { userId: string; reserved: boolean }`
  - `export async function loadEligibleUsers(supabase: SupabaseClient<Database>): Promise<WorkerUser[]>`: profiles with `is_demo = false` that have a `seeker_profiles` row; ordered reserved first, then by `user_id`. Throws `Error("Could not load users (<code>)")` on error.
  - `export function mergePreferredPlaces(lists: (string[] | null)[]): string[]`: trims, drops entries shorter than 2 characters, dedupes case-insensitively (keeps the first spelling), and sorts.

- [ ] **Step 1:** Tests: `mergePreferredPlaces([["Singapore", " singapore "], null, ["X", "Tokyo"]])` deep-equals `["Singapore", "Tokyo"]`; empty input gives `[]`. `loadEligibleUsers` with stubbed fetch excludes a demo row and a user without a seeker profile, and puts the reserved user first.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement. `loadPreferredPlaces` in ats-poller loads `preferred_locations` for all eligible users and returns `mergePreferredPlaces(...)`. Remove the `MATCHIE_USER_ID` read and update the header and comment.
- [ ] **Step 4:** Run `npm test` and `npx -y node@22 workers/ats-poller.ts`. Expected: tests pass; the worker exits on the missing Supabase env, not a SyntaxError.
- [ ] **Step 5:** Checkpoint.

### Task 5: score-matches serves all users round-robin

**Files:**
- Create: `lib/round-robin.ts`, `lib/round-robin.test.ts`
- Modify: `workers/score-matches.ts`

**Interfaces:**
- Consumes: `loadEligibleUsers` (Task 4), `chargeUser` (Task 2).
- Produces: `export function interleave<T>(queues: { key: string; items: T[] }[]): { key: string; item: T }[]`. Pass 1 takes item 0 of each queue in the given order, pass 2 takes item 1, and so on.

- [ ] **Step 1:** Tests: `interleave([{key:"a",items:[1,2,3]},{key:"b",items:[9]}])` gives keys `a,b,a,a` and items `1,9,2,3`; empty queues give `[]`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `interleave`.
- [ ] **Step 4:** Restructure the worker: `main()` loads eligible users. For each user, build the candidate as today (skip a user with no profile, or no skills and no resume) and call `shortlist_jobs(p_user_id, p_limit: MAX_SCORES_PER_RUN)`. Interleave the users' shortlists (`loadEligibleUsers` already orders reserved users first). Iterate up to `MAX_SCORES_PER_RUN`. Before each `scoreJob`, `chargeUser(supabase, userId, 1, true)`: on false, add the user to an `exhausted` set and skip their remaining items. Keep `SCORE_DELAY_MS` and the consecutive-failure stop. Stats add `users`, `quotaSkipped`. Zero users means log the stats and return. Remove `MATCHIE_USER_ID` and update the header.
- [ ] **Step 5:** Run `npm test` and `npx -y node@22 workers/score-matches.ts`. Expected: tests pass; the worker exits on missing env.
- [ ] **Step 6:** Checkpoint.

### Task 6: Quota in ghosting-checker and email-poller

**Files:**
- Modify: `workers/ghosting-checker.ts` (before `draftFollowUp(` at ~line 65), `workers/email-poller.ts` (before `classifyEmail(` at ~line 188)

- [ ] **Step 1:** Ghosting: before `draftFollowUp`, `chargeUser(supabase, app.user_id, 1, true)`. On false, use `followUpTemplate(context)` (the existing fallback) and count `stats.quotaSkipped`.
- [ ] **Step 2:** Email-poller: before `classifyEmail`, `chargeUser(supabase, run.userId, 1, true)`. On false, set a run flag that stops the main loop, do not store the message (it is retried next run, as today), and count `stats.quotaSkipped`. Header: `MATCHIE_USER_ID` is "the owner".
- [ ] **Step 3:** Run `npx -y node@22 workers/ghosting-checker.ts` and `npx -y node@22 workers/email-poller.ts`. Expected: exits on missing env. Run `npm test`. Expected: pass.
- [ ] **Step 4:** Checkpoint.

### Task 7: Invite-only sign-up

**Files:**
- Modify: `app/login/login-form.tsx`, `app/login/page.tsx` (heading copy if needed)
- Create: `lib/auth/sign-up-schema.ts`, `lib/auth/sign-up-schema.test.ts`

**Interfaces:**
- Produces: `export const SignUpSchema` (Zod): `email` (email), `password` (8–72 chars, same as `PasswordSchema` in settings), `inviteCode` (trimmed, 4–64 chars, `/^[A-Za-z0-9-]+$/`).

- [ ] **Step 1:** Tests: a valid input parses; a short password fails with `Use at least 8 characters.`; an invite code with a space inside or an empty one fails.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL. Implement. Run again. Expected: PASS.
- [ ] **Step 3:** The login form gets a mode toggle ("Sign in" / "Create account"). Create mode adds an invite code field, validates with `SignUpSchema`, and calls `supabase.auth.signUp({ email, password, options: { data: { invite_code }, emailRedirectTo: \`${location.origin}/auth/callback?next=/onboarding\` } })`. Any sign-up error whose message mentions the invite shows `That invite code is not valid.`; other errors show the Supabase message. On success, show "Check your email to confirm your account." Replace the top comment (no longer sign-in only). Keep the touch targets `min-h-11`.
- [ ] **Step 4:** Run `npx tsc --noEmit && npm run lint && npm test`. Expected: pass.
- [ ] **Step 5:** Checkpoint.

### Task 8: Self-service account deletion

**Files:**
- Modify: `app/(dashboard)/settings/actions.ts`, `app/(dashboard)/settings/DangerZone.tsx`, `app/(dashboard)/settings/page.tsx`
- Modify: `app/(marketing)/privacy/page.tsx` (one line)

**Interfaces:**
- Consumes: `delete_my_account` RPC (Task 1).
- Produces: `export async function deleteAccount(_prev: SettingsState, formData: FormData): Promise<SettingsState>`

- [ ] **Step 1:** `deleteAccount`: `requireUser("/settings")`. Require `formData.get("confirm") === "delete"` (else `{ error: 'Type "delete" to confirm.' }`). Refuse demo with `DEMO_DISABLED`. List and remove the user's files in the `avatars` bucket under `${user.id}/` (on error, `console.error("[settings] avatar cleanup failed", error.name)` and continue). Then `supabase.rpc("delete_my_account")`; on error, return `{ error: "Could not delete the account. Try again." }`. Then `supabase.auth.signOut()` and `redirect("/")`.
- [ ] **Step 2:** `DangerZone`: replace the placeholder with a form (`useActionState(deleteAccount, …)`) holding a text input labeled `Type "delete" to confirm` and the button. Keep `DemoLocked`. The owner sees it, but the RPC refuses reserved accounts; show its error.
- [ ] **Step 3:** Privacy page: add "You can delete your account and all your data any time in Settings."
- [ ] **Step 4:** Run `npx tsc --noEmit && npm run lint && npm test`. Expected: pass.
- [ ] **Step 5:** Checkpoint.

### Task 9: Owner-only labels, config and docs

**Files:**
- Create: `lib/auth/is-owner.ts`
- Modify: `app/(dashboard)/settings/page.tsx` (Email tracking card), `.github/workflows/discovery.yml`, `.env.example`, `README.md`, `CLAUDE.md`, `app/(marketing)/page.tsx` and `about/page.tsx` (one line each)

**Interfaces:**
- Produces: `export const isOwner = cache(async () => boolean)`: `(await requireUser()).id === process.env.MATCHIE_OWNER_ID`. Server-only; false when the env var is unset.

- [ ] **Step 1:** Settings: an "Email tracking" section. The owner sees "Connected to your inbox (runs every 2 hours)"; others see "Owner-only in this prototype." Read it inside `<Suspense>`.
- [ ] **Step 2:** `discovery.yml`: remove `MATCHIE_USER_ID` from the ats-poller and score-matches steps; keep it for digest. `.env.example`: add `MATCHIE_OWNER_ID=` (app, server-only) and note that `MATCHIE_USER_ID` is the owner for email-poller and digest.
- [ ] **Step 3:** README: a "Multi-user setup" section with the manual steps (apply 017; enable sign-ups, email confirmation and the before-user-created hook → `public.hook_check_invite`; Vercel `MATCHIE_OWNER_ID`), plus SQL snippets with placeholders: `insert into public.invite_codes (code, max_uses) values ('<CODE>', 5);` and `update public.profiles set llm_reserved = true where user_id = '<YOUR_USER_ID>';`.
- [ ] **Step 4:** CLAUDE.md: replace "Single user for now" with invite-only multi-user. Add a hard rule: every LLM call charges quota first (`chargeMe` / `chargeUser`). Update the migrations range to `001` through `017`. Note that the workers are multi-user except email-poller and digest.
- [ ] **Step 5:** Landing/About: mention invite-only accounts beside the demo.
- [ ] **Step 6:** Checkpoint.

### Task 10: Final verification

- [ ] **Step 1:** Run `npx tsc --noEmit`, `npm run lint` and `npm test`. Expected: exit 0, 0 problems, all pass.
- [ ] **Step 2:** Run `npx -y node@22 --test "lib/**/*.test.ts"`. Expected: all pass.
- [ ] **Step 3:** For each worker, run `npx -y node@22 workers/<name>.ts`. Expected: "Missing …" errors only.
- [ ] **Step 4:** Tenancy audit: for every `.from("jobs" | "companies" | "matches" | "applications" | "email_messages" | "interviews")` in `app/`, confirm it runs on the user's session client (RLS applies) and that any shared-table read (`jobs`, `companies`) cannot expose another user's `source = 'manual'` job (016's policy). List each finding; fix real leaks in a separate step.
- [ ] **Step 5:** Report to the user: what changed, and the manual steps (migration 017, Supabase Auth settings and hook, invite code and reserved owner SQL, Vercel env, the checks file).
