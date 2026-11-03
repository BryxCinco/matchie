import { Suspense } from "react";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { ResumeContentSchema } from "@/lib/resume";
import { ResumeForm } from "./ResumeForm";

export default function ResumePage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">Your resume</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Matchie reads your skills and experience from it. Saving replaces your current resume.
        </p>
        <Suspense fallback={<p className="mt-3 h-5 w-72 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />}>
          <SavedResumeStatus />
        </Suspense>
      </header>
      <ResumeForm />
    </div>
  );
}

async function SavedResumeStatus() {
  const user = await requireUser("/onboarding/resume");
  const supabase = await createClient();
  const { data } = await supabase
    .from("resumes")
    .select("content, updated_at")
    .eq("user_id", user.id)
    .eq("is_master", true)
    .maybeSingle();

  if (!data) {
    return <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">No resume saved yet.</p>;
  }

  const content = ResumeContentSchema.safeParse(data.content);
  const skills = content.success ? content.data.skills.length : 0;
  const roles = content.success ? content.data.experience.length : 0;
  const updated = new Date(data.updated_at).toLocaleDateString("en-PH", { dateStyle: "medium" });

  return (
    <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
      Saved resume: {skills} skills, {roles} roles · updated {updated}
    </p>
  );
}
