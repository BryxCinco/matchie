import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ScoreRing } from "../(dashboard)/ScoreRing";
import { HeroStage } from "./HeroStage";
import { Backdrop, CheckIcon, Container, LockIcon, Logo, PrimaryCta, SectionTitle, Svg } from "./site";

// The home page: what Matchie is, for visitors and signed-in users alike
// (the calls to action open the live demo, or "Open your dashboard" when
// signed in). Prerendered, apart from those buttons. Every name in the
// previews is invented.

export const metadata: Metadata = {
  title: { absolute: "Matchie · Your job hunt, on autopilot" },
  description:
    "Matchie finds Philippine and remote tech jobs every morning, scores each one against your resume, and updates your tracker when recruiters email you.",
};

export default function LandingPage() {
  return (
    <>
      <Backdrop />
      <main className="relative flex flex-col gap-24 pb-16 sm:gap-32">
        <Hero />
        <Stats />
        <Features />
        <HowItWorks />
        <BuiltForOne />
        <Privacy />
        <FinalCta />
      </main>
    </>
  );
}

// --- Hero -------------------------------------------------------------------

function Hero() {
  return (
    <Container className="grid items-center gap-10 pt-14 sm:gap-14 sm:pt-20 lg:grid-cols-[0.9fr_1.2fr] lg:gap-6">
      {/* CSS entrance, not motion: the hero must be visible before any JS loads. */}
      <div className="relative z-10 flex flex-col items-center gap-6 text-center motion-safe:animate-rise lg:items-start lg:text-left">
        <p className="eyebrow">
          <span>Built for the Philippine job market</span>
        </p>
        <h1 className="font-display text-5xl leading-[0.95] font-medium tracking-tight sm:text-6xl xl:text-7xl">
          Your job hunt,
          <br />
          on <em className="accent-word">autopilot</em>
        </h1>
        <p className="max-w-2xl text-lg text-zinc-600 sm:text-xl dark:text-zinc-400">
          Matchie finds Philippine and remote tech jobs every morning, scores each one against your resume, and moves your tracker when recruiters email you.
        </p>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <PrimaryCta />
          <a href="#how" className="btn-secondary min-h-12 px-7 text-base">
            See how it works
          </a>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          <LockIcon className="mr-1.5 inline size-4 align-[-0.2em]" />
          Your resume is read on your device. It is never uploaded.
        </p>
      </div>

      <div className="motion-safe:animate-rise motion-safe:[animation-delay:150ms]">
        <HeroStage />
      </div>
    </Container>
  );
}

// --- Stats --------------------------------------------------------------------

function Stats() {
  const stats = [
    { value: "30+", label: "job boards checked every morning" },
    { value: "6 AM", label: "daily digest of your best matches" },
    { value: "2 hrs", label: "between inbox checks" },
    { value: "0 bytes", label: "of your resume file uploaded" },
  ];
  return (
    <Container>
      <div className="reveal">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-200 lg:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-800">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col gap-1 bg-cream p-5 sm:p-7 dark:bg-zinc-950">
              <dt className="order-2 text-sm text-zinc-500 dark:text-zinc-400">{stat.label}</dt>
              <dd className="text-accent order-1 font-display text-3xl font-semibold sm:text-4xl">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Container>
  );
}

// --- Features -----------------------------------------------------------------

function Features() {
  return (
    <section id="features" className="scroll-mt-24">
      <Container className="flex flex-col gap-10">
        <div className="reveal">
          <SectionTitle eyebrow="What it does" title={<>Less searching. More <em className="accent-word">interviews</em></>} />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="reveal md:col-span-2">
            <Tile
              icon={<SparkIcon />}
              title="Scores every job against you"
              body="A 0-100 fit score with the skills you match, the ones you are missing, red flags, and two sentences on why. Paste any posting, or let Matchie find them."
            >
              <div className="mt-6 flex flex-wrap items-center gap-5">
                {[
                  { score: 92, label: "Frontend Developer" },
                  { score: 74, label: "Full Stack Engineer" },
                  { score: 41, label: "Senior DevOps Lead" },
                ].map((job) => (
                  <div key={job.label} className="flex items-center gap-3">
                    <ScoreRing score={job.score} loading={false} />
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{job.label}</span>
                  </div>
                ))}
              </div>
            </Tile>
          </div>
          <div className="reveal">
            <Tile icon={<MailIcon />} title="Watches your inbox" body="Rejections, interview invites, assessments and offers move your tracker on their own. Fourteen quiet days? It drafts the follow-up." />
          </div>
          <div className="reveal">
            <Tile icon={<SunIcon />} title="Finds jobs while you sleep" body="Company job boards plus your LinkedIn and JobStreet alerts, with duplicates merged. The best new matches land in your inbox at 6 AM." />
          </div>
          <div className="reveal">
            <Tile icon={<BoardIcon />} title="A tracker that fits one screen" body="Eleven stages from Saved to Offer, laid out so you see everything at once. Drag on a laptop, tap “Move to” on a phone." />
          </div>
          <div className="reveal">
            <Tile icon={<ChartIcon />} title="Know what is working" body="Your funnel, response rate, interview rate, and how many days each company takes to reply. All from your own history." />
          </div>
        </div>
      </Container>
    </section>
  );
}

function Tile({ icon, title, body, children }: { icon: ReactNode; title: string; body: string; children?: ReactNode }) {
  return (
    <article className="card group flex h-full flex-col p-6 transition-[border-color,box-shadow] duration-300 hover:border-orange-500/40 sm:p-7 dark:hover:shadow-[0_20px_60px_-30px_rgb(240_83_43/0.5)]">
      <span className="bg-accent flex size-11 items-center justify-center rounded-2xl text-zinc-950 shadow-[0_8px_24px_-8px_rgb(240_83_43/0.6)]">
        {icon}
      </span>
      <h3 className="mt-5 font-display text-xl font-medium">{title}</h3>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">{body}</p>
      {children}
    </article>
  );
}

// --- How it works ---------------------------------------------------------------

function HowItWorks() {
  const steps = [
    { title: "Add your resume", body: "Upload a PDF, Word file or a photo. Your browser reads it, and you check what it found before anything is saved." },
    { title: "Matchie does the searching", body: "Every morning it gathers new jobs, filters them with your rules, and has AI score the ones worth your time." },
    { title: "Apply. Your inbox does the rest", body: "Save a job and apply. When the company writes back, Matchie moves the card for you." },
  ];
  return (
    <section id="how" className="scroll-mt-24">
      <Container className="flex flex-col gap-10">
        <div className="reveal">
          <SectionTitle eyebrow="How it works" title={<>Three steps. Then it <em className="accent-word">runs itself</em></>} />
        </div>
        <ol className="grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="reveal relative flex h-full flex-col gap-3 overflow-hidden rounded-3xl border border-zinc-200 p-6 sm:p-7 dark:border-zinc-800"
            >
              <span aria-hidden="true" className="text-accent font-display text-7xl leading-none font-semibold opacity-90">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="font-display text-xl font-medium">{step.title}</h3>
              <p className="text-zinc-600 dark:text-zinc-400">{step.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

// --- Built for one ----------------------------------------------------------------

const STACK = ["Next.js 16", "React 19", "TypeScript", "Tailwind CSS", "Supabase", "PostgreSQL + RLS", "Gemini + Groq", "GitHub Actions", "Resend", "Vercel"];

function BuiltForOne() {
  const reasons = [
    {
      title: "The AI budget is the limit",
      body: "Free tiers allow about 50 scoring calls a day. So every job passes free SQL filters and a full-text shortlist first, and only the best few reach the AI.",
    },
    {
      title: "An inbox is personal",
      body: "Moving the tracker from recruiter email means reading an inbox. Matchie reads one: its owner’s. It never asks a stranger for theirs.",
    },
    {
      title: "Multi-user underneath",
      body: "Every table has a user_id and row-level security. Opening it to more people is a per-user quota and a loop in the workers, not a rewrite.",
    },
  ];
  return (
    <section id="built" className="scroll-mt-24">
      <Container className="flex flex-col gap-10">
        <div className="reveal flex flex-col gap-4">
          <SectionTitle eyebrow="Why one user" title={<>Built for one, <em className="accent-word">on purpose</em></>} />
          <p className="max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
            Matchie runs its owner’s real job search every day. Keeping it to one person is a trade-off, not a shortcut, and the demo account shows everything else.
          </p>
        </div>
        <ul className="grid gap-4 md:grid-cols-3">
          {reasons.map((reason) => (
            <li key={reason.title} className="reveal card flex h-full flex-col gap-2 p-6 sm:p-7">
              <h3 className="font-display text-xl font-medium">{reason.title}</h3>
              <p className="text-zinc-600 dark:text-zinc-400">{reason.body}</p>
            </li>
          ))}
        </ul>
        <div className="reveal flex flex-col gap-4">
          <p className="eyebrow">
            <span>The stack</span>
          </p>
          <ul className="flex flex-wrap gap-2">
            {STACK.map((tech) => (
              <li key={tech} className="rounded-full border border-zinc-200 px-3.5 py-1.5 text-sm font-medium text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
                {tech}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/about" className="link">
              How it is built
            </Link>
            <a href="https://github.com/BryxCinco/matchie" target="_blank" rel="noreferrer" className="link">
              Source on GitHub
            </a>
          </div>
        </div>
      </Container>
    </section>
  );
}

// --- Privacy --------------------------------------------------------------------

function Privacy() {
  const points = [
    "Your resume file is read on your device and never uploaded.",
    "Your name, email, phone and address never reach an AI model.",
    "The AI sees job descriptions and a summary of your skills. Nothing more.",
    "Personal email that is not about your job search is never stored.",
  ];
  return (
    <Container>
      <div className="reveal">
        <section className="relative overflow-hidden rounded-[2rem] border border-zinc-200 bg-white p-7 sm:p-12 dark:border-zinc-800 dark:bg-zinc-900">
          <div aria-hidden="true" className="absolute -top-24 -right-24 size-72 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div className="flex flex-col items-start gap-4">
              <span className="bg-accent flex size-12 items-center justify-center rounded-2xl text-zinc-950">
                <LockIcon className="size-6" />
              </span>
              <h2 className="font-display text-4xl leading-[1.02] font-medium tracking-tight sm:text-5xl">
                Private by <em className="accent-word">design</em>
              </h2>
              <p className="text-zinc-600 dark:text-zinc-400">A job search is personal. Matchie was built so the AI does the work without ever seeing who you are.</p>
              <Link href="/privacy" className="link">
                Read the privacy notice
              </Link>
            </div>
            <ul className="flex flex-col gap-3">
              {points.map((point) => (
                <li key={point} className="flex items-start gap-3 rounded-2xl bg-zinc-100/70 p-4 dark:bg-zinc-800/50">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-green-700 dark:text-green-400">
                    <CheckIcon />
                  </span>
                  <span className="text-zinc-700 dark:text-zinc-300">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </Container>
  );
}

// --- Final call to action ---------------------------------------------------------

function FinalCta() {
  return (
    <Container>
      <div className="reveal">
        <section className="relative flex flex-col items-center gap-6 overflow-hidden rounded-[2rem] px-6 py-16 text-center sm:py-20">
          <div aria-hidden="true" className="bg-accent absolute inset-0 opacity-[0.12] dark:opacity-[0.16]" />
          <div aria-hidden="true" className="absolute -bottom-32 left-1/2 h-64 w-[600px] -translate-x-1/2 rounded-full bg-orange-500/40 blur-[90px]" />
          <Logo className="relative size-16 motion-safe:animate-float" />
          <h2 className="relative max-w-2xl font-display text-4xl leading-[1.02] font-medium tracking-tight sm:text-6xl">
            Stop tracking jobs in a <em className="accent-word">spreadsheet</em>
          </h2>
          <p className="relative max-w-lg text-lg text-zinc-600 dark:text-zinc-400">
            Open the demo account: a full tracker, scored matches and analytics, with sample data that resets every night. No sign-up.
          </p>
          <PrimaryCta className="relative" />
        </section>
      </div>
    </Container>
  );
}

// --- Icons (24px, 1.8 stroke, like the tab bar) ------------------------------------

function MailIcon() {
  return (
    <Svg>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" />
    </Svg>
  );
}

function SunIcon() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </Svg>
  );
}

function SparkIcon() {
  return (
    <Svg>
      <path d="M12 3c.7 4.6 2.4 6.3 7 7-4.6.7-6.3 2.4-7 7-.7-4.6-2.4-6.3-7-7 4.6-.7 6.3-2.4 7-7z" />
    </Svg>
  );
}

function BoardIcon() {
  return (
    <Svg>
      <rect x="3.5" y="4" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="4" width="7" height="7" rx="1.8" />
      <rect x="3.5" y="14" width="17" height="6" rx="1.8" />
    </Svg>
  );
}

function ChartIcon() {
  return (
    <Svg>
      <path d="M5 20v-7M12 20V5M19 20v-11" />
    </Svg>
  );
}

