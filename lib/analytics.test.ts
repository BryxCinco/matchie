import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeAnalytics, median, percent, type AnalyticsEvent } from "./analytics.ts";
import type { ApplicationStatus } from "./application-status.ts";

// Builds one application's history: [status, day] pairs, day 0 = Nov 1.
function history(applicationId: string, steps: [ApplicationStatus, number][]): AnalyticsEvent[] {
  return steps.map(([toStatus, day]) => ({
    applicationId,
    toStatus,
    createdAt: new Date(Date.UTC(2026, 10, 1 + day)).toISOString(),
  }));
}

const companies = new Map<string, string | null>([
  ["a", "Acme"],
  ["b", "Acme"],
  ["c", "Globex"],
  ["d", null],
  ["e", "Initech"],
  ["f", "Umbrella"],
]);

const events = [
  ...history("a", [["saved", 0], ["applied", 1], ["screening", 4], ["interview", 9]]), // answer after 3 days
  ...history("b", [["applied", 0], ["rejected", 7]]), // answer after 7 days
  ...history("c", [["applied", 0], ["ghosted", 14]]), // no answer
  ...history("d", [["applied", 2], ["interview", 4], ["offer", 20]]), // jumped stages, 2 days
  ...history("e", [["saved", 0], ["withdrawn", 3]]), // never sent
  ...history("f", [["interview", 5]]), // added after the company answered
];

describe("computeAnalytics", () => {
  const result = computeAnalytics(events.reverse(), companies); // any order

  it("counts only applications that were sent", () => {
    assert.equal(result.applied, 5);
  });

  it("builds the funnel from the furthest stage each application reached", () => {
    assert.deepEqual(result.funnel, [
      { stage: "applied", count: 5 },
      { stage: "screening", count: 3 }, // a; d and f skipped it but got further
      { stage: "interview", count: 3 },
      { stage: "offer", count: 1 },
    ]);
  });

  it("counts rejections as responses but not ghosting", () => {
    assert.equal(result.responded, 4); // a, b, d, f
    assert.equal(result.interviewed, 3); // a, d, f
  });

  it("times the first answer after applying, by company, slowest first", () => {
    assert.equal(result.medianResponseDays, 3); // [3, 7, 2]
    assert.deepEqual(result.byCompany, [
      { company: "Acme", medianDays: 5, responses: 2 },
      { company: "Unknown company", medianDays: 2, responses: 1 },
    ]);
  });

  it("returns empty results for no events", () => {
    const empty = computeAnalytics([], new Map());
    assert.equal(empty.applied, 0);
    assert.equal(empty.medianResponseDays, null);
    assert.deepEqual(empty.byCompany, []);
  });
});

describe("median and percent", () => {
  it("handles odd, even and empty lists", () => {
    assert.equal(median([5, 1, 3]), 3);
    assert.equal(median([4, 1, 3, 2]), 2.5);
    assert.equal(median([]), null);
  });

  it("rounds and refuses to divide by zero", () => {
    assert.equal(percent(1, 3), 33);
    assert.equal(percent(0, 0), null);
  });
});
