"use client";

import { useId } from "react";

// Fit score as a gradient ring: green from 80, orange from 50, grey below,
// a dashed track when not scored yet, and a spinning arc while scoring.
// Shared by the dashboard and the Discover page.

const RING_RADIUS = 24;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function ScoreRing({ score, loading }: { score: number | null; loading: boolean }) {
  const gradientId = useId();
  const stops =
    score === null ? ["#ff8a3d", "#f0532b"] : score >= 80 ? ["#4cd964", "#34c759"] : score >= 50 ? ["#ff8a3d", "#f0532b"] : ["#9c95af", "#7b7490"];
  const label = loading ? "Scoring" : score === null ? "Not scored yet" : `Fit score ${score} out of 100`;

  return (
    <div role="img" aria-label={label} className="relative size-14 shrink-0">
      <svg viewBox="0 0 56 56" className={`size-14 -rotate-90 ${loading ? "animate-spin [animation-duration:1.1s]" : ""}`}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={stops[0]} />
            <stop offset="1" stopColor={stops[1]} />
          </linearGradient>
        </defs>
        <circle
          cx="28"
          cy="28"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="3.5"
          className="stroke-zinc-200 dark:stroke-zinc-800"
          strokeDasharray={score === null && !loading ? "3 4" : undefined}
        />
        {(score !== null || loading) && (
          <circle
            cx="28"
            cy="28"
            r={RING_RADIUS}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={loading ? RING_CIRCUMFERENCE * 0.7 : RING_CIRCUMFERENCE * (1 - (score ?? 0) / 100)}
            className="transition-[stroke-dashoffset] duration-700 ease-ios"
          />
        )}
      </svg>
      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center font-display text-lg font-semibold tabular-nums">
        {loading ? "" : (score ?? <span className="text-zinc-400 dark:text-zinc-600">—</span>)}
      </span>
    </div>
  );
}
