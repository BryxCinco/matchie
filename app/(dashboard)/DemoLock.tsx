import type { ReactNode } from "react";
import { DEMO_DISABLED } from "@/lib/demo";

// Controls the public demo account cannot use. The server refuses them too;
// these only explain why the button does nothing.

/**
 * Hover tooltip for a disabled control. Disabled buttons get no pointer
 * events in some browsers, so the title sits on a wrapper and the buttons
 * inside let the pointer through to it.
 */
export function DemoLocked({ locked, className = "", children }: { locked: boolean; className?: string; children: ReactNode }) {
  if (!locked) return children;
  return (
    <span title={DEMO_DISABLED} className={`cursor-not-allowed [&_button]:pointer-events-none ${className}`}>
      {children}
    </span>
  );
}

/** The same message as text, for touch screens (no hover). */
export function DemoLockNote({ className = "" }: { className?: string }) {
  return (
    <p className={`flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 ${className}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
        <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      </svg>
      {DEMO_DISABLED}
    </p>
  );
}
