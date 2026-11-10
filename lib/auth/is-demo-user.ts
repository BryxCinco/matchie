import { cache } from "react";
import { isDemoAccount } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "./require-user";

// Server Components: whether the signed-in user is the public demo account.
// cache() so the banner and every locked control on a page share one query.
// Render inside <Suspense>, like requireUser().
export const isDemoUser = cache(async () => {
  const user = await requireUser();
  const supabase = await createClient();
  return isDemoAccount(supabase, user.id);
});
