"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/#features", label: "Features" },
  { href: "/#how", label: "How it works" },
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
];

function isCurrent(pathname: string, href: string) {
  return !href.includes("#") && pathname === href;
}

/** Desktop links, centered in the header. */
export function SiteLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Site" className="mx-auto hidden md:block">
      <ul className="flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100/60 p-1 dark:border-zinc-800 dark:bg-zinc-900/60">
        {LINKS.map(({ href, label }) => {
          const current = isCurrent(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={`pressable block rounded-full px-3.5 py-1.5 text-sm font-medium ${
                  current
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
    </nav>
  );
}

/**
 * Phone menu. A <details> element, so it opens without JavaScript; the key
 * remounts it closed after every page change, and a link tap closes it too.
 */
export function MobileMenu() {
  const pathname = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  const close = () => menu.current?.removeAttribute("open");

  return (
    <details key={pathname} ref={menu} className="group relative md:hidden">
      <summary
        aria-label="Menu"
        className="pressable flex size-10 cursor-pointer list-none items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-700 [&::-webkit-details-marker]:hidden"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" className="group-open:hidden" />
          <path d="M6 6l12 12M18 6 6 18" className="hidden group-open:block" />
        </svg>
      </summary>
      <nav aria-label="Site" className="glass absolute top-12 right-0 w-56 rounded-2xl border p-2 shadow-xl shadow-black/20 motion-safe:animate-rise">
        <ul className="flex flex-col">
          {LINKS.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                onClick={close}
                aria-current={isCurrent(pathname, href) ? "page" : undefined}
                className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium aria-[current=page]:text-orange-600 hover:bg-zinc-100 dark:aria-[current=page]:text-orange-400 dark:hover:bg-zinc-800"
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </details>
  );
}
