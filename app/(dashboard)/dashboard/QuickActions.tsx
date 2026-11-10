"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { PasteJdForm } from "./PasteJdForm";

/**
 * An iOS-style grouped list of shortcuts. "Score a job description" opens
 * the paste form in a native <dialog>: a bottom sheet on phones, a centered
 * panel from sm up. The dialog stays mounted, so a score is still there if
 * the sheet is closed and reopened.
 */
export function QuickActions({ demo = false }: { demo?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  // iOS Safari scrolls the page behind a modal dialog; lock it while open.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  function show() {
    dialogRef.current?.showModal();
    setOpen(true);
  }

  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        <li>
          <ActionRow href="/discover" icon={<CompassIcon />} title="Find jobs for my resume" subtitle="Analyze your resume against new jobs" primary />
        </li>
        <li>
          <ActionRow onClick={show} icon={<SparkIcon />} title="Score a job description" subtitle="Paste a posting, get a fit score" />
        </li>
        <li>
          <ActionRow href="/tracker" icon={<BoardIcon />} title="Open tracker" subtitle="Move applications along" />
        </li>
        <li>
          <ActionRow href="/profile" icon={<PersonIcon />} title="Update profile" subtitle="Skills, salary, work setup" />
        </li>
      </ul>

      <dialog
        ref={dialogRef}
        aria-labelledby="paste-jd-title"
        onClose={() => setOpen(false)}
        // A click on the backdrop lands on the <dialog> itself, not its content.
        onClick={(event) => event.target === event.currentTarget && close()}
        className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[92dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-3xl border border-zinc-200 bg-cream p-0 text-zinc-950 shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm open:animate-rise sm:inset-0 sm:m-auto sm:max-h-[85dvh] sm:max-w-2xl sm:rounded-3xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
      >
        <div className="pb-safe">
          {/* Grabber, as on iOS sheets. */}
          <div aria-hidden="true" className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-zinc-300 sm:hidden dark:bg-zinc-700" />
          <div className="glass sticky top-0 z-10 flex items-center justify-between gap-4 border-b px-5 py-3 sm:px-6">
            <h2 id="paste-jd-title" className="font-display text-lg font-medium">
              Score a <em className="accent-word">job</em>
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="pressable inline-flex size-9 items-center justify-center rounded-full bg-zinc-200/70 text-zinc-600 hover:text-zinc-950 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:text-zinc-50"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          </div>
          <div className="p-4 sm:p-6">
            <PasteJdForm demo={demo} />
          </div>
        </div>
      </dialog>
    </>
  );
}

function ActionRow({
  icon,
  title,
  subtitle,
  href,
  onClick,
  primary = false,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  href?: string;
  onClick?: () => void;
  primary?: boolean;
}) {
  const content = (
    <>
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
          primary ? "bg-accent text-zinc-950" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</span>
      </span>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 shrink-0 text-zinc-400 dark:text-zinc-600" fill="currentColor">
        <path d="M7.3 4.3a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4-1.4L11.6 10 7.3 5.7a1 1 0 0 1 0-1.4Z" />
      </svg>
    </>
  );
  const className =
    "flex min-h-16 w-full items-center gap-3 bg-white px-4 py-3 transition-colors hover:bg-zinc-50 active:bg-zinc-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-500 dark:bg-zinc-900 dark:hover:bg-zinc-800/70 dark:active:bg-zinc-800";

  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

const iconProps = { "aria-hidden": true, viewBox: "0 0 24 24", className: "size-5", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function SparkIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
    </svg>
  );
}

function CompassIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </svg>
  );
}

function BoardIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3.5" y="4" width="5" height="16" rx="1.5" />
      <rect x="9.5" y="4" width="5" height="11" rx="1.5" />
      <rect x="15.5" y="4" width="5" height="7" rx="1.5" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20.5c1.2-3.6 4.3-5.5 8-5.5s6.8 1.9 8 5.5" />
    </svg>
  );
}
