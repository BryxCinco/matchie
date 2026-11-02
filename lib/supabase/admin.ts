// WARNING: This client bypasses Row Level Security. NEVER import this in any
// file inside the app/ directory. Use ONLY in workers/ or secure backend scripts.

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Workers run outside Next.js, where a missing GitHub Actions secret would
  // otherwise surface as a vague auth error on the first query.
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for the admin client.",
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    // No user session: this client acts as the service role, not as a user.
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
