"use client";

import { useActionState } from "react";
import { changePassword, sendPasswordReset, type SettingsState } from "./actions";

const INITIAL: SettingsState = { error: null, message: null };

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, INITIAL);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          New password
          <input name="password" type="password" autoComplete="new-password" required minLength={8} className="field" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Confirm
          <input name="confirm" type="password" autoComplete="new-password" required minLength={8} className="field" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary min-h-11 px-5">
          {pending ? "Updating…" : "Update password"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function ResetLinkButton() {
  const [state, action, pending] = useActionState(sendPasswordReset, INITIAL);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button type="submit" disabled={pending} className="btn-secondary min-h-11 px-5">
        {pending ? "Sending…" : "Email me a reset link"}
      </button>
      <Status state={state} />
    </form>
  );
}

function Status({ state }: { state: SettingsState }) {
  if (state.error)
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p role="status" className="text-sm text-green-700 dark:text-green-400">
        {state.message}
      </p>
    );
  return null;
}
