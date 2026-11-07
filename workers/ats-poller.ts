// ATS poller: pipeline stages 1-2 (ingest + dedupe), then retention.
// Reads active boards from ats_companies, fetches their public postings,
// upserts jobs by canonical_hash and records every sighting in job_sources.
// Run by .github/workflows/discovery.yml:  node workers/ats-poller.ts
//
// LOGGING RULE: public repo, public logs. Counts and ids only.
//
// Env:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   Optional: RETENTION_DAYS (60), ATS_KEEP_ALL_LOCATIONS ("1" to skip the PH/remote filter)

import { createClient } from "../lib/supabase/admin.ts";
import { describeError } from "../lib/describe-error.ts";
import {
  SUPPORTED_PLATFORMS,
  canonicalHash,
  fetchBoard,
  isRelevantLocation,
  normalizeCompanyName,
  type AtsPlatform,
  type AtsPosting,
} from "../lib/ats.ts";
import type { Json } from "../lib/types/database.types.ts";

const RETENTION_DAYS = Number(process.env.RETENTION_DAYS ?? 60);
const KEEP_ALL_LOCATIONS = process.env.ATS_KEEP_ALL_LOCATIONS === "1";
// Boards are independent hosts; a few at a time is quick and still polite.
const CONCURRENCY = 4;
// 64-char hashes in an `in (...)` filter: keeps the request URL well under limits.
const CHUNK = 100;

type Supabase = ReturnType<typeof createClient>;
type Board = { id: string; platform: string; board_token: string; company_id: string | null; company: { name: string } | null };

const stats = { boards: 0, boardsFailed: 0, unsupported: 0, postings: 0, offLocation: 0, newJobs: 0, seen: 0, deleted: 0, dbErrors: 0 };

async function main() {
  const supabase = createClient();

  const { data: boards, error } = await supabase
    .from("ats_companies")
    .select("id, platform, board_token, company_id, company:companies(name)")
    .eq("active", true)
    .order("last_polled_at", { ascending: true, nullsFirst: true });
  if (error) throw new Error(`Could not load ats_companies (${error.code}): ${error.message}`);

  const preferredPlaces = await loadPreferredPlaces(supabase);

  stats.boards = boards.length;
  const queue = [...boards];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let board = queue.shift(); board; board = queue.shift()) await pollBoard(supabase, board, preferredPlaces);
    }),
  );

  // Retention runs after ingest, so a job seen again today is never deleted.
  const { data: deleted, error: retentionError } = await supabase.rpc("delete_old_jobs", { retention_days: RETENTION_DAYS });
  if (retentionError) {
    stats.dbErrors++;
    console.error(`[ats-poller] delete_old_jobs failed (${retentionError.code}): ${retentionError.message}`);
  } else {
    stats.deleted = deleted ?? 0;
  }

  console.log(`[ats-poller] ${JSON.stringify(stats)}`);
  // One dead board (wrong token) is recorded in ats_companies.last_error and
  // should not page anyone daily; every board failing, or the database
  // failing, means something systemic.
  if (stats.dbErrors > 0 || (stats.boards > 0 && stats.boardsFailed === stats.boards)) process.exitCode = 1;
}

// Single user for now: keep postings in the places they said they want to
// work (e.g. "Singapore"), on top of PH and open remote. Optional: without
// MATCHIE_USER_ID the poller keeps only PH and open remote.
async function loadPreferredPlaces(supabase: Supabase) {
  const userId = process.env.MATCHIE_USER_ID;
  if (!userId) return [];
  const { data, error } = await supabase.from("seeker_profiles").select("preferred_locations").eq("user_id", userId).maybeSingle();
  if (error) {
    console.warn(`[ats-poller] preferred locations not loaded (${error.code}); keeping PH and open remote only`);
    return [];
  }
  return (data?.preferred_locations ?? []).map((place) => place.trim()).filter((place) => place.length >= 2);
}

async function pollBoard(supabase: Supabase, board: Board, preferredPlaces: string[]) {
  if (!(SUPPORTED_PLATFORMS as readonly string[]).includes(board.platform)) {
    stats.unsupported++;
    await markPolled(supabase, board.id, `platform ${board.platform} not supported yet`);
    return;
  }
  const platform = board.platform as AtsPlatform;

  let postings: AtsPosting[];
  try {
    postings = await fetchBoard(platform, board.board_token);
  } catch (error) {
    stats.boardsFailed++;
    const reason = describeError(error).slice(0, 300);
    console.error(`[ats-poller] board ${board.id} (${platform}): fetch failed: ${reason}`);
    await markPolled(supabase, board.id, reason);
    return;
  }
  stats.postings += postings.length;

  try {
    const companyName = board.company?.name ?? postings.find((p) => p.companyName)?.companyName ?? prettifyToken(board.board_token);
    const companyId = board.company_id ?? (await linkCompany(supabase, board.id, companyName));

    const relevant = KEEP_ALL_LOCATIONS ? postings : postings.filter((p) => isRelevantLocation(p.location, p.workSetup, preferredPlaces));
    stats.offLocation += postings.length - relevant.length;

    // Two openings with the same title and location are one job.
    const byHash = new Map<string, AtsPosting>();
    for (const posting of relevant) byHash.set(canonicalHash(companyName, posting.title, posting.location), posting);

    const jobIds = await upsertJobs(supabase, platform, companyId, byHash);
    await recordSightings(supabase, platform, jobIds, byHash);
    await markPolled(supabase, board.id, null);
  } catch (error) {
    stats.dbErrors++;
    console.error(`[ats-poller] board ${board.id} (${platform}): ${describeError(error)}`);
    await markPolled(supabase, board.id, `ingest failed: ${describeError(error).slice(0, 200)}`);
  }
}

// Returns hash -> job id for every posting, inserting the ones not seen before.
async function upsertJobs(supabase: Supabase, platform: AtsPlatform, companyId: string, byHash: Map<string, AtsPosting>) {
  const ids = new Map<string, string>();
  const hashes = [...byHash.keys()];

  for (const chunk of chunks(hashes, CHUNK)) {
    const { data, error } = await supabase.from("jobs").select("id, canonical_hash").in("canonical_hash", chunk);
    if (error) throw new Error(`select jobs (${error.code}): ${error.message}`);
    for (const row of data) ids.set(row.canonical_hash, row.id);
  }

  const fresh = hashes.filter((hash) => !ids.has(hash));
  for (const chunk of chunks(fresh, CHUNK)) {
    const rows = chunk.map((hash) => {
      const p = byHash.get(hash)!;
      return {
        canonical_hash: hash,
        company_id: companyId,
        title: p.title,
        description: p.description || null,
        location: p.location,
        work_setup: p.workSetup,
        salary_min: p.salaryMin,
        salary_max: p.salaryMax,
        experience_min_years: p.experienceMinYears,
        source: platform,
        source_url: p.url,
        posted_at: p.postedAt,
      };
    });
    // ignoreDuplicates: another board may have inserted the same posting
    // since the select above; its row wins and is picked up below.
    const { data, error } = await supabase
      .from("jobs")
      .upsert(rows, { onConflict: "canonical_hash", ignoreDuplicates: true })
      .select("id, canonical_hash");
    if (error) throw new Error(`insert jobs (${error.code}): ${error.message}`);
    for (const row of data) ids.set(row.canonical_hash, row.id);
    stats.newJobs += data.length;
  }

  const missing = hashes.filter((hash) => !ids.has(hash));
  for (const chunk of chunks(missing, CHUNK)) {
    const { data, error } = await supabase.from("jobs").select("id, canonical_hash").in("canonical_hash", chunk);
    if (error) throw new Error(`reselect jobs (${error.code}): ${error.message}`);
    for (const row of data) ids.set(row.canonical_hash, row.id);
  }
  return ids;
}

// One job_sources row per (job, platform); a re-sighting bumps seen_at,
// which is what keeps a live posting out of delete_old_jobs().
async function recordSightings(supabase: Supabase, platform: AtsPlatform, ids: Map<string, string>, byHash: Map<string, AtsPosting>) {
  const now = new Date().toISOString();
  const rows = [...ids].map(([hash, jobId]) => {
    const p = byHash.get(hash)!;
    return { job_id: jobId, platform, source_url: p.url, raw_payload: p.raw as Json, seen_at: now };
  });
  for (const chunk of chunks(rows, CHUNK)) {
    const { error } = await supabase.from("job_sources").upsert(chunk, { onConflict: "job_id,platform" });
    if (error) throw new Error(`upsert job_sources (${error.code}): ${error.message}`);
  }
  stats.seen += rows.length;
}

// A board added with only platform + token gets a companies row on first poll.
async function linkCompany(supabase: Supabase, boardId: string, name: string) {
  const normalized = normalizeCompanyName(name);
  const { data, error } = await supabase
    .from("companies")
    .upsert({ name, name_normalized: normalized }, { onConflict: "name_normalized" })
    .select("id")
    .single();
  if (error || !data) throw new Error(`upsert company (${error?.code}): ${error?.message}`);

  const { error: linkError } = await supabase.from("ats_companies").update({ company_id: data.id }).eq("id", boardId);
  if (linkError) throw new Error(`link company (${linkError.code}): ${linkError.message}`);
  return data.id;
}

async function markPolled(supabase: Supabase, boardId: string, lastError: string | null) {
  const { error } = await supabase
    .from("ats_companies")
    .update({ last_polled_at: new Date().toISOString(), last_error: lastError })
    .eq("id", boardId);
  if (error) {
    stats.dbErrors++;
    console.error(`[ats-poller] board ${boardId}: could not record poll (${error.code})`);
  }
}

function prettifyToken(token: string) {
  return token.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function chunks<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

main().catch((error) => {
  console.error(`[ats-poller] fatal: ${describeError(error)}`);
  process.exit(1);
});
