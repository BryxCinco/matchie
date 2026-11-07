"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DraggableStateSnapshot,
  type DraggingStyle,
  type DropResult,
  type NotDraggingStyle,
} from "@hello-pangea/dnd";
import { APPLICATION_STATUSES, CLOSED_STATUSES, STATUS_LABELS, type ApplicationStatus } from "@/lib/application-status";
import { moveApplication } from "./actions";
import { FollowUpDialog } from "./FollowUpDialog";

export type BoardCard = {
  id: string;
  status: ApplicationStatus;
  lastActivityAt: string;
  title: string;
  company: string | null;
  location: string | null;
  fitScore: number | null;
  appliedAt: string | null;
  /** Drafted by the ghosting checker when the card went to ghosted. */
  followUp: { subject: string; body: string } | null;
};

// The stages that wait on something, in order, and where applications end.
const PIPELINE = ["saved", "applied", "screening", "assessment", "interview", "final", "offer"] as const satisfies readonly ApplicationStatus[];
const OUTCOMES = ["accepted", "rejected", "ghosted", "withdrawn"] as const satisfies readonly ApplicationStatus[];
/** Cards shown per tile before "Show N more". */
const TILE_VISIBLE = 4;
const COMPACT_VISIBLE = 2;

// Layout: a bento grid of stage tiles; everything is visible without
// scrolling sideways. Drag and drop works between any tiles. On phones each
// card also has a "Move to" menu, because dragging with a thumb down a long
// page is not practical.
export function KanbanBoard({ initialCards }: { initialCards: BoardCard[] }) {
  const [cards, setCards] = useState(initialCards);
  const [error, setError] = useState<string | null>(null);
  // Tiles showing all their cards instead of the first few.
  const [expanded, setExpanded] = useState<Set<ApplicationStatus>>(new Set());
  // The card that just landed in a new column plays a short "settle" pulse.
  const [settledId, setSettledId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Optimistic: move the card now, put it back if the server says no.
  function move(cardId: string, to: ApplicationStatus) {
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.status === to) return;
    const from = card.status;

    setError(null);
    setSettledId(cardId);
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

  const total = cards.length;
  const active = cards.filter((c) => !CLOSED_STATUSES.has(c.status) && c.status !== "accepted" && c.status !== "saved").length;
  const toggle = (status: ApplicationStatus) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      )}

      <p className="eyebrow">
        <span>{total} applications</span>
        <span className="text-zinc-950 dark:text-zinc-50">{active} in progress</span>
      </p>

      <DragDropContext onDragEnd={handleDragEnd}>
        {/* Bento grid: every stage is visible at once, no sideways scrolling.
            Phones: one column. Tablets: two. Laptops and up: four, with
            Interview as the wide hero tile and the outcomes in one strip. */}
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PIPELINE.map((status) => (
            <Tile
              key={status}
              status={status}
              cards={byStatus.get(status) ?? []}
              expanded={expanded.has(status)}
              onToggle={() => toggle(status)}
              onMove={move}
              settledId={settledId}
              onSettled={() => setSettledId(null)}
              className={status === "interview" ? "md:col-span-2" : ""}
            />
          ))}

          <section aria-label="Outcomes" className="flex flex-col gap-3 rounded-3xl border border-zinc-200/70 bg-zinc-100/40 p-3 md:col-span-2 lg:col-span-4 dark:border-zinc-800/60 dark:bg-zinc-900/30">
            <h2 className="px-1 font-sans text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">Outcomes</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {OUTCOMES.map((status) => (
                <Tile
                  key={status}
                  status={status}
                  cards={byStatus.get(status) ?? []}
                  expanded={expanded.has(status)}
                  onToggle={() => toggle(status)}
                  onMove={move}
                  settledId={settledId}
                  onSettled={() => setSettledId(null)}
                  compact
                />
              ))}
            </div>
          </section>
        </div>
      </DragDropContext>
    </div>
  );
}

function Tile({
  status,
  cards,
  expanded,
  onToggle,
  onMove,
  settledId,
  onSettled,
  compact = false,
  className = "",
}: {
  status: ApplicationStatus;
  cards: BoardCard[];
  expanded: boolean;
  onToggle: () => void;
  onMove: (cardId: string, to: ApplicationStatus) => void;
  settledId: string | null;
  onSettled: () => void;
  compact?: boolean;
  className?: string;
}) {
  const closed = CLOSED_STATUSES.has(status);
  const won = status === "offer" || status === "accepted";
  // Long stages fold, so one busy tile does not push the rest off screen.
  // Order is not stored, so rendering only the first few is safe for drag.
  const limit = compact ? COMPACT_VISIBLE : TILE_VISIBLE;
  const shown = expanded ? cards : cards.slice(0, limit);
  const hidden = cards.length - shown.length;

  return (
    <section
      aria-label={STATUS_LABELS[status]}
      className={`flex min-w-0 flex-col rounded-3xl border ${
        compact ? "border-zinc-200 bg-white/80 dark:border-zinc-800 dark:bg-zinc-900/70" : "border-zinc-200 bg-white/70 dark:border-zinc-800 dark:bg-zinc-900"
      } ${className}`}
    >
      <h2 className={`flex items-center gap-2 font-sans text-sm font-semibold tracking-normal text-zinc-700 dark:text-zinc-200 ${compact ? "px-3 pt-3 pb-1.5" : "px-4 pt-4 pb-2"}`}>
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${won ? "bg-ios-green" : closed ? "bg-zinc-400 dark:bg-zinc-600" : "bg-accent"}`} />
        <span className="truncate">{STATUS_LABELS[status]}</span>
        <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium tabular-nums text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          {cards.length}
        </span>
      </h2>
      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <ul
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`m-1.5 mt-0 flex flex-1 flex-col gap-2 rounded-[1.25rem] p-1.5 transition-[background-color,box-shadow] duration-200 ${
              compact ? "min-h-14" : "min-h-20"
            } ${snapshot.isDraggingOver ? "bg-orange-500/[0.07] ring-2 ring-orange-500/40 ring-inset" : ""}`}
          >
            {cards.length === 0 && !snapshot.isDraggingOver && (
              <li aria-hidden="true" className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-zinc-200 px-3 py-3 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">
                Drop here
              </li>
            )}
            {shown.map((card, index) => (
              <Draggable key={card.id} draggableId={card.id} index={index}>
                {(dragProvided, dragSnapshot) => (
                  // The library owns the <li> transform (position); the visual
                  // lift and tilt go on the inner div so they never fight it.
                  <li
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                    style={withSnapDrop(dragProvided.draggableProps.style, dragSnapshot)}
                    className="rounded-2xl focus-visible:outline-2 focus-visible:outline-orange-500"
                  >
                    <div
                      onAnimationEnd={card.id === settledId ? onSettled : undefined}
                      className={`rounded-2xl border bg-white transition-[transform,box-shadow,border-color] duration-300 ease-ios dark:bg-zinc-950 ${compact ? "p-3" : "p-3.5"} ${
                        dragSnapshot.isDragging && !dragSnapshot.isDropAnimating
                          ? "scale-[1.04] rotate-[1.5deg] border-orange-500/60 shadow-[0_20px_40px_-12px_rgb(240_83_43/0.45)]"
                          : "border-zinc-200 shadow-sm hover:border-orange-500/40 dark:border-zinc-800"
                      } ${card.id === settledId ? "animate-settle" : ""} ${closed ? "opacity-75" : ""}`}
                    >
                      <CardBody card={card} compact={compact} />
                      {card.status === "ghosted" && <FollowUpDialog card={card} />}
                      <MoveMenu card={card} onMove={onMove} />
                    </div>
                  </li>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
            {(hidden > 0 || (expanded && cards.length > limit)) && (
              <li>
                <button
                  type="button"
                  onClick={onToggle}
                  className="pressable w-full rounded-full py-2 text-xs font-semibold text-orange-700 hover:bg-orange-500/10 dark:text-orange-300"
                >
                  {hidden > 0 ? `Show ${hidden} more` : "Show less"}
                </button>
              </li>
            )}
          </ul>
        )}
      </Droppable>
    </section>
  );
}

// On drop, the library animates the card into its slot with a plain ease.
// Swapping in an overshooting curve makes it "snap" into place, iOS style.
function withSnapDrop(style: DraggingStyle | NotDraggingStyle | undefined, snapshot: DraggableStateSnapshot) {
  if (!style || !snapshot.isDropAnimating || !snapshot.dropAnimation) return style;
  const { moveTo, duration } = snapshot.dropAnimation;
  return {
    ...style,
    transform: `translate(${moveTo.x}px, ${moveTo.y}px)`,
    transition: `transform ${Math.max(duration, 0.3)}s cubic-bezier(0.34, 1.4, 0.64, 1)`,
  };
}

function CardBody({ card, compact = false }: { card: BoardCard; compact?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className={`line-clamp-2 font-display leading-snug font-medium ${compact ? "text-sm" : "text-[15px]"}`}>{card.title}</p>
        <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
          {[card.company ?? "Company not set", card.location].filter(Boolean).join(" · ")}
        </p>
      </div>
      {card.fitScore !== null && !compact && <FitBadge score={card.fitScore} />}
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
  // Same thresholds and colors as the score ring.
  const tone =
    score >= 80
      ? "bg-ios-green/15 text-green-700 dark:text-green-400"
      : score >= 50
        ? "bg-orange-500/15 text-orange-700 dark:text-orange-300"
        : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  return (
    <span title="Fit score" className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${tone}`}>
      {score}
    </span>
  );
}
