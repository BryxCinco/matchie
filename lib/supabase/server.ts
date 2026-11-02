import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server client for Server Components, Server Actions and Route Handlers.
// Uses the anon key plus the user's session cookies, so RLS still applies.
// Create a new client per request; never cache one in module scope.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components cannot set cookies. Safe to ignore as long as
            // the proxy refreshes the session on every request.
          }
        },
      },
    },
  );
}
