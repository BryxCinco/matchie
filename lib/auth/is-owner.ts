import { cache } from "react";
import { requireUser } from "./require-user";

// The owner is the account the owner-only workers (email-poller, digest)
// act for. MATCHIE_OWNER_ID is a server-only env var with the same value as
// the workers' MATCHIE_USER_ID. Render inside <Suspense>, like requireUser().
export const isOwner = cache(async () => {
  const ownerId = process.env.MATCHIE_OWNER_ID;
  if (!ownerId) return false;
  return (await requireUser()).id === ownerId;
});
