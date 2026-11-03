"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/application-status";

// The application_events row for every status change is written by the
// applications_log_status trigger (migration 004), in the same transaction
// as the update. These actions only change applications.

const MoveSchema = z.object({
  applicationId: z.uuid(),
  status: z.enum(APPLICATION_STATUSES),
});

export async function moveApplication(
  applicationId: string,
  status: ApplicationStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const input = MoveSchema.safeParse({ applicationId, status });
  if (!input.success) return { ok: false, error: "Invalid move." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  // RLS limits this to the user's own rows; .select() confirms a row matched.
  const { data, error } = await supabase
    .from("applications")
    .update({ status: input.data.status })
    .eq("id", input.data.applicationId)
    .select("id");

  if (error) {
    console.error("[tracker] status update failed", error);
    return { ok: false, error: "Could not move the card. Please try again." };
  }
  if (!data?.length) return { ok: false, error: "That application no longer exists." };
  return { ok: true };
}

export type SaveToTrackerResult =
  | { ok: true; applicationId: string; alreadySaved: boolean }
  | { ok: false; error: string };

// No match_id on applications: a match is identified by (user_id, job_id),
// so linking the job links its match.
export async function saveJobToTracker(jobId: string): Promise<SaveToTrackerResult> {
  if (!z.uuid().safeParse(jobId).success) return { ok: false, error: "Invalid job." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  // ON CONFLICT DO NOTHING: saving twice is a no-op and logs no second event.
  const { data: inserted, error } = await supabase
    .from("applications")
    .upsert({ user_id: user.id, job_id: jobId, status: "saved" }, { onConflict: "user_id,job_id", ignoreDuplicates: true })
    .select("id");

  if (error) {
    console.error("[tracker] save to tracker failed", error);
    return { ok: false, error: "Could not save to your tracker. Please try again." };
  }
  if (inserted?.length) return { ok: true, applicationId: inserted[0].id, alreadySaved: false };

  const { data: existing } = await supabase
    .from("applications")
    .select("id")
    .eq("user_id", user.id)
    .eq("job_id", jobId)
    .single();
  if (!existing) return { ok: false, error: "Could not save to your tracker. Please try again." };
  return { ok: true, applicationId: existing.id, alreadySaved: true };
}
