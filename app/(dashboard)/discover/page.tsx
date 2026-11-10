import { Suspense } from "react";
import type { Metadata } from "next";
import { isDemoUser } from "@/lib/auth/is-demo-user";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { AnalyzeResumeButton } from "./AnalyzeResumeButton";
import { DiscoverList, type DiscoverItem } from "./DiscoverList";

export const metadata: Metadata = { title: "Discover" };

// "Analyze my resume" (a server action on this page) is one LLM call, plus
// the Groq fallback if Gemini is busy; the default limit could cut it off.
export const maxDuration = 60;

const JOB_COLUMNS =
  "id, title, location, work_setup, salary_min, salary_max, source, source_url, posted_at, created_at, company:companies(name)";

export default function DiscoverPage() {
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-5xl leading-[0.95] font-medium sm:text-6xl lg:text-7xl">
          Disc<em className="accent-word">o</em>ver
        </h1>
        <p className="max-w-xl text-zinc-600 dark:text-zinc-400">
          Jobs from the boards Matchie watches, filtered by your profile and ranked by fit.
        </p>
      </header>
      <Suspense fallback={<AnalyzeResumeButton />}>
        <AnalyzeSection />
      </Suspense>
      <Suspense fallback={<DiscoverSkeleton />}>
        <DiscoverLoader />
      </Suspense>
    </div>
  );
}

async function AnalyzeSection() {
  await requireUser("/discover");
  return <AnalyzeResumeButton demo={await isDemoUser()} />;
}

async function DiscoverLoader() {
  const user = await requireUser("/discover");
  const supabase = await createClient();

  const [matchesRes, shortlistRes, savedRes, latestRes, demo] = await Promise.all([
    supabase
      .from("matches")
      .select(`fit_score, reasoning, matched_skills, missing_skills, red_flags, job:jobs(${JOB_COLUMNS})`)
      .eq("user_id", user.id)
      .order("fit_score", { ascending: false })
      .limit(100),
    supabase.rpc("shortlist_my_jobs", { p_limit: 30 }),
    supabase.from("applications").select("job_id").eq("user_id", user.id),
    supabase.from("job_sources").select("seen_at").order("seen_at", { ascending: false }).limit(1).maybeSingle(),
    isDemoUser(),
  ]);

  if (matchesRes.error || savedRes.error) {
    console.error("[discover] loading matches failed", matchesRes.error ?? savedRes.error);
    return (
      <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
        Could not load your matches. Refresh to try again.
      </p>
    );
  }
  // Without migration 007 the Unscored tab is empty; the rest still works.
  if (shortlistRes.error) console.error("[discover] shortlist_my_jobs failed", shortlistRes.error);
  const shortlistIds = shortlistRes.data?.map((row) => row.job_id) ?? [];

  const { data: unscoredJobs, error: unscoredError } = shortlistIds.length
    ? await supabase.from("jobs").select(JOB_COLUMNS).in("id", shortlistIds)
    : { data: [], error: null };
  if (unscoredError) console.error("[discover] loading shortlisted jobs failed", unscoredError);

  const now = requestTime();
  const saved = new Set(savedRes.data.map((a) => a.job_id));
  type JobRow = NonNullable<(typeof matchesRes.data)[number]["job"]>;
  const toItem = (job: JobRow, match: DiscoverItem["match"]): DiscoverItem => ({
    jobId: job.id,
    title: job.title,
    company: job.company?.name ?? null,
    location: job.location,
    workSetup: job.work_setup,
    salary: formatSalary(job.salary_min, job.salary_max),
    url: job.source_url && /^https?:\/\//i.test(job.source_url) ? job.source_url : null,
    postedLabel: relativeDays(job.posted_at ?? job.created_at, now),
    isNew: now - Date.parse(job.created_at) < 24 * 3600 * 1000,
    match,
  });

  const scored = matchesRes.data
    // Pasted JDs live on the dashboard; saved jobs live on the tracker. The
    // demo's seeded jobs are "manual" too (to keep them out of the shared
    // pipeline), and they are what its Discover page is for.
    .filter((m) => m.job && (demo || m.job.source !== "manual") && !saved.has(m.job.id))
    .map((m) =>
      toItem(m.job!, {
        fitScore: m.fit_score,
        reasoning: m.reasoning,
        matchedSkills: m.matched_skills,
        missingSkills: m.missing_skills,
        redFlags: m.red_flags,
      }),
    );
  // Keep the shortlist's rank order (best full-text match first).
  const unscoredById = new Map((unscoredJobs ?? []).map((job) => [job.id, job]));
  const unscored = shortlistIds.flatMap((id) => {
    const job = unscoredById.get(id);
    return job ? [toItem(job, null)] : [];
  });

  const items = [...scored, ...unscored];
  const newToday = items.filter((item) => item.isNew).length;
  const updated = latestRes.data?.seen_at
    ? new Date(latestRes.data.seen_at).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false })
    : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-y border-zinc-200 py-3 dark:border-zinc-800">
        <p className="eyebrow">
          <span>New</span>
          <span className="text-zinc-950 dark:text-zinc-50">
            {newToday} job{newToday === 1 ? "" : "s"} today
          </span>
        </p>
        {updated && (
          <p className="eyebrow">
            <span>Updated</span>
            <span className="text-zinc-950 tabular-nums dark:text-zinc-50">{updated}</span>
          </p>
        )}
      </div>
      {/* Keyed by the data: DiscoverList keeps items in state, so a refresh
          with new scores (after "Analyze") must remount it. */}
      <DiscoverList
        key={dataKey(items)}
        initialItems={items}
        demo={demo}
        shortlistFailed={!!shortlistRes.error || !!unscoredError}
      />
    </>
  );
}

// Only call after requireUser(): it calls connection(), which is what makes
// reading the clock allowed during render with cacheComponents.
function requestTime() {
  return Date.now();
}

// Short fingerprint of which jobs are listed and how they are scored.
function dataKey(items: DiscoverItem[]) {
  let hash = 0;
  for (const item of items) {
    for (const ch of `${item.jobId}:${item.match?.fitScore ?? "-"};`) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  }
  return `${items.length}-${hash}`;
}

// jobs.salary_* are monthly PHP.
function formatSalary(min: number | null, max: number | null) {
  const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  if (min && max) return min === max ? `₱${k(min)}/mo` : `₱${k(min)}–${k(max)}/mo`;
  if (max) return `Up to ₱${k(max)}/mo`;
  if (min) return `From ₱${k(min)}/mo`;
  return null;
}

function relativeDays(iso: string, now: number) {
  const days = Math.floor((now - Date.parse(iso)) / (24 * 3600 * 1000));
  if (Number.isNaN(days)) return null;
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function DiscoverSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <div className="h-11 w-full animate-pulse rounded-full bg-zinc-200/70 sm:w-96 dark:bg-zinc-800/60" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-60 animate-pulse rounded-3xl bg-zinc-200/60 dark:bg-zinc-900" />
        ))}
      </div>
    </div>
  );
}
