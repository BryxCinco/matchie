import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { ResumeContentSchema } from "@/lib/resume";
import { FadeIn } from "../motion";
import { ProfileForm, type ProfileFormValues } from "../onboarding/ProfileForm";
import { AvatarUploader } from "./AvatarUploader";

export const metadata: Metadata = { title: "Profile" };

// Profile hub: photo, then the job-search answers (the same form as
// onboarding, so there is one place that defines them), then the resume.
export default function ProfilePage() {
  return (
    <div className="flex flex-col gap-8">
      <FadeIn>
        <h1 className="font-display text-4xl leading-[0.95] font-medium sm:text-5xl lg:text-6xl">
          Your <em className="accent-word">Profile</em>
        </h1>
      </FadeIn>

      <FadeIn delay={0.05}>
        <section className="card p-5 sm:p-8">
          <Suspense fallback={<div aria-busy="true" className="h-28 animate-pulse rounded-2xl bg-zinc-200/60 dark:bg-zinc-800" />}>
            <AvatarSection />
          </Suspense>
        </section>
      </FadeIn>

      <FadeIn delay={0.1}>
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl font-medium sm:text-2xl">Job-search preferences</h2>
            <Link href="/onboarding/resume" className="link text-sm">
              Edit resume
            </Link>
          </div>
          <p className="-mt-2 text-sm text-zinc-600 dark:text-zinc-400">Matchie uses these to filter and score jobs.</p>
          <Suspense fallback={<div aria-busy="true" className="h-[36rem] animate-pulse rounded-3xl bg-zinc-200/60 dark:bg-zinc-900" />}>
            <PreferencesLoader />
          </Suspense>
        </section>
      </FadeIn>
    </div>
  );
}

async function AvatarSection() {
  const user = await requireUser("/profile");
  const supabase = await createClient();
  const [{ data: profile }, { data: resume }] = await Promise.all([
    supabase.from("profiles").select("avatar_url").eq("user_id", user.id).maybeSingle(),
    supabase.from("resumes").select("content").eq("user_id", user.id).eq("is_master", true).maybeSingle(),
  ]);
  const resumeName = ResumeContentSchema.safeParse(resume?.content ?? {}).data?.contact.name;
  const email = user.email ?? "";
  return <AvatarUploader initialUrl={profile?.avatar_url ?? null} name={resumeName || email.split("@")[0] || "You"} email={email} />;
}

async function PreferencesLoader() {
  const user = await requireUser("/profile");
  const supabase = await createClient();
  const { data } = await supabase
    .from("seeker_profiles")
    .select("target_roles, skills, avoid_industries, work_setup, min_salary, years_experience")
    .eq("user_id", user.id)
    .maybeSingle();

  const initial: ProfileFormValues = data ?? {
    target_roles: [],
    skills: [],
    avoid_industries: [],
    work_setup: [],
    min_salary: null,
    years_experience: null,
  };
  return <ProfileForm initial={initial} returnTo="/profile" />;
}
