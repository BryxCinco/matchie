// Email poller: reads recent mail over IMAP, classifies job-related messages,
// stores them in email_messages, and moves applications on the tracker.
// Run by .github/workflows/email-poller.yml:  node workers/email-poller.ts
//
// LOGGING RULE: this runs in a public repo, so Actions logs are public. Log
// counts and ids only. Never a sender, subject, body or company name.
//
// Env:
//   GMAIL_USER, GMAIL_APP_PASSWORD   IMAP login (Gmail app password)
//   MATCHIE_USER_ID                  auth.users id that owns this inbox
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   GEMINI_API_KEY, GROQ_API_KEY
//   Optional: IMAP_HOST (imap.gmail.com), IMAP_MAILBOX (INBOX),
//             LOOKBACK_HOURS (26), MAX_EMAILS_PER_RUN (25)

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { createClient } from "../lib/supabase/admin.ts";
import { describeError } from "../lib/describe-error.ts";
import { ResumeContentSchema } from "../lib/resume.ts";
import {
  classifyEmail,
  looksJobRelated,
  MIN_CONFIDENCE_TO_APPLY,
  statusFromClassification,
  type ApplicationRef,
  type EmailClassification,
  type IncomingEmail,
} from "../lib/email-classifier.ts";

const IMAP_HOST = process.env.IMAP_HOST ?? "imap.gmail.com";
const MAILBOX = process.env.IMAP_MAILBOX ?? "INBOX";
// 26h for a 2-hourly schedule: generous overlap, since Actions runs can be
// delayed or skipped. Message-ID dedupe makes the overlap free.
const LOOKBACK_HOURS = Number(process.env.LOOKBACK_HOURS ?? 26);
// Each classified email is one LLM call against the shared daily budget.
const MAX_EMAILS_PER_RUN = Number(process.env.MAX_EMAILS_PER_RUN ?? 25);

const stats = { fetched: 0, tooOld: 0, duplicate: 0, filtered: 0, classified: 0, linked: 0, statusChanged: 0, interviews: 0, failed: 0 };

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

async function main() {
  const userId = requireEnv("MATCHIE_USER_ID");
  // Checked up front: without it every email fails the same way, one by one.
  requireEnv("GEMINI_API_KEY");
  if (!process.env.GROQ_API_KEY) console.warn("[email-poller] GROQ_API_KEY not set: no fallback when Gemini is rate-limited");
  const supabase = createClient();

  const [applications, knownNames] = await Promise.all([loadApplications(supabase, userId), loadKnownNames(supabase, userId)]);
  const statusById = new Map(applications.map((a) => [a.id, a.status]));

  const client = new ImapFlow({
    host: IMAP_HOST,
    port: 993,
    secure: true,
    auth: { user: requireEnv("GMAIL_USER"), pass: requireEnv("GMAIL_APP_PASSWORD") },
    logger: false, // imapflow's logger would print headers into public logs
  });

  await client.connect();
  const lock = await client.getMailboxLock(MAILBOX);
  try {
    const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000);
    // IMAP SINCE has day granularity; the exact cutoff is applied per message.
    const query =
      IMAP_HOST === "imap.gmail.com"
        ? { gmraw: `newer_than:${Math.ceil(LOOKBACK_HOURS / 24) + 1}d -category:promotions -category:social` }
        : { since: cutoff };
    const uids = (await client.search(query, { uid: true })) || [];

    // Newest first, so a backlog spends the per-run cap on fresh mail.
    for (const uid of uids.sort((a, b) => b - a)) {
      if (stats.classified >= MAX_EMAILS_PER_RUN) break;

      // BODY.PEEK: fetching does not mark the message as read in Gmail.
      const message = await client.fetchOne(String(uid), { source: true, internalDate: true }, { uid: true });
      if (!message || !message.source) continue;
      stats.fetched++;

      const receivedAt = new Date(message.internalDate ?? Date.now());
      if (receivedAt < cutoff) {
        stats.tooOld++;
        continue;
      }

      await processMessage(supabase, message.source, receivedAt, uid, { userId, applications, statusById, knownNames });
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }

  console.log(`[email-poller] ${JSON.stringify(stats)}`);
  // Non-zero exit makes the workflow fail, which opens an issue.
  if (stats.failed > 0) process.exitCode = 1;
}

type RunContext = {
  userId: string;
  applications: ApplicationRef[];
  statusById: Map<string, ApplicationRef["status"]>;
  knownNames: string[];
};

async function processMessage(supabase: Supabase, source: Buffer, receivedAt: Date, uid: number, run: RunContext) {
  const { userId, applications, statusById, knownNames } = run;
  let email: IncomingEmail & { messageId: string };
  try {
    const parsed = await simpleParser(source);
    email = {
      messageId: parsed.messageId ?? `uid-${uid}@${MAILBOX}`,
      from: parsed.from?.text ?? "",
      subject: parsed.subject ?? "",
      text: parsed.text ?? "",
      receivedAt,
    };
  } catch (error) {
    // Unparseable mail is rare and not job data we can use; count, do not store.
    stats.failed++;
    console.error(`[email-poller] uid ${uid}: could not parse: ${describeError(error)}`);
    return;
  }

  const { data: existing } = await supabase
    .from("email_messages")
    .select("id")
    .eq("user_id", userId)
    .eq("message_id", email.messageId)
    .maybeSingle();
  if (existing) {
    stats.duplicate++;
    return;
  }

  // Privacy gate: personal mail stops here. Not stored, not sent to an LLM.
  if (!looksJobRelated(email, applications)) {
    stats.filtered++;
    return;
  }

  let verdict;
  try {
    verdict = await classifyEmail(email, applications, { knownNames });
    stats.classified++;
  } catch (error) {
    // Not stored, so the next run retries it while it is inside the lookback window.
    stats.failed++;
    console.error(`[email-poller] uid ${uid}: classification failed: ${describeError(error)}`);
    return;
  }

  const { data: row, error: insertError } = await supabase
    .from("email_messages")
    .insert({
      user_id: userId,
      message_id: email.messageId,
      from_addr: email.from.slice(0, 500),
      subject: email.subject.slice(0, 1_000),
      body: email.text.slice(0, 50_000),
      received_at: receivedAt.toISOString(),
      classified_as: verdict.classification,
      classification_confidence: verdict.confidence,
      classification_reasoning: verdict.reasoning,
      linked_application_id: verdict.linked_application_id,
    })
    .select("id")
    .single();

  if (insertError || !row) {
    // 23505: another run stored it first.
    if (insertError?.code === "23505") {
      stats.duplicate++;
      return;
    }
    stats.failed++;
    console.error(`[email-poller] uid ${uid}: insert failed (${insertError?.code ?? "no row"}): ${insertError?.message ?? ""}`);
    return;
  }

  const appId = verdict.linked_application_id;
  if (!appId) return;
  stats.linked++;

  const current = statusById.get(appId);
  const next = current ? statusFromClassification(current, verdict.classification, verdict.confidence) : null;

  // Even with no status change, the call bumps last_activity_at (not ghosted).
  const { error: applyError } = await supabase.rpc("apply_email_to_application", {
    p_application_id: appId,
    p_email_message_id: row.id,
    p_to_status: next ?? undefined,
    p_note: next ? `Auto-detected ${verdict.classification.replace("_", " ")} (confidence ${verdict.confidence})` : undefined,
  });

  if (applyError) {
    stats.failed++;
    console.error(`[email-poller] application ${appId}: status update failed (${applyError.code}): ${applyError.message}`);
    return;
  }
  if (next) {
    stats.statusChanged++;
    statusById.set(appId, next); // a later email in the same run sees the new status
    console.log(`[email-poller] application ${appId}: ${current} -> ${next}`);
  }

  await recordInterview(supabase, appId, row.id, verdict, statusById.get(appId));
}

// An invite becomes an interviews row (round, and the date if the email
// states one), which fills the dashboard's "Upcoming interviews". Same bar
// as a status change: confident, and not on a closed application.
async function recordInterview(
  supabase: Supabase,
  appId: string,
  emailMessageId: string,
  verdict: EmailClassification,
  status: ApplicationRef["status"] | undefined,
) {
  if (verdict.classification !== "interview_invite" || !verdict.interview) return;
  if (verdict.confidence < MIN_CONFIDENCE_TO_APPLY) return;
  if (status === "accepted" || status === "rejected" || status === "withdrawn") return;

  const { data: round, error } = await supabase.rpc("record_email_interview", {
    p_application_id: appId,
    p_email_message_id: emailMessageId,
    p_round: verdict.interview.round ?? undefined,
    p_scheduled_at: verdict.interview.scheduled_at ?? undefined,
  });
  if (error) {
    stats.failed++;
    console.error(`[email-poller] application ${appId}: interview not recorded (${error.code}): ${error.message}`);
    return;
  }
  stats.interviews++;
  console.log(`[email-poller] application ${appId}: interview round ${round}${verdict.interview.scheduled_at ? " scheduled" : ", date not stated"}`);
}

type Supabase = ReturnType<typeof createClient>;

async function loadApplications(supabase: Supabase, userId: string): Promise<ApplicationRef[]> {
  const { data, error } = await supabase
    .from("applications")
    .select("id, status, last_activity_at, job:jobs(title, company:companies(name))")
    .eq("user_id", userId)
    .order("last_activity_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Could not load applications (${error.code})`);

  return data.map((app) => ({
    id: app.id,
    status: app.status,
    title: app.job?.title ?? "Untitled job",
    company: app.job?.company?.name ?? null,
  }));
}

// The user's own name, so the scrubber removes it from email bodies.
async function loadKnownNames(supabase: Supabase, userId: string) {
  const { data } = await supabase.from("resumes").select("content").eq("user_id", userId).eq("is_master", true).maybeSingle();
  const parsed = ResumeContentSchema.safeParse(data?.content ?? {});
  const name = parsed.success ? parsed.data.contact.name : null;
  return name ? [name] : [];
}

main().catch((error) => {
  console.error(`[email-poller] fatal: ${describeError(error)}`);
  process.exit(1);
});
