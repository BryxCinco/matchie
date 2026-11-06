"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: HomeIcon },
  { href: "/discover", label: "Discover", icon: CompassIcon },
  { href: "/tracker", label: "Tracker", icon: BoardIcon },
  { href: "/onboarding", label: "Profile", icon: PersonIcon },
] as const;

/**
 * Desktop and tablet (md+): a frosted top bar with the links, which shrinks
 * once the page scrolls. Phones: the top bar keeps only the logo, theme and
 * account button, and the links move to an iOS-style tab bar at the bottom,
 * within thumb reach.
 *
 * `userMenu` is a Server Component (email + log out) streamed in behind
 * Suspense by the layout. It renders in the bar on desktop and in the
 * account popover on phones.
 */
export function Navbar({ userMenu }: { userMenu: ReactNode }) {
  const pathname = usePathname();
  const scrolled = useScrolled();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <header className={`glass pt-safe sticky top-0 z-30 border-b transition-shadow duration-300 ${scrolled ? "shadow-[0_8px_30px_-12px_rgb(0_0_0/0.35)]" : ""}`}>
        <nav
          aria-label="Main"
          className={`mx-auto flex max-w-6xl items-center gap-6 px-4 transition-[height] duration-300 ease-ios sm:px-6 ${scrolled ? "h-12" : "h-14 md:h-16"}`}
        >
          <Link href="/dashboard" className="pressable flex items-center gap-2 rounded-lg">
            <Logo className={`transition-[width,height] duration-300 ease-ios ${scrolled ? "size-6" : "size-7"}`} />
            <span className="font-display text-lg font-semibold tracking-tight">Matchie</span>
          </Link>

          <ul className="hidden items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100/60 p-1 md:flex dark:border-zinc-800 dark:bg-zinc-900/60">
            {NAV_LINKS.map(({ href, label }) => {
              const active = isActive(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`pressable block rounded-full px-4 py-1.5 text-sm font-medium ${
                      active
                        ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-orange-400"
                        : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {/* Email shows from lg up; between md and lg only the button fits. */}
            <div className="hidden items-center gap-3 md:flex [&>span]:hidden lg:[&>span]:inline">{userMenu}</div>
            <AccountMenu>{userMenu}</AccountMenu>
          </div>
        </nav>
      </header>

      <nav aria-label="Tabs" className="glass pb-safe fixed inset-x-0 bottom-0 z-30 border-t md:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`pressable flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                    active ? "text-orange-600 dark:text-orange-400" : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  <Icon active={active} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

// True once the page has scrolled past the top. One passive listener,
// throttled to animation frames.
function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > threshold);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [threshold]);
  return scrolled;
}

// Phones only: email + log out in a small popover under the account button.
// The panel is hidden, not unmounted, so the streamed user menu stays put.
function AccountMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="account-menu"
        aria-label="Account"
        className="pressable inline-flex size-9 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-orange-500 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        <PersonIcon active={open} />
      </button>
      <div
        id="account-menu"
        className={`card absolute right-0 mt-2 w-[min(18rem,calc(100vw-2rem))] origin-top-right flex-col gap-3 p-4 [&>span]:truncate [&>span]:text-sm ${
          open ? "flex" : "hidden"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function Logo({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" className={className}>
      <defs>
        <linearGradient id="matchie-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff8a3d" />
          <stop offset="1" stopColor="#f0532b" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="26" fill="#15131f" />
      <circle cx="50" cy="50" r="28.5" fill="none" stroke="url(#matchie-logo)" strokeWidth="9" />
      <circle cx="50" cy="50" r="11" fill="url(#matchie-logo)" />
    </svg>
  );
}

// --- Tab icons (24px, 1.8 stroke; filled when active, as iOS does) ---------

type IconProps = { active: boolean };

function HomeIcon({ active }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6h-6v6H4.5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function CompassIcon({ active }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.18 : 0} />
      <path d="m15.5 8.5-2 5-5 2 2-5z" fill={active ? "currentColor" : "none"} />
    </svg>
  );
}

function BoardIcon({ active }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <rect x="3.5" y="4" width="5" height="16" rx="1.5" fill={active ? "currentColor" : "none"} />
      <rect x="9.5" y="4" width="5" height="11" rx="1.5" fill={active ? "currentColor" : "none"} />
      <rect x="15.5" y="4" width="5" height="7" rx="1.5" fill={active ? "currentColor" : "none"} />
    </svg>
  );
}

function PersonIcon({ active }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20.5c1.2-3.6 4.3-5.5 8-5.5s6.8 1.9 8 5.5" strokeLinecap="round" />
    </svg>
  );
}
