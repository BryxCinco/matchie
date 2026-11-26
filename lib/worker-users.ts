// Which users the daily workers serve (multi-user, migration 017).
// Eligible = not the demo account, and has filled in a seeker profile.
// Reserved users (the owner) come first, so they are served first.
//
// Imported by workers, so relative imports with .ts only.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types/database.types.ts";

export type WorkerUser = { userId: string; reserved: boolean };

export async function loadEligibleUsers(supabase: SupabaseClient<Database>): Promise<WorkerUser[]> {
  // profiles and seeker_profiles both reference auth.users, not each other,
  // so PostgREST cannot embed one in the other; intersect here instead.
  const [profiles, seekers] = await Promise.all([
    supabase.from("profiles").select("user_id, llm_reserved").eq("is_demo", false),
    supabase.from("seeker_profiles").select("user_id"),
  ]);
  if (profiles.error) throw new Error(`Could not load users (${profiles.error.code})`);
  if (seekers.error) throw new Error(`Could not load users (${seekers.error.code})`);

  const withProfile = new Set(seekers.data.map((row) => row.user_id));
  return profiles.data
    .filter((row) => withProfile.has(row.user_id))
    .map((row) => ({ userId: row.user_id, reserved: row.llm_reserved }))
    .sort((a, b) => Number(b.reserved) - Number(a.reserved) || a.userId.localeCompare(b.userId));
}

/** Union of every user's preferred places for the ATS location filter. */
export function mergePreferredPlaces(lists: (string[] | null)[]): string[] {
  const byKey = new Map<string, string>();
  for (const list of lists) {
    for (const raw of list ?? []) {
      const place = raw.trim();
      if (place.length < 2) continue;
      const key = place.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, place);
    }
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}
