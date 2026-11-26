// The daily LLM budget gate (migration 017). Every LLM call is charged here
// first, then made through callLLM(); a refused charge means no call.
//
// - chargeMe(): the app, as the signed-in user (consume_my_llm_quota takes
//   the user id from the session, never from the request).
// - chargeUser(): workers, with the service role.
//
// Fails closed: an RPC error (network, or the migration not applied yet)
// counts as refused, so an outage never opens an uncapped path.
//
// Imported by workers, so relative imports with .ts only.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types/database.types.ts";

type Supabase = SupabaseClient<Database>;

export const QUOTA_REFUSED = "Daily AI limit reached. It resets at midnight (PH time).";

export async function chargeUser(supabase: Supabase, userId: string, calls: number, worker: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc("consume_llm_quota", { p_user_id: userId, p_calls: calls, p_worker: worker });
  if (error) {
    console.error("[quota] consume_llm_quota failed", error.code);
    return false;
  }
  return data === true;
}

export async function chargeMe(supabase: Supabase, calls: number): Promise<boolean> {
  const { data, error } = await supabase.rpc("consume_my_llm_quota", { p_calls: calls });
  if (error) {
    console.error("[quota] consume_my_llm_quota failed", error.code);
    return false;
  }
  return data === true;
}

/** Interactive calls the signed-in user has left today; 0 when unknown. */
export async function quotaLeft(supabase: Supabase): Promise<number> {
  const { data, error } = await supabase.rpc("my_llm_quota_left");
  if (error) {
    console.error("[quota] my_llm_quota_left failed", error.code);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}
