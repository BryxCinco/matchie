import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseResumeText } from "./resume-parser.ts";
import { toCandidateSummary } from "./resume.ts";

const RESUME = `Juan Dela Cruz
juan.delacruz@gmail.com | 0917-123-4567 | Makati City

SUMMARY
Full-stack developer with 4 years of experience
building React and Node.js apps.

TECHNICAL SKILLS
Languages: TypeScript, JavaScript, Python
Frameworks: React, Next.js, Node.js
• PostgreSQL • Docker • CI/CD

WORK EXPERIENCE
Software Engineer — Acme Corp
Jan 2022 – Present
• Built a React dashboard used by 2,000 agents
• Cut API latency by 40% by adding Redis caching
  across three services
Beta Inc | Junior Developer | 06/2020 - Dec 2021
- Maintained a Laravel billing system

EDUCATION
BS Computer Science, University of the Philippines, 2016 - 2020
`;

describe("parseResumeText", () => {
  const parsed = parseResumeText(RESUME);

  it("extracts contact details", () => {
    assert.equal(parsed.contact.name, "Juan Dela Cruz");
    assert.equal(parsed.contact.email, "juan.delacruz@gmail.com");
    assert.equal(parsed.contact.phone, "0917-123-4567");
  });

  it("joins the summary into one paragraph", () => {
    assert.equal(parsed.summary, "Full-stack developer with 4 years of experience building React and Node.js apps.");
  });

  it("splits skills across commas, bullets and sub-labels", () => {
    assert.deepEqual(parsed.skills, [
      "TypeScript", "JavaScript", "Python", "React", "Next.js", "Node.js", "PostgreSQL", "Docker", "CI/CD",
    ]);
  });

  it("parses roles with title, company, dates and highlights", () => {
    assert.equal(parsed.experience.length, 2);
    assert.deepEqual(parsed.experience[0], {
      title: "Software Engineer",
      company: "Acme Corp",
      start: "2022-01",
      end: null,
      highlights: [
        "Built a React dashboard used by 2,000 agents",
        "Cut API latency by 40% by adding Redis caching across three services",
      ],
    });
  });

  it("finds the title even when the company comes first", () => {
    const role = parsed.experience[1];
    assert.equal(role.title, "Junior Developer");
    assert.equal(role.company, "Beta Inc");
    assert.equal(role.start, "2020-06");
    assert.equal(role.end, "2021-12");
  });

  it("does not treat education as experience", () => {
    assert.ok(!parsed.experience.some((r) => r.title.includes("Computer Science")));
  });

  it("handles inline headings and roles without bullets", () => {
    const result = parseResumeText(`Skills: React, Go
Experience
Backend Developer, Gamma, 2021 - 2023
Data Analyst, Delta, 2019 - 2021`);
    assert.deepEqual(result.skills, ["React", "Go"]);
    assert.deepEqual(
      result.experience.map((r) => [r.title, r.company, r.start, r.end]),
      [
        ["Backend Developer", "Gamma", "2021-01", "2023-01"],
        ["Data Analyst", "Delta", "2019-01", "2021-01"],
      ],
    );
  });

  it("returns empty fields for text with no recognizable structure", () => {
    const result = parseResumeText("just some words without any headings");
    assert.equal(result.contact.name, null);
    assert.deepEqual(result.skills, []);
    assert.deepEqual(result.experience, []);
  });
});

describe("toCandidateSummary on parsed output", () => {
  it("keeps skills and roles, drops contact details and companies", () => {
    const summary = toCandidateSummary(parseResumeText(RESUME), { skills: ["GraphQL"], years_experience: null }, new Date("2024-01-01"));
    assert.deepEqual(summary.skills.slice(0, 3), ["GraphQL", "TypeScript", "JavaScript"]);
    assert.equal(summary.experience[0].title, "Software Engineer");
    assert.equal(summary.experience[0].years, 2);
    assert.equal(summary.yearsExperience, 4);
    const serialized = JSON.stringify({ ...summary, fullName: undefined });
    for (const secret of ["juan.delacruz@gmail.com", "0917-123-4567", "Acme", "Beta Inc"]) {
      assert.ok(!serialized.includes(secret), `leaked "${secret}"`);
    }
  });
});
