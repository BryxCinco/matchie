"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseResumeText } from "@/lib/resume-parser";

export type FormState = { error: string | null };

const tagList = (max: number) => z.array(z.string().trim().min(1).max(80)).max(max);

// Empty inputs arrive as "", which means "not answered", not 0.
const optionalInt = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number({ error: "Enter a whole number." }).int("Enter a whole number.").min(0).max(max).nullable(),
  );

const ProfileSchema = z.object({
  target_roles: tagList(10).min(1, "Add at least one target role."),
  skills: tagList(60),
  avoid_industries: tagList(20),
  work_setup: z.array(z.enum(["onsite", "hybrid", "remote"])),
  min_salary: optionalInt(10_000_000),
  years_experience: optionalInt(60),
});

function strings(formData: FormData, name: string) {
  return formData.getAll(name).filter((v): v is string => typeof v === "string");
}

export async function saveSeekerProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = ProfileSchema.safeParse({
    target_roles: strings(formData, "target_roles"),
    skills: strings(formData, "skills"),
    avoid_industries: strings(formData, "avoid_industries"),
    work_setup: strings(formData, "work_setup"),
    min_salary: formData.get("min_salary"),
    years_experience: formData.get("years_experience"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");

  const { error } = await supabase.from("seeker_profiles").upsert({ user_id: user.id, ...parsed.data }, { onConflict: "user_id" });
  if (error) {
    console.error("[onboarding] saving seeker profile failed", error);
    return { error: "Could not save your profile. Please try again." };
  }

  redirect("/dashboard");
}

const ResumeSchema = z.object({
  resume_text: z
    .string()
    .trim()
    .min(100, "That looks too short for a resume. Paste the full text.")
    .max(50_000, "That resume is too long (max 50,000 characters)."),
});

export async function saveResume(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = ResumeSchema.safeParse({ resume_text: formData.get("resume_text") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  // Parsed again on the server; the browser preview is never trusted.
  const content = parseResumeText(parsed.data.resume_text);
  if (content.skills.length === 0 && content.experience.length === 0) {
    return {
      error: 'No "Skills" or "Experience" section was found. Make sure those headings are on their own lines.',
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding/resume");

  // One master resume per user (partial unique index), which PostgREST
  // cannot target with upsert, so update-or-insert.
  const { data: master, error: readError } = await supabase
    .from("resumes")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_master", true)
    .maybeSingle();

  const { error } = readError
    ? { error: readError }
    : master
      ? await supabase.from("resumes").update({ content }).eq("id", master.id)
      : await supabase.from("resumes").insert({ user_id: user.id, content, is_master: true });

  if (error) {
    console.error("[onboarding] saving resume failed", error);
    return { error: "Could not save your resume. Please try again." };
  }

  redirect("/dashboard");
}
