// MUST run before every LLM call. Do not bypass.
//
// Gemini's free tier may use prompts for training and human review, so names,
// emails, phone numbers and street addresses are swapped for placeholders
// like [EMAIL_1] before text leaves the server, and swapped back afterwards
// with unscrubPII(). See SPEC "Hard rules: PII never reaches an LLM".
//
// Plain regex, no NLP. Detection order matters: emails first (they contain
// names), then phones, addresses, and names last.
//
// Names are matched only when there is a signal: a name the caller already
// knows (the user's own, from the resume) via `knownNames`, an honorific
// (Mr., Ms., Engr., Atty.), or a label ("Name:", "Contact person:").
// A blanket "every capitalized word" rule would also scrub React, Python,
// Makati and Senior Software Engineer, which leaves nothing to score.

export type PIIKind = "EMAIL" | "PHONE" | "ADDRESS" | "NAME";

export type ScrubOptions = {
  /** Names to always scrub, e.g. the user's full name from the resume. Each
   * full name is also split into its parts, so "Juan Dela Cruz" scrubs
   * "Juan" and "Cruz" on their own too. */
  knownNames?: string[];
};

export type ScrubResult = {
  scrubbed: string;
  /** Placeholder to original value, e.g. { "[EMAIL_1]": "juan@gmail.com" }. */
  map: Record<string, string>;
};

// --- Patterns ---------------------------------------------------------------

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

// (?<!\d) / (?!\d) instead of \b, because "+" and "(" are not word chars.
const PHONE_PATTERNS = [
  // Mobile: +639171234567, +63 917 123 4567, 0917-123-4567, 09171234567
  /(?<![\d+])(?:\+?63[\s-]?|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}(?!\d)/g,
  // Landline with parenthesized area code: (02) 8123-4567, (032) 234 5678
  /\(0?\d{1,3}\)\s?\d{3,4}[\s-]?\d{4}(?!\d)/g,
  // Metro Manila landline: 02-8123-4567, +63 2 8123 4567
  /(?<![\d+])(?:\+?63[\s-]?|0)2[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g,
];

// A word inside an address: "Rizal", "J.P.", "San", "5th", "Mabini-Ext".
const ADDR_WORD = String.raw`[A-Za-zÀ-ÿñÑ0-9][\w.'À-ÿñÑ-]*`;
const STREET_TYPE = String.raw`(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Highway|Hwy\.?|Extension|Ext\.?)`;
const LOT_UNIT = String.raw`(?:Blk\.?|Block|Lot|Unit|Phase|Purok|Zone)\s*\d+[A-Za-z]?`;
const BARANGAY = String.raw`(?:Brgy\.?|Barangay)\s*${ADDR_WORD}(?:[ \t]+${ADDR_WORD}){0,3}`;
const STREET = String.raw`\d+[A-Za-z]?(?:[-/]\d+)?\s+(?:${ADDR_WORD}\s+){0,5}?${STREET_TYPE}(?![\w])`;
// Trailing segments absorbed into an address once one has started.
const ADDR_TAIL = String.raw`(?:,?\s*(?:${BARANGAY}|${LOT_UNIT}|(?:${ADDR_WORD}\s+){1,3}(?:City|Province)\b|Metro\s+Manila|NCR|\d{4}\b))*`;

// An address must start with a house or lot number. "Makati City" on its own
// is a job location, which the matcher needs for commute filtering.
const ADDRESS_PATTERNS = [
  // 123 Rizal Street, Brgy. San Antonio, Makati City
  // Unit 4B, 88 J.P. Rizal Ave., Makati City
  new RegExp(String.raw`\b(?:${LOT_UNIT},?\s*)*${STREET}${ADDR_TAIL}`, "g"),
  // Blk 5 Lot 12, Brgy. Molino, Bacoor City
  new RegExp(String.raw`\b${LOT_UNIT}(?:,?\s*${LOT_UNIT})*${ADDR_TAIL}`, "g"),
  // Brgy. 176, Caloocan City
  new RegExp(String.raw`\b(?:Brgy\.?|Barangay)\s*\d+${ADDR_TAIL}`, "g"),
];

// One name word: "Juan", "Santos-Reyes", "O'Brien", "Peña".
const NAME_WORD = String.raw`[A-ZÀ-ÞÑ][a-zà-ÿñ'’]+(?:-[A-ZÀ-ÞÑ]?[a-zà-ÿñ'’]+)*`;
// Lowercase particles inside surnames: "dela Cruz", "de los Santos".
const NAME_PARTICLE = String.raw`(?:de|del|dela|de\s+la|delos|de\s+los|van|von|y)`;
// [ \t] rather than \s: a name never continues onto the next line.
const FULL_NAME = String.raw`${NAME_WORD}(?:[ \t]+[A-Z]\.)?(?:[ \t]+(?:${NAME_PARTICLE}[ \t]+)?${NAME_WORD}){0,3}`;

// Group 1 is the name; the honorific or label before it is kept. Only the
// label is case-insensitive, via (?i:...): with a whole-regex "i" flag the
// name would also swallow the lowercase words after it.
const NAME_PATTERNS = [
  new RegExp(String.raw`\b(?:Mr|Mrs|Ms|Mx|Dr|Engr|Atty|Arch|Prof|Sir|Ma'am)\.?[ \t]+(${FULL_NAME})`, "g"),
  new RegExp(
    String.raw`\b(?i:Name|Full\s+Name|Contact(?:\s+Person)?|Attention|Attn|Recruiter|Hiring\s+Manager|Prepared\s+by|Signed)[ \t]*:[ \t]*(${FULL_NAME})`,
    "g",
  ),
];

const NAME_PARTICLES = new Set(["de", "del", "dela", "la", "delos", "los", "van", "von", "y"]);

// --- Implementation ---------------------------------------------------------

const PLACEHOLDER = /\[(?:EMAIL|PHONE|ADDRESS|NAME)_\d+\]/g;
const CONTAINS_PLACEHOLDER = /\[(?:EMAIL|PHONE|ADDRESS|NAME)_\d+\]/;

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function scrubPII(text: string, options: ScrubOptions = {}): ScrubResult {
  const map: Record<string, string> = {};
  const counters: Record<PIIKind, number> = { EMAIL: 0, PHONE: 0, ADDRESS: 0, NAME: 0 };
  // Same value always gets the same placeholder, so the LLM can tell that two
  // mentions are one person. Keyed case-insensitively.
  const seen = new Map<string, string>();

  function placeholderFor(kind: PIIKind, value: string) {
    const key = `${kind}:${value.toLowerCase()}`;
    let placeholder = seen.get(key);
    if (!placeholder) {
      placeholder = `[${kind}_${++counters[kind]}]`;
      seen.set(key, placeholder);
      map[placeholder] = value;
    }
    return placeholder;
  }

  // Trailing punctuation caught by a greedy match goes back into the text.
  function replaceAll(input: string, pattern: RegExp, kind: PIIKind) {
    return input.replace(pattern, (match) => {
      const trimmed = match.replace(/[\s,.;:]+$/, "");
      // Already-scrubbed text must not be scrubbed again.
      if (!trimmed || CONTAINS_PLACEHOLDER.test(trimmed)) return match;
      return placeholderFor(kind, trimmed) + match.slice(trimmed.length);
    });
  }

  let out = text;

  out = replaceAll(out, EMAIL, "EMAIL");
  for (const pattern of PHONE_PATTERNS) out = replaceAll(out, pattern, "PHONE");
  for (const pattern of ADDRESS_PATTERNS) out = replaceAll(out, pattern, "ADDRESS");

  // Known names: full names first, then their parts, longest first so
  // "Juan Dela Cruz" wins over "Juan".
  const known = new Set<string>();
  for (const full of options.knownNames ?? []) {
    const name = full.trim().replace(/\s+/g, " ");
    if (!name) continue;
    known.add(name);
    for (const part of name.split(" ")) {
      if (part.length >= 3 && !NAME_PARTICLES.has(part.toLowerCase())) known.add(part);
    }
  }
  for (const name of [...known].sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name).replace(/ /g, "\\s+")}(?![\\p{L}\\p{N}])`, "giu");
    out = replaceAll(out, pattern, "NAME");
  }

  for (const pattern of NAME_PATTERNS) {
    out = out.replace(pattern, (match, name: string) => {
      const start = match.length - name.length;
      return match.slice(0, start) + placeholderFor("NAME", name);
    });
  }

  return { scrubbed: out, map };
}

// Unknown placeholders (ones the model invented) are left as they are.
// A single pass, so [NAME_1] never matches inside [NAME_10].
export function unscrubPII(text: string, map: Record<string, string>): string {
  return text.replace(PLACEHOLDER, (placeholder) => map[placeholder] ?? placeholder);
}
