import { Suspense } from "react";
import { requireUser } from "@/lib/auth/require-user";
import { signOut } from "./actions";
import { Navbar } from "./Navbar";

// The navbar is a static shell. With cacheComponents, reading the session at
// the top of a layout would block every child page, so the session read sits
// in <UserMenu> behind its own Suspense boundary. UserMenu redirects to
// /login when there is no user; each page also calls requireUser() itself.
export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <Navbar
        userMenu={
          <Suspense fallback={<div className="h-8 w-20 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-900" aria-busy="true" />}>
            <UserMenu />
          </Suspense>
        }
      />
      {/* Bottom padding on phones clears the fixed tab bar and the home indicator. */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-8 md:pb-10">
        <Suspense fallback={<p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>}>{children}</Suspense>
      </main>
    </div>
  );
}

// Returns a span + form; the Navbar's containers decide how they are laid out.
async function UserMenu() {
  const user = await requireUser();

  return (
    <>
      <span className="text-sm text-zinc-500 dark:text-zinc-400">{user.email}</span>
      <form action={signOut} className="shrink-0">
        <button type="submit" className="btn-secondary px-3 py-1.5">
          Log out
        </button>
      </form>
    </>
  );
}
