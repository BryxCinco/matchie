import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, scoreJob, type CandidateSummary, type SeekerPreferences } from "./match-scoring.ts";

// Stub fetch so callLLM runs for real and the outgoing body can be inspected.
let geminiReplies: { status: number; body: unknown }[] = [];
let sentBodies: string[] = [];
const realFetch = globalThis.fetch;
const realError = console.error;

function geminiOk(json: unknown) {
  return {
    status: 200,
    body: { candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(json) }] }, finishReason: "STOP", index: 0 }] },
  };
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-gemini";
  process.env.GROQ_API_KEY = "test-groq";
  geminiReplies = [];
  sentBodies = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    sentBodies.push(String(init?.body ?? ""));
    const reply = geminiReplies.shift();
    if (!reply) throw new Error("no reply queued");
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  console.info = () => {};
  console.warn = () => {};
  console.error = () => {};
});

afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realError;
});

const candidate: CandidateSummary = {
  fullName: "Juan Dela Cruz",
  skills: ["React", "TypeScript", "PostgreSQL", "Node.js"],
  yearsExperience: 4,
  experience: [
    {
      title: "Full-stack Developer",
      years: 3,
      highlights: ["Built a React dashboard used by 2,000 agents", "Mentored by Juan Dela Cruz's lead"],
    },
  ],
};

const preferences: SeekerPreferences = {
  target_roles: ["Frontend Developer", "Full-stack Developer"],
  min_salary: 80000,
  work_setup: ["remote", "hybrid"],
  avoid_industries: ["gambling"],
  home_city: "Quezon City",
  preferred_locations: ["Makati", "Singapore"],
};

const JD = "Senior React Developer. Must have React, TypeScript, GraphQL. Hybrid in BGC, Taguig. PHP 90,000-120,000/month.";

describe("buildPrompt", () => {
  it("includes the JD, skills and every preference", () => {
    const prompt = buildPrompt(JD, candidate, preferences);
    for (const part of ["Senior React Developer", "React, TypeScript, PostgreSQL", "4 years", "Full-stack Developer (3 yrs)", "PHP 80,000/month", "remote, hybrid", "gambling", "Based in: Quezon City", "Makati, Singapore"]) {
      assert.ok(prompt.includes(part), `missing "${part}"`);
    }
  });

  it("never includes the candidate's name field", () => {
    const prompt = buildPrompt(JD, { ...candidate, experience: [] }, preferences);
    assert.ok(!prompt.includes("Juan"));
  });

  it("truncates very long job descriptions", () => {
    const prompt = buildPrompt("x".repeat(20_000), candidate, preferences);
    assert.ok(prompt.length < 10_000);
    assert.ok(prompt.includes("[truncated]"));
  });

  it("states missing preferences instead of leaving blanks", () => {
    const prompt = buildPrompt(JD, { skills: [], yearsExperience: null, experience: [] }, {
      target_roles: [],
      min_salary: null,
      work_setup: [],
      avoid_industries: [],
    });
    assert.ok(prompt.includes("Salary floor: not stated"));
    assert.ok(prompt.includes("Accepted work setups: any"));
    assert.ok(prompt.includes("Experience:\nnone listed"));
  });
});

describe("scoreJob", () => {
  it("returns a normalized result and scrubs the name from highlights", async () => {
    geminiReplies.push(
      geminiOk({
        fit_score: 77.6,
        matched_skills: ["React", "TypeScript", "react"],
        missing_skills: ["GraphQL"],
        red_flags: [],
        reasoning: " Strong React and TypeScript match. GraphQL is the main gap. ",
      }),
    );
    const result = await scoreJob(JD, candidate, preferences);

    assert.equal(result.failed, false);
    assert.equal(result.provider, "gemini");
    assert.equal(result.fit_score, 78);
    assert.deepEqual(result.matched_skills, ["React", "TypeScript"]);
    assert.equal(result.reasoning, "Strong React and TypeScript match. GraphQL is the main gap.");
    assert.ok(!sentBodies[0].includes("Juan"), "name leaked to the LLM");
  });

  it("returns the placeholder when the LLM fails, marked as failed", async () => {
    geminiReplies.push({ status: 400, body: { error: { code: 400, message: "bad request", status: "INVALID_ARGUMENT" } } });
    const result = await scoreJob(JD, candidate, preferences);

    assert.equal(result.failed, true);
    assert.equal(result.provider, null);
    assert.equal(result.fit_score, 0);
    assert.equal(result.reasoning, "Failed to analyze");
  });
});
