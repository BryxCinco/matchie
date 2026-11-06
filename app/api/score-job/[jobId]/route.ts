import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { scoreJob, type MatchResult, type ScoreExistingJobResponse } from "@/lib/match-scoring";
import { loadCandidate } from "@/lib/load-candidate";

// Gemini, then the Groq fallback, each with a 30s timeout. The default
// function limit would cut a fallback off halfway.
export const maxDuration = 60;

// Discover page: score a job that is already in `jobs` (found by the ATS
// poller). Runs as the user (anon key + session), so RLS applies throughout.
export async function POST(_request: NextRequest, { params }: RouteContext<"/api/score-job/[jobId]">) {
  const { jobId } = await params;
  if (!z.uuid().safeParse(jobId).success) return error(400, "Invalid job.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return error(401, "You need to sign in.");

  const [{ data: job, error: jobError }, loaded] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, description, location, work_setup, source, created_by, company:companies(name)")
      .eq("id", jobId)
      .maybeSingle(),
    loadCandidate(supabase, user.id),
  ]);
  if (jobError) return error(500, "Could not load the job.", jobError);
  // Someone else's pasted JD is theirs, not a shared posting.
  if (!job || (job.source === "manual" && job.created_by !== user.id)) return error(404, "Job not found.");
  if (!loaded.ok) return error(loaded.status, loaded.error, loaded.cause);
  const { seeker, candidate, inputsChangedAt } = loaded;

  // A second tap, or two open tabs, should not spend the token budget twice.
  const { data: existing } = await supabase
    .from("matches")
    .select("fit_score, matched_skills, missing_skills, red_flags, reasoning, model, scored_at")
    .eq("job_id", jobId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing && Date.parse(existing.scored_at) > inputsChangedAt) {
    return NextResponse.json<ScoreExistingJobResponse>({
      match: {
        fit_score: existing.fit_score,
        matched_skills: existing.matched_skills,
        missing_skills: existing.missing_skills,
        red_flags: existing.red_flags,
        reasoning: existing.reasoning ?? "",
      },
      provider: existing.model,
      cached: true,
    });
  }

  // Board postings keep title, company and location in fields, not the text.
  const header = [
    `Title: ${job.title}`,
    job.company?.name ? `Company: ${job.company.name}` : null,
    job.location ? `Location: ${job.location}` : null,
    job.work_setup ? `Work setup: ${job.work_setup}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await scoreJob(`${header}\n\n${job.description ?? ""}`, candidate, seeker);
  if (result.failed) return error(503, "The AI service is busy or unavailable. Try again in a few minutes.");

  const match: MatchResult = {
    fit_score: result.fit_score,
    matched_skills: result.matched_skills,
    missing_skills: result.missing_skills,
    red_flags: result.red_flags,
    reasoning: result.reasoning,
  };
  const { error: matchError } = await supabase
    .from("matches")
    .upsert({ job_id: jobId, user_id: user.id, ...match, model: result.provider, scored_at: new Date().toISOString() }, { onConflict: "user_id,job_id" });
  if (matchError) return error(500, "The job was scored but the result could not be saved.", matchError);

  return NextResponse.json<ScoreExistingJobResponse>({ match, provider: result.provider, cached: false });
}

// Server-side detail goes to the log; the client gets a safe message.
function error(status: number, message: string, cause?: unknown) {
  if (cause) console.error(`[api/score-job/[jobId]] ${message}`, cause);
  return NextResponse.json({ error: message }, { status });
}
