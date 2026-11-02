import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scrubPII, unscrubPII } from "./pii-scrubber.ts";

describe("scrubPII: emails", () => {
  it("replaces emails with numbered placeholders", () => {
    const { scrubbed, map } = scrubPII("Email juan.cruz+jobs@gmail.com or hr@acme.com.ph.");
    assert.equal(scrubbed, "Email [EMAIL_1] or [EMAIL_2].");
    assert.deepEqual(map, { "[EMAIL_1]": "juan.cruz+jobs@gmail.com", "[EMAIL_2]": "hr@acme.com.ph" });
  });

  it("reuses the placeholder for a repeated value", () => {
    const { scrubbed } = scrubPII("a@b.com, again A@B.com");
    assert.equal(scrubbed, "[EMAIL_1], again [EMAIL_1]");
  });
});

describe("scrubPII: phones", () => {
  const phones = [
    "+639171234567",
    "+63 917 123 4567",
    "+63-917-123-4567",
    "09171234567",
    "0917-123-4567",
    "0917 123 4567",
    "(02) 8123-4567",
    "(02)81234567",
    "(032) 234 5678",
    "02-8123-4567",
    "+63 2 8123 4567",
  ];

  for (const phone of phones) {
    it(`scrubs ${phone}`, () => {
      const { scrubbed, map } = scrubPII(`Call me at ${phone} today.`);
      assert.equal(scrubbed, "Call me at [PHONE_1] today.");
      assert.equal(map["[PHONE_1]"], phone);
    });
  }

  it("leaves salaries, years and counts alone", () => {
    const text = "PHP 50,000 - 70,000 monthly. 2019-2023. 3-5 years. Ref no. 2024001234.";
    assert.equal(scrubPII(text).scrubbed, text);
  });
});

describe("scrubPII: addresses", () => {
  it("scrubs a street address with its barangay and city", () => {
    const { scrubbed, map } = scrubPII("Lives at 123 Rizal Street, Brgy. San Antonio, Makati City. Open to hybrid.");
    assert.equal(scrubbed, "Lives at [ADDRESS_1]. Open to hybrid.");
    assert.equal(map["[ADDRESS_1]"], "123 Rizal Street, Brgy. San Antonio, Makati City");
  });

  it("scrubs a unit plus an abbreviated street as one address", () => {
    const address = "Unit 4B, 88 J.P. Rizal Ave., Brgy. Poblacion, Makati City";
    const { scrubbed, map } = scrubPII(address);
    assert.equal(scrubbed, "[ADDRESS_1]");
    assert.equal(map["[ADDRESS_1]"], address);
  });

  it("scrubs block and lot addresses", () => {
    const { scrubbed, map } = scrubPII("Blk 5 Lot 12, Brgy. Molino, Bacoor City, Cavite");
    assert.match(scrubbed, /^\[ADDRESS_1\]/);
    assert.ok(map["[ADDRESS_1]"].includes("Bacoor City"));
  });

  it("scrubs numbered barangays", () => {
    assert.equal(scrubPII("Brgy. 176, Caloocan City").scrubbed, "[ADDRESS_1]");
  });

  it("keeps bare cities, which the matcher needs as job locations", () => {
    const text = "Hybrid role in BGC, Taguig City. Some onsite days in Makati City or Cebu City.";
    assert.equal(scrubPII(text).scrubbed, text);
  });
});

describe("scrubPII: names", () => {
  it("scrubs known names, the full name and each part", () => {
    const { scrubbed, map } = scrubPII("Juan Dela Cruz. Juan led the team. Cruz shipped it.", {
      knownNames: ["Juan Dela Cruz"],
    });
    assert.equal(scrubbed, "[NAME_1]. [NAME_2] led the team. [NAME_3] shipped it.");
    assert.equal(map["[NAME_1]"], "Juan Dela Cruz");
  });

  it("does not scrub a known name inside another word", () => {
    const { scrubbed } = scrubPII("Ana uses Kanban.", { knownNames: ["Ana Reyes"] });
    assert.equal(scrubbed, "[NAME_1] uses Kanban.");
  });

  it("scrubs names after honorifics and keeps the honorific", () => {
    const { scrubbed, map } = scrubPII("Please contact Ms. Maria Santos-Reyes or Engr. Jose dela Paz.");
    assert.equal(scrubbed, "Please contact Ms. [NAME_1] or Engr. [NAME_2].");
    assert.equal(map["[NAME_1]"], "Maria Santos-Reyes");
    assert.equal(map["[NAME_2]"], "Jose dela Paz");
  });

  it("scrubs names after labels, any label case, without eating the next words", () => {
    const { scrubbed, map } = scrubPII("RECRUITER: Ana Lim will call you.\nContact person: Paolo Garcia\nRole: Developer");
    assert.equal(scrubbed, "RECRUITER: [NAME_1] will call you.\nContact person: [NAME_2]\nRole: Developer");
    assert.equal(map["[NAME_1]"], "Ana Lim");
  });

  it("leaves capitalized tech words, companies, titles and places alone", () => {
    const text =
      "Senior Software Engineer at Accenture Philippines. Must know React, TypeScript, Node.js, PostgreSQL and Google Cloud. Based in Quezon City.";
    assert.equal(scrubPII(text).scrubbed, text);
  });
});

describe("scrubPII: whole document", () => {
  const resume = `Name: Juan Dela Cruz
Email: juan.delacruz@gmail.com | Mobile: 0917-123-4567 | Landline: (02) 8123-4567
Address: 123 Rizal Street, Brgy. San Antonio, Makati City

Juan Dela Cruz is a full-stack developer with 4 years of React and Postgres.
References available from Mr. Pedro Penduko.`;

  const secrets = [
    "Juan",
    "Dela Cruz",
    "juan.delacruz@gmail.com",
    "0917-123-4567",
    "8123-4567",
    "Rizal Street",
    "San Antonio",
    "Pedro",
    "Penduko",
  ];

  it("leaves no PII in the output", () => {
    const { scrubbed } = scrubPII(resume, { knownNames: ["Juan Dela Cruz"] });
    for (const secret of secrets) {
      assert.ok(!scrubbed.includes(secret), `leaked "${secret}" in:\n${scrubbed}`);
    }
    assert.ok(scrubbed.includes("4 years of React and Postgres"));
  });

  it("round-trips through unscrubPII", () => {
    const { scrubbed, map } = scrubPII(resume, { knownNames: ["Juan Dela Cruz"] });
    assert.equal(unscrubPII(scrubbed, map), resume);
  });

  it("is idempotent: scrubbing scrubbed text changes nothing", () => {
    const once = scrubPII(resume, { knownNames: ["Juan Dela Cruz"] }).scrubbed;
    const twice = scrubPII(once, { knownNames: ["Juan Dela Cruz"] });
    assert.equal(twice.scrubbed, once);
    assert.deepEqual(twice.map, {});
  });
});

describe("unscrubPII", () => {
  it("restores placeholders in LLM output", () => {
    const map = { "[NAME_1]": "Juan", "[EMAIL_1]": "juan@gmail.com" };
    assert.equal(unscrubPII("Dear [NAME_1], we will reach [EMAIL_1].", map), "Dear Juan, we will reach juan@gmail.com.");
  });

  it("does not confuse [NAME_1] with [NAME_10]", () => {
    const map = { "[NAME_1]": "Ana", "[NAME_10]": "Ben" };
    assert.equal(unscrubPII("[NAME_10] and [NAME_1]", map), "Ben and Ana");
  });

  it("leaves placeholders the model invented untouched", () => {
    assert.equal(unscrubPII("Hi [NAME_7]", { "[NAME_1]": "Ana" }), "Hi [NAME_7]");
  });
});

describe("scrubPII: edge cases", () => {
  it("handles empty input", () => {
    assert.deepEqual(scrubPII(""), { scrubbed: "", map: {} });
  });

  it("ignores blank known names", () => {
    assert.equal(scrubPII("Hello there", { knownNames: ["", "   "] }).scrubbed, "Hello there");
  });

  it("escapes regex characters in known names", () => {
    assert.equal(scrubPII("Hi J.R. (Jun)", { knownNames: ["J.R. (Jun)"] }).scrubbed, "Hi [NAME_1]");
  });
});
