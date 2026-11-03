import type { Database } from "./types/database.types.ts";

export type ApplicationStatus = Database["public"]["Enums"]["application_status"];

// Board order: the pipeline left to right, then the closed outcomes.
export const APPLICATION_STATUSES = [
  "saved",
  "applied",
  "screening",
  "assessment",
  "interview",
  "final",
  "offer",
  "accepted",
  "rejected",
  "ghosted",
  "withdrawn",
] as const satisfies readonly ApplicationStatus[];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  screening: "Screening",
  assessment: "Assessment",
  interview: "Interview",
  final: "Final round",
  offer: "Offer",
  accepted: "Accepted",
  rejected: "Rejected",
  ghosted: "Ghosted",
  withdrawn: "Withdrawn",
};

/** Outcomes where the application is over; shown muted on the board. */
export const CLOSED_STATUSES: ReadonlySet<ApplicationStatus> = new Set(["rejected", "ghosted", "withdrawn"]);
