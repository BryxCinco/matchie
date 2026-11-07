// Email poller: reads recent mail over IMAP, classifies job-related messages,
// stores them in email_messages, and moves applications on the tracker.
// Job alerts (LinkedIn, JobStreet, Indeed) are parsed without an LLM and
// their jobs go into jobs/job_sources, like the ATS poller's.
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
import { canonicalHash, inferWorkSetup, normalizeCompanyName } from "../lib/ats.ts";
import { parseJobAlert, type ParsedAlert } from "../lib/job-alert-parser.ts";
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

const stats = {
  fetched: 0,
  tooOld: 0,
  duplicate: 0,
  filtered: 0,
  classified: 0,
  linked: 0,
  statusChanged: 0,
  interviews: 0,
  alerts: 0,
  alertJobs: 0,
  newJobs: 0,
  failed: 0,
};
// Job alert senders. Gmail files these under Social or Promotions, which the
// main search skips, so they are searched for separately.
const ALERT_SENDERS =
  "from:(jobalerts-noreply@linkedin.com OR jobs-noreply@linkedin.com OR jobs-listings@linkedin.com OR jobstreet.com OR jobstreet.com.ph OR indeed.com)";

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
    const newerThan = `newer_than:${Math.ceil(LOOKBACK_HOURS / 24) + 1}d`;
    const queries =
      IMAP_HOST === "imap.gmail.com"
        ? [{ gmraw: `${newerThan} -category:promotions -category:social` }, { gmraw: `${newerThan} ${ALERT_SENDERS}` }]
        : [{ since: cutoff }];
    const found = await Promise.all(queries.map(async (query) => (await client.search(query, { uid: true })) || []));
    const uids = [...new Set(found.flat())];
    // Found only by the alert search (Social/Promotions): handled if it parses
    // as an alert, otherwise skipped as before, so it never reaches the LLM.
    const mainSearch = new Set(found[0]);
    const alertsOnly = new Set(uids.filter((uid) => !mainSearch.has(uid)));

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

      await processMessage(supabase, message.source, receivedAt, uid, { userId, applications, statusById, knownNames, alertsOnly });
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
  alertsOnly: Set<number>;
};

async function processMessage(supabase: Supabase, source: Buffer, receivedAt: Date, uid: number, run: RunContext) {
  const { userId, applications, statusById, knownNames } = run;
  let email: IncomingEmail & { messageId: string; html: string | null };
  try {
    const parsed = await simpleParser(source);
    email = {
      messageId: parsed.messageId ?? `uid-${uid}@${MAILBOX}`,
      from: parsed.from?.text ?? "",
      subject: parsed.subject ?? "",
      text: parsed.text ?? "",
      html: typeof parsed.html === "string" ? parsed.html : null,
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

  // Job alerts: parsed here, never sent to an LLM.
  const alert = parseJobAlert(email);
  if (alert) {
    await ingestAlert(supabase, userId, email, alert, uid);
    return;
  }
  if (run.alertsOnly.has(uid)) {
    stats.filtered++;
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

/**
 * An alert's jobs go into jobs/job_sources, deduplicated by canonical_hash
 * like the ATS poller's, so a job seen on Greenhouse and in a LinkedIn alert
 * is one row with two sources. The email is stored last: if ingest fails it
 * is not marked as seen, and the next run retries it.
 */
async function ingestAlert(supabase: Supabase, userId: string, email: IncomingEmail & { messageId: string }, alert: ParsedAlert, uid: number) {
  try {
    const companyIds = await companyIdsFor(supabase, alert.jobs.map((job) => job.company));
    const seenAt = (email.receivedAt ?? new Date()).toISOString();

    const byHash = new Map(alert.jobs.map((job) => [canonicalHash(job.company, job.title, job.location), job]));
    const hashes = [...byHash.keys()];
    const { data: inserted, error: insertError } = await supabase
      .from("jobs")
      .upsert(
        hashes.map((hash) => {
          const job = byHash.get(hash)!;
          return {
            canonical_hash: hash,
            company_id: companyIds.get(normalizeCompanyName(job.company)) ?? null,
            title: job.title,
            // Alerts carry no description; the shortlist and scoring work from the title.
            description: null,
            location: job.location,
            work_setup: job.location ? inferWorkSetup(job.location) : null,
            source: alert.platform,
            source_url: job.url,
          };
        }),
        // An existing row (from a board or an earlier alert) wins.
        { onConflict: "canonical_hash", ignoreDuplicates: true },
      )
      .select("id");
    if (insertError) throw new Error(`insert jobs (${insertError.code}): ${insertError.message}`);

    const { data: rows, error: selectError } = await supabase.from("jobs").select("id, canonical_hash").in("canonical_hash", hashes);
    if (selectError) throw new Error(`select jobs (${selectError.code}): ${selectError.message}`);

    // A re-sighting bumps seen_at, which keeps the job shortlisted and out of retention.
    const { error: sourceError } = await supabase.from("job_sources").upsert(
      rows.map((row) => {
        const job = byHash.get(row.canonical_hash)!;
        return { job_id: row.id, platform: alert.platform, source_url: job.url, raw_payload: { external_id: job.externalId, via: "email_alert" }, seen_at: seenAt };
      }),
      { onConflict: "job_id,platform" },
    );
    if (sourceError) throw new Error(`upsert job_sources (${sourceError.code}): ${sourceError.message}`);

    const { error: emailError } = await supabase.from("email_messages").insert({
      user_id: userId,
      message_id: email.messageId,
      from_addr: email.from.slice(0, 500),
      subject: email.subject.slice(0, 1_000),
      body: email.text.slice(0, 50_000),
      received_at: seenAt,
      classified_as: "job_alert",
    });
    // 23505: another run stored it first; the jobs above are idempotent.
    if (emailError && emailError.code !== "23505") throw new Error(`insert email (${emailError.code}): ${emailError.message}`);

    stats.alerts++;
    stats.alertJobs += rows.length;
    stats.newJobs += inserted.length;
    console.log(`[email-poller] uid ${uid}: ${alert.platform} alert, ${rows.length} jobs (${inserted.length} new)`);
  } catch (error) {
    stats.failed++;
    console.error(`[email-poller] uid ${uid}: job alert not ingested: ${describeError(error)}`);
  }
}

/** normalized company name -> companies.id, creating the missing ones. */
async function companyIdsFor(supabase: Supabase, names: string[]) {
  const byNormalized = new Map<string, string>();
  for (const name of names) {
    const normalized = normalizeCompanyName(name);
    if (normalized && !byNormalized.has(normalized)) byNormalized.set(normalized, name);
  }
  const normalizedNames = [...byNormalized.keys()];
  if (normalizedNames.length === 0) return new Map<string, string>();

  // ignoreDuplicates: an existing company keeps its own spelling.
  const { error: upsertError } = await supabase.from("companies").upsert(
    normalizedNames.map((normalized) => ({ name: byNormalized.get(normalized)!, name_normalized: normalized })),
    { onConflict: "name_normalized", ignoreDuplicates: true },
  );
  if (upsertError) throw new Error(`upsert companies (${upsertError.code}): ${upsertError.message}`);

  const { data, error } = await supabase.from("companies").select("id, name_normalized").in("name_normalized", normalizedNames);
  if (error) throw new Error(`select companies (${error.code}): ${error.message}`);
  return new Map(data.map((row) => [row.name_normalized, row.id]));
}

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
