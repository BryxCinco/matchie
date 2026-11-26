import { isDemoUser } from "@/lib/auth/is-demo-user";
import { requireUser } from "@/lib/auth/require-user";
import { quotaLeft } from "@/lib/llm-quota";
import { createClient } from "@/lib/supabase/server";

// "AI calls left today", from my_llm_quota_left() (migration 017). Reads the
// session, so render it inside <Suspense>. Hidden for the demo, which has no
// AI calls at all.
export async function QuotaBadge() {
  await requireUser();
  if (await isDemoUser()) return null;
  const left = await quotaLeft(await createClient());
  return (
    <p className="glass inline-flex min-h-8 items-center self-start rounded-full px-3 text-xs font-medium text-zinc-700 dark:text-zinc-300">
      AI calls left today: <span className="ml-1 font-semibold text-accent">{left}</span>
    </p>
  );
}
