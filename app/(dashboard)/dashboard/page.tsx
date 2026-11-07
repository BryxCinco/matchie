import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { FadeIn } from "../motion";
import { QuickActions } from "./QuickActions";
import { RecentMatches, RecentMatchesSkeleton } from "./RecentMatches";
import { StatsSkeleton, StatsWidget } from "./StatsWidget";
import { UpcomingInterviews, UpcomingInterviewsSkeleton } from "./UpcomingInterviews";

// Command center. The headings, quick actions and layout are static and
// prerender into the shell; each widget reads its own data behind its own
// Suspense boundary, so a slow query delays only its card.
//
// Layout: one column on phones; from md, interviews and quick actions sit
// side by side; from lg, interviews take two thirds.
export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <FadeIn>
        <header className="flex flex-col gap-2">
          <Suspense fallback={<p className="eyebrow h-4" />}>
            <Greeting />
          </Suspense>
          <h1 className="font-display text-4xl leading-[0.95] font-medium sm:text-5xl lg:text-6xl">
            Command <em className="accent-word">Center</em>
          </h1>
        </header>
      </FadeIn>

      <FadeIn delay={0.06}>
        <Suspense fallback={<StatsSkeleton />}>
          <StatsWidget />
        </Suspense>
      </FadeIn>

      <FadeIn delay={0.12}>
        <Section
          title="Recent matches"
          action={
            <Link href="/discover" className="link text-sm">
              See all
            </Link>
          }
        >
          <Suspense fallback={<RecentMatchesSkeleton />}>
            <RecentMatches />
          </Suspense>
        </Section>
      </FadeIn>

      <FadeIn delay={0.18} className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        <Section title="Upcoming interviews" className="lg:col-span-2">
          <div className="card p-5 sm:p-6">
            <Suspense fallback={<UpcomingInterviewsSkeleton />}>
              <UpcomingInterviews />
            </Suspense>
          </div>
        </Section>
        <Section title="Quick actions">
          <QuickActions />
        </Section>
      </FadeIn>
    </div>
  );
}

function Section({ title, action, className = "", children }: { title: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`flex flex-col gap-4 ${className}`}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-xl font-medium sm:text-2xl">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

async function Greeting() {
  const user = await requireUser("/dashboard");
  const name = user.email?.split("@")[0];
  return (
    <p className="eyebrow">
      <span>{greetingFor(requestTime())}</span>
      <span className="text-zinc-950 dark:text-zinc-50">{name}</span>
    </p>
  );
}

// requireUser() called connection(), so reading the clock is allowed here.
function requestTime() {
  return Date.now();
}

function greetingFor(now: number) {
  const hour = Number(new Date(now).toLocaleString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", hour12: false }));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}
