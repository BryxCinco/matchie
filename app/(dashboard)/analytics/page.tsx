import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { computeAnalytics, percent, type Analytics, type FunnelStage } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";
import { FadeIn } from "../motion";

// Read-only views over application_events (lib/analytics.ts). No LLM calls.
// Charts are plain HTML bars: one series each, so one color (the accent),
// no legend, and every value is also written out as text.

const STAGE_LABELS: Record<FunnelStage, string> = {
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
};
const MAX_COMPANIES = 8;
// One user's history is a few hundred events; this only guards the query.
const MAX_EVENTS = 5_000;

export default function AnalyticsPage() {
  return (
    <div className="flex flex-col gap-6">
      <FadeIn>
        <header className="flex flex-col gap-3">
          <h1 className="font-display text-4xl leading-[0.95] font-medium sm:text-5xl lg:text-6xl">
            Your <em className="accent-word">Analytics</em>
          </h1>
          <p className="max-w-xl text-zinc-600 dark:text-zinc-400">How your search is going, from every move in your tracker.</p>
        </header>
      </FadeIn>
      <Suspense fallback={<AnalyticsSkeleton />}>
        <AnalyticsLoader />
      </Suspense>
    </div>
  );
}

async function AnalyticsLoader() {
  const user = await requireUser("/analytics");
  const supabase = await createClient();

  const [events, applications] = await Promise.all([
    supabase
      .from("application_events")
      .select("application_id, to_status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(MAX_EVENTS),
    supabase.from("applications").select("id, job:jobs(company:companies(name))").eq("user_id", user.id),
  ]);
  if (events.error || applications.error) {
    console.error("[analytics] loading failed", (events.error ?? applications.error)?.code);
    return (
      <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
        Could not load your analytics. Refresh to try again.
      </p>
    );
  }

  const companyOf = new Map(applications.data.map((app) => [app.id, app.job?.company?.name ?? null]));
  const analytics = computeAnalytics(
    events.data.map((e) => ({ applicationId: e.application_id, toStatus: e.to_status, createdAt: e.created_at })),
    companyOf,
  );

  if (analytics.applied === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 p-8 text-center sm:p-12">
        <p className="font-display text-xl font-medium">Nothing to measure yet</p>
        <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
          Move an application to Applied on your tracker. As companies answer, this page shows your funnel, response rate and how long each company takes.
        </p>
        <Link href="/tracker" className="btn-primary mt-2 min-h-11 px-5">
          Open the tracker
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <FadeIn delay={0.05}>
        <Headline analytics={analytics} />
      </FadeIn>
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <FadeIn delay={0.1}>
          <Funnel analytics={analytics} />
        </FadeIn>
        <FadeIn delay={0.15}>
          <ResponseTimes analytics={analytics} />
        </FadeIn>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        A response is any answer from the company, rejections included. Ghosted applications count as no response.
      </p>
    </div>
  );
}

function Headline({ analytics }: { analytics: Analytics }) {
  const responseRate = percent(analytics.responded, analytics.applied);
  const interviewRate = percent(analytics.interviewed, analytics.applied);
  const tiles = [
    { label: "Applied", value: String(analytics.applied), hint: "applications sent" },
    { label: "Response rate", value: responseRate === null ? "–" : `${responseRate}%`, hint: `${analytics.responded} of ${analytics.applied} answered`, accent: true },
    { label: "Interview rate", value: interviewRate === null ? "–" : `${interviewRate}%`, hint: `${analytics.interviewed} reached interview` },
    {
      label: "Median reply",
      value: analytics.medianResponseDays === null ? "–" : formatDays(analytics.medianResponseDays, true),
      hint: "from applying to first answer",
    },
  ];

  return (
    <ul className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
      {tiles.map((tile) => (
        <li key={tile.label} className="glass flex h-full flex-col gap-1 rounded-3xl border p-4 sm:p-5 dark:bg-zinc-900/60">
          <span className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase sm:text-xs dark:text-zinc-400">{tile.label}</span>
          <span className={`font-display text-3xl leading-none font-semibold tabular-nums sm:text-5xl ${tile.accent ? "text-accent" : ""}`}>{tile.value}</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{tile.hint}</span>
        </li>
      ))}
    </ul>
  );
}

function Funnel({ analytics }: { analytics: Analytics }) {
  return (
    <section aria-labelledby="funnel-title" className="card flex h-full flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 id="funnel-title" className="font-display text-lg font-medium">
          Funnel
        </h2>
        <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">Applications that reached each stage or went further.</p>
      </div>
      <ol className="flex flex-col gap-4">
        {analytics.funnel.map(({ stage, count }) => {
          const share = percent(count, analytics.applied) ?? 0;
          return (
            <li key={stage} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{STAGE_LABELS[stage]}</span>
                <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold text-zinc-950 dark:text-zinc-50">{count}</span> · {share}%
                </span>
              </div>
              <Bar fraction={count / analytics.applied} label={`${STAGE_LABELS[stage]}: ${count} of ${analytics.applied} (${share}%)`} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ResponseTimes({ analytics }: { analytics: Analytics }) {
  const rows = analytics.byCompany.slice(0, MAX_COMPANIES);
  const longest = Math.max(...rows.map((row) => row.medianDays), 1);

  return (
    <section aria-labelledby="response-title" className="card flex h-full flex-col gap-5 p-5 sm:p-6">
      <div>
        <h2 id="response-title" className="font-display text-lg font-medium">
          Median response time
        </h2>
        <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">Days from applying to the first answer, slowest first.</p>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">No answers to time yet. They appear once a company replies to an application you moved to Applied.</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {rows.map((row) => (
            <li key={row.company} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">{row.company}</span>
                <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold text-zinc-950 dark:text-zinc-50">{formatDays(row.medianDays)}</span>
                  {" · "}
                  {row.responses} {row.responses === 1 ? "reply" : "replies"}
                </span>
              </div>
              <Bar fraction={row.medianDays / longest} label={`${row.company}: ${formatDays(row.medianDays)} median over ${row.responses} ${row.responses === 1 ? "reply" : "replies"}`} />
            </li>
          ))}
        </ol>
      )}
      {analytics.byCompany.length > MAX_COMPANIES && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Showing the {MAX_COMPANIES} slowest of {analytics.byCompany.length} companies.</p>
      )}
    </section>
  );
}

// A thin horizontal bar on a recessive track. The value is always written
// next to it; the bar's title is the hover tooltip.
function Bar({ fraction, label }: { fraction: number; label: string }) {
  const width = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div title={label} className="h-2.5 w-full rounded-full bg-zinc-200/70 dark:bg-zinc-800">
      <div
        className="bg-accent h-full rounded-full transition-[width] duration-700 ease-ios"
        // A zero still shows a dot, so the row does not read as missing.
        style={{ width: width === 0 ? "0.625rem" : `${width}%`, opacity: width === 0 ? 0.35 : 1 }}
      />
    </div>
  );
}

function formatDays(days: number, short = false) {
  if (days < 1) return short ? "<1d" : "same day";
  const rounded = days < 10 ? Math.round(days * 10) / 10 : Math.round(days);
  if (short) return `${rounded}d`;
  return `${rounded} ${rounded === 1 ? "day" : "days"}`;
}

function AnalyticsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4 sm:gap-6">
      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-3xl bg-zinc-200/60 sm:h-36 dark:bg-zinc-800" />
        ))}
      </div>
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-3xl bg-zinc-200/60 dark:bg-zinc-800" />
        <div className="h-72 animate-pulse rounded-3xl bg-zinc-200/60 dark:bg-zinc-800" />
      </div>
    </div>
  );
}
