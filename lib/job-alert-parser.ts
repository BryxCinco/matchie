// Parses job alert emails (LinkedIn, JobStreet, Indeed) into postings, with
// no LLM: the alerts are templated, and the job links carry a stable id.
//
// LinkedIn, JobStreet and Indeed have no public API and forbid scraping
// (SPEC "Job ingestion"), so the alert the user subscribed to is the legal
// way in. Only what the email itself shows is read; the job pages are never
// fetched.
//
// How it reads an alert, whatever the layout:
//   1. Find every job link of the platform. The id in the link identifies the
//      job; several links to one id (title link, "Apply" button) are one job.
//   2. Read the lines around the first link of each job:
//      - "Frontend Developer [https://...]": the link text is the title, and
//        the lines after it are company and location (HTML layouts).
//      - "View job: https://...": the lines before it are title, company and
//        location (LinkedIn's plain-text layout).
// Templates change without notice. A job without a title and a company is
// dropped rather than guessed, and an alert that yields nothing falls back
// to the normal classifier.

export const ALERT_PLATFORMS = ["linkedin", "jobstreet", "indeed"] as const;
export type AlertPlatform = (typeof ALERT_PLATFORMS)[number];

export type AlertJob = {
  /** The platform's job id, from the link. */
  externalId: string;
  title: string;
  company: string;
  location: string | null;
  /** Canonical job page, without tracking parameters. */
  url: string;
};

export type ParsedAlert = { platform: AlertPlatform; jobs: AlertJob[] };

export type AlertEmail = { from: string; subject: string; text: string; html?: string | null };

// Link characters stop at whitespace and at the brackets html-to-text and
// plain-text mail put around links.
const URL_TAIL = String.raw`[^\s<>"'\]\)]*`;

const JOB_LINKS: Record<AlertPlatform, RegExp> = {
  // linkedin.com/comm/jobs/view/3912345678/?trackingId=...
  linkedin: new RegExp(String.raw`https?://(?:[a-z]{2,3}\.)?linkedin\.com/(?:comm/)?jobs/view/(\d{6,})` + URL_TAIL, "gi"),
  // ph.jobstreet.com/job/81234567?ref=... (current) or
  // jobstreet.com.ph/en/job/junior-developer-1234567 (older)
  jobstreet: new RegExp(String.raw`https?://(?:[a-z]{2,3}\.)?jobstreet\.com(?:\.ph)?/(?:job/|(?:en/)?job/[^\s?/]*?-)(\d{5,})` + URL_TAIL, "gi"),
  // ph.indeed.com/rc/clk?jk=0123abcd... or /viewjob?jk=...
  indeed: new RegExp(String.raw`https?://(?:[a-z]{2,3}\.)?indeed\.com/(?:rc/clk|viewjob|pagead/clk)\?(?:[^\s<>"'\]\)]*?&)?jk=([0-9a-f]{8,})` + URL_TAIL, "gi"),
};

const CANONICAL_URL: Record<AlertPlatform, (id: string) => string> = {
  linkedin: (id) => `https://www.linkedin.com/jobs/view/${id}/`,
  jobstreet: (id) => `https://ph.jobstreet.com/job/${id}`,
  indeed: (id) => `https://ph.indeed.com/viewjob?jk=${id}`,
};

/** The platform whose alert this sender sends, or null. */
export function alertPlatformOf(from: string): AlertPlatform | null {
  const address = from.match(/[\w.+-]+@([\w-]+\.)+[a-z]{2,}/i)?.[0].toLowerCase() ?? "";
  const [local = "", domain = ""] = address.split("@");
  const on = (base: string) => domain === base || domain.endsWith(`.${base}`);
  // LinkedIn sends much else (messages, invitations); only its job mailers.
  if (on("linkedin.com") && /job/.test(local)) return "linkedin";
  if (on("jobstreet.com") || on("jobstreet.com.ph") || on("seek.com.au")) return "jobstreet";
  if (on("indeed.com")) return "indeed";
  return null;
}

/**
 * The jobs in a job alert, or null when this is not one. An alert is mail
 * from a platform's job mailer, or an alert the user forwarded ("Fwd:"),
 * that has at least one job link.
 */
export function parseJobAlert(email: AlertEmail): ParsedAlert | null {
  const sender = alertPlatformOf(email.from);
  const forwarded = /^\s*(fwd?|fw)\s*:/i.test(email.subject);
  if (!sender && !forwarded) return null;

  // Prefer the plain-text part; HTML-only mail (or a text part without the
  // links, which some mailers send) is converted with links kept inline.
  const texts = [email.text, email.html ? htmlToText(email.html) : ""].filter(Boolean);
  const platforms = sender ? [sender] : ALERT_PLATFORMS;

  let best: ParsedAlert | null = null;
  for (const text of texts) {
    for (const platform of platforms) {
      const jobs = parseJobs(text, platform);
      if (jobs.length > (best?.jobs.length ?? 0)) best = { platform, jobs };
    }
    if (best) break;
  }
  return best;
}

// --- Reading the jobs ---------------------------------------------------------

type LinkHit = { id: string; start: number; end: number };

function parseJobs(text: string, platform: AlertPlatform): AlertJob[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const hits: LinkHit[] = [...normalized.matchAll(JOB_LINKS[platform])].map((m) => ({
    id: m[1].toLowerCase(),
    start: m.index!,
    end: m.index! + m[0].length,
  }));

  // First link of each job, in order. Later links to the same job (the
  // "Apply" button) only mark where its card ends.
  const firsts = hits.filter((hit, i) => hits.findIndex((h) => h.id === hit.id) === i);
  const jobs: AlertJob[] = [];

  const lineStartOf = (index: number) => normalized.lastIndexOf("\n", index - 1) + 1;

  firsts.forEach((hit, i) => {
    const previousEnd = Math.max(0, ...hits.filter((h) => h.end <= hit.start).map((h) => h.end));
    const lineStart = lineStartOf(hit.start);
    const sameLine = cleanLine(normalized.slice(Math.max(lineStart, previousEnd), hit.start));

    let fields: string[];
    if (sameLine && !isNoise(sameLine)) {
      // "Title [link]": the card continues after the link, up to the line
      // that holds the next job's title.
      const next = firsts[i + 1];
      const after = normalized.slice(hit.end, next ? Math.max(hit.end, lineStartOf(next.start)) : normalized.length);
      fields = [sameLine, ...meaningfulLines(after.slice(0, cutAtNextLink(after)))];
    } else {
      // "View job: link": the card is the lines before the link.
      fields = cardBefore(normalized.slice(previousEnd, lineStart));
    }

    const job = toJob(fields, hit.id, platform);
    if (job) jobs.push(job);
  });
  return jobs;
}

function toJob(fields: string[], id: string, platform: AlertPlatform): AlertJob | null {
  const [title, second, third] = fields;
  if (!title || !second) return null;

  // "Acme Corp · Makati" or "Acme Corp - Makati" in one line.
  let company = second;
  let location = third && !looksLikeDetail(third) ? third : null;
  const split = second.split(/\s+[·•|]\s+|\s+[-–]\s+/);
  if (split.length >= 2) {
    company = split[0];
    location = split.slice(1).join(", ");
  }

  if (!isPlausible(title, 150) || !isPlausible(company, 120)) return null;
  return {
    externalId: id,
    title: title.slice(0, 150),
    company: company.slice(0, 120),
    location: location && isPlausible(location, 120) ? location : null,
    url: CANONICAL_URL[platform](id),
  };
}

// Lines that are part of the template, not of a job.
const NOISE =
  /^(view( the)? job|view all|see (all|more)( jobs)?|apply( now)?|easy apply|quick apply|save( job)?|actively recruiting|promoted|new|featured|urgent|be an early applicant|recommended( for you)?|jobs? (you|for you).*|your job alert.*|\d+ new jobs?.*|unsubscribe.*|manage (your )?(job )?alerts?.*|.*\bapplicants?\b.*|.*\bconnections?\b.*|.*\balumni\b.*|(posted|listed)\b.*|\d+\s*(minutes?|mins?|hours?|hrs?|days?|d|weeks?|w|months?|mo)\s+ago|just now|today|yesterday|responds? (within|in) .*)$/i;

function isNoise(line: string) {
  return NOISE.test(line.replace(/[:.!]+$/, "").trim());
}

/** Salary, benefits and "time ago" lines that follow the location. */
function looksLikeDetail(line: string) {
  return /(₱|\bphp\b|\$|\bper (month|year|hour)\b|\d{2,}\s*k\b|ago\b)/i.test(line);
}

function meaningfulLines(block: string) {
  return block
    .split("\n")
    .map(cleanLine)
    .filter((line) => line && !isNoise(line) && line.length <= 160);
}

/** The last paragraph before a "View job" link, so a greeting or header
 * above the first card is not read as its title. Paragraphs are split by
 * blank lines or separator lines; a card split across two is joined. */
function cardBefore(region: string) {
  const paragraphs = region.split(/\n\s*\n|\n\s*[-=_*]{5,}\s*(?:\n|$)/);
  let lines: string[] = [];
  for (let i = paragraphs.length - 1; i >= 0 && lines.length < 2; i--) {
    lines = [...meaningfulLines(paragraphs[i]), ...lines];
  }
  return lines;
}

/** Drops link fragments, bullets and the brackets around links. */
function cleanLine(line: string) {
  return line
    .replace(/<?https?:\/\/\S+>?/g, " ")
    .replace(/[[\]<>]/g, " ")
    .replace(/^[\s\-–—•*·|:]+|[\s\-–—•*·|:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// In "Title [link]" layouts the card ends at the next link of any kind
// (another job, "See all jobs"), or at a separator line.
function cutAtNextLink(text: string) {
  const link = text.search(/https?:\/\//);
  const separator = text.search(/\n\s*[-=_*]{5,}\s*\n/);
  const cuts = [link, separator].filter((i) => i >= 0);
  return cuts.length ? Math.min(...cuts) : text.length;
}

function isPlausible(text: string, max: number) {
  return text.length >= 2 && text.length <= max && /\p{L}/u.test(text) && !/^https?:/i.test(text);
}

// --- HTML ---------------------------------------------------------------------

/** Minimal HTML to text: links become "text [url]", block tags new lines. */
export function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, inner: string) => {
        const label = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        return `${label} [${href.replace(/&amp;/g, "&")}]\n`;
      })
      .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d|\/td|\/table)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    // A link already ends its line; a <br> right after it is not a new paragraph.
    .replace(/\]\n\n+/g, "]\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(text: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", ndash: "–", mdash: "—", bull: "•", peso: "₱" };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return named[code.toLowerCase()] ?? match;
  });
}
