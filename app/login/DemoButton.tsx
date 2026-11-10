"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo";

/** Signs in as the public demo account and opens the dashboard. Used on the
 * login page and the public site. */
export function DemoButton({ className = "", children }: { className?: string; children: ReactNode }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    if (error) {
      // Most likely mid-reset, or the nightly reset has not run yet.
      setError("The demo is not available right now. Please try again in a few minutes.");
      setPending(false);
      return;
    }
    // refresh() so Server Components re-render with the new session cookie.
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={start} disabled={pending} className={className}>
        {pending ? "Opening the demo…" : children}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </>
  );
}
