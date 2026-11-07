"use server";

import { requireUser } from "@/lib/auth/require-user";
import { MAX_BATCH_JOBS, scoreJobsBatch } from "@/lib/batch-scoring";
import { loadCandidate } from "@/lib/load-candidate";
import { createClient } from "@/lib/supabase/server";

export type AnalyzeResult =
  | { ok: true; scored: number; rescored: number; strong: number }
  | { ok: false; error: string };

const STRONG_FIT = 80;

/**
 * "Analyze my resume": scores the user's top shortlisted jobs now, in one
 * LLM call, instead of waiting for the daily scoring run.
 *
 * The free stages are the existing ones: shortlist_my_jobs() applies the
 * rules filter (setup, salary, years, distance, industry) and ranks unscored
 * jobs by full-text match against the profile's target roles and skills.
 * Every result is saved, not only strong fits, so the same jobs are not
 * scored again on the next click.
 *
 * Scores older than the user's last profile or resume edit are stale: they
 * judged a different candidate. Those are re-scored first, then the rest of
 * the batch is filled with new jobs from the shortlist.
 */
export async function analyzeResumeForJobs(): Promise<AnalyzeResult> {
  const user = await requireUser("/discover");
  const supabase = await createClient();

  const loaded = await loadCandidate(supabase, user.id);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  // Pasted jobs keep their full single-job score; only discovered ones are
  // re-scored here. Best first, so the matches the user sees are fixed first.
  const { data: stale, error: staleError } = await supabase
    .from("matches")
    .select("job_id, job:jobs!inner(source)")
    .eq("user_id", user.id)
    .lt("scored_at", new Date(loaded.inputsChangedAt).toISOString())
    .neq("job.source", "manual")
    .order("fit_score", { ascending: false })
    .limit(MAX_BATCH_JOBS);
  if (staleError) {
    console.error("[discover] loading stale matches failed", staleError.code);
    return { ok: false, error: "Could not search for jobs. Please try again." };
  }

  const openSlots = MAX_BATCH_JOBS - stale.length;
  const { data: shortlist, error: shortlistError } =
    openSlots > 0 ? await supabase.rpc("shortlist_my_jobs", { p_limit: openSlots }) : { data: [], error: null };
  if (shortlistError) {
    console.error("[discover] shortlist failed", shortlistError.code);
    return { ok: false, error: "Could not search for jobs. Please try again." };
  }

  const jobIds = [...stale.map((row) => row.job_id), ...shortlist.map((row) => row.job_id)];
  if (jobIds.length === 0) return { ok: true, scored: 0, rescored: 0, strong: 0 };

  const { data: jobs, error: jobsError } = await supabase
    .from("jobs")
    .select("id, title, description, location, work_setup, company:companies(name)")
    .in("id", jobIds);
  if (jobsError) {
    console.error("[discover] loading jobs failed", jobsError.code);
    return { ok: false, error: "Could not load the jobs. Please try again." };
  }

  let result;
  try {
    result = await scoreJobsBatch(
      jobs.map((job) => ({
        id: job.id,
        title: job.title,
        company: job.company?.name ?? null,
        location: job.location,
        workSetup: job.work_setup,
        description: job.description,
      })),
      loaded.candidate,
      loaded.seeker,
    );
  } catch (error) {
    console.error("[discover] batch scoring failed", error instanceof Error ? error.name : error);
    return { ok: false, error: "The AI service is busy or unavailable. Try again in a few minutes." };
  }

  const scoredAt = new Date().toISOString();
  const rows = [...result.scores].map(([jobId, match]) => ({
    job_id: jobId,
    user_id: user.id,
    ...match,
    model: `${result.provider}-batch`,
    scored_at: scoredAt,
  }));
  if (rows.length > 0) {
    const { error: saveError } = await supabase.from("matches").upsert(rows, { onConflict: "user_id,job_id" });
    if (saveError) {
      console.error("[discover] saving matches failed", saveError.code);
      return { ok: false, error: "Jobs were scored but could not be saved. Please try again." };
    }
  }

  const staleIds = new Set(stale.map((row) => row.job_id));
  return {
    ok: true,
    scored: rows.length,
    rescored: rows.filter((row) => staleIds.has(row.job_id)).length,
    strong: rows.filter((row) => row.fit_score >= STRONG_FIT).length,
  };
}
