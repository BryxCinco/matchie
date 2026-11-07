// Loads what match scoring needs about the signed-in user: seeker preferences
// and the skills summary built from the master resume (never the raw resume;
// see the PII rule in CLAUDE.md). Shared by the score-job routes.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import type { CandidateSummary, SeekerPreferences } from "@/lib/match-scoring";
import { toCandidateSummary } from "@/lib/resume";

export type LoadedCandidate =
  | {
      ok: true;
      seeker: SeekerPreferences;
      candidate: CandidateSummary;
      /** Latest profile or resume edit. A score older than this is stale. */
      inputsChangedAt: number;
    }
  | { ok: false; status: number; error: string; cause?: unknown };

export async function loadCandidate(supabase: SupabaseClient<Database>, userId: string): Promise<LoadedCandidate> {
  const [{ data: seeker, error: seekerError }, { data: resume, error: resumeError }] = await Promise.all([
    supabase
      .from("seeker_profiles")
      .select("target_roles, min_salary, work_setup, avoid_industries, skills, years_experience, home_city, preferred_locations, updated_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("resumes").select("content, updated_at").eq("user_id", userId).eq("is_master", true).maybeSingle(),
  ]);
  if (seekerError || resumeError) return { ok: false, status: 500, error: "Could not load your profile.", cause: seekerError ?? resumeError };
  if (!seeker) return { ok: false, status: 400, error: "Complete your job-search profile before scoring jobs." };

  const candidate = toCandidateSummary(resume?.content, seeker);
  if (candidate.skills.length === 0 && candidate.experience.length === 0) {
    return { ok: false, status: 400, error: "Upload a resume or add skills to your profile before scoring jobs." };
  }

  return {
    ok: true,
    seeker,
    candidate,
    inputsChangedAt: Math.max(Date.parse(seeker.updated_at), resume ? Date.parse(resume.updated_at) : 0),
  };
}
