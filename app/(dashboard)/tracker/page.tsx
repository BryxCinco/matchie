import { Suspense } from "react";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { FadeIn } from "../motion";
import { KanbanBoard, type BoardCard } from "./KanbanBoard";

export default function TrackerPage() {
  return (
    <div className="flex flex-col gap-6">
      <FadeIn>
        <header className="flex flex-col gap-3">
          <h1 className="font-display text-4xl leading-[0.95] font-medium sm:text-5xl lg:text-6xl">
            Your <em className="accent-word">Tracker</em>
          </h1>
          <p className="max-w-xl text-zinc-600 dark:text-zinc-400">
            <span className="hidden md:inline">Drag a card to update its status.</span>
            <span className="md:hidden">Swipe between columns; use &ldquo;Move to&rdquo; on a card to change its status.</span> Every move is
            kept in its history.
          </p>
        </header>
      </FadeIn>
      <Suspense fallback={<BoardSkeleton />}>
        <BoardLoader />
      </Suspense>
    </div>
  );
}

async function BoardLoader() {
  const user = await requireUser("/tracker");
  const supabase = await createClient();

  // jobs -> matches is one-to-many, but RLS returns only this user's match
  // and (user_id, job_id) is unique, so there is at most one.
  const { data, error } = await supabase
    .from("applications")
    .select("id, status, last_activity_at, job:jobs(id, title, location, company:companies(name), matches(fit_score))")
    .eq("user_id", user.id)
    .order("last_activity_at", { ascending: false });

  if (error) {
    console.error("[tracker] loading applications failed", error);
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
        Could not load your applications. Refresh to try again.
      </p>
    );
  }

  const cards: BoardCard[] = data.map((app) => ({
    id: app.id,
    status: app.status,
    lastActivityAt: app.last_activity_at,
    title: app.job?.title ?? "Untitled job",
    company: app.job?.company?.name ?? null,
    location: app.job?.location ?? null,
    fitScore: app.job?.matches[0]?.fit_score ?? null,
  }));

  return <KanbanBoard initialCards={cards} />;
}

function BoardSkeleton() {
  return (
    <div aria-busy="true" className="flex gap-4 overflow-hidden">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-96 w-72 shrink-0 animate-pulse rounded-3xl bg-zinc-200/60 dark:bg-zinc-900" />
      ))}
    </div>
  );
}
