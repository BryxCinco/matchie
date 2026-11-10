// Ghosting checker (SPEC "Email intelligence"): no reply after 14 days flips
// an application to ghosted and offers a follow-up draft.
// Run daily by .github/workflows/discovery.yml:  node workers/ghosting-checker.ts
//
// 1. mark_ghosted_applications() flips quiet applications in one SQL
//    transaction, with source = 'system' on the application_events rows.
// 2. Every ghosted application without a draft gets one: an LLM draft, or
//    the plain template if drafting fails. Picking up all draftless ones (not
//    only today's) retries yesterday's failures for free.
//
// LOGGING RULE: public repo, public logs. Counts and ids only; never a job
// title, company or draft.
//
// Env:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, GROQ_API_KEY
//   Optional: GHOSTING_DAYS (14), MAX_DRAFTS_PER_RUN (20)

import { createClient } from "../lib/supabase/admin.ts";
import { describeError } from "../lib/describe-error.ts";
import { draftFollowUp } from "../lib/follow-up.ts";
import { followUpTemplate, type FollowUpDraft } from "../lib/follow-up-template.ts";
import { ResumeContentSchema } from "../lib/resume.ts";

const GHOSTING_DAYS = Number(process.env.GHOSTING_DAYS ?? 14);
// Each draft is one LLM call against the shared daily budget.
const MAX_DRAFTS_PER_RUN = Number(process.env.MAX_DRAFTS_PER_RUN ?? 20);

type Supabase = ReturnType<typeof createClient>;

const stats = { ghosted: 0, drafted: 0, templated: 0, failed: 0 };

async function main() {
  const supabase = createClient();

  const { data: ghosted, error } = await supabase.rpc("mark_ghosted_applications", { p_days: GHOSTING_DAYS });
  if (error) throw new Error(`mark_ghosted_applications failed (${error.code}): ${error.message}`);
  stats.ghosted = ghosted.length;
  for (const row of ghosted) console.log(`[ghosting] application ${row.application_id}: ghosted`);

  // mark_ghosted_applications() skips demo accounts, but a demo visitor can
  // still drag a card to Ghosted; drafting it would spend the LLM budget.
  const { data: demoProfiles, error: demoError } = await supabase.from("profiles").select("user_id").eq("is_demo", true);
  if (demoError) throw new Error(`Could not load demo profiles (${demoError.code})`);
  let pendingQuery = supabase
    .from("applications")
    .select("id, user_id, applied_at, job:jobs(title, company:companies(name))")
    .eq("status", "ghosted")
    .is("follow_up_draft", null);
  if (demoProfiles.length) pendingQuery = pendingQuery.not("user_id", "in", `(${demoProfiles.map((p) => p.user_id).join(",")})`);
  const { data: pending, error: pendingError } = await pendingQuery.order("last_activity_at", { ascending: false }).limit(MAX_DRAFTS_PER_RUN);
  if (pendingError) throw new Error(`Could not load ghosted applications (${pendingError.code})`);

  const namesByUser = new Map<string, string[]>();
  for (const app of pending) {
    if (!namesByUser.has(app.user_id)) namesByUser.set(app.user_id, await knownNames(supabase, app.user_id));
    const context = {
      title: app.job?.title ?? "the role",
      company: app.job?.company?.name ?? null,
      lastStage: await lastStageBeforeGhosting(supabase, app.id),
      appliedAt: app.applied_at,
    };

    let draft: FollowUpDraft;
    try {
      draft = await draftFollowUp(context, { knownNames: namesByUser.get(app.user_id) });
      stats.drafted++;
    } catch (error) {
      // The user still gets a usable draft today; the template is the fallback.
      console.error(`[ghosting] application ${app.id}: drafting failed, using template: ${describeError(error)}`);
      draft = followUpTemplate(context);
      stats.templated++;
    }

    const { error: saveError } = await supabase
      .from("applications")
      .update({ follow_up_subject: draft.subject, follow_up_draft: draft.body, follow_up_drafted_at: new Date().toISOString() })
      .eq("id", app.id)
      .eq("status", "ghosted"); // revived by an email meanwhile: leave it alone
    if (saveError) {
      stats.failed++;
      console.error(`[ghosting] application ${app.id}: could not save draft (${saveError.code})`);
    }
  }

  console.log(`[ghosting] ${JSON.stringify(stats)}`);
  if (stats.failed > 0) process.exitCode = 1;
}

// The stage the application sat in before going quiet ("interview" makes a
// different email than "applied"). From the system event that ghosted it.
async function lastStageBeforeGhosting(supabase: Supabase, applicationId: string) {
  const { data } = await supabase
    .from("application_events")
    .select("from_status")
    .eq("application_id", applicationId)
    .eq("to_status", "ghosted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.from_status ?? null;
}

// The user's own name, so the scrubber removes it if it ever appears.
async function knownNames(supabase: Supabase, userId: string) {
  const { data } = await supabase.from("resumes").select("content").eq("user_id", userId).eq("is_master", true).maybeSingle();
  const name = ResumeContentSchema.safeParse(data?.content ?? {}).data?.contact.name;
  return name ? [name] : [];
}

main().catch((error) => {
  console.error(`[ghosting] fatal: ${describeError(error)}`);
  process.exit(1);
});
