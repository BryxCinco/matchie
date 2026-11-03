// Shape of resumes.content (jsonb) and the one function allowed to turn it
// into something an LLM may see.

import { z } from "zod";
import type { CandidateSummary } from "./match-scoring.ts";
import type { Tables } from "./types/database.types.ts";

// Lenient on read: jsonb written by older parser versions should still load,
// so every field has a default instead of failing the whole parse.
export const ResumeContentSchema = z.object({
  contact: z
    .object({
      name: z.string().nullish(),
      email: z.string().nullish(),
      phone: z.string().nullish(),
      location: z.string().nullish(),
    })
    .default({}),
  summary: z.string().nullish(),
  skills: z.array(z.string()).default([]),
  experience: z
    .array(
      z.object({
        title: z.string(),
        company: z.string().nullish(),
        /** ISO date or YYYY-MM. */
        start: z.string().nullish(),
        /** ISO date, YYYY-MM, or null for a current role. */
        end: z.string().nullish(),
        highlights: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

export type ResumeContent = z.infer<typeof ResumeContentSchema>;

/** Keeps skills, role titles, durations and highlights. Drops contact details,
 * the free-text summary and company names, which can identify the person. */
export function toCandidateSummary(
  content: unknown,
  seeker: Pick<Tables<"seeker_profiles">, "skills" | "years_experience"> | null,
  now = new Date(),
): CandidateSummary {
  const parsed = ResumeContentSchema.safeParse(content ?? {});
  const resume = parsed.success ? parsed.data : ResumeContentSchema.parse({});

  const skills = new Map<string, string>();
  for (const skill of [...(seeker?.skills ?? []), ...resume.skills]) {
    const trimmed = skill.trim();
    if (trimmed && !skills.has(trimmed.toLowerCase())) skills.set(trimmed.toLowerCase(), trimmed);
  }

  const experience = resume.experience.map((role) => ({
    title: role.title,
    years: yearsBetween(role.start, role.end, now),
    highlights: role.highlights,
  }));

  return {
    skills: [...skills.values()],
    // The questionnaire answer wins; the resume sum overcounts overlapping roles.
    yearsExperience: seeker?.years_experience ?? sumYears(experience),
    experience,
    fullName: resume.contact.name ?? null,
  };
}

function yearsBetween(start: string | null | undefined, end: string | null | undefined, now: Date) {
  const from = start ? new Date(start) : null;
  const to = end ? new Date(end) : now;
  if (!from || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return null;
  return Math.round(((to.getTime() - from.getTime()) / (365.25 * 24 * 3600 * 1000)) * 10) / 10;
}

function sumYears(experience: { years: number | null }[]) {
  const total = experience.reduce((sum, role) => sum + (role.years ?? 0), 0);
  return total > 0 ? Math.round(total) : null;
}
