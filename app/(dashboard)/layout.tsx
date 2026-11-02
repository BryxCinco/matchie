import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { signOut } from "./actions";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tracker", label: "Tracker" },
] as const;

// The navbar is a static shell. With cacheComponents, reading the session at
// the top of a layout would block every child page, so the session read sits
// in <UserMenu> behind its own Suspense boundary. UserMenu redirects to
// /login when there is no user; each page also calls requireUser() itself.
export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Matchie
          </Link>
          <ul className="flex gap-4 text-sm">
            {NAV_LINKS.map(({ href, label }) => (
              <li key={href}>
                <Link href={href} className="text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="ml-auto flex items-center gap-3">
            <Suspense fallback={<div className="h-8 w-20" aria-busy="true" />}>
              <UserMenu />
            </Suspense>
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Suspense fallback={<p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>}>
          {children}
        </Suspense>
      </main>
    </div>
  );
}

async function UserMenu() {
  const user = await requireUser();

  return (
    <>
      <span className="hidden text-sm text-zinc-500 sm:inline dark:text-zinc-400">{user.email}</span>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          Log out
        </button>
      </form>
    </>
  );
}
