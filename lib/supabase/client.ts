import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database.types";

// Browser client for Client Components. Uses the anon key, so every query
// runs as the signed-in user and is bound by RLS.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
