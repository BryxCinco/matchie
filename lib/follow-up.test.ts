import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFollowUpPrompt, draftFollowUp } from "./follow-up.ts";
import { SIGNATURE_PLACEHOLDER, followUpTemplate } from "./follow-up-template.ts";

const CONTEXT = { title: "Frontend Developer", company: "Acme", lastStage: "interview", appliedAt: "2026-10-01T02:00:00Z" };

describe("followUpTemplate", () => {
  it("names the role and company and leaves the signature for the user", () => {
    const { subject, body } = followUpTemplate(CONTEXT);
    assert.equal(subject, "Following up: Frontend Developer");
    assert.ok(body.includes("Frontend Developer role at Acme"));
    assert.ok(body.includes("our recent conversation"));
    assert.ok(body.trimEnd().endsWith(SIGNATURE_PLACEHOLDER));
  });

  it("mentions the application date when the last stage was applying", () => {
    const { body } = followUpTemplate({ ...CONTEXT, lastStage: "applied" });
    assert.ok(body.includes("my application for the Frontend Developer role at Acme on October 1"));
  });

  it("copes with an unknown company", () => {
    assert.ok(followUpTemplate({ ...CONTEXT, company: null }).body.includes("at your team"));
  });
});

describe("buildFollowUpPrompt", () => {
  it("states only the facts and the day count", () => {
    const prompt = buildFollowUpPrompt(CONTEXT, new Date("2026-10-21T02:00:00Z"));
    assert.ok(prompt.includes("Role: Frontend Developer"));
    assert.ok(prompt.includes("Days since applying: 20"));
    assert.ok(prompt.includes(SIGNATURE_PLACEHOLDER));
  });
});

// Through the real router with fetch stubbed, as in llm-router.test.ts.
describe("draftFollowUp", () => {
  const realFetch = globalThis.fetch;
  let sent = "";

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test";
    process.env.GROQ_API_KEY = "test";
    console.info = () => {};
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      sent = String(init?.body ?? "");
      const draft = { subject: " Following up on Frontend Developer ", body: "Hello,\n\nJust checking in.\n\nBest regards,\n[Your name]" };
      const body = { candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(draft) }] }, finishReason: "STOP", index: 0 }] };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("returns a trimmed draft and scrubs a known name that slipped into the title", async () => {
    const draft = await draftFollowUp({ ...CONTEXT, title: "Developer (referral: Juan Dela Cruz)" }, { knownNames: ["Juan Dela Cruz"] });
    assert.equal(draft.subject, "Following up on Frontend Developer");
    assert.ok(draft.body.endsWith("[Your name]"));
    assert.ok(!sent.includes("Juan"), "name leaked to the LLM");
  });
});
