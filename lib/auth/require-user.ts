import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Returns the signed-in user or redirects to /login. Wrapped in cache() so the
// layout and the page share one Auth call per request.
//
// Call it in every protected page, not only the layout: layouts do not
// re-render on client-side navigation between their child pages.
export const requireUser = cache(async (next = "/dashboard") => {
  // Supabase calls Date.now() to check token expiry. With cacheComponents that
  // is an error during prerender unless the render is first marked as
  // request-time. Callers must render inside <Suspense>.
  await connection();
  const supabase = await createClient();
  // getUser() asks the Auth server, so a revoked session is caught here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  return user;
});
