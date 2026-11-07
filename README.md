# Matchie

An AI job search agent for the Philippine tech market. Matchie finds jobs for you every morning, scores each one against your resume and preferences, explains the score, and keeps your tracker up to date by reading your job-search email.

Built with Next.js 16, React 19, TypeScript, Tailwind v4 and Supabase. Gemini scores jobs, with Groq as the fallback. Everything runs on free tiers.

![Dashboard](screenshots/dashboard.png)

## Features

### Tracker and matching (MVP)

- **Resume scanning in the browser.** Upload a PDF, Word file or a photo of your resume. Your browser reads it (pdf.js, mammoth, on-device OCR with tesseract.js), you review and fix what it read, and only the reviewed result is saved. The file is never uploaded.
- **Job-search profile.** Target roles, salary floor, work setups, years of experience, skills, industries to avoid, your city and preferred locations.
- **Paste-a-JD scoring.** Paste any job posting and get a 0-100 fit score, matched and missing skills, red flags and a two-sentence reason.
- **Tracker.** Eleven statuses from Saved to Withdrawn on a bento-grid board that fits any screen. Drag a card, or use "Move to" on a phone. A database trigger records every change in an append-only history.

![Tracker](screenshots/tracker.png)

### Email intelligence (Phase 2)

- **Your inbox updates the board.** Every two hours a worker reads recent mail over IMAP. Rejections, interview invites, assessments and offers move the matching application automatically, and each change records the email that caused it.
- **Interviews from invites.** The date, time and round of an interview invite are read in the same AI call that classifies it, and appear under "Upcoming interviews" on the dashboard.
- **Ghosting detection.** After 14 days with no word from a company, the application moves to Ghosted and Matchie drafts a polite follow-up for you to send.
- **Job alerts.** LinkedIn, JobStreet and Indeed alert emails are parsed into jobs by simple rules, with no AI call.

### Automated discovery (Phase 3)

- **ATS boards.** Every morning a worker polls 30+ public Greenhouse and Lever boards for jobs in the Philippines or open to remote.
- **One row per job.** A hash of company, title and location collapses the same posting from several sources into one job.
- **A free shortlist.** SQL rules (setup, salary, years, seniority, location, industries) and full-text search against your roles, skills and resume, with related roles and spellings ("IT Support" also finds "Help Desk"), pick the jobs worth an AI call.
- **Daily digest.** The best new matches arrive by email through Resend.
- **Analyze my resume.** Scores your top ten unscored jobs in one AI call, on demand, and re-scores old matches after you change your profile.

![Discover](screenshots/discover.png)

### Analytics (Phase 5)

- Funnel from Applied to Offer, response rate, interview rate, and median days to a reply for each company. All computed from the application history, with no AI and no extra tracking.

![Analytics](screenshots/analytics.png)

### Polish

- Installable as a PWA on phones and desktops.
- "Editorial Night" theme: dark by default, with a light mode, iOS-style navigation and motion.
- A public [privacy notice](app/privacy/page.tsx) at `/privacy`.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Cache Components), React 19, TypeScript 5 |
| Styling | Tailwind CSS v4, `motion` for page transitions |
| Database, auth, storage | Supabase (Postgres with row-level security, Auth, Storage) |
| Search | Postgres full-text search (`tsvector`) and SQL rules |
| AI | Gemini (primary) and Groq (fallback), one router for both |
| Background jobs | Plain TypeScript workers on GitHub Actions |
| Email in / out | IMAP (`imapflow`) / Resend |
| Resume reading | pdf.js, mammoth, tesseract.js, all in the browser |
| Hosting | Vercel |

## Architecture

The design turns on one split: **Vercel serves the UI and nothing else; every slow job runs in GitHub Actions.** Both import the same `lib/` folder, so there is one codebase across two runtimes.

```
  Sources                     GitHub Actions workers                      Supabase Postgres
  ───────                     ──────────────────────                      ─────────────────
  Greenhouse / Lever  ──▶  ats-poller ─ ingest + dedupe ───────────────▶  jobs, job_sources
  LinkedIn / JobStreet /                                                       │
  Indeed alert emails ──▶  email-poller ─ alerts: rules, no AI ─────────▶     │
  Recruiter email     ──▶      └─ classify (AI) ─▶ status, interviews ─▶  applications,
                                                                          application_events
                           score-matches                                       │
                             1. shortlist_jobs()  ◀── free SQL rules + full-text ┘
                             2. scrub PII ─▶ Gemini / Groq ─▶ fit score ──▶  matches
                           digest ─▶ Resend ─▶ your inbox

  Next.js on Vercel: tracker, discover, analytics, profile ◀── reads/writes ──▶ Supabase (RLS)
```

**Why the funnel matters.** The free AI tiers allow roughly 50 scoring calls a day. So everything before scoring is free SQL: ingest, dedupe, the rules filter and the full-text shortlist. Only the jobs that survive reach the model, and what is not scored today is still shortlisted tomorrow.

**Daily order** (`.github/workflows/discovery.yml`, 06:00 Manila): `ats-poller` → `ghosting-checker` → `score-matches` → `digest`. The email poller runs separately every two hours.

## The PII rule

The Gemini free tier may use requests to improve Google's products, and people may review them. In Matchie that would mean resumes. So one rule holds without exception: **personal data never reaches an AI model.**

- **One gate.** `lib/llm-router.ts` is the only code that calls Gemini or Groq. It runs `lib/pii-scrubber.ts` first, which replaces names, email addresses, phone numbers and street addresses with placeholders like `[NAME_1]`, and restores them only in the parsed answer.
- **The minimum, by construction.** Scoring sends the job description and a skills summary built by `toCandidateSummary()`: skills, role titles and one highlight each. Never the raw resume, contact details, the resume summary or past employers. Email classification sends the sender's domain, not the address.
- **The file never leaves the device.** Resumes are read in the browser; only the structured result you reviewed is saved.
- **Personal mail is never touched.** A free keyword check drops mail that is not about your job search before it is stored or sent anywhere.
- **Public logs stay clean.** The repository and its Actions logs are public, so workers log counts and ids only.

The user-facing version is the [privacy notice](app/privacy/page.tsx).

## Setup

Requirements: Node.js 22.18 or newer, a Supabase project, and free API keys for Gemini and Groq.

1. **Install.**

   ```bash
   npm install
   ```

2. **Environment.** Copy `.env.example` to `.env.local` and fill it in (see the table below).

3. **Database.** Run every file in `supabase/migrations/` in order (`001` to `013`) in the Supabase SQL editor, or with the Supabase CLI.

4. **Auth URLs.** In Supabase, under **Authentication > URL Configuration**, set the Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` to the Redirect URLs.

5. **Run.**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000), sign up, add your resume on the Profile page and fill in your preferences.

6. **Workers (optional, for discovery, email and the digest).** Add the secrets below to the GitHub repository under **Settings > Secrets and variables > Actions**. To run a worker locally:

   ```bash
   node --env-file=.env.local workers/ats-poller.ts
   node --env-file=.env.local workers/score-matches.ts
   node --env-file=.env.local workers/digest.ts
   node --env-file=.env.local workers/email-poller.ts
   ```

### Environment variables

| Variable | Used by | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | App, workers | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | App | Public key; row-level security protects every table |
| `NEXT_PUBLIC_APP_URL` | App, digest | Base URL, e.g. `http://localhost:3000` |
| `GEMINI_API_KEY` | App, workers | Primary AI provider |
| `GROQ_API_KEY` | App, workers | Fallback when Gemini fails |
| `GEMINI_MODEL`, `GROQ_MODEL` | Optional | Override the default models when a provider retires one |
| `SUPABASE_SERVICE_ROLE_KEY` | Workers only | Bypasses row-level security. Never used in `app/` |
| `MATCHIE_USER_ID` | Workers | The account the workers act for (single user) |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Email poller | IMAP login with a Gmail app password |
| `RESEND_API_KEY` | Digest | `RESEND_FROM` and `DIGEST_TO` are optional |

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm test` | Unit tests (Node's built-in test runner) |
| `npm run lint` | ESLint |
| `npm run build` | Production build (stop the dev server first: both write to `.next/`) |

CI (`.github/workflows/ci.yml`) runs type-check, lint, tests and a build on Node 22 for every push to `main`. Every scheduled workflow opens a GitHub issue when it fails, because GitHub does not notify you about failed scheduled runs. GitHub also pauses schedules after 60 days without a commit, and the keepalive pings Supabase every three days so the free project never sleeps.

## Project layout

```
app/                  Next.js routes: (dashboard) pages, privacy, login, API routes
lib/                  Shared TypeScript: LLM router, PII scrubber, scoring,
                      email classifier, job alert parser, resume reader, analytics
workers/              GitHub Actions jobs, run with plain `node`
supabase/migrations/  Numbered SQL migrations (001-013)
.github/workflows/    CI, keepalive, email poller, daily discovery
```
