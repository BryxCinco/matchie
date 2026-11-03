"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tracker", label: "Tracker" },
  { href: "/onboarding", label: "Profile" },
] as const;

/**
 * `userMenu` is a Server Component (email + log out) streamed in behind
 * Suspense by the layout. It renders in the bar on desktop and inside the
 * menu panel on mobile.
 */
export function Navbar({ userMenu }: { userMenu: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Escape closes the mobile menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <nav aria-label="Main" className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/dashboard" className="flex items-center gap-2 text-lg font-semibold tracking-tight" onClick={() => setOpen(false)}>
          <Logo />
          Matchie
        </Link>

        <ul className="hidden gap-1 md:flex">
          {NAV_LINKS.map(({ href, label }) => (
            <li key={href}>
              <NavLink href={href} active={isActive(href)} className="px-3 py-1.5 text-sm">
                {label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {/* Email shows from lg up; between md and lg only the button fits. */}
          <div className="hidden items-center gap-3 md:flex [&>span]:hidden lg:[&>span]:inline">{userMenu}</div>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex size-9 items-center justify-center rounded-lg text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-zinc-950 md:hidden dark:text-zinc-300 dark:hover:bg-zinc-900 dark:focus-visible:outline-orange-500"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-5">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </nav>

      {/* Hidden with `hidden` (not unmounted) so the streamed user menu stays put. */}
      <div id="mobile-menu" className={`border-t border-zinc-200 px-4 pt-2 pb-4 md:hidden dark:border-zinc-800 ${open ? "block" : "hidden"}`}>
        <ul className="flex flex-col gap-1">
          {NAV_LINKS.map(({ href, label }) => (
            <li key={href}>
              <NavLink href={href} active={isActive(href)} onClick={() => setOpen(false)} className="block px-3 py-3 text-base">
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800 [&>span]:min-w-0 [&>span]:truncate">
          {userMenu}
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  active,
  className,
  onClick,
  children,
}: {
  href: string;
  active: boolean;
  className: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`rounded-lg font-medium transition-colors ${className} ${
        active
          ? "bg-zinc-100 text-zinc-950 dark:bg-orange-500/10 dark:text-orange-400"
          : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
      }`}
    >
      {children}
    </Link>
  );
}

function Logo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" className="size-7">
      <rect width="100" height="100" rx="22" className="fill-zinc-950 dark:fill-zinc-900" />
      <circle cx="50" cy="50" r="28.5" fill="none" stroke="#f97316" strokeWidth="9" />
      <circle cx="50" cy="50" r="11" fill="#f97316" />
    </svg>
  );
}
