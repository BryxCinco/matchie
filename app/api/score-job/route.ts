import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { scoreJob, type MatchResult } from "@/lib/match-scoring";
import { toCandidateSummary } from "@/lib/resume";

const BodySchema = z.object({
  job_description: z
    .string()
    .trim()
    .min(50, "Paste the full job description (at least 50 characters).")
    .max(20_000, "That job description is too long (max 20,000 characters)."),
});

export type ScoreJobResponse = {
  job_id: string;
  match: MatchResult;
  provider: string | null;
  /** True when an existing score was returned without calling the LLM. */
  cached: boolean;
};

// Paste-the-JD box: create a jobs row by hand, score it, save the match.
// Runs as the user (anon key + session), so RLS applies to every query.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return error(401, "You need to sign in.");

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return error(400, body.error.issues[0]?.message ?? "Invalid request.");
  const jobDescription = body.data.job_description;

  const [{ data: seeker, error: seekerError }, { data: resume, error: resumeError }] = await Promise.all([
    supabase
      .from("seeker_profiles")
      .select("target_roles, min_salary, work_setup, avoid_industries, skills, years_experience, updated_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("resumes").select("content, updated_at").eq("user_id", user.id).eq("is_master", true).maybeSingle(),
  ]);
  if (seekerError || resumeError) return error(500, "Could not load your profile.", seekerError ?? resumeError);
  if (!seeker) return error(400, "Complete your job-search profile before scoring jobs.");

  const candidate = toCandidateSummary(resume?.content, seeker);
  if (candidate.skills.length === 0 && candidate.experience.length === 0) {
    return error(400, "Upload a resume or add skills to your profile before scoring jobs.");
  }

  // Manual jobs are hashed per user: a pasted JD is the user's own record,
  // and the RLS insert policy only allows rows they created.
  const canonicalHash = sha256(`manual:${user.id}:${normalize(jobDescription)}`);

  // Re-pasting the same JD reuses the saved score, unless the profile or
  // resume changed since. Every LLM call spends the daily token budget.
  const { data: existingJob } = await supabase.from("jobs").select("id").eq("canonical_hash", canonicalHash).maybeSingle();
  if (existingJob) {
    const { data: existingMatch } = await supabase
      .from("matches")
      .select("fit_score, matched_skills, missing_skills, red_flags, reasoning, model, scored_at")
      .eq("job_id", existingJob.id)
      .eq("user_id", user.id)
      .maybeSingle();
    const inputsChangedAt = Math.max(Date.parse(seeker.updated_at), resume ? Date.parse(resume.updated_at) : 0);
    if (existingMatch && Date.parse(existingMatch.scored_at) > inputsChangedAt) {
      return NextResponse.json<ScoreJobResponse>({
        job_id: existingJob.id,
        match: {
          fit_score: existingMatch.fit_score,
          matched_skills: existingMatch.matched_skills,
          missing_skills: existingMatch.missing_skills,
          red_flags: existingMatch.red_flags,
          reasoning: existingMatch.reasoning ?? "",
        },
        provider: existingMatch.model,
        cached: true,
      });
    }
  }

  const result = await scoreJob(jobDescription, candidate, seeker);
  if (result.failed) {
    return error(500, `${result.reasoning}. The AI service is busy or unavailable; please try again in a few minutes.`);
  }
  const { provider } = result;
  const match: MatchResult = {
    fit_score: result.fit_score,
    matched_skills: result.matched_skills,
    missing_skills: result.missing_skills,
    red_flags: result.red_flags,
    reasoning: result.reasoning,
  };

  let jobId = existingJob?.id;
  if (!jobId) {
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        title: titleFrom(jobDescription),
        description: jobDescription,
        source: "manual",
        canonical_hash: canonicalHash,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (jobError || !job) return error(500, "Could not save the job.", jobError);
    jobId = job.id;
  }

  const { error: matchError } = await supabase.from("matches").upsert(
    {
      job_id: jobId,
      user_id: user.id,
      ...match,
      model: provider,
      scored_at: new Date().toISOString(),
    },
    { onConflict: "user_id,job_id" },
  );
  if (matchError) return error(500, "The job was scored but the result could not be saved.", matchError);

  return NextResponse.json<ScoreJobResponse>({ job_id: jobId, match, provider, cached: false });
}

// Server-side detail goes to the log; the client gets a safe message.
function error(status: number, message: string, cause?: unknown) {
  if (cause) console.error(`[api/score-job] ${message}`, cause);
  return NextResponse.json({ error: message }, { status });
}

function sha256(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

// Whitespace and case differences should not create a second job.
function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

// Pasted JDs have no structured title; the first line is almost always it.
function titleFrom(jobDescription: string) {
  const firstLine = jobDescription
    .split("\n")
    .map((line) => line.replace(/^[#*\s-]+/, "").trim())
    .find(Boolean);
  if (!firstLine) return "Pasted job";
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
}
