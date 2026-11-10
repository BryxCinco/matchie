"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/auth/safe-next";
import { DemoButton } from "./DemoButton";

// Sign in only. Matchie is single-user: sign-ups are off in Supabase Auth,
// and new accounts are added by hand in the dashboard. Visitors use the demo.
// Reads search params, so it must render inside <Suspense> (see page.tsx).
export function LoginForm() {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const callbackError = searchParams.get("error");

  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(callbackError);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setPending(false);
      return;
    }
    // refresh() so Server Components re-render with the new session cookie.
    router.replace(next);
    router.refresh();
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">Sign in to Matchie</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Welcome back.</p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field text-base font-normal"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field text-base font-normal"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn-primary mt-2 px-4 py-2.5">
          {pending ? "Please wait…" : "Sign in"}
        </button>
      </form>

      <div className="mt-6 flex flex-col gap-3">
        <div className="flex items-center gap-3 text-xs text-zinc-500 uppercase dark:text-zinc-400">
          <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          or
          <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <DemoButton className="btn-secondary w-full px-4 py-2.5">Try demo account</DemoButton>
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">Sample data, no sign-up. AI scoring is off in the demo.</p>
      </div>
    </>
  );
}
