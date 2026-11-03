import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm, type ProfileFormValues } from "./ProfileForm";

// The form itself is a Client Component; this page loads the saved answers
// behind Suspense so returning users edit their profile instead of retyping it.
export default function OnboardingPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">Your job-search profile</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Matchie uses these answers to filter and score jobs. Also{" "}
          <Link href="/onboarding/resume" className="link">
            add your resume
          </Link>{" "}
          for better matches.
        </p>
      </header>
      <Suspense fallback={<div aria-busy="true" className="h-[36rem] animate-pulse rounded-2xl bg-zinc-200/60 dark:bg-zinc-800/60" />}>
        <ProfileFormLoader />
      </Suspense>
    </div>
  );
}

async function ProfileFormLoader() {
  const user = await requireUser("/onboarding");
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

  return <ProfileForm initial={initial} />;
}
