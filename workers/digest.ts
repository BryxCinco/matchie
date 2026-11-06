// Daily digest: pipeline stage 6. Emails the user's best matches that have
// not been in a digest yet, through Resend, then stamps matches.digest_sent_at.
// Run by .github/workflows/discovery.yml after scoring:  node workers/digest.ts
//
// LOGGING RULE: public repo, public logs. Counts and ids only; never the
// recipient address or job details.
//
// Env:
//   MATCHIE_USER_ID, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   RESEND_API_KEY, NEXT_PUBLIC_APP_URL
//   Optional: RESEND_FROM ("Matchie <onboarding@resend.dev>"), DIGEST_TO (defaults
//             to the account email), DIGEST_SIZE (10), MIN_DIGEST_SCORE (60)

import { createHash } from "node:crypto";
import { createClient } from "../lib/supabase/admin.ts";
import { describeError } from "../lib/describe-error.ts";
import { buildDigestEmail, type DigestItem } from "../lib/digest-email.ts";

const DIGEST_SIZE = Number(process.env.DIGEST_SIZE ?? 10);
// Below this a "match" is noise; it stays unsent and simply ages out.
const MIN_DIGEST_SCORE = Number(process.env.MIN_DIGEST_SCORE ?? 60);
// resend.dev is Resend's shared test domain: it only delivers to the email
// address that owns the Resend account. Verify a domain to send elsewhere.
const RESEND_FROM = process.env.RESEND_FROM || "Matchie <onboarding@resend.dev>";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

async function main() {
  const userId = requireEnv("MATCHIE_USER_ID");
  const resendKey = requireEnv("RESEND_API_KEY");
  const appUrl = requireEnv("NEXT_PUBLIC_APP_URL");
  const supabase = createClient();

  // Over-fetch, then drop pasted jobs (the user has seen them) and saved ones.
  const { data: candidates, error } = await supabase
    .from("matches")
    .select("id, job_id, fit_score, reasoning, job:jobs(title, location, source, source_url, company:companies(name))")
    .eq("user_id", userId)
    .is("digest_sent_at", null)
    .gte("fit_score", MIN_DIGEST_SCORE)
    .order("fit_score", { ascending: false })
    .limit(DIGEST_SIZE * 3);
  if (error) throw new Error(`Could not load matches (${error.code}): ${error.message}`);

  const jobIds = candidates.map((m) => m.job_id);
  const { data: saved, error: savedError } = jobIds.length
    ? await supabase.from("applications").select("job_id").eq("user_id", userId).in("job_id", jobIds)
    : { data: [], error: null };
  if (savedError) throw new Error(`Could not load applications (${savedError.code})`);
  const savedJobIds = new Set(saved.map((a) => a.job_id));

  const picked = candidates.filter((m) => m.job && m.job.source !== "manual" && !savedJobIds.has(m.job_id)).slice(0, DIGEST_SIZE);
  if (picked.length === 0) {
    console.log("[digest] no new matches; no email sent");
    return;
  }

  const to = process.env.DIGEST_TO || (await accountEmail(supabase, userId));
  const items: DigestItem[] = picked.map((m) => ({
    title: m.job!.title,
    company: m.job!.company?.name ?? null,
    location: m.job!.location,
    fitScore: m.fit_score,
    reasoning: m.reasoning,
    url: m.job!.source_url,
  }));
  const { subject, html, text } = buildDigestEmail(items, appUrl);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${resendKey}`,
      "content-type": "application/json",
      // A re-run after a failed stamp (below) picks the same matches, so the
      // same key, and Resend returns the original instead of a duplicate.
      "idempotency-key": `matchie-digest-${manilaDate()}-${hashIds(picked.map((m) => m.id))}`,
    },
    body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html, text }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
  if (!response.ok) {
    // Resend's message explains the cause (unverified domain, bad key) and
    // does not echo the recipient.
    throw new Error(`Resend HTTP ${response.status}: ${body.name ?? ""} ${body.message ?? ""}`.trim());
  }

  const { error: stampError } = await supabase
    .from("matches")
    .update({ digest_sent_at: new Date().toISOString() })
    .in(
      "id",
      picked.map((m) => m.id),
    );
  if (stampError) throw new Error(`Email sent (${body.id}) but matches not stamped (${stampError.code}); a re-run today is deduplicated`);

  console.log(`[digest] sent ${picked.length} matches, resend id ${body.id}`);
}

async function accountEmail(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user?.email) throw new Error(`Could not read the account email (${error?.code ?? "no email"})`);
  return data.user.email;
}

function hashIds(ids: string[]) {
  return createHash("sha256").update([...ids].sort().join(",")).digest("hex").slice(0, 32);
}

function manilaDate() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

main().catch((error) => {
  console.error(`[digest] fatal: ${describeError(error)}`);
  process.exit(1);
});
