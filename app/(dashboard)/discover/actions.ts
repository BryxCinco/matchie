"use server";

import { requireUser } from "@/lib/auth/require-user";
import { MAX_BATCH_JOBS, scoreJobsBatch } from "@/lib/batch-scoring";
import { loadCandidate } from "@/lib/load-candidate";
import { createClient } from "@/lib/supabase/server";

export type AnalyzeResult = { ok: true; scored: number; strong: number } | { ok: false; error: string };

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
 */
export async function analyzeResumeForJobs(): Promise<AnalyzeResult> {
  const user = await requireUser("/discover");
  const supabase = await createClient();

  const loaded = await loadCandidate(supabase, user.id);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const { data: shortlist, error: shortlistError } = await supabase.rpc("shortlist_my_jobs", { p_limit: MAX_BATCH_JOBS });
  if (shortlistError) {
    console.error("[discover] shortlist failed", shortlistError.code);
    return { ok: false, error: "Could not search for jobs. Please try again." };
  }
  if (shortlist.length === 0) return { ok: true, scored: 0, strong: 0 };

  const { data: jobs, error: jobsError } = await supabase
    .from("jobs")
    .select("id, title, description, location, work_setup, company:companies(name)")
    .in(
      "id",
      shortlist.map((row) => row.job_id),
    );
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

  return { ok: true, scored: rows.length, strong: rows.filter((row) => row.fit_score >= STRONG_FIT).length };
}
