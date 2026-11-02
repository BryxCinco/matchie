"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/auth/safe-next";

type Mode = "login" | "signup";

// Reads search params, so it must render inside <Suspense> (see page.tsx).
export function LoginForm() {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const callbackError = searchParams.get("error");

  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(callbackError);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setPending(false);
        return;
      }
      // refresh() so Server Components re-render with the new session cookie.
      router.replace(next);
      router.refresh();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setPending(false);

    if (error) {
      setError(error.message);
      return;
    }
    // With email confirmation on (the Supabase default) there is no session yet.
    if (!data.session) {
      setNotice("Check your email for a confirmation link to finish signing up.");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  function switchMode() {
    setMode(mode === "login" ? "signup" : "login");
    setError(null);
    setNotice(null);
  }

  const isLogin = mode === "login";

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        {isLogin ? "Sign in to Matchie" : "Create your Matchie account"}
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {isLogin ? "Welcome back." : "Start tracking your job search."}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base font-normal text-zinc-950 outline-none focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-300"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Password
          <input
            type="password"
            required
            minLength={isLogin ? undefined : 8}
            autoComplete={isLogin ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base font-normal text-zinc-950 outline-none focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-300"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          {pending ? "Please wait…" : isLogin ? "Sign in" : "Sign up"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        {isLogin ? "No account yet?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={switchMode}
          className="font-medium text-zinc-950 underline-offset-4 hover:underline dark:text-zinc-50"
        >
          {isLogin ? "Sign up" : "Sign in"}
        </button>
      </p>
    </>
  );
}
