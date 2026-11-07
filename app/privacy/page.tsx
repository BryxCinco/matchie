import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

// Public and static: readable before signing up, so it sits outside the
// (dashboard) group and reads no request data. Keep it in step with the PII
// rule in CLAUDE.md; this page is the promise that rule keeps.

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Matchie stores, what reaches an AI model, and what never does.",
};

const UPDATED = "November 9, 2026";

export default function PrivacyPage() {
  return (
    <main className="pt-safe pb-safe flex-1 bg-zinc-50 px-4 py-10 sm:px-6 sm:py-16 dark:bg-zinc-950">
      <article className="mx-auto flex w-full max-w-2xl flex-col gap-10">
        <header className="flex flex-col gap-4">
          <Link href="/dashboard" className="link self-start text-sm">
            ← Back to Matchie
          </Link>
          <h1 className="font-display text-4xl leading-[0.95] font-medium sm:text-5xl">
            Your <em className="accent-word">privacy</em>
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Matchie reads your resume and your job-search email to do its work. This page says exactly what it keeps, what an AI model sees, and what never leaves your hands.
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Last updated {UPDATED}</p>
        </header>

        <section className="card flex flex-col gap-3 p-5 sm:p-6">
          <h2 className="font-display text-xl font-medium">The short version</h2>
          <ul className="flex flex-col gap-2.5 text-zinc-700 dark:text-zinc-300">
            <Point>Your resume file is read on your own device. The file is never uploaded.</Point>
            <Point>Your name, email, phone number and street address never reach an AI model. They are replaced with placeholders before every request.</Point>
            <Point>The AI sees job descriptions and a summary of your skills and roles. Nothing more.</Point>
            <Point>Personal email that is not about your job search is never stored and never sent anywhere.</Point>
          </ul>
        </section>

        <Section title="Your resume">
          <p>
            When you add a resume, your browser reads the file: PDF and Word files are read as text, and photos or scanned PDFs are read with on-device text recognition. The file itself is never
            sent to Matchie or to any other service.
          </p>
          <p>
            The first time you scan a photo, your browser downloads the English text-recognition data (about 10 MB) from a public CDN (jsDelivr). Only that data is downloaded; your image stays on
            your device.
          </p>
          <p>You then review what was read and correct it. Only that reviewed, structured version is saved: contact details, summary, skills and roles.</p>
        </Section>

        <Section title="What an AI model sees">
          <p>
            Matchie uses Google Gemini, with Groq as a fallback. Free tiers of these services may use requests to improve their products, and people may review them. That is why every request
            goes through one gate in the code, which removes names, email addresses, phone numbers and street addresses first and puts them back only in the answer you see.
          </p>
          <Table
            rows={[
              ["Scoring a job", "The job description, your skills, your role titles with one highlight each, your years of experience, and your preferences (target roles, salary floor, work setup, industries to avoid, your city and preferred locations)."],
              ["Reading a job email", "The sender's domain (not the address), the subject, the cleaned body, the date it arrived, and your applications' job titles, companies and stages, so it can tell which one the email is about."],
              ["Drafting a follow-up", "The job title, company, stage and dates. The draft is signed “[Your name]” for you to fill in."],
            ]}
          />
          <p>
            Never sent: your name, email, phone number, street address, resume file, resume summary, or the names of companies you worked for. Your city is sent only as a city, and the form
            rejects anything with a street number.
          </p>
        </Section>

        <Section title="Your email">
          <p>
            If you connect an inbox, Matchie checks recent mail every two hours. A free keyword check runs first: mail that is not about your job search is skipped. It is not stored and it is not
            sent to an AI model.
          </p>
          <p>
            Job-search mail (rejections, interview invites, assessments, offers) is stored so your tracker can update itself and show where each change came from. Job alerts from LinkedIn,
            JobStreet and Indeed are read by simple rules, with no AI, and only the job title, company, location and link are kept. Matchie never opens or scrapes the job pages.
          </p>
        </Section>

        <Section title="What is stored, and where">
          <p>
            Your account, profile, reviewed resume, job matches, applications and their history are stored in a Supabase database. Every table is locked to your account with row-level
            security, so one account cannot read another&apos;s rows.
          </p>
          <p>
            Your profile photo is stored under a random file name. Anyone with its exact link can view it, the same as most profile photos. The daily digest is sent to your email address through
            Resend and contains job titles, companies and scores. The app runs on Vercel, and background jobs run on GitHub Actions, whose logs record counts and ids only, never the content of
            your email, resume or jobs.
          </p>
        </Section>

        <Section title="Your control">
          <p>
            You can edit or replace your resume and preferences at any time on your profile. What you change there is what Matchie uses from then on.
          </p>
          <p>
            Deleting your whole account from inside the app is not available yet. Until it is, ask the person who runs your Matchie instance to delete it, or open an issue on the{" "}
            <a href="https://github.com/BryxCinco/matchie" className="link" target="_blank" rel="noreferrer">
              project&apos;s GitHub page
            </a>
            .
          </p>
        </Section>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 leading-relaxed text-zinc-700 dark:text-zinc-300">
      <h2 className="font-display text-2xl font-medium text-zinc-950 dark:text-zinc-50">{title}</h2>
      {children}
    </section>
  );
}

function Point({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="bg-accent mt-2 size-1.5 shrink-0 rounded-full" />
      <span>{children}</span>
    </li>
  );
}

// Stacks on phones: a two-column table does not fit 375px with this much text.
function Table({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="card divide-y divide-zinc-200 overflow-hidden dark:divide-zinc-800">
      {rows.map(([task, sent]) => (
        <div key={task} className="flex flex-col gap-1 p-4 sm:flex-row sm:gap-6 sm:p-5">
          <dt className="shrink-0 font-semibold text-zinc-950 sm:w-40 dark:text-zinc-50">{task}</dt>
          <dd className="text-sm leading-relaxed">{sent}</dd>
        </div>
      ))}
    </dl>
  );
}
