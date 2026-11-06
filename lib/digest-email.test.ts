import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDigestEmail, type DigestItem } from "./digest-email.ts";

const ITEM: DigestItem = {
  title: "Frontend Developer",
  company: "Acme",
  location: "Makati",
  fitScore: 87,
  reasoning: "Strong React match. Missing GraphQL.",
  url: "https://jobs.lever.co/acme/1",
};

describe("buildDigestEmail", () => {
  it("lists every match with its score and link", () => {
    const { subject, html, text } = buildDigestEmail([ITEM, { ...ITEM, title: "Backend Developer", fitScore: 72 }], "https://matchie.example.com/");
    assert.match(subject, /^Matchie: 2 new job matches for /);
    assert.ok(html.includes('href="https://jobs.lever.co/acme/1"'));
    assert.ok(html.includes(">87<") && html.includes(">72<"));
    assert.ok(html.includes('href="https://matchie.example.com/tracker"'));
    assert.ok(text.includes("[87] Frontend Developer"));
  });

  it("escapes board-supplied text", () => {
    const { html } = buildDigestEmail([{ ...ITEM, title: '<img src=x onerror="alert(1)">', company: "A&B" }], "https://m.example.com");
    assert.ok(!html.includes("<img"));
    assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
    assert.ok(html.includes("A&amp;B"));
  });

  it("does not link non-http URLs", () => {
    const { html } = buildDigestEmail([{ ...ITEM, url: "javascript:alert(1)" }], "https://m.example.com");
    assert.ok(!html.includes("javascript:"));
  });

  it("uses the singular for one match", () => {
    assert.match(buildDigestEmail([ITEM], "https://m.example.com").subject, /1 new job match for/);
  });
});
