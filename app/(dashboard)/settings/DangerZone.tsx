"use client";

import { useActionState } from "react";
import { DemoLocked } from "../DemoLock";
import { deleteAccount, type SettingsState } from "./actions";

const initial: SettingsState = { error: null, message: null };

// Deletes the account and every row that belongs to it (migration 017,
// delete_my_account). The typed confirmation stops a stray tap.
export function DeleteAccountButton({ demo = false }: { demo?: boolean }) {
  const [state, action, pending] = useActionState(deleteAccount, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
        Type &quot;delete&quot; to confirm
        <input
          name="confirm"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={demo}
          className="field text-base font-normal sm:max-w-xs"
        />
      </label>
      <DemoLocked locked={demo} className="self-start">
        <button
          type="submit"
          disabled={demo || pending}
          className="pressable inline-flex min-h-11 items-center justify-center self-start rounded-full border border-red-500/40 px-5 text-sm font-semibold text-red-600 hover:bg-red-500/10 focus-visible:outline-2 focus-visible:outline-red-500 disabled:opacity-50 dark:text-red-400"
        >
          {pending ? "Deleting…" : "Delete my account"}
        </button>
      </DemoLocked>
      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
