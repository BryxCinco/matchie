"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DemoLocked, DemoLockNote } from "../DemoLock";
import { analyzeResumeForJobs, type AnalyzeResult } from "./actions";

export function AnalyzeResumeButton({ demo = false }: { demo?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AnalyzeResult | null>(null);

  function analyze() {
    setResult(null);
    startTransition(async () => {
      const outcome = await analyzeResumeForJobs();
      setResult(outcome);
      // New matches are in the database; re-render the list below with them.
      if (outcome.ok && outcome.scored > 0) router.refresh();
    });
  }

  return (
    <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="min-w-0">
        <h2 className="font-display text-lg font-medium">
          Find my <em className="accent-word">best</em> fits
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
          {demo ? (
            "The demo never calls the AI. The scored jobs below were prepared ahead of time."
          ) : pending ? (
            "Reading your resume against your top jobs…"
          ) : result?.ok ? (
            result.scored === 0 ? (
              "No new jobs match your profile right now. New ones arrive every morning."
            ) : (
              <>
                Scored {result.scored} job{result.scored === 1 ? "" : "s"}
                {result.rescored > 0 && ` (${result.rescored} re-scored for your updated profile)`}
                {" · "}
                <span className="font-semibold text-green-700 dark:text-green-400">
                  {result.strong} strong fit{result.strong === 1 ? "" : "s"} (80+)
                </span>
                . They are in the Scored tab.
              </>
            )
          ) : (
            "Scores the top 10 jobs that match your skills and target roles, in one quick pass."
          )}
        </p>
        {result && !result.ok && (
          <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
            {result.error}
          </p>
        )}
      </div>
      <DemoLocked locked={demo} className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
        <button type="button" onClick={analyze} disabled={pending || demo} className="btn-primary min-h-11 shrink-0 px-5">
          {pending ? (
            <>
              <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Analyzing…
            </>
          ) : (
            "Analyze my resume to find matches"
          )}
        </button>
        {demo && <DemoLockNote />}
      </DemoLocked>
    </div>
  );
}
