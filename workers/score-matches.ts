// Scoring worker: pipeline stages 3-5. shortlist_jobs() does the free rules
// filter and full-text ranking in SQL; only the shortlist reaches the LLM.
// Run by .github/workflows/discovery.yml after the ATS poller:
//   node workers/score-matches.ts
//
// Multi-user: serves every eligible user (lib/worker-users.ts) round-robin,
// reserved users first in each pass.
//
// Budget: every job scored here is one LLM call (~3,500 tokens), charged
// first to the user's daily quota (consume_llm_quota, migration 017). The
// run cap is deliberately low; what is not scored today is still in the
// shortlist tomorrow.
//
// LOGGING RULE: public repo, public logs. Counts and ids only.
//
// Env:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   GEMINI_API_KEY, GROQ_API_KEY
//   Optional: MAX_SCORES_PER_RUN (30), SCORE_DELAY_MS (10000)

import { createClient } from "../lib/supabase/admin.ts";
import { describeError } from "../lib/describe-error.ts";
import { scoreJob } from "../lib/match-scoring.ts";
import { toCandidateSummary } from "../lib/resume.ts";
import { chargeUser } from "../lib/llm-quota.ts";
import { interleave } from "../lib/round-robin.ts";
import { loadEligibleUsers } from "../lib/worker-users.ts";

const MAX_SCORES_PER_RUN = Number(process.env.MAX_SCORES_PER_RUN ?? 30);
// Gemini's free tier allows few requests per minute; spacing calls avoids
// burning the Groq fallback on rate limits we caused ourselves.
const SCORE_DELAY_MS = Number(process.env.SCORE_DELAY_MS ?? 10_000);
// Both providers down: stop instead of failing the rest of the shortlist.
const MAX_CONSECUTIVE_FAILURES = 3;

const stats = { users: 0, shortlisted: 0, scored: 0, failed: 0, quotaSkipped: 0 };

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

async function main() {
  requireEnv("GEMINI_API_KEY");
  const supabase = createClient();

  const users = await loadEligibleUsers(supabase);
  const queues: { key: string; items: string[] }[] = [];
  const contextByUser = new Map<string, UserContext>();
  for (const { userId } of users) {
    const loaded = await loadUserContext(supabase, userId);
    if (!loaded) continue;
    const { data: shortlist, error } = await supabase.rpc("shortlist_jobs", { p_user_id: userId, p_limit: MAX_SCORES_PER_RUN });
    if (error) {
      stats.failed++;
      console.error(`[score-matches] user ${userId}: shortlist_jobs failed (${error.code})`);
      continue;
    }
    if (shortlist.length === 0) continue;
    contextByUser.set(userId, loaded);
    queues.push({ key: userId, items: shortlist.map((row) => row.job_id) });
    stats.shortlisted += shortlist.length;
  }
  stats.users = queues.length;

  // Round-robin, reserved users first in each pass (loadEligibleUsers order),
  // capped for the whole run. What is not scored stays shortlisted.
  const work = interleave(queues).slice(0, MAX_SCORES_PER_RUN);
  if (work.length === 0) {
    console.log(`[score-matches] ${JSON.stringify(stats)}`);
    return;
  }

  const { data: jobs, error: jobsError } = await supabase
    .from("jobs")
    .select("id, title, description, location, work_setup, company:companies(name)")
    .in("id", [...new Set(work.map((w) => w.item))]);
  if (jobsError) throw new Error(`Could not load jobs (${jobsError.code})`);
  const jobById = new Map(jobs.map((job) => [job.id, job]));

  const exhausted = new Set<string>();
  let consecutiveFailures = 0;
  let called = false;
  for (const { key: userId, item: job_id } of work) {
    const job = jobById.get(job_id);
    const context = contextByUser.get(userId);
    if (!job || !context || exhausted.has(userId)) continue;

    // Charged before the call; a refusal means this user is done for today.
    if (!(await chargeUser(supabase, userId, 1, true))) {
      exhausted.add(userId);
      stats.quotaSkipped++;
      continue;
    }
    if (called) await sleep(SCORE_DELAY_MS);
    called = true;

    // Board postings put title, company and location in fields, not the text.
    const header = [
      `Title: ${job.title}`,
      job.company?.name ? `Company: ${job.company.name}` : null,
      job.location ? `Location: ${job.location}` : null,
      job.work_setup ? `Work setup: ${job.work_setup}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    const result = await scoreJob(`${header}\n\n${job.description ?? ""}`, context.candidate, context.seeker);

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

type Supabase = ReturnType<typeof createClient>;
type UserContext = NonNullable<Awaited<ReturnType<typeof loadUserContext>>>;

// The user's preferences and skills summary, or null when there is nothing
// to score with yet (no seeker profile, or no skills and no resume).
async function loadUserContext(supabase: Supabase, userId: string) {
  const [{ data: seeker, error: seekerError }, { data: resume, error: resumeError }] = await Promise.all([
    supabase
      .from("seeker_profiles")
      .select("target_roles, min_salary, work_setup, avoid_industries, skills, years_experience, home_city, preferred_locations")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("resumes").select("content").eq("user_id", userId).eq("is_master", true).maybeSingle(),
  ]);
  if (seekerError || resumeError) {
    stats.failed++;
    console.error(`[score-matches] user ${userId}: could not load profile (${(seekerError ?? resumeError)!.code})`);
    return null;
  }
  if (!seeker) return null;
  const candidate = toCandidateSummary(resume?.content, seeker);
  if (candidate.skills.length === 0 && candidate.experience.length === 0) return null;
  return { seeker, candidate };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(`[score-matches] fatal: ${describeError(error)}`);
  process.exit(1);
});
