"use client";

import { useState } from "react";
import type { ScoreJobResponse } from "@/app/api/score-job/route";

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
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setResult(data as ScoreJobResponse);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  const tooShort = jobDescription.trim().length < 50;

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <label htmlFor="job-description" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Paste a job description
        </label>
        <textarea
          id="job-description"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          rows={10}
          maxLength={20_000}
          placeholder="Paste the full posting: title, requirements, salary, location…"
          className="mt-2 w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-300"
        />
        <div className="mt-3 flex items-center justify-between gap-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Your name and contact details are removed before anything is sent to the AI.
          </p>
          <button
            type="submit"
            disabled={pending || tooShort}
            className="shrink-0 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {pending ? "Scoring…" : "Score job"}
          </button>
        </div>
      </form>

      {pending && (
        <div
          aria-busy="true"
          className="h-48 animate-pulse rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
        />
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      )}

      {result && <MatchCard result={result} />}
    </div>
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
      className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
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
    </section>
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
