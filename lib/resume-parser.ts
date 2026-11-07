// Heuristic resume text -> ResumeContent parser for Phase 1. No LLM: the raw
// resume is exactly what must never reach a model. Plain regex over section
// headings, bullets and date ranges. Pure, so it also runs in the browser for
// a live preview.

import type { ResumeContent } from "./resume.ts";

type Section = "summary" | "skills" | "experience" | "education" | "other";

const SECTION_HEADINGS: Record<Exclude<Section, "other">, string[]> = {
  summary: ["summary", "professional summary", "profile", "professional profile", "about me", "objective", "career objective"],
  skills: [
    "skills",
    "technical skills",
    "core skills",
    "key skills",
    "core competencies",
    "competencies",
    "tech stack",
    "technologies",
    "tools and technologies",
  ],
  experience: ["experience", "work experience", "professional experience", "employment history", "employment", "work history", "career history"],
  education: ["education", "educational background", "academic background"],
};
// Headings that end the current section but are not parsed (yet).
const OTHER_HEADINGS = ["projects", "certifications", "certificates", "awards", "references", "languages", "interests", "seminars", "trainings", "character references"];

const MONTH = String.raw`(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?`;
const DATE = String.raw`(?:${MONTH}\s+\d{4}|\d{1,2}/\d{4}|\d{4})`;
const DATE_RANGE = new RegExp(String.raw`(${DATE})\s*(?:-|–|—|to)\s*(${DATE}|Present|Current|Now|Today)`, "i");
const BULLET = /^\s*[-•*·▪●◦‣]\s*/;

const ROLE_WORDS =
  /\b(engineer|developer|programmer|analyst|manager|designer|intern|lead|specialist|consultant|architect|administrator|admin|officer|associate|scientist|tester|qa|support|assistant|head|director|technician|coordinator|representative|agent|writer|editor)\b/i;

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

export function parseResumeText(text: string): ResumeContent {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => unspaceLetters(l.trim()));
  const sections = splitSections(lines);

  return {
    contact: {
      name: findName(lines),
      email: text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/)?.[0] ?? null,
      phone: text.match(/(?:\+?63[\s-]?|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}|\+?\d[\d\s()-]{8,}\d/)?.[0]?.trim() ?? null,
      location: null,
    },
    summary: sections.summary.filter(Boolean).join(" ").slice(0, 1000) || null,
    skills: parseSkills(sections.skills),
    experience: parseExperience(sections.experience),
  };
}

// Letter-spaced headings ("S K I L L S", "W O R K  E X P E R I E N C E") are
// common in designed resumes (Canva and the like), and PDF text extraction
// and OCR keep the spaces. A run of 2+ spaces separates words.
function unspaceLetters(line: string) {
  if (line.length > 80) return line;
  const tokens = line.split(/\s+/);
  const single = tokens.filter((t) => t.length === 1).length;
  if (tokens.length < 4 || single / tokens.length < 0.6) return line;
  return line
    .split(/\s{2,}/)
    .map((word) => word.replace(/\s+/g, ""))
    .join(" ");
}

function headingOf(line: string): { section: Section; rest: string } | null {
  const cleaned = line.replace(/^#+\s*/, "");
  // "Skills: React, Node" is a heading with content on the same line.
  const inline = cleaned.match(/^([A-Za-z &]+?)\s*:\s*(.+)$/);
  const standalone = cleaned.match(/^([A-Za-z &]+?)\s*:?$/);
  const rawLabel = inline?.[1] ?? standalone?.[1];
  if (!rawLabel) return null;
  const label = rawLabel.toLowerCase().replace(/&/g, "and").trim();
  const rest = inline?.[2] ?? "";

  for (const [section, headings] of Object.entries(SECTION_HEADINGS)) {
    if (headings.includes(label)) return { section: section as Section, rest };
  }
  // Only a standalone line ends a section: "Languages: TypeScript, Go" inside
  // Skills is a sub-label, not the start of a Languages section.
  if (!inline && OTHER_HEADINGS.includes(label)) return { section: "other", rest: "" };
  return null;
}

function splitSections(lines: string[]) {
  const sections: Record<Section, string[]> = { summary: [], skills: [], experience: [], education: [], other: [] };
  let current: Section = "other";
  for (const line of lines) {
    const heading = headingOf(line);
    if (heading) {
      current = heading.section;
      if (heading.rest) sections[current].push(heading.rest);
      continue;
    }
    sections[current].push(line);
  }
  return sections;
}

// First line that looks like a name: 2-4 words, letters only, each one
// capitalized or a surname particle. Or an explicit "Name:" label.
function findName(lines: string[]) {
  for (const line of lines) {
    const labelled = line.match(/^name\s*:\s*(.+)$/i);
    if (labelled) return labelled[1].trim();
  }
  const first = lines.find(Boolean);
  if (!first || /[\d@|]/.test(first)) return null;
  const words = first.split(/\s+/);
  const particle = /^(de|del|dela|la|delos|los|y|van|von)$/i;
  const looksLikeName =
    words.length >= 2 && words.length <= 5 && words.every((w) => particle.test(w) || /^[A-ZÀ-ÞÑ][A-Za-zÀ-ÿñÑ.'’-]*$/.test(w));
  return looksLikeName && !headingOf(first) ? first : null;
}

function parseSkills(lines: string[]) {
  const seen = new Map<string, string>();
  for (const raw of lines) {
    // "Languages: TypeScript, Go" -> drop the sub-label.
    const line = raw.replace(BULLET, "").replace(/^[A-Za-z /&]{2,30}:\s*/, "");
    for (const piece of line.split(/[,;|•·]|\s{2,}|\t/)) {
      const skill = piece.trim().replace(/\.$/, "").replace(/^and\s+/i, "");
      if (skill.length >= 1 && skill.length <= 40 && !seen.has(skill.toLowerCase())) {
        seen.set(skill.toLowerCase(), skill);
      }
    }
  }
  return [...seen.values()];
}

type Draft = { header: string[]; highlights: string[] };

function parseExperience(lines: string[]): ResumeContent["experience"] {
  const drafts: Draft[] = [];
  let current: Draft | null = null;

  for (const line of lines) {
    if (!line) continue;

    if (BULLET.test(line)) {
      const highlight = line.replace(BULLET, "").trim();
      if (!current) continue;
      if (highlight) current.highlights.push(highlight);
      continue;
    }

    const hasDate = DATE_RANGE.test(line);
    const currentHasDate = current?.header.some((h) => DATE_RANGE.test(h)) ?? false;

    if (current && current.highlights.length > 0 && !hasDate && !looksLikeHeader(line)) {
      // A wrapped bullet: continuation of the previous highlight.
      current.highlights[current.highlights.length - 1] += ` ${line}`;
      continue;
    }

    const startsNew =
      !current ||
      current.highlights.length > 0 ||
      (hasDate && currentHasDate) ||
      current.header.length >= 3;
    if (startsNew) {
      current = { header: [], highlights: [] };
      drafts.push(current);
    }
    current!.header.push(line);
  }

  return drafts.map(toEntry).filter((e): e is ResumeContent["experience"][number] => e !== null);
}

// A non-bullet line after highlights is a new role when it names one.
function looksLikeHeader(line: string) {
  return ROLE_WORDS.test(line) && line.length <= 120;
}

function toEntry(draft: Draft): ResumeContent["experience"][number] | null {
  const headerText = draft.header.join(" | ");
  const range = headerText.match(DATE_RANGE);
  const withoutDates = range ? headerText.replace(range[0], " ") : headerText;

  const parts = withoutDates
    .split(/\s+(?:at|@)\s+|\s*[|–—,·•]\s*|\s+-\s+/)
    .map((p) => p.replace(/[()]/g, "").trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const titleIndex = Math.max(0, parts.findIndex((p) => ROLE_WORDS.test(p)));
  const title = parts[titleIndex];
  const company = parts.find((_, i) => i !== titleIndex) ?? null;

  return {
    title,
    company,
    start: range ? toIsoMonth(range[1]) : null,
    end: range ? toIsoMonth(range[2]) : null,
    highlights: draft.highlights,
  };
}

/** "Jan 2021" -> "2021-01", "03/2021" -> "2021-03", "2021" -> "2021-01", "Present" -> null. */
function toIsoMonth(value: string): string | null {
  const v = value.trim();
  if (/^(present|current|now|today)$/i.test(v)) return null;
  const slash = v.match(/^(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[2]}-${slash[1].padStart(2, "0")}`;
  const named = v.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/);
  if (named) return `${named[2]}-${MONTHS[named[1].toLowerCase()] ?? "01"}`;
  const year = v.match(/^(\d{4})$/);
  return year ? `${year[1]}-01` : null;
}
