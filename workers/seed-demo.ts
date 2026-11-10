// Demo account seed: creates (or resets) the public demo login and fills it
// with invented data: a resume, a job-search profile, 15 applications with
// backdated history, upcoming interviews and 5 scored matches.
//
// Run locally:  node --env-file=.env.local workers/seed-demo.ts
// Run nightly by .github/workflows/demo-reset.yml, which also undoes whatever
// visitors changed during the day (cards moved, profile edited, password).
//
// Every company, job and person here is invented. No LLM calls.
//
// LOGGING RULE: public repo, public logs. Counts and ids only.
//
// Env:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   Optional: MATCHIE_USER_ID (the owner; the script refuses to touch it)

import { createClient } from "../lib/supabase/admin.ts";
import { describeError } from "../lib/describe-error.ts";
import { normalizeCompanyName } from "../lib/ats.ts";
import { DEMO_EMAIL, DEMO_PASSWORD } from "../lib/demo.ts";
import type { ApplicationStatus } from "../lib/application-status.ts";
import type { Database, Json } from "../lib/types/database.types.ts";

type Supabase = ReturnType<typeof createClient>;
type WorkSetup = Database["public"]["Enums"]["work_setup"];

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const stats = { jobs: 0, applications: 0, interviews: 0, matches: 0 };

// --- The data ---------------------------------------------------------------------

type DemoJob = {
  slug: string;
  title: string;
  company: string;
  location: string;
  workSetup: WorkSetup;
  salary: [number, number];
  description: string;
};

/** A move on the board: the status, and how many days ago it happened. */
type Step = { status: ApplicationStatus; daysAgo: number; source?: "email" };

type DemoApplication = DemoJob & {
  history: Step[];
  /** Interview rounds; negative days are in the past. */
  interviews?: { round: number; inDays: number; hour: number }[];
};

type DemoMatch = DemoJob & {
  fitScore: number;
  matched: string[];
  missing: string[];
  redFlags: string[];
  reasoning: string;
};

const SKILLS = ["React", "TypeScript", "Next.js", "Node.js", "PostgreSQL", "Tailwind CSS", "Supabase", "REST APIs", "Git", "Jest"];

const RESUME = {
  contact: { name: "Alex Santos", email: DEMO_EMAIL, phone: null, location: "Quezon City" },
  summary: "Frontend developer with three years of React and TypeScript, building fast, accessible web apps for startups.",
  skills: SKILLS,
  experience: [
    {
      title: "Frontend Developer",
      company: "Bahaghari Digital",
      start: "2023-04",
      end: null,
      highlights: [
        "Rebuilt the customer dashboard in Next.js, cutting load time by 40%",
        "Set up the component library and visual tests used by three teams",
      ],
    },
    {
      title: "Junior Web Developer",
      company: "Kubo Creative",
      start: "2021-06",
      end: "2023-03",
      highlights: ["Built marketing sites and a booking flow in React and Node.js", "Moved the team from REST mocks to typed API clients"],
    },
  ],
};

const SEEKER = {
  target_roles: ["Frontend Developer", "Full Stack Developer"],
  skills: SKILLS,
  years_experience: 3,
  min_salary: 70_000,
  work_setup: ["remote", "hybrid"] as WorkSetup[],
  avoid_industries: ["Gambling"],
  home_city: "Quezon City",
  preferred_locations: ["Makati", "BGC", "Pasig"],
};

const describe = (title: string, company: string, stack: string) =>
  `${title} at ${company}.\n\nYou will build and ship product features with ${stack}, review code, and work closely with design and backend engineers.\n\nRequirements:\n- 2+ years of professional web development\n- Strong ${stack}\n- Good written English for remote collaboration`;

const APPLICATIONS: DemoApplication[] = [
  // Saved
  { slug: "habi-frontend", title: "Frontend Developer", company: "Habi Studio", location: "Makati", workSetup: "hybrid", salary: [60_000, 85_000], description: "", history: [{ status: "saved", daysAgo: 2 }] },
  { slug: "tanaw-react", title: "React Developer", company: "Tanaw Cloud", location: "Remote (Philippines)", workSetup: "remote", salary: [70_000, 95_000], description: "", history: [{ status: "saved", daysAgo: 1 }] },
  { slug: "sinag-fullstack", title: "Junior Full Stack Engineer", company: "Sinag Learning", location: "Quezon City", workSetup: "hybrid", salary: [45_000, 65_000], description: "", history: [{ status: "saved", daysAgo: 4 }] },
  // Applied, waiting
  { slug: "kapwa-nextjs", title: "Frontend Engineer (Next.js)", company: "Kapwa Health", location: "Remote (Philippines)", workSetup: "remote", salary: [80_000, 110_000], description: "", history: [{ status: "saved", daysAgo: 5 }, { status: "applied", daysAgo: 3 }] },
  { slug: "isla-web", title: "Software Engineer, Web", company: "Isla Logistics", location: "Pasig", workSetup: "hybrid", salary: [65_000, 90_000], description: "", history: [{ status: "saved", daysAgo: 7 }, { status: "applied", daysAgo: 5 }] },
  { slug: "alon-ui", title: "UI Engineer", company: "Alon Games", location: "Remote", workSetup: "remote", salary: [75_000, 100_000], description: "", history: [{ status: "saved", daysAgo: 10 }, { status: "applied", daysAgo: 8 }] },
  { slug: "hiraya-fullstack", title: "Full Stack Developer", company: "Hiraya Commerce", location: "Taguig", workSetup: "hybrid", salary: [70_000, 95_000], description: "", history: [{ status: "saved", daysAgo: 13 }, { status: "applied", daysAgo: 11 }] },
  // Screening
  {
    slug: "liwanag-frontend", title: "Frontend Developer", company: "Liwanag Analytics", location: "Remote (Philippines)", workSetup: "remote", salary: [70_000, 90_000], description: "",
    history: [{ status: "saved", daysAgo: 20 }, { status: "applied", daysAgo: 18 }, { status: "screening", daysAgo: 12, source: "email" }],
  },
  // Interview
  {
    slug: "agos-fullstack", title: "Full Stack Engineer", company: "Agos Payments", location: "BGC, Taguig", workSetup: "hybrid", salary: [90_000, 120_000], description: "",
    history: [{ status: "saved", daysAgo: 25 }, { status: "applied", daysAgo: 24 }, { status: "screening", daysAgo: 19, source: "email" }, { status: "interview", daysAgo: 14, source: "email" }],
    interviews: [{ round: 1, inDays: -10, hour: 10 }, { round: 2, inDays: 2, hour: 14 }],
  },
  {
    slug: "bituin-frontend", title: "Frontend Engineer", company: "Bituin Software", location: "Remote", workSetup: "remote", salary: [85_000, 115_000], description: "",
    history: [{ status: "saved", daysAgo: 16 }, { status: "applied", daysAgo: 15 }, { status: "interview", daysAgo: 9, source: "email" }],
    interviews: [{ round: 1, inDays: 4, hour: 10 }],
  },
  {
    slug: "kawayan-web", title: "Web Developer", company: "Kawayan Labs", location: "Cebu City (remote OK)", workSetup: "remote", salary: [60_000, 80_000], description: "",
    history: [{ status: "saved", daysAgo: 12 }, { status: "applied", daysAgo: 11 }, { status: "assessment", daysAgo: 7, source: "email" }, { status: "interview", daysAgo: 3, source: "email" }],
    interviews: [{ round: 1, inDays: 1, hour: 15 }],
  },
  // Offer
  {
    slug: "ulap-senior-frontend", title: "Frontend Developer II", company: "Ulap Systems", location: "Remote (Philippines)", workSetup: "remote", salary: [100_000, 130_000], description: "",
    history: [
      { status: "saved", daysAgo: 40 },
      { status: "applied", daysAgo: 38 },
      { status: "screening", daysAgo: 33, source: "email" },
      { status: "interview", daysAgo: 27, source: "email" },
      { status: "final", daysAgo: 20, source: "email" },
      { status: "offer", daysAgo: 6, source: "email" },
    ],
    interviews: [{ round: 1, inDays: -25, hour: 11 }, { round: 2, inDays: -18, hour: 14 }],
  },
  // Rejected
  {
    slug: "lakbay-frontend", title: "Frontend Developer", company: "Lakbay Travel Tech", location: "Makati", workSetup: "onsite", salary: [55_000, 75_000], description: "",
    history: [{ status: "saved", daysAgo: 30 }, { status: "applied", daysAgo: 29 }, { status: "rejected", daysAgo: 22, source: "email" }],
  },
  {
    slug: "talaan-fullstack", title: "Full Stack Developer", company: "Talaan HR", location: "Remote", workSetup: "remote", salary: [70_000, 90_000], description: "",
    history: [{ status: "saved", daysAgo: 35 }, { status: "applied", daysAgo: 34 }, { status: "screening", daysAgo: 28, source: "email" }, { status: "rejected", daysAgo: 21, source: "email" }],
  },
  {
    slug: "siklab-swe", title: "Software Engineer", company: "Siklab Robotics", location: "Pasig", workSetup: "hybrid", salary: [75_000, 95_000], description: "",
    history: [{ status: "saved", daysAgo: 22 }, { status: "applied", daysAgo: 21 }, { status: "interview", daysAgo: 15, source: "email" }, { status: "rejected", daysAgo: 8, source: "email" }],
  },
];

const MATCHES: DemoMatch[] = [
  {
    slug: "dagat-frontend", title: "Frontend Engineer", company: "Dagat Data Co.", location: "Remote (Philippines)", workSetup: "remote", salary: [85_000, 110_000], description: "",
    fitScore: 94, matched: ["React", "TypeScript", "Next.js", "Tailwind CSS", "Jest"], missing: ["GraphQL"], redFlags: [],
    reasoning: "Your React, TypeScript and Next.js work lines up with almost every requirement. GraphQL is the only gap, and the role lists it as a plus.",
  },
  {
    slug: "mabuhay-nextjs", title: "Next.js Developer", company: "Mabuhay Fintech Labs", location: "BGC, Taguig", workSetup: "hybrid", salary: [90_000, 120_000], description: "",
    fitScore: 89, matched: ["Next.js", "TypeScript", "PostgreSQL", "REST APIs"], missing: ["Payments experience"], redFlags: [],
    reasoning: "Strong overlap on the Next.js and TypeScript stack, and the salary clears your floor. They prefer someone who has worked on payments.",
  },
  {
    slug: "sariwa-fullstack", title: "Full Stack Developer (React/Node)", company: "Sariwa Foods Digital", location: "Quezon City", workSetup: "hybrid", salary: [70_000, 90_000], description: "",
    fitScore: 86, matched: ["React", "Node.js", "PostgreSQL", "Git"], missing: ["Docker", "AWS"], redFlags: [],
    reasoning: "A full stack role close to home that uses your React and Node.js experience. You would need to pick up their Docker and AWS setup.",
  },
  {
    slug: "tahanan-typescript", title: "TypeScript Engineer", company: "Tahanan Proptech", location: "Remote", workSetup: "remote", salary: [80_000, 100_000], description: "",
    fitScore: 82, matched: ["TypeScript", "React", "Supabase", "Jest"], missing: ["React Native"], redFlags: ["Expects weekend on-call once a month"],
    reasoning: "Your TypeScript and Supabase work fit the web side well. Part of the role is in React Native, and the posting mentions monthly weekend on-call.",
  },
  {
    slug: "pinnacle-design-systems", title: "Frontend Developer, Design Systems", company: "Pinnacle Bay Tech", location: "Makati", workSetup: "hybrid", salary: [75_000, 95_000], description: "",
    fitScore: 78, matched: ["React", "Tailwind CSS", "TypeScript"], missing: ["Storybook", "Figma"], redFlags: [],
    reasoning: "You built a component library already, which is the core of this role. Storybook and Figma handoff experience would make it a stronger fit.",
  },
];

const STACKS = ["React and TypeScript", "Next.js and TypeScript", "React and Node.js"];

// --- Main -------------------------------------------------------------------------

async function main() {
  const supabase = createClient();
  const userId = await prepareDemoUser(supabase);
  console.log(`[seed-demo] demo user ${userId}`);

  await wipe(supabase, userId);
  await seedProfile(supabase, userId);
  const jobIds = await seedJobs(supabase, userId);
  await seedApplications(supabase, userId, jobIds);
  await seedMatches(supabase, userId, jobIds);

  console.log(`[seed-demo] ${JSON.stringify(stats)}`);
}

/** Finds or creates the demo login, resets its email and password, and flags it. */
async function prepareDemoUser(supabase: Supabase) {
  const { data: flagged, error } = await supabase.from("profiles").select("user_id").eq("is_demo", true);
  if (error) throw new Error(`Could not look up the demo profile (${error.code}); is migration 014 applied?`);
  if (flagged.length > 1) throw new Error(`${flagged.length} profiles are flagged is_demo; expected at most one`);

  // The flag wins over the email: a visitor may have changed the email.
  let userId = flagged[0]?.user_id ?? (await findUserIdByEmail(supabase, DEMO_EMAIL));
  if (userId && userId === process.env.MATCHIE_USER_ID) throw new Error("The demo account resolves to MATCHIE_USER_ID; refusing to wipe the owner");
  if (userId && flagged.length === 0) await assertNoData(supabase, userId);

  if (!userId) {
    const { data, error: createError } = await supabase.auth.admin.createUser({ email: DEMO_EMAIL, password: DEMO_PASSWORD, email_confirm: true });
    if (createError || !data.user) throw new Error(`Could not create the demo user (${createError?.code ?? "no user"})`);
    userId = data.user.id;
    console.log("[seed-demo] created the demo user");
  } else {
    // Undo a visitor's password or email change.
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { email: DEMO_EMAIL, password: DEMO_PASSWORD, email_confirm: true });
    if (updateError) throw new Error(`Could not reset the demo login (${updateError.code})`);
  }

  // The service role passes the protect_demo_flag trigger (migration 014).
  const { error: flagError } = await supabase.from("profiles").upsert({ user_id: userId, is_demo: true, avatar_url: null }, { onConflict: "user_id" });
  if (flagError) throw new Error(`Could not flag the demo profile (${flagError.code})`);
  return userId;
}

async function findUserIdByEmail(supabase: Supabase, email: string) {
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Could not list users (${error.code})`);
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (user) return user.id;
    if (data.users.length < perPage) return null;
  }
}

// An unflagged account with this email is someone's real account until
// proven otherwise: only an empty one is turned into the demo.
async function assertNoData(supabase: Supabase, userId: string) {
  const { count, error } = await supabase.from("applications").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (error) throw new Error(`Could not check the existing account (${error.code})`);
  if (count) throw new Error(`An unflagged account with the demo email has ${count} applications; refusing to wipe it`);
}

/** Removes everything the demo user owns. Applications first: they cascade
 * to events and interviews, and they block deleting their jobs. */
async function wipe(supabase: Supabase, userId: string) {
  const steps = [
    ["applications", () => supabase.from("applications").delete().eq("user_id", userId)],
    ["email_messages", () => supabase.from("email_messages").delete().eq("user_id", userId)],
    ["matches", () => supabase.from("matches").delete().eq("user_id", userId)],
    ["jobs", () => supabase.from("jobs").delete().eq("created_by", userId)],
    ["resumes", () => supabase.from("resumes").delete().eq("user_id", userId)],
  ] as const;
  for (const [table, run] of steps) {
    const { error } = await run();
    if (error) throw new Error(`Could not clear ${table} (${error.code})`);
  }
}

async function seedProfile(supabase: Supabase, userId: string) {
  const { error: seekerError } = await supabase.from("seeker_profiles").upsert({ user_id: userId, ...SEEKER, max_commute_km: null }, { onConflict: "user_id" });
  if (seekerError) throw new Error(`Could not save the seeker profile (${seekerError.code})`);
  const { error: resumeError } = await supabase.from("resumes").insert({ user_id: userId, content: RESUME, is_master: true });
  if (resumeError) throw new Error(`Could not save the resume (${resumeError.code})`);
}

/** Jobs are source "manual", created by the demo user: the shortlist and the
 * digest skip manual jobs, so the owner's pipeline never sees them. */
async function seedJobs(supabase: Supabase, userId: string) {
  const all: DemoJob[] = [...APPLICATIONS, ...MATCHES];
  const companyIds = await seedCompanies(supabase, all.map((job) => job.company));

  const { data, error } = await supabase
    .from("jobs")
    .upsert(
      all.map((job, i) => ({
        canonical_hash: `demo:${job.slug}`,
        company_id: companyIds.get(normalizeCompanyName(job.company)) ?? null,
        title: job.title,
        description: job.description || describe(job.title, job.company, STACKS[i % STACKS.length]),
        location: job.location,
        work_setup: job.workSetup,
        salary_min: job.salary[0],
        salary_max: job.salary[1],
        source: "manual",
        created_by: userId,
      })),
      { onConflict: "canonical_hash" },
    )
    .select("id, canonical_hash");
  if (error) throw new Error(`Could not save the jobs (${error.code})`);
  stats.jobs = data.length;
  return new Map(data.map((row) => [row.canonical_hash.replace(/^demo:/, ""), row.id]));
}

/** normalized name -> id. Existing rows keep their spelling and are never
 * deleted here: a real job may share the company row. */
async function seedCompanies(supabase: Supabase, names: string[]) {
  const unique = new Map(names.map((name) => [normalizeCompanyName(name), name]));
  const { error } = await supabase
    .from("companies")
    .upsert([...unique].map(([normalized, name]) => ({ name, name_normalized: normalized })), { onConflict: "name_normalized", ignoreDuplicates: true });
  if (error) throw new Error(`Could not save the companies (${error.code})`);

  const { data, error: selectError } = await supabase.from("companies").select("id, name_normalized").in("name_normalized", [...unique.keys()]);
  if (selectError) throw new Error(`Could not load the companies (${selectError.code})`);
  return new Map(data.map((row) => [row.name_normalized, row.id]));
}

async function seedApplications(supabase: Supabase, userId: string, jobIds: Map<string, string>) {
  const now = Date.now();
  for (const [i, app] of APPLICATIONS.entries()) {
    const jobId = jobIds.get(app.slug);
    if (!jobId) throw new Error(`No job for application ${i}`);

    // A few hours apart within a day, so same-day moves keep their order.
    const history: Json = app.history.map((step, n) => ({
      status: step.status,
      at: new Date(now - step.daysAgo * DAY_MS - (8 - n) * HOUR_MS).toISOString(),
      ...(step.source ? { source: step.source } : {}),
    }));

    const { data: applicationId, error } = await supabase.rpc("seed_demo_application", { p_user_id: userId, p_job_id: jobId, p_history: history });
    if (error || !applicationId) throw new Error(`Could not seed application ${i} (${error?.code ?? "no id"})`);
    stats.applications++;

    for (const interview of app.interviews ?? []) {
      const day = new Date(now + interview.inDays * DAY_MS);
      // Hour in Manila (UTC+8).
      day.setUTCHours(interview.hour - 8, 0, 0, 0);
      const { error: interviewError } = await supabase.from("interviews").insert({
        application_id: applicationId,
        user_id: userId,
        round: interview.round,
        scheduled_at: day.toISOString(),
        source: "email",
      });
      if (interviewError) throw new Error(`Could not seed an interview for application ${i} (${interviewError.code})`);
      stats.interviews++;
    }
  }
}

async function seedMatches(supabase: Supabase, userId: string, jobIds: Map<string, string>) {
  const now = Date.now();
  const { error } = await supabase.from("matches").upsert(
    MATCHES.map((match, i) => ({
      job_id: jobIds.get(match.slug)!,
      user_id: userId,
      fit_score: match.fitScore,
      matched_skills: match.matched,
      missing_skills: match.missing,
      red_flags: match.redFlags,
      reasoning: match.reasoning,
      model: "demo",
      // After the profile and resume were saved, so the scores are not stale.
      scored_at: new Date(now + (i + 1) * 1000).toISOString(),
    })),
    { onConflict: "user_id,job_id" },
  );
  if (error) throw new Error(`Could not save the matches (${error.code})`);
  stats.matches = MATCHES.length;
}

main().catch((error) => {
  console.error(`[seed-demo] fatal: ${describeError(error)}`);
  process.exit(1);
});
