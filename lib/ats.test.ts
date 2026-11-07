import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalHash,
  fetchBoard,
  htmlToText,
  isRelevantLocation,
  normalizeCompanyName,
  parseGreenhouse,
  parseLever,
  parseMinYears,
} from "./ats.ts";

// Shapes copied from live responses (Nov 2026), trimmed.
const GREENHOUSE = {
  jobs: [
    {
      id: 8638232002,
      title: "Sr. Frontend Engineer",
      absolute_url: "https://job-boards.greenhouse.io/acme/jobs/8638232002",
      location: { name: "Makati, Philippines" },
      updated_at: "2026-11-05T12:24:35-05:00",
      first_published: "2026-10-22T13:38:40-04:00",
      company_name: "Acme Corp",
      metadata: [],
      content:
        "&lt;p&gt;We build things &amp;amp; ship.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;3+ years of React experience&lt;/li&gt;&lt;li&gt;TypeScript&lt;/li&gt;&lt;/ul&gt;",
    },
  ],
  meta: { total: 1 },
};

const LEVER = [
  {
    id: "5f1c-abc",
    text: "Backend Developer",
    hostedUrl: "https://jobs.lever.co/acme/5f1c-abc",
    createdAt: 1788199939703,
    categories: { location: "Remote", commitment: "Full-time" },
    workplaceType: "remote",
    descriptionPlain: "Join our platform team.",
    description: "<div>Join our platform team.</div>",
    lists: [{ text: "Requirements", content: "<li>2-4 years of professional experience</li><li>Node.js</li>" }],
    additionalPlain: "We offer HMO.",
    salaryRange: { currency: "PHP", interval: "per-year-salary", min: 1_200_000, max: 1_800_000 },
  },
];

describe("parseGreenhouse", () => {
  const [job] = parseGreenhouse(GREENHOUSE);

  it("decodes the double-encoded HTML into text", () => {
    assert.equal(job.description, "We build things & ship.\n\n- 3+ years of React experience\n- TypeScript");
  });

  it("maps fields", () => {
    assert.equal(job.externalId, "8638232002");
    assert.equal(job.location, "Makati, Philippines");
    assert.equal(job.companyName, "Acme Corp");
    assert.equal(job.experienceMinYears, 3);
    assert.equal(job.url, GREENHOUSE.jobs[0].absolute_url);
  });

  it("keeps the raw payload without the description", () => {
    assert.equal("content" in job.raw, false);
    assert.equal(job.raw.id, 8638232002);
  });
});

describe("parseLever", () => {
  const [job] = parseLever(LEVER);

  it("joins intro, lists and closing", () => {
    assert.equal(job.description, "Join our platform team.\n\nRequirements\n- 2-4 years of professional experience\n- Node.js\n\nWe offer HMO.");
  });

  it("maps workplace type, PHP salary to monthly, and years", () => {
    assert.equal(job.workSetup, "remote");
    assert.equal(job.salaryMin, 100_000);
    assert.equal(job.salaryMax, 150_000);
    assert.equal(job.experienceMinYears, 2);
    assert.equal(job.postedAt, new Date(1788199939703).toISOString());
  });

  it("ignores salaries in other currencies", () => {
    const [usd] = parseLever([{ ...LEVER[0], salaryRange: { currency: "USD", interval: "per-year-salary", min: 90_000, max: 120_000 } }]);
    assert.equal(usd.salaryMin, null);
  });

  it("drops description fields from the raw payload", () => {
    assert.equal("lists" in job.raw, false);
    assert.equal("descriptionPlain" in job.raw, false);
    assert.equal(job.raw.workplaceType, "remote");
  });
});

describe("canonicalHash", () => {
  it("collapses formatting differences across boards", () => {
    const a = canonicalHash("Acme Corp.", "Sr. Frontend Engineer", "Makati, Philippines");
    const b = canonicalHash("ACME Corporation", "Senior Frontend Engineer", "makati  philippines");
    assert.equal(a, b);
  });

  it("separates different roles and locations", () => {
    const base = canonicalHash("Acme", "Frontend Engineer", "Makati");
    assert.notEqual(base, canonicalHash("Acme", "Backend Engineer", "Makati"));
    assert.notEqual(base, canonicalHash("Acme", "Frontend Engineer", "Cebu"));
  });

  it("normalizes company names like companies.name_normalized", () => {
    assert.equal(normalizeCompanyName("Globe Telecom, Inc."), "globe telecom");
    assert.equal(normalizeCompanyName("Ayala Land & Co"), "ayala land and");
  });
});

describe("isRelevantLocation", () => {
  it("keeps Philippine locations", () => {
    for (const loc of ["Makati, Philippines", "BGC, Taguig", "Cebu City", "Manila, PH", "Parañaque"]) {
      assert.ok(isRelevantLocation(loc, null), loc);
    }
  });

  it("keeps open remote roles", () => {
    for (const loc of ["Remote", "Remote - APAC", "Anywhere", "Remote (Southeast Asia)"]) {
      assert.ok(isRelevantLocation(loc, null), loc);
    }
    assert.ok(isRelevantLocation(null, "remote"));
  });

  it("drops onsite and country-restricted remote roles elsewhere", () => {
    for (const loc of ["Remote, United States", "London, UK", "Remote - Germany", "Singapore"]) {
      assert.ok(!isRelevantLocation(loc, null), loc);
    }
  });

  it("keeps postings in the user's preferred locations", () => {
    assert.ok(isRelevantLocation("Singapore", null, ["singapore"]));
    assert.ok(isRelevantLocation("Tokyo, Japan", "onsite", ["Japan"]));
    assert.ok(!isRelevantLocation("London, UK", null, ["Singapore"]));
  });
});

describe("parseMinYears", () => {
  it("reads common phrasings", () => {
    assert.equal(parseMinYears("At least 5 years of experience in Java"), 5);
    assert.equal(parseMinYears("3+ years of professional software engineering experience"), 3);
    assert.equal(parseMinYears("1-2 years experience"), 1);
    assert.equal(parseMinYears("Founded 25 years ago"), null);
  });
});

describe("htmlToText", () => {
  it("drops scripts and keeps structure", () => {
    assert.equal(htmlToText("<p>Hi</p><script>alert(1)</script><p>there&nbsp;you</p>"), "Hi\nthere you");
  });
});

describe("fetchBoard", () => {
  it("throws a BoardFetchError with the status for a missing board", async () => {
    const fake = (async () => new Response("{}", { status: 404 })) as typeof fetch;
    await assert.rejects(fetchBoard("lever", "no-such-company", fake), { name: "BoardFetchError", status: 404 });
  });

  it("URL-encodes the token", async () => {
    let url = "";
    const fake = (async (input: RequestInfo | URL) => {
      url = String(input);
      return Response.json(GREENHOUSE);
    }) as typeof fetch;
    await fetchBoard("greenhouse", "a/b", fake);
    assert.equal(url, "https://boards-api.greenhouse.io/v1/boards/a%2Fb/jobs?content=true");
  });
});
