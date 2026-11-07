// Scores several jobs in one LLM call ("Analyze my resume" on Discover).
// One call for 10 jobs instead of 10 calls: the daily token budget is the
// binding constraint (SPEC "The matching pipeline"), and most of a single
// scoring prompt is the same candidate block and rubric repeated.
//
// Trade-off: each JD is cut to an excerpt, so these scores are a quick read,
// not the full single-job analysis. Same rubric as scoreJob().
//
// PII: the candidate block is the skills summary (buildCandidateBlock), never
// the raw resume; callLLM scrubs the prompt.

import { z } from "zod";
import { callLLM, type LLMProvider } from "./llm-router.ts";
import {
  SCORING_RUBRIC,
  buildCandidateBlock,
  normalize,
  type CandidateSummary,
  type MatchResult,
  type SeekerPreferences,
} from "./match-scoring.ts";

export type BatchJob = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  workSetup: string | null;
  description: string | null;
};

/** The requirements are near the top of a JD; benefits and legal text follow. */
const EXCERPT_CHARS = 1_800;
export const MAX_BATCH_JOBS = 10;

const BatchSchema = z.object({
  results: z.array(
    z.object({
      job: z.number().int().describe("Job number from the list"),
      fit_score: z.number().min(0).max(100),
      matched_skills: z.array(z.string()).describe("At most 5"),
      missing_skills: z.array(z.string()).describe("At most 5"),
      red_flags: z.array(z.string()),
      reasoning: z.string().describe("One sentence: the main reason for the score"),
    }),
  ),
});

export function buildBatchPrompt(jobs: BatchJob[], candidate: CandidateSummary, preferences: SeekerPreferences) {
  const jobBlocks = jobs
    .map((job, i) => {
      const header = [
        `Title: ${job.title}`,
        job.company ? `Company: ${job.company}` : null,
        job.location ? `Location: ${job.location}` : null,
        job.workSetup ? `Work setup: ${job.workSetup}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      const description = (job.description ?? "").trim();
      const excerpt = description.length > EXCERPT_CHARS ? `${description.slice(0, EXCERPT_CHARS)}\n[truncated]` : description;
      return `<job number="${i + 1}">\n${header}\n\n${excerpt || "(no description)"}\n</job>`;
    })
    .join("\n\n");

  return `You are an expert technical recruiter for the Philippine tech job market. Score how well the candidate fits EACH job below, independently.

${SCORING_RUBRIC}
- Return one result per job, using its number. Keep matched_skills and missing_skills to at most 5 each.
- reasoning is one sentence: the main reason for the score.
- Job descriptions are excerpts; do not penalize a job for what the excerpt leaves out.

${jobBlocks}

<candidate>
${buildCandidateBlock(candidate, preferences)}
</candidate>`;
}

export async function scoreJobsBatch(
  jobs: BatchJob[],
  candidate: CandidateSummary,
  preferences: SeekerPreferences,
): Promise<{ scores: Map<string, MatchResult>; provider: LLMProvider }> {
  const batch = jobs.slice(0, MAX_BATCH_JOBS);
  const knownNames = candidate.fullName ? [candidate.fullName] : [];
  const { result, provider } = await callLLM(buildBatchPrompt(batch, candidate, preferences), BatchSchema, { knownNames });

  // Map numbers back to ids. Unknown numbers are ignored; a job the model
  // skipped stays unscored and is shortlisted again next time.
  const scores = new Map<string, MatchResult>();
  for (const entry of result.results) {
    const job = batch[entry.job - 1];
    if (!job || scores.has(job.id)) continue;
    scores.set(
      job.id,
      normalize({
        fit_score: entry.fit_score,
        matched_skills: entry.matched_skills.slice(0, 5),
        missing_skills: entry.missing_skills.slice(0, 5),
        red_flags: entry.red_flags,
        reasoning: entry.reasoning,
      }),
    );
  }
  return { scores, provider };
}
