import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { callLLM, LLMValidationError } from "./llm-router.ts";

// Both SDKs go through global fetch, so stubbing it exercises the real router
// code and lets the tests inspect exactly what would leave the server.

type Reply = { status: number; body: unknown };

let geminiReplies: Reply[] = [];
let groqReplies: Reply[] = [];
let sentBodies: { provider: "gemini" | "groq"; body: string }[] = [];
const realFetch = globalThis.fetch;

function geminiOk(text: string): Reply {
  return { status: 200, body: { candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP", index: 0 }] } };
}
function geminiError(status: number): Reply {
  return { status, body: { error: { code: status, message: "upstream error", status: "ERROR" } } };
}
function groqOk(content: string): Reply {
  return {
    status: 200,
    body: {
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 0,
      model: "openai/gpt-oss-120b",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    },
  };
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-gemini";
  process.env.GROQ_API_KEY = "test-groq";
  geminiReplies = [];
  groqReplies = [];
  sentBodies = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const provider = url.includes("generativelanguage.googleapis.com") ? "gemini" : url.includes("groq.com") ? "groq" : null;
    if (!provider) throw new Error(`unexpected fetch to ${url}`);
    sentBodies.push({ provider, body: String(init?.body ?? "") });
    const reply = (provider === "gemini" ? geminiReplies : groqReplies).shift();
    if (!reply) throw new Error(`no ${provider} reply queued`);
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  console.info = () => {};
  console.warn = () => {};
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const Score = z.object({
  fit_score: z.number().int().min(0).max(100),
  reasoning: z.string(),
});

const PROMPT =
  "Candidate Juan Dela Cruz (juan.delacruz@gmail.com, 0917-123-4567) knows React and Postgres. Score the fit for a React developer role.";

const calls = (provider: "gemini" | "groq") => sentBodies.filter((b) => b.provider === provider).length;

describe("callLLM", () => {
  it("sends only scrubbed text to the provider", async () => {
    geminiReplies.push(geminiOk(JSON.stringify({ fit_score: 80, reasoning: "Good fit." })));
    await callLLM(PROMPT, Score, { knownNames: ["Juan Dela Cruz"] });

    const sent = sentBodies[0].body;
    for (const secret of ["Juan", "Dela Cruz", "juan.delacruz@gmail.com", "0917-123-4567"]) {
      assert.ok(!sent.includes(secret), `leaked "${secret}" to the LLM`);
    }
    assert.ok(sent.includes("[NAME_1]") && sent.includes("[EMAIL_1]") && sent.includes("[PHONE_1]"));
    assert.ok(sent.includes("JSON Schema"), "schema instructions are in the prompt");
  });

  it("uses Gemini and never calls Groq when Gemini succeeds", async () => {
    geminiReplies.push(geminiOk(JSON.stringify({ fit_score: 80, reasoning: "[NAME_1] knows React." })));
    const { result, provider } = await callLLM(PROMPT, Score, { knownNames: ["Juan Dela Cruz"] });

    assert.equal(provider, "gemini");
    assert.equal(calls("groq"), 0);
    assert.deepEqual(result, { fit_score: 80, reasoning: "Juan Dela Cruz knows React." });
  });

  for (const status of [429, 500, 503, 404, 403, 400]) {
    it(`falls back to Groq on Gemini HTTP ${status}`, async () => {
      geminiReplies.push(geminiError(status));
      groqReplies.push(groqOk(JSON.stringify({ fit_score: 60, reasoning: "Okay fit for [NAME_1]." })));
      const { result, provider } = await callLLM(PROMPT, Score, { knownNames: ["Juan Dela Cruz"] });

      assert.equal(provider, "groq");
      assert.equal(result.reasoning, "Okay fit for Juan Dela Cruz.");
      assert.ok(!sentBodies.find((b) => b.provider === "groq")!.body.includes("juan.delacruz@gmail.com"));
    });
  }

  it("falls back on a network error and logs the Gemini model", async () => {
    // No Gemini reply queued: the stub throws, as fetch does on a dead connection.
    groqReplies.push(groqOk(JSON.stringify({ fit_score: 55, reasoning: "Fine." })));
    const warnings: string[] = [];
    console.warn = (line: string) => warnings.push(line);

    const { provider } = await callLLM(PROMPT, Score);
    assert.equal(provider, "groq");
    assert.match(warnings.join("\n"), /gemini model=gemini-3\.8-flash failed .* falling back to groq/);
  });

  it("does not fall back when GEMINI_API_KEY is missing", async () => {
    const key = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      await assert.rejects(callLLM(PROMPT, Score), /Missing GEMINI_API_KEY/);
      assert.equal(calls("groq"), 0);
    } finally {
      process.env.GEMINI_API_KEY = key;
    }
  });

  it("retries once on invalid output, then succeeds", async () => {
    geminiReplies.push(geminiOk("not json at all"));
    geminiReplies.push(geminiOk(JSON.stringify({ fit_score: 70, reasoning: "Fine." })));
    const { result, provider } = await callLLM(PROMPT, Score);

    assert.equal(provider, "gemini");
    assert.equal(result.fit_score, 70);
    assert.equal(calls("gemini"), 2);
    assert.ok(sentBodies[1].body.includes("Return ONLY valid JSON"));
  });

  it("throws LLMValidationError after a failed retry, without calling Groq", async () => {
    geminiReplies.push(geminiOk(JSON.stringify({ fit_score: 999, reasoning: "x" })));
    geminiReplies.push(geminiOk(JSON.stringify({ fit_score: "high" })));
    await assert.rejects(callLLM(PROMPT, Score), LLMValidationError);
    assert.equal(calls("gemini"), 2);
    assert.equal(calls("groq"), 0);
  });

  it("accepts JSON wrapped in a markdown fence", async () => {
    geminiReplies.push(geminiOk('```json\n{"fit_score": 55, "reasoning": "Meh."}\n```'));
    const { result } = await callLLM(PROMPT, Score);
    assert.equal(result.fit_score, 55);
  });

  it("restores PII containing quotes without breaking JSON", async () => {
    geminiReplies.push(geminiOk(JSON.stringify({ fit_score: 50, reasoning: "Ask [NAME_1]." })));
    const { result } = await callLLM('Contact: Jose "Pepe" Rizal knows Go.', Score, { knownNames: ['Jose "Pepe" Rizal'] });
    assert.equal(result.reasoning, 'Ask Jose "Pepe" Rizal.');
  });
});
