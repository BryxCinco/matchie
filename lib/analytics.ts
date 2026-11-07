// Job-search analytics (SPEC "Analytics"), computed from application_events
// alone: the append-only history already records every move, so nothing
// extra is tracked and no LLM is involved. Pure functions; the page loads
// the rows and renders the result.

import type { ApplicationStatus } from "./application-status.ts";

export type AnalyticsEvent = {
  applicationId: string;
  toStatus: ApplicationStatus;
  createdAt: string;
};

export const FUNNEL_STAGES = ["applied", "screening", "interview", "offer"] as const satisfies readonly ApplicationStatus[];
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

// Pipeline order. Reaching a stage counts every stage before it as passed:
// an application that jumped from applied to interview did get past screening.
const RANK: Partial<Record<ApplicationStatus, number>> = {
  applied: 1,
  screening: 2,
  assessment: 3,
  interview: 4,
  final: 5,
  offer: 6,
  accepted: 7,
};

/** A status only the company can cause: the company answered. Ghosted is the
 * absence of an answer, and withdrawn is the user's own move. */
const RESPONSE_STATUSES = new Set<ApplicationStatus>(["screening", "assessment", "interview", "final", "offer", "accepted", "rejected"]);
/** Statuses that mean "sent", not "only saved". */
const NOT_APPLIED = new Set<ApplicationStatus>(["saved", "withdrawn"]);

const DAY_MS = 86_400_000;

export type CompanyResponse = { company: string; medianDays: number; responses: number };

export type Analytics = {
  /** Applications that were ever sent (moved past "saved"). */
  applied: number;
  funnel: { stage: FunnelStage; count: number }[];
  /** Sent applications that got any answer from the company, rejections included. */
  responded: number;
  /** Sent applications that reached interview or later. */
  interviewed: number;
  /** Median days from "applied" to the first answer, over every company. Null with no timed answers. */
  medianResponseDays: number | null;
  /** Slowest first: where waiting is the norm. */
  byCompany: CompanyResponse[];
};

/**
 * @param events every event of the user's applications, any order
 * @param companyOf application id -> company name (null when unknown)
 */
export function computeAnalytics(events: AnalyticsEvent[], companyOf: Map<string, string | null>): Analytics {
  const byApp = new Map<string, AnalyticsEvent[]>();
  for (const event of events) {
    const list = byApp.get(event.applicationId) ?? [];
    list.push(event);
    byApp.set(event.applicationId, list);
  }

  let applied = 0;
  let responded = 0;
  const reached = new Map<FunnelStage, number>(FUNNEL_STAGES.map((stage) => [stage, 0]));
  const allDays: number[] = [];
  const daysByCompany = new Map<string, number[]>();

  for (const [appId, history] of byApp) {
    history.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const sentIndex = history.findIndex((e) => !NOT_APPLIED.has(e.toStatus));
    if (sentIndex === -1) continue;
    applied++;

    const maxRank = Math.max(...history.map((e) => RANK[e.toStatus] ?? 0));
    for (const stage of FUNNEL_STAGES) if (maxRank >= RANK[stage]!) reached.set(stage, reached.get(stage)! + 1);

    const sent = history[sentIndex];
    // Added to the tracker after the answer came (e.g. straight to
    // "interview"): it did respond, but there is no "applied" moment to time.
    if (sent.toStatus !== "applied") {
      if (RESPONSE_STATUSES.has(sent.toStatus)) responded++;
      continue;
    }
    const answer = history.slice(sentIndex + 1).find((e) => RESPONSE_STATUSES.has(e.toStatus));
    if (!answer) continue;
    responded++;

    const days = Math.max(0, (Date.parse(answer.createdAt) - Date.parse(sent.createdAt)) / DAY_MS);
    allDays.push(days);
    const company = companyOf.get(appId)?.trim() || "Unknown company";
    daysByCompany.set(company, [...(daysByCompany.get(company) ?? []), days]);
  }

  return {
    applied,
    funnel: FUNNEL_STAGES.map((stage) => ({ stage, count: reached.get(stage)! })),
    responded,
    interviewed: reached.get("interview")!,
    medianResponseDays: median(allDays),
    byCompany: [...daysByCompany]
      .map(([company, days]) => ({ company, medianDays: median(days)!, responses: days.length }))
      .sort((a, b) => b.medianDays - a.medianDays || a.company.localeCompare(b.company)),
  };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 0-100, or null when there is nothing to divide by. */
export function percent(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}
