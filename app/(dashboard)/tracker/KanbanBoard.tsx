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

export function KanbanBoard({ initialCards }: { initialCards: BoardCard[] }) {
  const [cards, setCards] = useState(initialCards);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Order within a column is not stored; columns are always most recent first.
  function handleDragEnd({ draggableId, source, destination }: DropResult) {
    if (!destination || destination.droppableId === source.droppableId) return;

    const from = source.droppableId as ApplicationStatus;
    const to = destination.droppableId as ApplicationStatus;
    const movedAt = new Date().toISOString();

    // Optimistic: move the card now, put it back if the server says no.
    setError(null);
    setCards((current) => current.map((c) => (c.id === draggableId ? { ...c, status: to, lastActivityAt: movedAt } : c)));

    startTransition(async () => {
      const result = await moveApplication(draggableId, to);
      if (!result.ok) {
        setCards((current) => current.map((c) => (c.id === draggableId ? { ...c, status: from } : c)));
        setError(result.error);
      }
    });
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
        <p className="font-medium text-zinc-900 dark:text-zinc-100">No applications yet</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Score a job on the{" "}
          <Link href="/dashboard" className="font-medium text-zinc-950 underline underline-offset-4 dark:text-zinc-50">
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
      <DragDropContext onDragEnd={handleDragEnd}>
        {/* Bleeds past the page padding so the last column can scroll fully into view. */}
        <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-4">
          {APPLICATION_STATUSES.map((status) => (
            <Column key={status} status={status} cards={byStatus.get(status) ?? []} />
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}

function Column({ status, cards }: { status: ApplicationStatus; cards: BoardCard[] }) {
  const closed = CLOSED_STATUSES.has(status);
  return (
    <section
      aria-label={STATUS_LABELS[status]}
      className={`flex w-72 shrink-0 flex-col rounded-2xl border border-zinc-200 dark:border-zinc-800 ${
        closed ? "bg-zinc-100/60 dark:bg-zinc-900/40" : "bg-zinc-100 dark:bg-zinc-900"
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
              snapshot.isDraggingOver ? "bg-zinc-200/70 dark:bg-zinc-800/70" : ""
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
                      dragSnapshot.isDragging ? "rotate-1 shadow-lg ring-2 ring-zinc-950/10 dark:ring-zinc-50/20" : ""
                    } ${closed ? "opacity-70" : ""}`}
                  >
                    <CardBody card={card} />
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
        <p className="line-clamp-2 text-sm font-medium text-zinc-950 dark:text-zinc-50">{card.title}</p>
        <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
          {[card.company ?? "Company not set", card.location].filter(Boolean).join(" · ")}
        </p>
      </div>
      {card.fitScore !== null && <FitBadge score={card.fitScore} />}
    </div>
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
