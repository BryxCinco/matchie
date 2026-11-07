import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildBatchPrompt, scoreJobsBatch, type BatchJob } from "./batch-scoring.ts";
import type { CandidateSummary, SeekerPreferences } from "./match-scoring.ts";

const JOBS: BatchJob[] = [
  { id: "11111111-1111-4111-8111-111111111111", title: "React Developer", company: "Acme", location: "Makati", workSetup: "hybrid", description: "Must know React." },
  { id: "22222222-2222-4222-8222-222222222222", title: "Java Engineer", company: "Globex", location: null, workSetup: null, description: "x".repeat(5_000) },
];
const CANDIDATE: CandidateSummary = {
  skills: ["React", "TypeScript"],
  yearsExperience: 3,
  experience: [{ title: "Frontend Developer", years: 3, highlights: ["Juan Dela Cruz built the checkout"] }],
  fullName: "Juan Dela Cruz",
};
const PREFS: SeekerPreferences = { target_roles: ["Frontend Developer"], min_salary: 80_000, work_setup: ["hybrid", "remote"], avoid_industries: [] };

describe("buildBatchPrompt", () => {
  const prompt = buildBatchPrompt(JOBS, CANDIDATE, PREFS);

  it("numbers the jobs without their ids", () => {
    assert.ok(prompt.includes('<job number="1">\nTitle: React Developer\nCompany: Acme'));
    assert.ok(prompt.includes('<job number="2">'));
    assert.ok(!prompt.includes("11111111"));
  });

  it("cuts long descriptions to an excerpt", () => {
    assert.ok(prompt.includes("[truncated]"));
    assert.ok(prompt.length < 6_000);
  });
});

describe("scoreJobsBatch", () => {
  const realFetch = globalThis.fetch;
  let sent = "";

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test";
    process.env.GROQ_API_KEY = "test";
    console.info = () => {};
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      sent = String(init?.body ?? "");
      const reply = {
        results: [
          { job: 1, fit_score: 88.6, matched_skills: ["React", "React"], missing_skills: [], red_flags: [], reasoning: "Strong React fit." },
          { job: 9, fit_score: 90, matched_skills: [], missing_skills: [], red_flags: [], reasoning: "Not in the list." },
        ],
      };
      const body = { candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(reply) }] }, finishReason: "STOP", index: 0 }] };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("maps numbers back to ids, normalizes, and ignores unknown or skipped jobs", async () => {
    const { scores } = await scoreJobsBatch(JOBS, CANDIDATE, PREFS);
    assert.equal(scores.size, 1);
    assert.deepEqual(scores.get(JOBS[0].id), {
      fit_score: 89,
      matched_skills: ["React"],
      missing_skills: [],
      red_flags: [],
      reasoning: "Strong React fit.",
    });
    assert.ok(!sent.includes("Juan"), "name leaked to the LLM");
  });
});
