import { Suspense } from "react";
import Link from "next/link";
import { isDemoUser } from "@/lib/auth/is-demo-user";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { Avatar } from "./Avatar";
import { Navbar } from "./Navbar";

// The navbar is a static shell. With cacheComponents, reading the session at
// the top of a layout would block every child page, so the session read sits
// in <UserMenu> behind its own Suspense boundary. UserMenu redirects to
// /login when there is no user; each page also calls requireUser() itself.
export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <Navbar
        avatar={
          <Suspense fallback={<span className="block size-full rounded-full bg-zinc-200 dark:bg-zinc-800" />}>
            <NavAvatar />
          </Suspense>
        }
        userMenu={
          <Suspense fallback={<div className="h-8 w-20 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-900" aria-busy="true" />}>
            <UserMenu />
          </Suspense>
        }
      />
      {/* Bottom padding on phones clears the fixed tab bar and the home indicator. */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-8 md:pb-10">
        <Suspense fallback={null}>
          <DemoBanner />
        </Suspense>
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

// Only for the public demo login: says what is real and what is not.
async function DemoBanner() {
  if (!(await isDemoUser())) return null;
  return (
    <aside className="card mb-6 flex flex-col gap-3 border-orange-500/40 p-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:p-5 dark:border-orange-500/40">
      <p className="text-zinc-700 dark:text-zinc-300">
        <span className="font-semibold text-zinc-950 dark:text-zinc-50">You are exploring the demo account.</span> The jobs, companies and history are invented and reset
        every night. AI scoring, password changes and uploads are turned off.
      </p>
      <Link href="/" className="btn-secondary min-h-11 shrink-0 px-4">
        About Matchie
      </Link>
    </aside>
  );
}

// Fills its container; the Navbar decides the size.
async function NavAvatar() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("avatar_url").eq("user_id", user.id).maybeSingle();
  return <Avatar url={data?.avatar_url ?? null} name={user.email ?? "?"} className="size-full text-[11px]" />;
}
