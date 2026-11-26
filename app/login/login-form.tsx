"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/auth/safe-next";
import { SignUpSchema } from "@/lib/auth/sign-up-schema";
import { DemoButton } from "./DemoButton";

// Sign in, or create an account with an invite code (migration 017). The
// code is enforced by the hook_check_invite() auth hook in the database; the
// form only catches typos. Visitors without a code use the demo.
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
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [inviteCode, setInviteCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  function switchMode(next: "sign-in" | "sign-up") {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function handleSignUp() {
    const parsed = SignUpSchema.safeParse({ email, password, inviteCode });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form.");
      setPending(false);
      return;
    }
    const { error } = await createClient().auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { invite_code: parsed.data.inviteCode },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
      },
    });
    setPending(false);
    if (error) {
      // The hook's message comes back as the error; never hint whether a code exists.
      setError(/invite/i.test(error.message) ? "That invite code is not valid." : error.message);
      return;
    }
    setNotice("Check your email to confirm your account.");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    if (mode === "sign-up") return handleSignUp();

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
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        {mode === "sign-in" ? "Sign in to Matchie" : "Create your account"}
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {mode === "sign-in" ? "Welcome back." : "Matchie is invite-only for now. You need an invite code."}
      </p>

      <div role="tablist" aria-label="Account" className="mt-5 grid grid-cols-2 gap-1 rounded-full bg-zinc-100 p-1 dark:bg-zinc-900">
        {(["sign-in", "sign-up"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={`pressable min-h-11 rounded-full text-sm font-medium ${
              mode === m ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50" : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            {m === "sign-in" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

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
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field text-base font-normal"
          />
        </label>

        {mode === "sign-up" && (
          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Invite code
            <input
              type="text"
              required
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="field text-base font-normal"
            />
          </label>
        )}

        {notice && (
          <p role="status" className="rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            {notice}
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn-primary mt-2 px-4 py-2.5">
          {pending ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}
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
