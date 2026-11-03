import { Suspense } from "react";
import { requireUser } from "@/lib/auth/require-user";
import { PasteJdForm } from "./PasteJdForm";

// The heading and the form are static and prerender into the shell. Only the
// greeting reads the session, so only it waits behind Suspense.
export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">Welcome to Matchie</h1>
        <Suspense fallback={<p className="mt-2 h-6 w-64 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />}>
          <SignedInAs />
        </Suspense>
      </section>
      <PasteJdForm />
    </div>
  );
}

async function SignedInAs() {
  const user = await requireUser("/dashboard");
  return (
    <p className="mt-2 text-zinc-600 dark:text-zinc-400">
      Signed in as <span className="font-medium text-zinc-950 dark:text-zinc-50">{user.email}</span>
    </p>
  );
}
