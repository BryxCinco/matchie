// The public demo account (portfolio). Its password is not a secret: the
// "Try the demo" buttons sign in with it, and the nightly reset
// (workers/seed-demo.ts) puts it back if a visitor manages to change it.
//
// Imported by the seed worker, so relative imports with .ts only.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types/database.types.ts";

export const DEMO_EMAIL = "demo@matchie.dev";
export const DEMO_PASSWORD = "matchie-demo-2026";

export const DEMO_DISABLED = "Disabled in Demo Mode";

/**
 * Whether the user is the demo account (profiles.is_demo, migration 014).
 * Fails closed: when the check itself fails, the caller treats the user as
 * a demo, so an outage never opens the LLM routes to the shared login.
 */
export async function isDemoAccount(supabase: SupabaseClient<Database>, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("profiles").select("is_demo").eq("user_id", userId).maybeSingle();
  if (error) {
    console.error("[demo] is_demo check failed", error.code);
    return true;
  }
  return data?.is_demo ?? false;
}
