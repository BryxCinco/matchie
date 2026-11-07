import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

// Three counts. head: true returns only the count, no rows.
export async function StatsWidget() {
  const user = await requireUser("/dashboard");
  const supabase = await createClient();
  const count = () => supabase.from("applications").select("id", { count: "exact", head: true }).eq("user_id", user.id);

  const [total, interviews, offers] = await Promise.all([
    count(),
    count().eq("status", "interview"),
    count().in("status", ["offer", "accepted"]),
  ]);
  const failed = total.error ?? interviews.error ?? offers.error;
  if (failed) console.error("[dashboard] stats failed", failed);

  const stats = [
    { label: "Applications", value: total.count, hint: "in your tracker" },
    { label: "Interviews", value: interviews.count, hint: "active now" },
    { label: "Offers", value: offers.count, hint: "offered or accepted", accent: true },
  ];

  return (
    <ul className="grid grid-cols-3 gap-2 sm:gap-4">
      {stats.map((stat) => (
        <li key={stat.label}>
          <Link
            href="/tracker"
            className="glass pressable flex h-full flex-col gap-1 rounded-3xl border p-3 hover:border-orange-500/40 sm:p-5 dark:bg-zinc-900/60"
          >
            <span className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase sm:text-xs dark:text-zinc-400">{stat.label}</span>
            <span className={`font-display text-3xl leading-none font-semibold tabular-nums sm:text-5xl ${stat.accent && stat.value ? "text-accent" : ""}`}>
              {stat.value ?? "–"}
            </span>
            <span className="hidden text-xs text-zinc-500 sm:block dark:text-zinc-400">{stat.hint}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function StatsSkeleton() {
  return (
    <div aria-busy="true" className="grid grid-cols-3 gap-2 sm:gap-4">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-3xl bg-zinc-200/60 sm:h-32 dark:bg-zinc-900" />
      ))}
    </div>
  );
}
