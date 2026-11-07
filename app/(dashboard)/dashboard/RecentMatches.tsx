import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { RecentMatchCard } from "./RecentMatchCard";

const SHOWN = 3;

// The three most recently scored jobs that are not in the tracker yet.
export async function RecentMatches() {
  const user = await requireUser("/dashboard");
  const supabase = await createClient();

  const [matchesRes, savedRes] = await Promise.all([
    supabase
      .from("matches")
      .select("fit_score, reasoning, scored_at, job:jobs(id, title, location, company:companies(name))")
      .eq("user_id", user.id)
      .order("scored_at", { ascending: false })
      .limit(30),
    supabase.from("applications").select("job_id").eq("user_id", user.id),
  ]);
  if (matchesRes.error || savedRes.error) {
    console.error("[dashboard] recent matches failed", matchesRes.error ?? savedRes.error);
    return <p className="text-sm text-red-600 dark:text-red-400">Could not load your matches. Refresh to try again.</p>;
  }

  const saved = new Set(savedRes.data.map((a) => a.job_id));
  const recent = matchesRes.data.filter((m) => m.job && !saved.has(m.job.id)).slice(0, SHOWN);

  if (recent.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
        <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">No new matches to review. Fresh jobs are scored every morning.</p>
        <Link href="/discover" className="btn-primary min-h-11 px-5">
          Browse Discover
        </Link>
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {recent.map((m, index) => (
        <li key={m.job!.id} className="animate-rise" style={{ animationDelay: `${index * 60}ms` }}>
          <RecentMatchCard
            jobId={m.job!.id}
            title={m.job!.title}
            meta={[m.job!.company?.name, m.job!.location].filter(Boolean).join(" · ")}
            fitScore={m.fit_score}
            reasoning={m.reasoning}
          />
        </li>
      ))}
    </ul>
  );
}

export function RecentMatchesSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: SHOWN }, (_, i) => (
        <div key={i} className={`h-48 animate-pulse rounded-3xl bg-zinc-200/60 dark:bg-zinc-900 ${i === 2 ? "hidden lg:block" : i === 1 ? "hidden sm:block" : ""}`} />
      ))}
    </div>
  );
}
