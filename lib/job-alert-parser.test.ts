import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { alertPlatformOf, htmlToText, parseJobAlert } from "./job-alert-parser.ts";

// Fake alerts in the shapes these platforms send. Every name is invented.

const LINKEDIN_TEXT = `Your job alert for frontend developer in Philippines
3 new jobs match your preferences.

Frontend Developer
Acme Corp
Makati, National Capital Region, Philippines
View job: https://www.linkedin.com/comm/jobs/view/3912345678/?trackingId=abc%3D%3D&refId=xyz

---------------------------------------------------------

React Engineer
Globex Philippines
Taguig (Hybrid)
Actively recruiting
View job: https://www.linkedin.com/comm/jobs/view/3912345679/?trackingId=def

---------------------------------------------------------

Junior Web Developer
Initech
View job: https://www.linkedin.com/comm/jobs/view/3912345680/

---------------------------------------------------------

See all jobs: https://www.linkedin.com/comm/jobs/search?keywords=frontend
Unsubscribe: https://www.linkedin.com/comm/psettings/email-unsubscribe?x=1`;

const JOBSTREET_HTML = `<html><head><style>td{color:red}</style></head><body>
<p>Hi there, here are new jobs for you</p>
<table>
<tr><td><a href="https://ph.jobstreet.com/job/81234567?ref=alert&amp;uid=abc"><strong>Junior Web Developer</strong></a><br>Initech Inc.<br>Pasig City, Metro Manila<br>&#8369;30,000 &ndash; &#8369;40,000 per month<br><a href="https://ph.jobstreet.com/job/81234567?ref=apply">Apply now</a></td></tr>
<tr><td><a href="https://ph.jobstreet.com/job/81234568?ref=alert">IT Support Specialist</a><br>Umbrella Corp</td></tr>
<tr><td><a href="https://ph.jobstreet.com/job/81234569?ref=alert">Help Desk Analyst</a><br>Stark Industries &middot; Cebu City</td></tr>
<tr><td><a href="https://ph.jobstreet.com/jobs?keywords=developer">View all jobs</a></td></tr>
</table></body></html>`;

const INDEED_TEXT = `Software Developer [https://ph.indeed.com/rc/clk?jk=0a1b2c3d4e5f6a7b&from=ja&tk=xyz]
Wayne Enterprises - Quezon City
Easily apply
2 days ago

QA Tester [https://ph.indeed.com/rc/clk?jk=1a1b2c3d4e5f6a7b&from=ja]
Cyberdyne Systems - Remote`;

describe("alertPlatformOf", () => {
  it("recognizes job mailers only", () => {
    assert.equal(alertPlatformOf("LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>"), "linkedin");
    assert.equal(alertPlatformOf("jobs-noreply@linkedin.com"), "linkedin");
    assert.equal(alertPlatformOf("LinkedIn <messages-noreply@linkedin.com>"), null);
    assert.equal(alertPlatformOf("JobStreet <noreply@s.jobstreet.com>"), "jobstreet");
    assert.equal(alertPlatformOf("Indeed <alert@indeed.com>"), "indeed");
    assert.equal(alertPlatformOf("recruiter@acme.com"), null);
  });
});

describe("parseJobAlert", () => {
  it("reads LinkedIn's plain-text layout and skips the header", () => {
    const alert = parseJobAlert({ from: "jobalerts-noreply@linkedin.com", subject: "Frontend developer: 3 new jobs", text: LINKEDIN_TEXT });
    assert.equal(alert?.platform, "linkedin");
    assert.deepEqual(alert?.jobs, [
      { externalId: "3912345678", title: "Frontend Developer", company: "Acme Corp", location: "Makati, National Capital Region, Philippines", url: "https://www.linkedin.com/jobs/view/3912345678/" },
      { externalId: "3912345679", title: "React Engineer", company: "Globex Philippines", location: "Taguig (Hybrid)", url: "https://www.linkedin.com/jobs/view/3912345679/" },
      { externalId: "3912345680", title: "Junior Web Developer", company: "Initech", location: null, url: "https://www.linkedin.com/jobs/view/3912345680/" },
    ]);
  });

  it("reads an HTML-only JobStreet alert: one job per id, no tracking in URLs", () => {
    const alert = parseJobAlert({ from: "noreply@s.jobstreet.com", subject: "New jobs", text: "", html: JOBSTREET_HTML });
    assert.equal(alert?.platform, "jobstreet");
    assert.deepEqual(
      alert?.jobs.map((j) => [j.title, j.company, j.location, j.url]),
      [
        ["Junior Web Developer", "Initech Inc.", "Pasig City, Metro Manila", "https://ph.jobstreet.com/job/81234567"],
        // No location line: the next job's title must not be read as one.
        ["IT Support Specialist", "Umbrella Corp", null, "https://ph.jobstreet.com/job/81234568"],
        ["Help Desk Analyst", "Stark Industries", "Cebu City", "https://ph.jobstreet.com/job/81234569"],
      ],
    );
  });

  it("reads Indeed's 'Company - Location' lines", () => {
    const alert = parseJobAlert({ from: "alert@indeed.com", subject: "Jobs for you", text: INDEED_TEXT });
    assert.deepEqual(
      alert?.jobs.map((j) => [j.externalId, j.title, j.company, j.location]),
      [
        ["0a1b2c3d4e5f6a7b", "Software Developer", "Wayne Enterprises", "Quezon City"],
        ["1a1b2c3d4e5f6a7b", "QA Tester", "Cyberdyne Systems", "Remote"],
      ],
    );
  });

  it("accepts an alert the user forwarded", () => {
    const alert = parseJobAlert({ from: "me@example.com", subject: "Fwd: Frontend developer: 3 new jobs", text: LINKEDIN_TEXT });
    assert.equal(alert?.platform, "linkedin");
    assert.equal(alert?.jobs.length, 3);
  });

  it("ignores mail that is not an alert", () => {
    // A recruiter's LinkedIn message that links one job is not an alert.
    assert.equal(
      parseJobAlert({ from: "messages-noreply@linkedin.com", subject: "New message", text: "Hi! See https://www.linkedin.com/jobs/view/3912345678/" }),
      null,
    );
    // An alert sender with no job links (e.g. a newsletter).
    assert.equal(parseJobAlert({ from: "alert@indeed.com", subject: "Tips", text: "Five tips for your CV" }), null);
  });
});

describe("htmlToText", () => {
  it("keeps link targets and decodes entities", () => {
    assert.equal(htmlToText('<a href="https://x.test/?a=1&amp;b=2">Go &amp; see</a><br>&#8369;5'), "Go & see [https://x.test/?a=1&b=2]\n₱5");
  });
});
