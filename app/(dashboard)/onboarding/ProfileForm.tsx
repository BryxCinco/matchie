"use client";

import { useActionState } from "react";
import { saveSeekerProfile, type FormState } from "./actions";
import { TagInput } from "./TagInput";

export type ProfileFormValues = {
  target_roles: string[];
  skills: string[];
  avoid_industries: string[];
  work_setup: ("onsite" | "hybrid" | "remote")[];
  min_salary: number | null;
  years_experience: number | null;
};

const WORK_SETUPS = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "Onsite" },
] as const;

const inputClass =
  "mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-300";
const labelClass = "text-sm font-medium text-zinc-800 dark:text-zinc-200";

export function ProfileForm({ initial }: { initial: ProfileFormValues }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveSeekerProfile, { error: null });

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <Section title="What you're looking for">
        <TagInput
          name="target_roles"
          label="Target roles"
          hint="Press Enter or comma after each one."
          placeholder="e.g. Frontend Developer"
          initial={initial.target_roles}
          max={10}
        />

        <fieldset>
          <legend className={labelClass}>Work setups you accept</legend>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Leave all unchecked if any setup is fine.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {WORK_SETUPS.map(({ value, label }) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-800 has-checked:border-zinc-950 has-checked:bg-zinc-950 has-checked:text-white dark:border-zinc-700 dark:text-zinc-200 dark:has-checked:border-zinc-50 dark:has-checked:bg-zinc-50 dark:has-checked:text-zinc-950"
              >
                <input type="checkbox" name="work_setup" value={value} defaultChecked={initial.work_setup.includes(value)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="min_salary" className={labelClass}>
              Minimum monthly salary (PHP)
            </label>
            <input
              id="min_salary"
              name="min_salary"
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              placeholder="e.g. 60000"
              defaultValue={initial.min_salary ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="years_experience" className={labelClass}>
              Years of experience
            </label>
            <input
              id="years_experience"
              name="years_experience"
              type="number"
              inputMode="numeric"
              min={0}
              max={60}
              placeholder="e.g. 3"
              defaultValue={initial.years_experience ?? ""}
              className={inputClass}
            />
          </div>
        </div>

        <TagInput
          name="avoid_industries"
          label="Industries to avoid (optional)"
          placeholder="e.g. Gambling"
          initial={initial.avoid_industries}
          max={20}
        />
      </Section>

      <Section title="What you bring">
        <TagInput
          name="skills"
          label="Skills"
          hint="These are combined with the skills found in your resume."
          placeholder="e.g. React, TypeScript, PostgreSQL"
          initial={initial.skills}
          max={60}
        />
      </Section>

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
      >
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">{title}</h2>
      {children}
    </section>
  );
}
