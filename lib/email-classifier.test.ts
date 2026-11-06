import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPrompt,
  classifyEmail,
  cleanBody,
  looksJobRelated,
  statusFromClassification,
  type ApplicationRef,
} from "./email-classifier.ts";

const APPS: ApplicationRef[] = [
  { id: "11111111-1111-4111-8111-111111111111", title: "Frontend Developer", company: "Acme Corp", status: "applied" },
  { id: "22222222-2222-4222-8222-222222222222", title: "Backend Engineer", company: "Globex", status: "interview" },
];

describe("looksJobRelated", () => {
  it("passes mail from ATS domains", () => {
    assert.ok(looksJobRelated({ from: "Acme <no-reply@hire.lever.co>", subject: "Update", text: "" }, []));
    assert.ok(looksJobRelated({ from: "jobs@us.greenhouse-mail.io", subject: "Hi", text: "" }, []));
  });

  it("passes mail with job keywords", () => {
    assert.ok(looksJobRelated({ from: "hr@random.ph", subject: "Your application for Developer", text: "" }, []));
    assert.ok(looksJobRelated({ from: "a@b.com", subject: "Hello", text: "We'd like to schedule an interview." }, []));
  });

  it("passes mail naming a company the user applied to", () => {
    assert.ok(looksJobRelated({ from: "people@globex.com", subject: "Quick note from Globex", text: "" }, APPS));
  });

  it("blocks personal mail", () => {
    assert.ok(!looksJobRelated({ from: "mom@gmail.com", subject: "Dinner on Sunday?", text: "Bring rice." }, APPS));
    assert.ok(!looksJobRelated({ from: "receipts@grab.com", subject: "Your GrabFood receipt", text: "Total 350" }, APPS));
  });
});

describe("buildPrompt", () => {
  const prompt = buildPrompt(
    { from: "Maria Santos <maria.santos@acme.com>", subject: "Your application", text: "Hi Juan,\nWe'd like to invite you." },
    APPS,
  );

  it("sends only the sender's domain", () => {
    assert.ok(prompt.includes("From domain: acme.com"));
    assert.ok(!prompt.includes("maria.santos"));
    assert.ok(!prompt.includes("Maria Santos"));
  });

  it("lists applications by number, without their ids", () => {
    assert.ok(prompt.includes("1. Frontend Developer at Acme Corp (status: applied)"));
    assert.ok(!prompt.includes("11111111"));
  });
});

describe("cleanBody", () => {
  it("drops quoted replies and truncates", () => {
    const body = cleanBody("Thanks for applying.\n\nOn Mon, 3 Nov 2026, Juan wrote:\n> my old message");
    assert.equal(body, "Thanks for applying.");
    assert.ok(cleanBody("x".repeat(10_000)).endsWith("[truncated]"));
  });

  it("replaces links and collapses runs of them", () => {
    const body = cleanBody(
      `Schedule your interview: https://cal.example.com/book?id=${"a".repeat(300)}\n` +
        "<https://t.example.com/1>\nhttps://t.example.com/2\n\nThanks",
    );
    assert.equal(body, "Schedule your interview: [link]\nThanks");
  });
});

describe("statusFromClassification", () => {
  it("moves forward on confident verdicts", () => {
    assert.equal(statusFromClassification("applied", "interview_invite", 90), "interview");
    assert.equal(statusFromClassification("screening", "assessment", 85), "assessment");
    assert.equal(statusFromClassification("final", "offer", 95), "offer");
  });

  it("rejects from any open stage", () => {
    assert.equal(statusFromClassification("interview", "rejection", 90), "rejected");
    assert.equal(statusFromClassification("saved", "rejection", 90), "rejected");
  });

  it("never moves backwards", () => {
    assert.equal(statusFromClassification("final", "interview_invite", 95), null);
    assert.equal(statusFromClassification("interview", "assessment", 95), null);
  });

  it("revives ghosted applications", () => {
    assert.equal(statusFromClassification("ghosted", "interview_invite", 90), "interview");
  });

  it("leaves final states alone", () => {
    assert.equal(statusFromClassification("accepted", "rejection", 99), null);
    assert.equal(statusFromClassification("withdrawn", "offer", 99), null);
    assert.equal(statusFromClassification("rejected", "interview_invite", 99), null);
  });

  it("ignores low confidence and noise", () => {
    assert.equal(statusFromClassification("applied", "rejection", 79), null);
    assert.equal(statusFromClassification("applied", "noise", 100), null);
  });
});

// classifyEmail through the real router with fetch stubbed.
describe("classifyEmail", () => {
  let reply: unknown;
  let sent = "";
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test";
    process.env.GROQ_API_KEY = "test";
    sent = "";
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      sent = String(init?.body ?? "");
      const body = { candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(reply) }] }, finishReason: "STOP", index: 0 }] };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    console.info = () => {};
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const email = { from: "talent@globex.com", subject: "Update on your application", text: "Hi Juan Dela Cruz, unfortunately we will not move forward." };

  it("maps the application number back to its id", async () => {
    reply = { classification: "rejection", application_ref: 2, confidence: 93.4, reasoning: "Clear rejection from Globex." };
    const result = await classifyEmail(email, APPS, { knownNames: ["Juan Dela Cruz"] });
    assert.deepEqual(result, {
      classification: "rejection",
      linked_application_id: APPS[1].id,
      confidence: 93,
      reasoning: "Clear rejection from Globex.",
    });
    assert.ok(!sent.includes("Juan"), "user's name leaked to the LLM");
  });

  it("drops an application number that is not in the list", async () => {
    reply = { classification: "offer", application_ref: 7, confidence: 90, reasoning: "Offer." };
    const result = await classifyEmail(email, APPS);
    assert.equal(result.linked_application_id, null);
  });
});
