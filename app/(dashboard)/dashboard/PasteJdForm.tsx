"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { ScoreJobResponse } from "@/app/api/score-job/route";
import { MAX_JD_CHARS, MIN_JD_CHARS } from "@/lib/job-description-limits";
import { saveJobToTracker, type SaveToTrackerResult } from "../tracker/actions";

export function PasteJdForm() {
  const [jobDescription, setJobDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScoreJobResponse | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/score-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_description: jobDescription }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        // Show the server's own message (e.g. "Complete your job-search
        // profile...") so the user knows what to fix.
        setError(data?.error ?? `Request failed (HTTP ${response.status}). Please try again.`);
        return;
      }
      setResult(data as ScoreJobResponse);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  const length = jobDescription.trim().length;
  const tooShort = length < MIN_JD_CHARS;

  return (
    <div className="flex flex-col gap-6">
      {/* One vertical stack at every width: label, textarea, hint, button.
          The button is full width on phones and right-aligned from sm up. */}
      <form onSubmit={handleSubmit} className="card flex w-full flex-col gap-3 p-4 sm:p-6">
        <label htmlFor="job-description" className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Paste a job description
        </label>
        <textarea
          id="job-description"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          rows={10}
          maxLength={MAX_JD_CHARS}
          placeholder="Paste the full posting: title, requirements, salary, location…"
          className="field block min-h-48 w-full resize-y text-sm"
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {length > 0 && tooShort
            ? `${MIN_JD_CHARS - length} more character${MIN_JD_CHARS - length === 1 ? "" : "s"} needed.`
            : "Your name and contact details are removed before anything is sent to the AI."}
        </p>
        <button
          type="submit"
          disabled={pending || tooShort}
          className="btn-primary w-full px-4 py-2.5 sm:w-auto sm:self-end"
        >
          {pending ? "Scoring…" : "Score job"}
        </button>
      </form>

      {pending && (
        <div aria-busy="true" className="card h-48 animate-pulse" />
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error} <FixLink error={error} />
        </p>
      )}

      {/* key: a new job remounts the card, resetting the save button. */}
      {result && <MatchCard key={result.job_id} result={result} />}
    </div>
  );
}

// The two setup errors from /api/score-job each have a page that fixes them.
function FixLink({ error }: { error: string }) {
  const target = /resume/i.test(error)
    ? { href: "/profile#resume", label: "Add your resume" }
    : /profile/i.test(error)
      ? { href: "/onboarding", label: "Complete your profile" }
      : null;
  if (!target) return null;
  return (
    <Link href={target.href} className="font-medium underline underline-offset-4">
      {target.label}
    </Link>
  );
}

function MatchCard({ result }: { result: ScoreJobResponse }) {
  const { match } = result;
  const tone =
    match.fit_score >= 70
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900"
      : match.fit_score >= 50
        ? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900"
        : "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900";

  return (
    <section
      aria-live="polite"
      className="card p-4 sm:p-6"
    >
      <div className="flex items-start gap-4">
        <div className={`flex size-16 shrink-0 flex-col items-center justify-center rounded-xl ring-1 ${tone}`}>
          <span className="text-2xl font-semibold leading-none">{match.fit_score}</span>
          <span className="mt-1 text-[10px] font-medium uppercase tracking-wide">fit</span>
        </div>
        <div>
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Why this matched</h2>
          <p className="mt-1 text-zinc-900 dark:text-zinc-100">{match.reasoning}</p>
          {result.cached && (
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Previously scored; nothing in your profile has changed since.</p>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-3">
        <SkillList title="Matched skills" items={match.matched_skills} empty="None found" className="bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200" />
        <SkillList title="Missing skills" items={match.missing_skills} empty="Nothing missing" className="bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200" />
        <SkillList title="Red flags" items={match.red_flags} empty="No red flags" className="bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-200" />
      </div>

      <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <SaveToTrackerButton jobId={result.job_id} />
      </div>
    </section>
  );
}

function SaveToTrackerButton({ jobId }: { jobId: string }) {
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<SaveToTrackerResult | null>(null);

  if (outcome?.ok) {
    return (
      <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
        {outcome.alreadySaved ? "Already in your tracker." : "Saved to your tracker."}{" "}
        <Link href="/tracker" className="link">
          View tracker
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setOutcome(await saveJobToTracker(jobId)))}
        className="btn-primary px-4 py-2"
      >
        {pending ? "Saving…" : "Save to tracker"}
      </button>
      {outcome && !outcome.ok && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {outcome.error}
        </p>
      )}
    </div>
  );
}

function SkillList({ title, items, empty, className }: { title: string; items: string[]; empty: string; className: string }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</h3>
      {items.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li key={item} className={`rounded-md px-2 py-1 text-xs font-medium ${className}`}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">{empty}</p>
      )}
    </div>
  );
}
