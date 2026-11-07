import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

const SHOWN = 5;
const TIME_ZONE = "Asia/Manila";

// Next interviews as a vertical timeline, soonest first.
export async function UpcomingInterviews() {
  const user = await requireUser("/dashboard");
  const supabase = await createClient();
  // requireUser() called connection(), so reading the clock is allowed here.
  const now = requestTime();

  const { data, error } = await supabase
    .from("interviews")
    .select("id, round, scheduled_at, application:applications(job:jobs(title, company:companies(name)))")
    .eq("user_id", user.id)
    .gt("scheduled_at", new Date(now).toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(SHOWN);

  if (error) {
    console.error("[dashboard] interviews failed", error);
    return <p className="text-sm text-red-600 dark:text-red-400">Could not load interviews. Refresh to try again.</p>;
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <CalendarIcon />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No upcoming interviews.</p>
        <p className="max-w-xs text-xs text-zinc-500">When an invite arrives by email, its application moves to Interview on your tracker.</p>
      </div>
    );
  }

  return (
    <ol className="relative flex flex-col gap-5 before:absolute before:top-2 before:bottom-2 before:left-[1.4rem] before:w-px before:bg-zinc-200 dark:before:bg-zinc-800">
      {data.map((interview, index) => {
        const at = new Date(interview.scheduled_at!);
        const job = interview.application?.job;
        return (
          <li key={interview.id} className="relative flex items-start gap-4">
            <div
              className={`z-10 flex w-11 shrink-0 flex-col items-center rounded-2xl py-1.5 text-center ${
                index === 0 ? "bg-accent text-zinc-950" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              }`}
            >
              <span className="text-[10px] font-semibold tracking-wider uppercase">{format(at, { month: "short" })}</span>
              <span className="font-display text-lg leading-none font-semibold">{format(at, { day: "numeric" })}</span>
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="truncate font-medium">{job?.title ?? "Interview"}</p>
              <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                {[job?.company?.name, `Round ${interview.round}`].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-0.5 text-sm text-orange-600 tabular-nums dark:text-orange-400">
                {format(at, { weekday: "short" })}, {format(at, { hour: "numeric", minute: "2-digit" })}
                <span className="ml-1.5 text-zinc-500 dark:text-zinc-500">{relative(at.getTime() - now)}</span>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function requestTime() {
  return Date.now();
}

function format(date: Date, options: Intl.DateTimeFormatOptions) {
  return date.toLocaleString("en-PH", { timeZone: TIME_ZONE, ...options });
}

function relative(ms: number) {
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return "· soon";
  if (hours < 24) return `· in ${hours}h`;
  const days = Math.round(hours / 24);
  return `· in ${days} day${days === 1 ? "" : "s"}`;
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-9 text-zinc-300 dark:text-zinc-700" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

export function UpcomingInterviewsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex gap-4">
          <div className="h-12 w-11 animate-pulse rounded-2xl bg-zinc-200/60 dark:bg-zinc-800" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-200/60 dark:bg-zinc-800" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-200/60 dark:bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  );
}
