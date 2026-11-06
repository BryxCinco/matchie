# Matchie

An AI job search agent for the Philippine tech market. Matchie scores job postings against your resume and preferences, explains each score, and tracks every application from saved to offer.

Built with Next.js 16, React 19, TypeScript, Tailwind v4 and Supabase. Gemini scores jobs, with Groq as the fallback.

## Phase 1 features

- **Sign up and log in** with email and password (Supabase Auth). Protected pages redirect to `/login`.
- **Job-search profile** at `/onboarding`: target roles, minimum monthly salary (PHP), accepted work setups, years of experience, skills and industries to avoid.
- **Resume** at `/onboarding/resume`: upload a `.txt` file or paste the text. A rule-based parser pulls out skills and roles, and shows a preview before saving.
- **Paste-the-JD scoring** on the dashboard: paste any job posting and get a 0-100 fit score, matched skills, missing skills, red flags and a two-sentence reason. Pasting the same posting again reuses the saved score unless your profile or resume changed.
- **Kanban tracker** at `/tracker`: 11 statuses from Saved to Withdrawn. Drag a card to change its status. A database trigger records every change in `application_events`, so the full history is kept.
- **Supabase keepalive**: a GitHub Actions workflow queries the database every 3 days so the free-tier project never pauses.

## Privacy: personal data never reaches an LLM

The Gemini free tier may use prompts to improve Google's products, and humans may review them. Matchie therefore follows one rule without exception:

- `lib/pii-scrubber.ts` runs before every LLM call. It replaces names, email addresses, phone numbers and street addresses with placeholders like `[NAME_1]`, and restores them in the response.
- The model sees the job description and a summary of your skills and roles. It never sees your raw resume, contact details or company names. This is enforced by types: the scoring function has no parameter that accepts resume text.
- `lib/llm-router.ts` is the only code that calls an LLM. Do not call the Gemini or Groq SDKs anywhere else.

## Run locally

Requirements: Node.js 22.18 or newer, and a Supabase project.

1. Install dependencies.

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the values (see below).

3. Apply the database migrations in order, in the Supabase SQL editor or with the Supabase CLI:

   ```
   supabase/migrations/001_extensions_and_enums.sql
   supabase/migrations/002_core_tables.sql
   supabase/migrations/003_events_and_indexes.sql
   supabase/migrations/004_application_status_events.sql
   ```

4. In Supabase, under **Authentication > URL Configuration**, set the Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` to the Redirect URLs.

5. Start the dev server and open [http://localhost:3000](http://localhost:3000).

   ```bash
   npm run dev
   ```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm test` | Runs the unit tests (Node's built-in test runner) |
| `npm run lint` | Runs ESLint |
| `npm run build` | Production build |

## Environment variables

| Variable | Used by | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | App, CI, keepalive | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | App, CI, keepalive | Public anon key. Safe in the browser: Row Level Security protects every table |
| `SUPABASE_SERVICE_ROLE_KEY` | Workers only | Bypasses Row Level Security. Never use it in `app/` and never expose it to the browser |
| `GEMINI_API_KEY` | Job scoring | Primary LLM provider |
| `GROQ_API_KEY` | Job scoring | Fallback when Gemini returns HTTP 429 or 5xx |
| `GEMINI_MODEL` | Job scoring | Optional. Defaults to `gemini-3.8-flash` |
| `GROQ_MODEL` | Job scoring | Optional. Defaults to `openai/gpt-oss-120b` |
| `NEXT_PUBLIC_APP_URL` | App | Base URL, e.g. `http://localhost:3000` |

## GitHub Actions

- **CI** (`.github/workflows/ci.yml`) runs on pushes and pull requests to `main`: type-check, lint, tests and a production build on Node 22.
- **Keepalive** (`.github/workflows/keepalive.yml`) runs every 3 days. If it fails, it opens a GitHub issue, because GitHub does not send notifications for failed scheduled runs.

Add these repository secrets under **Settings > Secrets and variables > Actions**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_APP_URL`.

GitHub disables scheduled workflows after 60 days without a commit to the repository. Commit at least once every two months to keep the keepalive running.

## Project layout

```
app/                 Next.js pages, API routes and Server Actions
lib/                 Shared TypeScript: LLM router, PII scrubber, scoring, resume parser
supabase/migrations/ Numbered SQL migrations
.github/workflows/   CI and the keepalive cron
```
