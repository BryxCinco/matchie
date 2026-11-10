# Matchie

AI job search agent: paste a JD, get a match score, track applications on a Kanban board, and let an IMAP poller move applications from recruiter email. Single user for now. The repo is **public**.

## Stack

- **Next.js 16** App Router with `cacheComponents: true`, **React 19**, **TypeScript 5**, **Tailwind v4** (no config file; utilities live in `app/globals.css`).
- **Supabase**: Postgres, Auth, and RLS. Schema is raw SQL in `supabase/migrations/`; there is no ORM.
- **LLMs**: Gemini `gemini-3.8-flash` primary (override with `GEMINI_MODEL`), Groq `openai/gpt-oss-120b` fallback (override with `GROQ_MODEL`) on any Gemini-side failure. Providers retire models without notice: check a 404 against the provider's model list before guessing a replacement, both through `lib/llm-router.ts`.
- **Workers**: plain `.ts` files run by GitHub Actions with `node workers/<name>.ts`. Node type stripping runs them; there is no tsx and no build step.
- **Tests**: `node:test`, files at `lib/**/*.test.ts`.

## Layout

- `app/`: routes. The `(dashboard)` route group needs a signed-in user; `proxy.ts` guards `/dashboard`, `/tracker` and `/onboarding`.
- `lib/`: domain logic (scrubber, LLM router, scoring, email classifier, resume parser).
- `lib/supabase/`: `client.ts` (browser), `server.ts` (RSC and actions), `admin.ts` (service role, **workers only**).
- `workers/`: GitHub Actions jobs. `email-poller.ts` (every 2 hours); `ats-poller.ts` → `ghosting-checker.ts` → `score-matches.ts` → `digest.ts` (daily, in that order); `seed-demo.ts` (nightly demo reset).
- `supabase/migrations/`: numbered SQL files, `001` through `016`.
- `.github/workflows/`: `ci.yml`, `keepalive.yml`, `email-poller.yml`, `discovery.yml`, `demo-reset.yml`.

## Discovery pipeline (SPEC "The matching pipeline")

The binding constraint is the LLM budget (~50 scoring calls a day on free tiers), so every stage before scoring is free SQL:

1. **Ingest** (`ats-poller.ts`): public Greenhouse/Lever boards from `ats_companies`. Only PH and open-remote postings are kept (`isRelevantLocation` in `lib/ats.ts`).
2. **Dedupe**: `jobs.canonical_hash` = hash of normalized company + title + location; every sighting is a `job_sources` row, and `seen_at` keeps live jobs out of `delete_old_jobs()`.
3. **Rules filter + full-text shortlist**: `shortlist_jobs()` in SQL (migration 006). A null on the job side passes the rules.
4. **LLM scoring** (`score-matches.ts`): capped per run; unscored jobs stay shortlisted for the next run.
5. **Digest** (`digest.ts`): best unsent matches via Resend, then `matches.digest_sent_at` is stamped. Each match is emailed at most once.

Never move a stage after scoring, or score before the SQL stages: it spends the budget on jobs the rules would have dropped.

## Demo account

A public demo login (`lib/demo.ts`, `profiles.is_demo`, migration 014) for the portfolio site. Its password is published. Any new feature that calls an LLM, changes credentials, uploads files or sends email must refuse demo accounts on the server (`isDemoAccount()`), not only in the UI. Workers that loop over users skip demo accounts.

## Hard rules

### 1. PII never reaches an LLM

- **Every** LLM call goes through `callLLM()` in `lib/llm-router.ts`. It runs `scrubPII()` before sending and `unscrubPII()` on the parsed result. Never call the Gemini or Groq SDKs, or `fetch` an LLM API, anywhere else.
- Pass the user's name in `knownNames` so the scrubber catches it.
- Send the minimum the model needs:
  - **Match scoring**: the JD plus a skills summary (`toCandidateSummary`) and preferences, including `home_city` (city only; the form rejects digits). Never the raw resume or contact details.
  - **Email classification**: the sender's **domain** only (not the address), the received date, the subject, and the cleaned body. The same call reads an invite's date and round.
  - **Batch scoring** ("Analyze my resume" on Discover, `lib/batch-scoring.ts`): the same skills summary as single scoring, with up to 10 numbered JD excerpts.
  - **Follow-up drafts**: job title, company, stage and dates. The draft signs off with `[Your name]`.
- **Resume files are read in the browser** (`lib/resume-extract.ts`: pdf.js, mammoth, tesseract.js OCR). Never send a resume file, image or its raw text to an LLM or any API; only the reviewed, structured result is saved.
- **Email prefilter**: mail that fails `looksJobRelated()` is never stored and never sent to an LLM.
- **Job alerts** (LinkedIn, JobStreet, Indeed) are parsed by `lib/job-alert-parser.ts` without an LLM. Only the email is read; never fetch or scrape the job pages (their terms forbid it).
- Text from outside (JDs, emails) goes inside delimiters, and the prompt says it is data, not instructions.

### 2. Supabase

- **Never import `lib/supabase/admin.ts` from `app/`.** The service-role key bypasses RLS. Workers only.
- RLS is on for every user table: `(select auth.uid()) = user_id`. Child tables use composite FKs `(parent_id, user_id)`, so a row cannot point at another user's parent.
- **Status history is written by triggers, not by app code.** A status change on `applications` inserts an `application_events` row (`log_application_status`). Never insert status events by hand. `application_events` is append-only: UPDATE and TRUNCATE are blocked.
- The event's `source`, `note` and `email_message_id` come from `set_config('matchie.event_*', ..., true)`. That setting lasts one transaction, and every PostgREST request is its own transaction, so **`supabase.rpc('set_config')` followed by an update does not work.** Set the config and do the update inside one SQL function.
  - Email-driven changes: `rpc("apply_email_to_application", ...)` (service role only). It also bumps `last_activity_at` when the status does not change.
  - Manual moves from the UI use a plain update; the source defaults to `'manual'`.
- In the proxy, use `getClaims()`. In server code that needs the user, use `requireUser()` from `lib/auth/require-user.ts`, which calls `getUser()`.

### 3. Node 22 compatibility

Local is Node 26; CI, Vercel and the workers run **Node 22**. Code that works locally can fail there.

- **No inline regex modifiers** such as `(?i:...)`; they are a SyntaxError on Node 22, and the whole module fails to load. Use flags, or the `anyCase()` helper in `lib/pii-scrubber.ts` for case-insensitive parts.
- **No constructor parameter properties** (`constructor(readonly x: T)`). Type stripping rejects them. Declare fields and assign them.
- No `enum` or `namespace` either (also not strippable). Use `as const` arrays.
- **Any `lib/` file a worker imports, directly or indirectly, uses relative imports with the `.ts` extension** (`import { scrubPII } from "./pii-scrubber.ts"`). Node does not resolve the `@/` alias. `import type` from `@/` is fine, because it is erased.
- To check a change on Node 22: `npx -y node@22 --test "lib/**/*.test.ts"`, and `npx -y node@22 workers/<name>.ts` for each worker (it should exit on "Missing env var", not on a SyntaxError).

### 4. Next.js 16

- With `cacheComponents`, request data must be read inside `<Suspense>`: `cookies()`, `headers()`, `searchParams`, `params`, and the session. Otherwise the build fails with "Uncached data was accessed outside of `<Suspense>`".
  - Pattern: a static page shell, with a small async component that reads the data inside `<Suspense>`. A client component that uses `useSearchParams()` goes inside `<Suspense>` too.
- `Date.now()`, `new Date()` and `Math.random()` in a server component need `await connection()` first (`requireUser()` already does this).
- The middleware file is `proxy.ts`, not `middleware.ts`.
- `PageProps<"/route">` and `LayoutProps` are global generated types. Run `npx next typegen` before `tsc` on a fresh checkout.
- Client components never import from `route.ts` or other server files. Shared constants go in `lib/` (for example `lib/job-description-limits.ts`).
- **Never run `next build` while `next dev` is running.** Both write to `.next/`, and the dev server then serves broken pages: 404s, hydration errors and missing CSS. If that happens, stop the dev server, delete `.next`, and restart. Hard-refresh the browser.
- Dark mode is class-based: `@custom-variant dark` in `globals.css`. Dark is the default; the inline script in `app/layout.tsx` switches to light only when the user chose it.

## Design system ("Editorial Night")

- The theme **redefines Tailwind's `zinc` and `orange` scales** in `app/globals.css` (violet ink to warm cream; warm orange). Keep writing `zinc-*` / `orange-*` classes; do not add raw hex colors in components.
- Fonts: `font-display` (Outfit) for headings, Geist for body, and `accent-word` (Instrument Serif italic, gradient) for one accent word in a big heading, e.g. `Disc<em className="accent-word">o</em>ver`.
- Use the utilities: `btn-primary`, `btn-secondary`, `link`, `field`, `card`, `glass`, `pressable`, `eyebrow`, `bg-accent`, `text-accent`, `pt-safe`/`pb-safe`.
- Animation: `FadeIn` from `app/(dashboard)/motion.tsx` (the `motion` package) for page and section entrances; CSS (`pressable`, `btn-*` hover, `animate-rise`, `animate-settle`) for everything small. Never put motion transforms on tracker cards: @hello-pangea/dnd owns their transform.
- Phones (< md): navigation is the bottom tab bar in `Navbar.tsx` (Log out is on /settings there); page content is padded to clear it. Touch targets at least 44px (`min-h-11`). Inputs stay 16px on phones so iOS does not zoom.

### 5. Migrations

- **Never edit a migration that has been applied.** Put every change in the next numbered file (`006_<name>.sql`).
- Each migration has a header comment that says why. Every function gets `set search_path = ''` and schema-qualified names (`public.`, `extensions.`).
- Revoke `execute` on privileged functions from `public, anon, authenticated`, and grant it only to the role that needs it.
- After any schema change, update `lib/types/database.types.ts` to match. Regenerate it with the Supabase CLI, or edit it by hand to match the migration if the CLI is not set up. Keep it UTF-8; PowerShell redirection writes UTF-16.
- The user applies migrations to the hosted project. Say clearly when a change needs a migration applied.

### 6. Logs

- Actions logs are public. **Workers log counts and ids only.** Never log an email address, sender, subject, body, company name, JD text or resume content.
- In error logs, print `error.name` and a code, not the full error. IMAP and Supabase errors can echo server data.
- Set `logger: false` on imapflow.

### 7. Secrets and dependencies

- Secrets go in `.env.local` / `.env` (gitignored) and GitHub Actions secrets. Never in code, workflow files or commits.
- New dependencies: pin an exact version that has been published for at least 2 weeks (`npm install --save-exact pkg@x.y.z`).

## Before saying a task is done

Run all three, and report any failure as it is:

```bash
npx tsc --noEmit
npm run lint
npm test
```

If a worker or a `lib/` file it imports changed, also run the Node 22 checks in rule 3. Only run `next build` when the dev server is stopped.

## Conventions

- Validate LLM output and form input with Zod v4 (`z.toJSONSchema` puts the schema into the prompt).
- Server Actions return `{ error }` for expected failures and do not throw.
- Tests stub `globalThis.fetch` so the real SDK code runs; do not mock the router.
- Commit only when the user asks.
- Explain things to the user in Tagalog/Taglish. Code, comments and commit messages are in English.
