import { Suspense } from "react";
import { LoginForm } from "./login-form";

// Static shell. The form reads ?next and ?error, which are request data, so
// with cacheComponents it streams in behind a Suspense boundary.
export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <Suspense fallback={<div className="h-80" aria-busy="true" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
