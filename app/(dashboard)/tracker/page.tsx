import { requireUser } from "@/lib/auth/require-user";

export default async function TrackerPage() {
  await requireUser("/tracker");

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Kanban Tracker coming soon
      </h1>
    </section>
  );
}
