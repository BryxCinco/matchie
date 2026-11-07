import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Backdrop, CheckIcon, Container, LockIcon, PrimaryCta, SectionTitle, Svg } from "../site";

// What Matchie is and why it works the way it does. The principles are the
// SPEC's design decisions ("Hard rules", "Not now, and why") in plain words.

export const metadata: Metadata = {
  title: "About",
  description: "Why Matchie exists, what it believes, and how it is built: an AI job search agent for the Philippine tech market.",
};

export default function AboutPage() {
  return (
    <>
      <Backdrop />
      <main className="relative flex flex-col gap-24 pb-16 sm:gap-32">
        <Intro />
        <Problems />
        <Principles />
        <HowItsBuilt />
        <Faq />
        <Closing />
      </main>
    </>
  );
}

function Intro() {
  return (
    <Container className="flex flex-col items-start gap-6 pt-12 motion-safe:animate-rise sm:pt-20">
      <p className="eyebrow">
        <span>About Matchie</span>
      </p>
      <h1 className="max-w-4xl font-display text-5xl leading-[0.95] font-medium tracking-tight sm:text-6xl lg:text-7xl">
        Built for the job hunt we <em className="accent-word">actually</em> have
      </h1>
      <p className="max-w-2xl text-lg text-zinc-600 sm:text-xl dark:text-zinc-400">
        Looking for a tech job in the Philippines means ten open tabs, a spreadsheet, and checking your inbox every hour. Matchie does the searching, the judging and the bookkeeping, so
        your energy goes into the applications that fit.
      </p>
    </Container>
  );
}

function Problems() {
  const problems = [
    {
      title: "The jobs are everywhere",
      body: "LinkedIn, JobStreet, Indeed and dozens of company career pages. None of them talk to each other, and the same job shows up four times.",
    },
    {
      title: "Every posting looks like a fit",
      body: "You read fifty job descriptions to find the five worth your time, and you still guess whether you are what they want.",
    },
    {
      title: "The tracking never ends",
      body: "A spreadsheet you forget to update, follow-ups you mean to send, and companies that simply stop replying.",
    },
  ];
  return (
    <Container className="flex flex-col gap-10">
      <div className="reveal">
        <SectionTitle eyebrow="Why it exists" title={<>Job hunting is a <em className="accent-word">second job</em></>} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {problems.map((problem, index) => (
          <article key={problem.title} className="reveal card flex flex-col gap-3 p-6 sm:p-7">
            <span className="text-accent font-display text-5xl leading-none font-semibold">{index + 1}</span>
            <h3 className="font-display text-xl font-medium">{problem.title}</h3>
            <p className="text-zinc-600 dark:text-zinc-400">{problem.body}</p>
          </article>
        ))}
      </div>
      <p className="reveal max-w-3xl text-lg text-zinc-700 dark:text-zinc-300">
        Matchie answers all three: it gathers jobs into one place without duplicates, tells you how well each one fits and why, and keeps your tracker current by reading the replies for you.
      </p>
    </Container>
  );
}

function Principles() {
  const principles: { icon: ReactNode; title: string; body: string }[] = [
    {
      icon: <LockIcon className="size-5" />,
      title: "Private by design",
      body: "Your resume is read on your device. Your name and contact details are removed before any AI request. The AI judges your skills, never who you are.",
    },
    {
      icon: <HandIcon />,
      title: "You apply. Always.",
      body: "Matchie never applies for you. Mass, unreviewed applications get accounts banned and lower your callback rate. It finds and ranks; you decide.",
    },
    {
      icon: <ShieldIcon />,
      title: "Legal sources only",
      body: "Public company job boards and the job alerts you subscribed to. No scraping of sites that forbid it, and no job pages opened behind your back.",
    },
    {
      icon: <ScaleIcon />,
      title: "Honest, not hyped",
      body: "A daily digest, not fake “real-time” alerts. A score with its reasons and its gaps, not a magic number. Your analytics show what is not working too.",
    },
    {
      icon: <LeafIcon />,
      title: "Free to run",
      body: "Built entirely on free tiers. Free SQL rules filter the jobs first, so the limited AI budget is spent only on jobs worth a closer look.",
    },
  ];
  return (
    <Container className="flex flex-col gap-10">
      <div className="reveal">
        <SectionTitle eyebrow="What it believes" title={<>Five rules it <em className="accent-word">never</em> breaks</>} />
      </div>
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {principles.map((principle, index) => (
          <li
            key={principle.title}
            className={`reveal card relative flex flex-col gap-3 overflow-hidden p-6 sm:p-7 ${index === 0 ? "lg:row-span-2 lg:justify-end" : ""}`}
          >
            {index === 0 && (
              // The tall tile's empty top: a large glowing lock, decoration only.
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 hidden h-1/2 items-center justify-center lg:flex">
                <div className="absolute size-40 rounded-full bg-orange-500/25 blur-3xl" />
                <LockIcon className="relative size-28 stroke-[1.2] text-orange-500/70" />
              </div>
            )}
            <span className="bg-accent relative flex size-11 items-center justify-center rounded-2xl text-zinc-950 shadow-[0_8px_24px_-8px_rgb(240_83_43/0.6)]">{principle.icon}</span>
            <h3 className="mt-2 font-display text-xl font-medium">{principle.title}</h3>
            <p className="text-zinc-600 dark:text-zinc-400">{principle.body}</p>
            {index === 0 && (
              <Link href="/privacy" className="link mt-1 self-start text-sm">
                Read exactly what the AI sees
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Container>
  );
}

function HowItsBuilt() {
  const steps = [
    { title: "Collect", body: "Company job boards every morning, job alerts from your inbox, and any posting you paste." },
    { title: "Filter for free", body: "SQL rules for setup, salary, seniority and location, then a full-text search on your roles and skills." },
    { title: "Score with AI", body: "Only the shortlist reaches the AI, with personal details removed. It returns a score, gaps and reasons." },
    { title: "Keep you posted", body: "The best matches in a 6 AM email, and your tracker updated as companies reply." },
  ];
  const stack = ["Next.js 16", "React 19", "TypeScript", "Tailwind CSS", "Supabase", "Gemini + Groq", "GitHub Actions", "Resend", "Vercel"];
  return (
    <Container>
      <section className="reveal relative overflow-hidden rounded-[2rem] border border-zinc-200 bg-white p-7 sm:p-12 dark:border-zinc-800 dark:bg-zinc-900">
        <div aria-hidden="true" className="absolute -top-24 -left-24 size-72 rounded-full bg-orange-500/15 blur-3xl" />
        <div className="relative flex flex-col gap-10">
          <SectionTitle eyebrow="How it is built" title={<>Free work first, <em className="accent-word">AI</em> last</>} />
          <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step.title} className="flex flex-col gap-2">
                <span className="flex items-center gap-3">
                  <span className="bg-accent flex size-8 items-center justify-center rounded-full text-sm font-semibold text-zinc-950">{index + 1}</span>
                  {index < steps.length - 1 && <span aria-hidden="true" className="hidden h-px flex-1 bg-gradient-to-r from-orange-500/60 to-transparent lg:block" />}
                </span>
                <h3 className="mt-2 font-display text-lg font-medium">{step.title}</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{step.body}</p>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Built with</p>
            <ul className="flex flex-wrap gap-2">
              {stack.map((tool) => (
                <li key={tool} className="rounded-full border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
                  {tool}
                </li>
              ))}
            </ul>
            <a href="https://github.com/BryxCinco/matchie#architecture" target="_blank" rel="noreferrer" className="link mt-2 self-start text-sm">
              Read the full architecture on GitHub
            </a>
          </div>
        </div>
      </section>
    </Container>
  );
}

function Faq() {
  const questions = [
    {
      q: "Is Matchie free?",
      a: "Yes. It runs on free tiers. The AI budget is about fifty scoring calls a day, which is why free rules filter the jobs before any AI call.",
    },
    {
      q: "Does it apply to jobs for me?",
      a: "No, and it never will. You review every job and apply yourself. Matchie finds, ranks, reminds and keeps the record.",
    },
    {
      q: "Does it read all my email?",
      a: "It checks recent mail every two hours. A free keyword check skips anything that is not about your job search; that mail is never stored and never sent to an AI.",
    },
    {
      q: "Which jobs does it find?",
      a: "Philippine and remote-friendly roles from 30+ company job boards, the LinkedIn, JobStreet and Indeed alerts in your inbox, and any posting you paste in.",
    },
    {
      q: "Does the AI see my resume?",
      a: "It sees a summary: your skills, role titles and years of experience. Never the file, your name, contact details or past employers.",
    },
    {
      q: "Can I use it on my phone?",
      a: "Yes. Open it in Safari or Chrome and choose “Add to Home Screen”. It installs like an app, with its own icon.",
    },
  ];
  return (
    <Container className="flex flex-col gap-10">
      <div className="reveal">
        <SectionTitle eyebrow="Questions" title={<>Good to <em className="accent-word">know</em></>} />
      </div>
      <div className="reveal card divide-y divide-zinc-200 overflow-hidden dark:divide-zinc-800">
        {questions.map(({ q, a }) => (
          <details key={q} className="group">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium hover:bg-zinc-50 sm:px-6 dark:hover:bg-zinc-800/40 [&::-webkit-details-marker]:hidden">
              {q}
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition-transform duration-300 ease-ios group-open:rotate-45 dark:bg-zinc-800 dark:text-zinc-400"
              >
                <Svg className="size-4">
                  <path d="M12 5v14M5 12h14" />
                </Svg>
              </span>
            </summary>
            <p className="px-5 pb-5 text-zinc-600 sm:px-6 dark:text-zinc-400">{a}</p>
          </details>
        ))}
      </div>
    </Container>
  );
}

function Closing() {
  return (
    <Container>
      <section className="reveal relative flex flex-col items-center gap-6 overflow-hidden rounded-[2rem] px-6 py-16 text-center sm:py-20">
        <div aria-hidden="true" className="bg-accent absolute inset-0 opacity-[0.12] dark:opacity-[0.16]" />
        <div aria-hidden="true" className="absolute -bottom-32 left-1/2 h-64 w-[600px] -translate-x-1/2 rounded-full bg-orange-500/40 blur-[90px]" />
        <h2 className="relative max-w-2xl font-display text-4xl leading-[1.02] font-medium tracking-tight sm:text-6xl">
          Spend your energy on jobs that <em className="accent-word">fit</em>
        </h2>
        <ul className="relative flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-zinc-700 dark:text-zinc-300">
          {["Free", "No auto-apply", "Your resume stays on your device"].map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-full bg-green-500/15 text-green-700 dark:text-green-400">
                <CheckIcon />
              </span>
              {item}
            </li>
          ))}
        </ul>
        <PrimaryCta className="relative" />
      </section>
    </Container>
  );
}

// --- Icons ------------------------------------------------------------------------

function HandIcon() {
  return (
    <Svg>
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L3 16.3a1.5 1.5 0 0 1 2.3-1.9L8 17" />
    </Svg>
  );
}

function ShieldIcon() {
  return (
    <Svg>
      <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  );
}

function ScaleIcon() {
  return (
    <Svg>
      <path d="M12 4v16M7 20h10M5 8h14M5 8l-2.5 6a3 3 0 0 0 5 0zM19 8l-2.5 6a3 3 0 0 0 5 0z" />
    </Svg>
  );
}

function LeafIcon() {
  return (
    <Svg>
      <path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z" />
      <path d="M5 19 13 11" />
    </Svg>
  );
}
