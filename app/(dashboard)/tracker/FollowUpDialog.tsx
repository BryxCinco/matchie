"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SIGNATURE_PLACEHOLDER, followUpTemplate } from "@/lib/follow-up-template";
import type { BoardCard } from "./KanbanBoard";

/**
 * "Follow up" on a ghosted card. Opens the draft the ghosting checker wrote
 * (or the plain template if it has not run yet) in an editable sheet, with
 * Copy and Open-in-Mail. Nothing is sent from Matchie: the candidate sends
 * it from their own inbox.
 */
export function FollowUpDialog({ card }: { card: BoardCard }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const initial = card.followUp ?? followUpTemplate({ title: card.title, company: card.company, lastStage: null, appliedAt: card.appliedAt });
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [copied, setCopied] = useState(false);
  // The dialog is rendered only while open (so the portal only ever runs in
  // the browser); edits live in this component and survive closing.
  const [open, setOpen] = useState(false);

  // Open it as a modal once mounted, and lock the page behind it: iOS Safari
  // scrolls the page under a modal dialog otherwise.
  useEffect(() => {
    if (!open) return;
    dialogRef.current?.showModal();
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure origin, permissions): the text is still selectable.
    }
  }

  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const needsName = body.includes(SIGNATURE_PLACEHOLDER);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pressable mt-3 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-full border border-orange-500/50 px-3 text-xs font-semibold text-orange-700 hover:bg-orange-500/10 focus-visible:outline-2 focus-visible:outline-orange-500 dark:text-orange-300"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 5.5h14v9H3zM3.5 6l6.5 5 6.5-5" />
        </svg>
        Follow up
      </button>

      {/* Portaled out of the card: inside the draggable <li>, pressing or typing
          in the sheet could start a drag of the card behind it. */}
      {open &&
        createPortal(
          <dialog
            ref={dialogRef}
            aria-labelledby={`follow-up-${card.id}`}
            onClose={() => setOpen(false)}
            onClick={(event) => event.target === event.currentTarget && dialogRef.current?.close()}
            className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[92dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-3xl border border-zinc-200 bg-cream p-0 text-zinc-950 shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm open:animate-rise sm:inset-0 sm:m-auto sm:max-h-[85dvh] sm:max-w-xl sm:rounded-3xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
          >
            <div className="pb-safe flex flex-col">
              <div aria-hidden="true" className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-zinc-300 sm:hidden dark:bg-zinc-700" />
              <div className="flex items-start justify-between gap-4 px-5 pt-4 sm:px-6 sm:pt-6">
                <div className="min-w-0">
                  <h2 id={`follow-up-${card.id}`} className="font-display text-xl font-medium">
                    <em className="accent-word">Follow</em> up
                  </h2>
                  <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">{[card.title, card.company].filter(Boolean).join(" · ")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => dialogRef.current?.close()}
                  aria-label="Close"
                  className="pressable inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-200/70 text-zinc-600 hover:text-zinc-950 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:text-zinc-50"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M5 5l10 10M15 5L5 15" />
                  </svg>
                </button>
              </div>

              <div className="flex flex-col gap-3 p-5 sm:p-6">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  No reply in 14 days. {card.followUp ? "Here is a draft written for this role." : "Here is a starting point."} Edit it, then send it from your
                  own email.
                </p>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Subject
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} className="field" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Message
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={11} className="field resize-y leading-relaxed" />
                </label>
                {needsName && <p className="text-xs text-orange-700 dark:text-orange-300">Replace {SIGNATURE_PLACEHOLDER} with your name before sending.</p>}
                <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                  <a href={mailto} className="btn-primary min-h-11 flex-1 px-5">
                    Open in Mail
                  </a>
                  <button type="button" onClick={copy} className="btn-secondary min-h-11 flex-1 px-5">
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            </div>
          </dialog>,
          document.body,
        )}
    </>
  );
}
