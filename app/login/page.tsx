import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "./login-form";

// Static shell. The form reads ?next and ?error, which are request data, so
// with cacheComponents it streams in behind a Suspense boundary.
export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-4 py-10 sm:py-16 dark:bg-zinc-950">
      <div className="w-full max-w-sm card p-6 sm:p-8">
        <Suspense fallback={<div className="h-80" aria-busy="true" />}>
          <LoginForm />
        </Suspense>
      </div>
      <p className="max-w-sm text-center text-xs text-zinc-500 dark:text-zinc-400">
        Your resume is read on your device, and your name and contact details never reach an AI model.{" "}
        <Link href="/privacy" className="link">
          Privacy notice
        </Link>
      </p>
    </main>
  );
}
