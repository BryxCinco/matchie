import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Returns the signed-in user or redirects to /login. Wrapped in cache() so the
// layout and the page share one Auth call per request.
//
// Call it in every protected page, not only the layout: layouts do not
// re-render on client-side navigation between their child pages.
export const requireUser = cache(async (next = "/dashboard") => {
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
