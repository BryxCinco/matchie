// ATS job boards: fetch, parse and normalize public postings (SPEC "Job
// ingestion - ATS boards"). Pure apart from fetchBoard(); the database side
// lives in workers/ats-poller.ts.
//
// Imported by a worker, so relative imports with .ts only (see CLAUDE.md).

import { createHash } from "node:crypto";
import { z } from "zod";
import type { Database } from "./types/database.types.ts";

export type WorkSetup = Database["public"]["Enums"]["work_setup"];

export const SUPPORTED_PLATFORMS = ["greenhouse", "lever"] as const;
export type AtsPlatform = (typeof SUPPORTED_PLATFORMS)[number];

export type AtsPosting = {
  externalId: string;
  title: string;
  location: string | null;
  description: string;
  url: string | null;
  postedAt: string | null;
  workSetup: WorkSetup | null;
  /** Monthly PHP, only when the board states PHP pay. */
  salaryMin: number | null;
  salaryMax: number | null;
  experienceMinYears: number | null;
  /** The board's own company name, when it has one (Greenhouse does). */
  companyName: string | null;
  /** Posting minus its description fields, for job_sources.raw_payload.
   * The description is already in jobs.description; storing it twice
   * would eat the 500 MB free tier. */
  raw: Record<string, unknown>;
};

const FETCH_TIMEOUT_MS = 20_000;
const MAX_DESCRIPTION_CHARS = 20_000;

export function boardUrl(platform: AtsPlatform, token: string) {
  const slug = encodeURIComponent(token);
  return platform === "greenhouse"
    ? `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`
    : `https://api.lever.co/v0/postings/${slug}?mode=json`;
}

export class BoardFetchError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "BoardFetchError";
    this.status = status;
  }
}

export async function fetchBoard(platform: AtsPlatform, token: string, fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(boardUrl(platform, token), {
    headers: { accept: "application/json", "user-agent": "matchie-job-ingest (+https://github.com/BryxCinco/matchie)" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new BoardFetchError(`HTTP ${response.status} from ${platform} board`, response.status);
  const json: unknown = await response.json();
  return platform === "greenhouse" ? parseGreenhouse(json) : parseLever(json);
}

// --- Parsers -----------------------------------------------------------------
// Validate only what is used; boards add fields freely.

const GreenhouseBoardSchema = z.object({
  jobs: z.array(
    z.looseObject({
      id: z.union([z.number(), z.string()]),
      title: z.string(),
      absolute_url: z.string().nullish(),
      location: z.object({ name: z.string().nullish() }).nullish(),
      content: z.string().nullish(),
      first_published: z.string().nullish(),
      updated_at: z.string().nullish(),
      company_name: z.string().nullish(),
    }),
  ),
});

export function parseGreenhouse(json: unknown): AtsPosting[] {
  return GreenhouseBoardSchema.parse(json).jobs.map((job) => {
    const location = clean(job.location?.name);
    // content is HTML, entity-encoded once more on top.
    const description = htmlToText(decodeEntities(job.content ?? ""));
    return {
      externalId: String(job.id),
      title: job.title.trim(),
      location,
      description: description.slice(0, MAX_DESCRIPTION_CHARS),
      url: job.absolute_url ?? null,
      postedAt: job.first_published ?? job.updated_at ?? null,
      workSetup: inferWorkSetup(`${job.title} ${location ?? ""}`),
      salaryMin: null,
      salaryMax: null,
      experienceMinYears: parseMinYears(description),
      companyName: clean(job.company_name),
      raw: omit(job, ["content"]),
    };
  });
}

const LeverPostingSchema = z.looseObject({
  id: z.string(),
  text: z.string(),
  hostedUrl: z.string().nullish(),
  createdAt: z.number().nullish(),
  categories: z.object({ location: z.string().nullish(), allLocations: z.array(z.string()).nullish() }).nullish(),
  workplaceType: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  additionalPlain: z.string().nullish(),
  lists: z.array(z.object({ text: z.string().nullish(), content: z.string().nullish() })).nullish(),
  salaryRange: z
    .object({ currency: z.string().nullish(), interval: z.string().nullish(), min: z.number().nullish(), max: z.number().nullish() })
    .nullish(),
});

const LEVER_TEXT_FIELDS = ["description", "descriptionPlain", "descriptionBody", "lists", "additional", "additionalPlain", "opening", "openingPlain"];

const LEVER_WORKPLACE: Record<string, WorkSetup> = { remote: "remote", hybrid: "hybrid", "on-site": "onsite", onsite: "onsite" };

export function parseLever(json: unknown): AtsPosting[] {
  return z
    .array(LeverPostingSchema)
    .parse(json)
    .map((job) => {
      const location = clean(job.categories?.location) ?? clean(job.categories?.allLocations?.join(" / "));
      // Lever splits a posting into an intro, titled lists (requirements,
      // responsibilities) and a closing section.
      const lists = (job.lists ?? [])
        .map((list) => `${list.text ?? ""}\n${htmlToText(list.content ?? "")}`.trim())
        .filter(Boolean);
      const description = [job.descriptionPlain ?? "", ...lists, job.additionalPlain ?? ""]
        .map((part) => part.trim())
        .filter(Boolean)
        .join("\n\n");
      const salary = leverSalary(job.salaryRange);
      return {
        externalId: job.id,
        title: job.text.trim(),
        location,
        description: description.slice(0, MAX_DESCRIPTION_CHARS),
        url: job.hostedUrl ?? null,
        postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
        workSetup: LEVER_WORKPLACE[job.workplaceType ?? ""] ?? inferWorkSetup(`${job.text} ${location ?? ""}`),
        salaryMin: salary.min,
        salaryMax: salary.max,
        experienceMinYears: parseMinYears(description),
        companyName: null,
        raw: omit(job, LEVER_TEXT_FIELDS),
      };
    });
}

// jobs.salary_* are monthly PHP. Other currencies are left null rather than
// converted: the rules filter treats null as "unknown", which is honest.
function leverSalary(range: z.infer<typeof LeverPostingSchema>["salaryRange"]) {
  if (!range || range.currency?.toUpperCase() !== "PHP") return { min: null, max: null };
  const divisor = range.interval?.includes("year") ? 12 : range.interval?.includes("month") ? 1 : null;
  if (!divisor) return { min: null, max: null };
  const monthly = (value: number | null | undefined) => (value ? Math.round(value / divisor) : null);
  return { min: monthly(range.min), max: monthly(range.max) };
}

// --- Normalization -----------------------------------------------------------

function clean(text: string | null | undefined) {
  const value = text?.replace(/\s+/g, " ").trim();
  return value ? value : null;
}

const LEGAL_SUFFIXES = /\b(incorporated|inc|corporation|corp|company|co|llc|ltd|limited|plc|pte|gmbh)\b\.?/g;

/** Same rule as companies.name_normalized: lowercased, punctuation and legal suffixes stripped. */
export function normalizeCompanyName(name: string) {
  return normalizeText(name).replace(LEGAL_SUFFIXES, " ").replace(/\s+/g, " ").trim();
}

function normalizeText(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitle(title: string) {
  return normalizeText(title).replace(/\bsr\b/g, "senior").replace(/\bjr\b/g, "junior");
}

/** jobs.canonical_hash: the same posting from several boards collapses to one row. */
export function canonicalHash(companyName: string, title: string, location: string | null) {
  const key = [normalizeCompanyName(companyName), normalizeTitle(title), normalizeText(location ?? "")].join("|");
  return createHash("sha256").update(key).digest("hex");
}

// --- Location filter ---------------------------------------------------------
// The registry is Philippine employers, but many post worldwide from one
// board. Storing a 500-job global board would fill the free tier with jobs
// the user cannot take, so the poller keeps PH-based and open-remote roles,
// plus anything in the user's preferred locations (seeker_profiles).

const PH_PLACES =
  /\b(philippines|pilipinas|manila|makati|taguig|bgc|bonifacio|pasig|ortigas|quezon city|mandaluyong|san juan|alabang|muntinlupa|para[nñ]aque|pasay|cebu|davao|iloilo|clark|pampanga|baguio|cavite|laguna|bacolod|cagayan de oro|batangas|bulacan)\b/i;
const OPEN_REMOTE_REGIONS = /\b(apac|asia|asia[- ]pacific|southeast asia|sea|anywhere|worldwide|global)\b/i;
const REMOTE_WORDS = /\b(remote|anywhere|worldwide|global|work from home|wfh|fully remote|100% remote)\b/gi;

export function isRelevantLocation(location: string | null, workSetup: WorkSetup | null, preferredPlaces: readonly string[] = []) {
  if (!location) return true; // unknown: keep; the LLM sees the JD
  if (PH_PLACES.test(location) || /\bPH\b/.test(location)) return true;
  const lower = location.toLowerCase();
  if (preferredPlaces.some((place) => place && lower.includes(place.toLowerCase()))) return true;

  const remote = workSetup === "remote" || new RegExp(REMOTE_WORDS.source, "i").test(location);
  if (!remote) return false;
  if (OPEN_REMOTE_REGIONS.test(location)) return true;
  // "Remote" alone is open; "Remote, United States" is not.
  return location.replace(REMOTE_WORDS, " ").replace(/[^A-Za-z]+/g, "") === "";
}

function omit(record: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
}

// --- Text helpers ------------------------------------------------------------

export function inferWorkSetup(text: string): WorkSetup | null {
  if (/\bhybrid\b/i.test(text)) return "hybrid";
  if (/\bremote\b/i.test(text)) return "remote";
  if (/\b(on-?site|in[- ]office)\b/i.test(text)) return "onsite";
  return null;
}

/** "3+ years of experience", "2-4 years experience": the lower bound. */
export function parseMinYears(text: string) {
  const match = text.match(
    /\b(\d{1,2})\s*\+?\s*(?:(?:-|–|to)\s*\d{1,2}\s*)?\+?\s*years?['’]?\s+(?:of\s+)?(?:[\w-]+\s+){0,3}?experience\b/i,
  );
  if (!match) return null;
  const years = Number(match[1]);
  return years <= 20 ? years : null;
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", bull: "•" };

export function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });
}

export function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<br\s*\/?>|<\/(p|div|ul|ol|h[1-6]|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
