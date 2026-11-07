// Scoring worker: pipeline stages 3-5. shortlist_jobs() does the free rules
// filter and full-text ranking in SQL; only the shortlist reaches the LLM.
// Run by .github/workflows/discovery.yml after the ATS poller:
//   node workers/score-matches.ts
//
// Budget: every job scored here is one LLM call (~3,500 tokens). Groq's free
// tier allows ~50 a day across all features, so the cap is deliberately low;
// what is not scored today is still in the shortlist tomorrow.
//
// LOGGING RULE: public repo, public logs. Counts and ids only.
//
// Env:
//   MATCHIE_USER_ID, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   GEMINI_API_KEY, GROQ_API_KEY
//   Optional: MAX_SCORES_PER_RUN (30), SCORE_DELAY_MS (4000)

import { createClient } from "../lib/supabase/admin.ts";
import { describeError } from "../lib/describe-error.ts";
import { scoreJob } from "../lib/match-scoring.ts";
import { toCandidateSummary } from "../lib/resume.ts";

const MAX_SCORES_PER_RUN = Number(process.env.MAX_SCORES_PER_RUN ?? 30);
// Gemini's free tier allows few requests per minute; spacing calls avoids
// burning the Groq fallback on rate limits we caused ourselves.
const SCORE_DELAY_MS = Number(process.env.SCORE_DELAY_MS ?? 4_000);
// Both providers down: stop instead of failing the rest of the shortlist.
const MAX_CONSECUTIVE_FAILURES = 3;

const stats = { shortlisted: 0, scored: 0, failed: 0 };

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

async function main() {
  const userId = requireEnv("MATCHIE_USER_ID");
  requireEnv("GEMINI_API_KEY");
  const supabase = createClient();

  const [{ data: seeker, error: seekerError }, { data: resume, error: resumeError }] = await Promise.all([
    supabase
      .from("seeker_profiles")
      .select("target_roles, min_salary, work_setup, avoid_industries, skills, years_experience, home_city, preferred_locations")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("resumes").select("content").eq("user_id", userId).eq("is_master", true).maybeSingle(),
  ]);
  if (seekerError || resumeError) throw new Error(`Could not load profile (${(seekerError ?? resumeError)!.code})`);
  if (!seeker) {
    console.log("[score-matches] no seeker profile yet; nothing to score");
    return;
  }

  const candidate = toCandidateSummary(resume?.content, seeker);
  if (candidate.skills.length === 0 && candidate.experience.length === 0) {
    console.log("[score-matches] no skills or resume yet; nothing to score");
    return;
  }

  const { data: shortlist, error: shortlistError } = await supabase.rpc("shortlist_jobs", {
    p_user_id: userId,
    p_limit: MAX_SCORES_PER_RUN,
  });
  if (shortlistError) throw new Error(`shortlist_jobs failed (${shortlistError.code}): ${shortlistError.message}`);
  stats.shortlisted = shortlist.length;
  if (shortlist.length === 0) {
    console.log(`[score-matches] ${JSON.stringify(stats)}`);
    return;
  }

  const { data: jobs, error: jobsError } = await supabase
    .from("jobs")
    .select("id, title, description, location, work_setup, company:companies(name)")
    .in(
      "id",
      shortlist.map((row) => row.job_id),
    );
  if (jobsError) throw new Error(`Could not load jobs (${jobsError.code})`);
  const jobById = new Map(jobs.map((job) => [job.id, job]));

  let consecutiveFailures = 0;
  for (const [index, { job_id }] of shortlist.entries()) {
    const job = jobById.get(job_id);
    if (!job) continue;
    if (index > 0) await sleep(SCORE_DELAY_MS);

    // Board postings put title, company and location in fields, not the text.
    const header = [
      `Title: ${job.title}`,
      job.company?.name ? `Company: ${job.company.name}` : null,
      job.location ? `Location: ${job.location}` : null,
      job.work_setup ? `Work setup: ${job.work_setup}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    const result = await scoreJob(`${header}\n\n${job.description ?? ""}`, candidate, seeker);

    if (result.failed) {
      stats.failed++;
      if (++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(`[score-matches] ${MAX_CONSECUTIVE_FAILURES} failures in a row; stopping. The rest stay shortlisted for the next run.`);
        break;
      }
      continue;
    }
    consecutiveFailures = 0;

    const { error } = await supabase.from("matches").upsert(
      {
        job_id,
        user_id: userId,
        fit_score: result.fit_score,
        matched_skills: result.matched_skills,
        missing_skills: result.missing_skills,
        red_flags: result.red_flags,
        reasoning: result.reasoning,
        model: result.provider,
        scored_at: new Date().toISOString(),
      },
      { onConflict: "user_id,job_id" },
    );
    if (error) {
      stats.failed++;
      console.error(`[score-matches] job ${job_id}: could not save match (${error.code})`);
      continue;
    }
    stats.scored++;
  }

  console.log(`[score-matches] ${JSON.stringify(stats)}`);
  // Some failures are expected on a busy day; none scored means a real outage.
  if (stats.scored === 0 && stats.failed > 0) process.exitCode = 1;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(`[score-matches] fatal: ${describeError(error)}`);
  process.exit(1);
});
