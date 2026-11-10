"use client";

import { useState } from "react";
import { DemoLocked } from "../DemoLock";

// Placeholder: deleting an account needs a service-role call (auth.users),
// storage cleanup and a confirmation step. Until that exists, the button says
// so instead of pretending.
export function DeleteAccountButton({ demo = false }: { demo?: boolean }) {
  const [asked, setAsked] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <DemoLocked locked={demo} className="self-start">
        <button
          type="button"
          disabled={demo}
          onClick={() => setAsked(true)}
          className="pressable inline-flex min-h-11 items-center justify-center self-start rounded-full border border-red-500/40 px-5 text-sm font-semibold text-red-600 hover:bg-red-500/10 focus-visible:outline-2 focus-visible:outline-red-500 disabled:opacity-50 dark:text-red-400"
        >
          Delete my account
        </button>
      </DemoLocked>
      {asked && (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Account deletion is not available yet. Nothing was deleted.
        </p>
      )}
    </div>
  );
}
