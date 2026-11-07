"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { saveJobToTracker, type SaveToTrackerResult } from "../tracker/actions";
import { ScoreRing } from "../ScoreRing";

export function RecentMatchCard({
  jobId,
  title,
  meta,
  fitScore,
  reasoning,
}: {
  jobId: string;
  title: string;
  meta: string;
  fitScore: number;
  reasoning: string | null;
}) {
  const [saving, startSave] = useTransition();
  const [outcome, setOutcome] = useState<SaveToTrackerResult | null>(null);

  return (
    <article className="card flex h-full flex-col gap-3 p-5">
      <div className="flex items-start gap-3">
        <ScoreRing score={fitScore} loading={false} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 font-display text-base leading-snug font-medium tracking-tight">{title}</h3>
          {meta && <p className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">{meta}</p>}
        </div>
      </div>
      {reasoning && <p className="line-clamp-2 text-sm text-zinc-600 dark:text-zinc-300">{reasoning}</p>}
      <div className="mt-auto pt-1">
        {outcome?.ok ? (
          <p role="status" className="flex min-h-11 items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            {outcome.alreadySaved ? "Already in your tracker." : "Saved."}
            <Link href="/tracker" className="link">
              View tracker
            </Link>
          </p>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={() => startSave(async () => setOutcome(await saveJobToTracker(jobId)))}
            className="btn-primary min-h-11 w-full px-4"
          >
            {saving ? "Saving…" : "Save to tracker"}
          </button>
        )}
        {outcome && !outcome.ok && (
          <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
            {outcome.error}
          </p>
        )}
      </div>
    </article>
  );
}
