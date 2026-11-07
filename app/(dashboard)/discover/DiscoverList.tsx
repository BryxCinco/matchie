"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { saveJobToTracker, type SaveToTrackerResult } from "../tracker/actions";
import { ScoreRing } from "../ScoreRing";
import type { ScoreExistingJobResponse } from "@/lib/match-scoring";

export type DiscoverItem = {
  jobId: string;
  title: string;
  company: string | null;
  location: string | null;
  workSetup: "onsite" | "hybrid" | "remote" | null;
  salary: string | null;
  url: string | null;
  postedLabel: string | null;
  isNew: boolean;
  match: {
    fitScore: number;
    reasoning: string | null;
    matchedSkills: string[];
    missingSkills: string[];
    redFlags: string[];
  } | null;
};

type Tab = "scored" | "unscored" | "all";

// Client-side cap on one scoring request. The route allows 60s (Gemini, then
// the Groq fallback); past this the user is better off retrying.
const SCORE_TIMEOUT_MS = 55_000;

const WORK_SETUP_LABEL = { onsite: "On-site", hybrid: "Hybrid", remote: "Remote" } as const;

export function DiscoverList({ initialItems, shortlistFailed }: { initialItems: DiscoverItem[]; shortlistFailed: boolean }) {
  const [items, setItems] = useState(initialItems);
  // Jobs scored on this page stay in the Unscored tab until the tab changes,
  // so a card does not vanish the moment its score arrives.
  const [scoredHere, setScoredHere] = useState<Set<string>>(new Set());
  const scoredCount = initialItems.filter((item) => item.match).length;
  const [tab, setTab] = useState<Tab>(scoredCount > 0 ? "scored" : "unscored");

  const counts = {
    scored: items.filter((item) => item.match).length,
    unscored: items.filter((item) => !item.match).length,
    all: items.length,
  };
  const visible = items
    .filter((item) => (tab === "scored" ? item.match : tab === "unscored" ? !item.match || scoredHere.has(item.jobId) : true))
    .sort((a, b) => (tab === "unscored" ? 0 : (b.match?.fitScore ?? -1) - (a.match?.fitScore ?? -1)));

  function changeTab(next: Tab) {
    setTab(next);
    setScoredHere(new Set());
  }

  function onScored(jobId: string, match: NonNullable<DiscoverItem["match"]>) {
    setItems((current) => current.map((item) => (item.jobId === jobId ? { ...item, match } : item)));
    setScoredHere((current) => new Set(current).add(jobId));
  }

  return (
    <div className="flex flex-col gap-6">
      <SegmentedControl value={tab} onChange={changeTab} counts={counts} />

      {visible.length === 0 ? (
        <EmptyState tab={tab} shortlistFailed={shortlistFailed} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((item, index) => (
            <li key={item.jobId} className="animate-rise" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
              <JobCard item={item} onScored={onScored} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- Segmented control (iOS UISegmentedControl) -------------------------------

const TABS: { value: Tab; label: string }[] = [
  { value: "scored", label: "Scored" },
  { value: "unscored", label: "Unscored" },
  { value: "all", label: "All" },
];

function SegmentedControl({ value, onChange, counts }: { value: Tab; onChange: (tab: Tab) => void; counts: Record<Tab, number> }) {
  const index = TABS.findIndex((tab) => tab.value === value);
  return (
    <div role="tablist" aria-label="Filter jobs" className="relative grid w-full grid-cols-3 rounded-full bg-zinc-200/70 p-1 sm:w-96 dark:bg-zinc-900">
      {/* The sliding thumb. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-white shadow-[0_2px_8px_rgb(0_0_0/0.12)] transition-transform duration-300 ease-ios dark:bg-zinc-700"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {TABS.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.value)}
            className={`relative z-10 flex min-h-9 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-orange-500 ${
              selected ? "text-zinc-950 dark:text-zinc-50" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {tab.label}
            <span className="text-xs tabular-nums opacity-60">{counts[tab.value]}</span>
          </button>
        );
      })}
    </div>
  );
}

// --- Job card ---------------------------------------------------------------------

function JobCard({ item, onScored }: { item: DiscoverItem; onScored: (jobId: string, match: NonNullable<DiscoverItem["match"]>) => void }) {
  const [scoring, setScoring] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [saved, setSaved] = useState<SaveToTrackerResult | null>(null);

  async function score() {
    setScoring(true);
    setScoreError(null);
    try {
      const response = await fetch(`/api/score-job/${item.jobId}`, { method: "POST", signal: AbortSignal.timeout(SCORE_TIMEOUT_MS) });
      const body = (await response.json().catch(() => null)) as (ScoreExistingJobResponse & { error?: string }) | null;
      if (!response.ok || !body?.match) {
        setScoreError(body?.error ?? (response.status === 504 ? "Scoring took too long. Try again." : "Could not score this job. Try again."));
        return;
      }
      onScored(item.jobId, {
        fitScore: body.match.fit_score,
        reasoning: body.match.reasoning,
        matchedSkills: body.match.matched_skills,
        missingSkills: body.match.missing_skills,
        redFlags: body.match.red_flags,
      });
    } catch (error) {
      setScoreError(
        error instanceof DOMException && error.name === "TimeoutError"
          ? "Scoring took too long. The AI may be busy; try again."
          : "Network error. Check your connection and try again.",
      );
    } finally {
      setScoring(false);
    }
  }

  const meta = [item.company, item.location].filter(Boolean).join(" · ");
  const chips = [item.workSetup ? WORK_SETUP_LABEL[item.workSetup] : null, item.salary, item.postedLabel].filter(Boolean);

  return (
    <article className="card flex h-full flex-col gap-4 p-5">
      <div className="flex items-start gap-4">
        <ScoreRing score={item.match?.fitScore ?? null} loading={scoring} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h2 className="line-clamp-2 flex-1 font-display text-lg leading-snug font-medium tracking-tight">{item.title}</h2>
            {item.isNew && (
              <span className="bg-accent shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider text-zinc-950 uppercase">New</span>
            )}
          </div>
          {meta && <p className="mt-1 truncate text-sm text-zinc-500 dark:text-zinc-400">{meta}</p>}
        </div>
      </div>

      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <li key={chip} className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
              {chip}
            </li>
          ))}
        </ul>
      )}

      {item.match?.reasoning && <p className="line-clamp-3 text-sm text-zinc-700 dark:text-zinc-300">{item.match.reasoning}</p>}

      {item.match && (item.match.matchedSkills.length > 0 || item.match.missingSkills.length > 0 || item.match.redFlags.length > 0) && (
        <details className="group text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-zinc-500 select-none hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 [&::-webkit-details-marker]:hidden">
            Why this score
            <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 transition-transform duration-200 group-open:rotate-90" fill="currentColor">
              <path d="M7.3 4.3a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4-1.4L11.6 10 7.3 5.7a1 1 0 0 1 0-1.4Z" />
            </svg>
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <SkillChips label="Matched" items={item.match.matchedSkills} tone="good" />
            <SkillChips label="Missing" items={item.match.missingSkills} tone="gap" />
            <SkillChips label="Red flags" items={item.match.redFlags} tone="bad" />
          </div>
        </details>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-1">
        {saved?.ok ? (
          <p role="status" className="flex min-h-11 items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <CheckIcon />
            {saved.alreadySaved ? "Already in your tracker." : "Saved."}
            <Link href="/tracker" className="link">
              View tracker
            </Link>
          </p>
        ) : (
          <div className="flex items-center gap-2">
            {item.match ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => startSave(async () => setSaved(await saveJobToTracker(item.jobId)))}
                className="btn-primary min-h-11 flex-1 px-4"
              >
                {saving ? "Saving…" : "Save to tracker"}
              </button>
            ) : (
              <>
                <button type="button" disabled={scoring} onClick={score} className="btn-primary min-h-11 flex-1 px-4">
                  {scoring ? "Scoring…" : scoreError ? "Try again" : "Score job"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => startSave(async () => setSaved(await saveJobToTracker(item.jobId)))}
                  aria-label="Save to tracker without scoring"
                  title="Save to tracker"
                  className="btn-secondary min-h-11 px-4"
                >
                  {saving ? "…" : "Save"}
                </button>
              </>
            )}
            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="pressable inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
              >
                Apply
                <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M7 13 13 7M8 7h5v5" />
                </svg>
              </a>
            )}
          </div>
        )}
        {scoreError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {scoreError}
          </p>
        )}
        {saved && !saved.ok && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {saved.error}
          </p>
        )}
      </div>
    </article>
  );
}

// --- Small pieces --------------------------------------------------------------------

const TONE = {
  good: "bg-ios-green/10 text-green-700 dark:text-green-400",
  gap: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  bad: "bg-red-500/10 text-red-700 dark:text-red-300",
} as const;

function SkillChips({ label, items, tone }: { label: string; items: string[]; tone: keyof typeof TONE }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">{label}</h3>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((skill) => (
          <li key={skill} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[tone]}`}>
            {skill}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState({ tab, shortlistFailed }: { tab: Tab; shortlistFailed: boolean }) {
  const text =
    tab === "unscored" && shortlistFailed
      ? "Could not load unscored jobs right now. Refresh to try again."
      : tab === "scored"
        ? "No scored jobs yet. The daily run scores new jobs every morning, or score one from the Unscored tab."
        : tab === "unscored"
          ? "Nothing waiting to be scored. New jobs arrive every morning."
          : "No jobs yet. Once the boards are polled, they show up here.";
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <svg aria-hidden="true" viewBox="0 0 48 48" className="size-12 text-zinc-300 dark:text-zinc-700" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="24" cy="24" r="20" />
        <circle cx="24" cy="24" r="12" strokeDasharray="3 4" />
        <circle cx="24" cy="24" r="3" fill="currentColor" />
      </svg>
      <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">{text}</p>
      {tab !== "unscored" && (
        <Link href="/dashboard" className="link text-sm">
          Or paste a job description
        </Link>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 text-ios-green" fill="currentColor">
      <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.3a1 1 0 0 0-1.4-1.4L9 10.6 7.7 9.3a1 1 0 0 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4Z" />
    </svg>
  );
}
