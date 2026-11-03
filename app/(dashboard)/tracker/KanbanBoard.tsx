"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { APPLICATION_STATUSES, CLOSED_STATUSES, STATUS_LABELS, type ApplicationStatus } from "@/lib/application-status";
import { moveApplication } from "./actions";

export type BoardCard = {
  id: string;
  status: ApplicationStatus;
  lastActivityAt: string;
  title: string;
  company: string | null;
  location: string | null;
  fitScore: number | null;
};

const columnId = (status: ApplicationStatus) => `column-${status}`;

// Layout: on desktop, a horizontally scrolling row of columns with drag and
// drop. On phones, the same row snaps one column at a time, a chip bar jumps
// between columns, and each card has a "Move to" menu, because dragging a
// card across 11 columns with a thumb is not practical.
export function KanbanBoard({ initialCards }: { initialCards: BoardCard[] }) {
  const [cards, setCards] = useState(initialCards);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Optimistic: move the card now, put it back if the server says no.
  function move(cardId: string, to: ApplicationStatus) {
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.status === to) return;
    const from = card.status;

    setError(null);
    setCards((current) =>
      current.map((c) => (c.id === cardId ? { ...c, status: to, lastActivityAt: new Date().toISOString() } : c)),
    );

    startTransition(async () => {
      const result = await moveApplication(cardId, to);
      if (!result.ok) {
        setCards((current) => current.map((c) => (c.id === cardId ? { ...c, status: from } : c)));
        setError(result.error);
      }
    });
  }

  // Order within a column is not stored; columns are always most recent first.
  function handleDragEnd({ draggableId, source, destination }: DropResult) {
    if (!destination || destination.droppableId === source.droppableId) return;
    move(draggableId, destination.droppableId as ApplicationStatus);
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center sm:p-10 dark:border-zinc-700">
        <p className="font-medium">No applications yet</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Score a job on the{" "}
          <Link href="/dashboard" className="link">
            dashboard
          </Link>{" "}
          and click &ldquo;Save to tracker&rdquo;.
        </p>
      </div>
    );
  }

  const byStatus = new Map<ApplicationStatus, BoardCard[]>(APPLICATION_STATUSES.map((s) => [s, []]));
  for (const card of [...cards].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))) {
    byStatus.get(card.status)?.push(card);
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      )}

      <StatusJumpBar counts={byStatus} />

      <DragDropContext onDragEnd={handleDragEnd}>
        {/* Bleeds past the page padding so the last column can scroll fully into view. */}
        <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:scroll-px-6 sm:px-6 md:snap-none md:gap-4">
          {APPLICATION_STATUSES.map((status) => (
            <Column key={status} status={status} cards={byStatus.get(status) ?? []} onMove={move} />
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}

// Phones only: one chip per status; tapping scrolls that column into view.
function StatusJumpBar({ counts }: { counts: Map<ApplicationStatus, BoardCard[]> }) {
  return (
    <nav aria-label="Jump to status" className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6 md:hidden">
      <ul className="flex gap-2">
        {APPLICATION_STATUSES.map((status) => (
          <li key={status}>
            <button
              type="button"
              onClick={() =>
                document.getElementById(columnId(status))?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })
              }
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:text-zinc-300"
            >
              {STATUS_LABELS[status]}
              <span className="text-zinc-400 dark:text-zinc-500">{counts.get(status)?.length ?? 0}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Column({
  status,
  cards,
  onMove,
}: {
  status: ApplicationStatus;
  cards: BoardCard[];
  onMove: (cardId: string, to: ApplicationStatus) => void;
}) {
  const closed = CLOSED_STATUSES.has(status);
  return (
    <section
      id={columnId(status)}
      aria-label={STATUS_LABELS[status]}
      className={`flex w-[85vw] max-w-80 shrink-0 snap-start flex-col rounded-2xl border border-zinc-200 sm:w-72 dark:border-zinc-800 ${
        closed ? "bg-zinc-50 dark:bg-zinc-900/40" : "bg-zinc-100 dark:bg-zinc-900"
      }`}
    >
      <h2 className="flex items-center justify-between px-4 pt-3 pb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        {STATUS_LABELS[status]}
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          {cards.length}
        </span>
      </h2>
      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <ul
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex min-h-32 flex-1 flex-col gap-2 rounded-b-2xl p-2 transition-colors ${
              snapshot.isDraggingOver ? "bg-zinc-200/70 dark:bg-orange-500/10" : ""
            }`}
          >
            {cards.map((card, index) => (
              <Draggable key={card.id} draggableId={card.id} index={index}>
                {(dragProvided, dragSnapshot) => (
                  <li
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                    className={`rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 ${
                      dragSnapshot.isDragging ? "rotate-1 shadow-lg ring-2 ring-zinc-950/10 dark:ring-orange-500/60" : ""
                    } ${closed ? "opacity-70" : ""}`}
                  >
                    <CardBody card={card} />
                    <MoveMenu card={card} onMove={onMove} />
                  </li>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </ul>
        )}
      </Droppable>
    </section>
  );
}

function CardBody({ card }: { card: BoardCard }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm font-medium">{card.title}</p>
        <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
          {[card.company ?? "Company not set", card.location].filter(Boolean).join(" · ")}
        </p>
      </div>
      {card.fitScore !== null && <FitBadge score={card.fitScore} />}
    </div>
  );
}

// Phones only. A native <select> gives the platform's own picker; the drag
// library ignores interactive elements, so tapping it never starts a drag.
function MoveMenu({ card, onMove }: { card: BoardCard; onMove: (cardId: string, to: ApplicationStatus) => void }) {
  return (
    <label className="mt-3 flex items-center gap-2 text-xs text-zinc-500 md:hidden dark:text-zinc-400">
      Move to
      <select
        value={card.status}
        onChange={(e) => onMove(card.id, e.target.value as ApplicationStatus)}
        className="field min-w-0 flex-1 py-1.5 text-sm"
      >
        {APPLICATION_STATUSES.map((status) => (
          <option key={status} value={status}>
            {STATUS_LABELS[status]}
          </option>
        ))}
      </select>
    </label>
  );
}

function FitBadge({ score }: { score: number }) {
  const tone =
    score >= 70
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
      : score >= 50
        ? "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
        : "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300";
  return (
    <span title="Fit score" className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${tone}`}>
      {score}
    </span>
  );
}
