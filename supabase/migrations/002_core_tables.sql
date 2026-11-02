-- 002_core_tables.sql
-- The 14 core tables, indexes, updated_at triggers and baseline RLS.
--
-- Ownership model: every user-owned row carries user_id directly, so every
-- RLS policy is the same cheap `auth.uid() = user_id` check. Child tables
-- (resume_versions, application_events, interviews, email_messages) use a
-- composite FK (parent_id, user_id) so a child can never point at another
-- user's parent.
--
-- Shared tables (companies, jobs, job_sources, ats_companies) are written by
-- the GitHub Actions workers with the service role, which bypasses RLS.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  home_lat    double precision check (home_lat between -90 and 90),
  home_lng    double precision check (home_lng between -180 and 180),
  locale      text not null default 'en' check (locale in ('en', 'tl')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profiles_home_coords_paired
    check ((home_lat is null) = (home_lng is null))
);

comment on column public.profiles.home_lat is
  'Home latitude, used for straight-line distance to jobs.geo. Never sent to an LLM.';
comment on column public.profiles.locale is
  'UI language: en or tl.';

-- ---------------------------------------------------------------------------
-- seeker_profiles
-- ---------------------------------------------------------------------------

create table public.seeker_profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references auth.users (id) on delete cascade,
  target_roles        text[] not null default '{}',
  skills              text[] not null default '{}',
  years_experience    smallint check (years_experience >= 0),
  min_salary          integer check (min_salary >= 0),
  work_setup          public.work_setup[] not null default '{}',
  avoid_industries    text[] not null default '{}',
  max_commute_km      integer check (max_commute_km > 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.seeker_profiles is
  'Answers to the intake questionnaire. Drives the rules filter and full-text shortlist.';
comment on column public.seeker_profiles.skills is
  'Skills summary sent to the LLM in place of the raw resume (PII rule).';
comment on column public.seeker_profiles.years_experience is
  'Used by the rules filter against jobs.experience_min_years.';
comment on column public.seeker_profiles.min_salary is
  'Salary floor, monthly, in PHP. Compared against jobs.salary_max.';
comment on column public.seeker_profiles.work_setup is
  'Every setup the seeker will accept, e.g. {remote,hybrid}. Empty means any.';
comment on column public.seeker_profiles.max_commute_km is
  'Straight-line km from profiles.home_lat/lng. Ignored for remote jobs.';

-- ---------------------------------------------------------------------------
-- resumes
-- ---------------------------------------------------------------------------

create table public.resumes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  content      jsonb not null default '{}',
  is_master    boolean not null default false,
  source_path  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id)
);

comment on column public.resumes.content is
  'Parsed resume as structured JSON (contact, experience, education, skills). Contains PII; scrub before any LLM call.';
comment on column public.resumes.is_master is
  'The master resume that tailored versions derive from. At most one per user.';
comment on column public.resumes.source_path is
  'Supabase Storage path of the originally uploaded file.';

create unique index resumes_one_master_per_user
  on public.resumes (user_id) where is_master;

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------

create table public.companies (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  name_normalized  text not null unique,
  website          text,
  industry         text,
  size             text,
  summary          text,
  enriched_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.companies is
  'Enrichment cache, one row per company, never per job.';
comment on column public.companies.name_normalized is
  'Lowercased, punctuation and legal suffixes (Inc, Corp) stripped. Join key for dedupe.';
comment on column public.companies.size is
  'Headcount band as text, e.g. 51-200.';
comment on column public.companies.enriched_at is
  'Last enrichment run. Re-enrich only when older than 30 days.';

create index companies_name_trgm
  on public.companies using gin (name_normalized extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------

create table public.jobs (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid references public.companies (id) on delete set null,
  title                 text not null,
  description           text,
  location              text,
  geo                   extensions.geography(point, 4326),
  salary_min            integer check (salary_min >= 0),
  salary_max            integer check (salary_max >= 0),
  work_setup            public.work_setup,
  experience_min_years  smallint check (experience_min_years >= 0),
  source                text not null,
  source_url            text,
  canonical_hash        text not null unique,
  created_by            uuid references auth.users (id) on delete set null,
  posted_at             timestamptz,
  search_vector         tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce(location, '')), 'C')
  ) stored,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint jobs_salary_range check (salary_min is null or salary_max is null or salary_min <= salary_max)
);

comment on table public.jobs is
  'Every ingested posting, deduplicated. Rows older than 60 days with no application are purged nightly.';
comment on column public.jobs.geo is
  'Job location as a PostGIS point (SRID 4326). Null for remote or ungeocoded jobs.';
comment on column public.jobs.salary_min is
  'Monthly, in PHP, normalized at ingest.';
comment on column public.jobs.experience_min_years is
  'Minimum years of experience parsed from the JD. Used by the rules filter.';
comment on column public.jobs.source is
  'Platform that first produced this row: greenhouse, lever, ashby, workable, aggregator, email or manual. Every sighting is in job_sources.';
comment on column public.jobs.canonical_hash is
  'Hash of normalized company name + title + location. Collapses the same posting from several platforms into one row.';
comment on column public.jobs.created_by is
  'Set when a user created the job through the paste-the-JD box. Null for worker-ingested jobs.';
comment on column public.jobs.search_vector is
  'Generated full-text vector (title A, description B, location C) for the shortlist stage.';

create index jobs_search_vector_idx on public.jobs using gin (search_vector);
create index jobs_geo_idx on public.jobs using gist (geo);
create index jobs_company_id_idx on public.jobs (company_id);
create index jobs_created_at_idx on public.jobs (created_at);

-- ---------------------------------------------------------------------------
-- job_sources
-- ---------------------------------------------------------------------------

create table public.job_sources (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.jobs (id) on delete cascade,
  platform     text not null,
  source_url   text,
  raw_payload  jsonb,
  seen_at      timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (job_id, platform)
);

comment on table public.job_sources is
  'Every place a job appeared. Many rows to one jobs row.';
comment on column public.job_sources.raw_payload is
  'Unmodified response or parsed email fragment, kept for re-parsing.';
comment on column public.job_sources.seen_at is
  'Last time this platform listed the job. Bumped on every re-sighting.';

-- ---------------------------------------------------------------------------
-- resume_versions
-- ---------------------------------------------------------------------------

create table public.resume_versions (
  id          uuid primary key default gen_random_uuid(),
  resume_id   uuid not null,
  user_id     uuid not null references auth.users (id) on delete cascade,
  job_id      uuid references public.jobs (id) on delete set null,
  label       text not null,
  content     jsonb not null default '{}',
  pdf_path    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  foreign key (resume_id, user_id)
    references public.resumes (id, user_id) on delete cascade
);

comment on table public.resume_versions is
  'A tailored variant of a master resume.';
comment on column public.resume_versions.job_id is
  'The job this version was tailored for, if any.';
comment on column public.resume_versions.pdf_path is
  'Supabase Storage path of the rendered PDF.';

create index resume_versions_resume_id_idx on public.resume_versions (resume_id);

-- ---------------------------------------------------------------------------
-- matches
-- ---------------------------------------------------------------------------

create table public.matches (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references public.jobs (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  fit_score       smallint not null check (fit_score between 0 and 100),
  matched_skills  text[] not null default '{}',
  missing_skills  text[] not null default '{}',
  red_flags       text[] not null default '{}',
  reasoning       text,
  model           text,
  scored_at       timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, job_id)
);

comment on table public.matches is
  'LLM scoring output, one row per user per job. Re-scoring overwrites.';
comment on column public.matches.reasoning is
  'Two-sentence "why this matched", shown on every job.';
comment on column public.matches.model is
  'Provider and model that produced the score, e.g. gemini-2.0-flash or groq/llama-3.3-70b.';

create index matches_user_score_idx on public.matches (user_id, fit_score desc);

-- ---------------------------------------------------------------------------
-- applications
-- ---------------------------------------------------------------------------

create table public.applications (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  job_id             uuid not null references public.jobs (id) on delete restrict,
  resume_version_id  uuid,
  status             public.application_status not null default 'saved',
  applied_at         timestamptz,
  last_activity_at   timestamptz not null default now(),
  notes              text,
  contacts           jsonb not null default '[]',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, job_id),
  foreign key (resume_version_id, user_id)
    references public.resume_versions (id, user_id) on delete set null (resume_version_id)
);

comment on table public.applications is
  'The tracker. status is a denormalized copy of the latest application_events.to_status.';
comment on column public.applications.job_id is
  'on delete restrict: the 60-day retention job must never delete a job someone applied to.';
comment on column public.applications.resume_version_id is
  'Resume version used to apply, for measuring which version performs.';
comment on column public.applications.last_activity_at is
  'Last status change or inbound email. Ghosting detection flips to ghosted after 14 days of silence.';
comment on column public.applications.contacts is
  'Array of {name, role, email, phone, notes}. Contains PII; never sent to an LLM.';

create index applications_user_status_idx on public.applications (user_id, status);
create index applications_job_id_idx on public.applications (job_id);
create index applications_last_activity_idx on public.applications (last_activity_at);

-- ---------------------------------------------------------------------------
-- application_events (append-only)
-- ---------------------------------------------------------------------------

create table public.application_events (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null,
  user_id         uuid not null references auth.users (id) on delete cascade,
  from_status     public.application_status,
  to_status       public.application_status not null,
  source          public.event_source not null default 'manual',
  note            text,
  email_message_id uuid,
  created_at      timestamptz not null default now(),
  foreign key (application_id, user_id)
    references public.applications (id, user_id) on delete cascade,
  constraint application_events_status_changes
    check (from_status is null or from_status <> to_status)
);

comment on table public.application_events is
  'Append-only status history. Never updated or deleted (enforced by trigger in a later migration). All analytics derive from this table.';
comment on column public.application_events.from_status is
  'Null on the first event for an application.';
comment on column public.application_events.source is
  'manual = user on the board, email = inbound classifier, system = worker (e.g. ghosting detection).';
comment on column public.application_events.email_message_id is
  'The email that triggered this change, when source = email. FK added below, after email_messages exists.';

create index application_events_application_idx
  on public.application_events (application_id, created_at);
create index application_events_user_idx
  on public.application_events (user_id, created_at);

-- ---------------------------------------------------------------------------
-- interviews
-- ---------------------------------------------------------------------------

create table public.interviews (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null,
  user_id         uuid not null references auth.users (id) on delete cascade,
  round           smallint not null check (round > 0),
  scheduled_at    timestamptz,
  prep_notes      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (application_id, round),
  foreign key (application_id, user_id)
    references public.applications (id, user_id) on delete cascade
);

comment on column public.interviews.round is
  '1-based round number within the application.';

create index interviews_user_scheduled_idx on public.interviews (user_id, scheduled_at);

-- ---------------------------------------------------------------------------
-- email_messages
-- ---------------------------------------------------------------------------

create table public.email_messages (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  from_addr              text not null,
  subject                text,
  body                   text,
  received_at            timestamptz not null default now(),
  classified_as          text check (classified_as in (
                           'job_alert', 'rejection', 'interview_invite',
                           'assessment', 'offer', 'noise'
                         )),
  linked_application_id  uuid,
  parse_failed           boolean not null default false,
  parse_error            text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  foreign key (linked_application_id, user_id)
    references public.applications (id, user_id) on delete set null (linked_application_id)
);

comment on table public.email_messages is
  'Raw inbound mail from Cloudflare Email Routing. Inserted by the webhook with the service role.';
comment on column public.email_messages.classified_as is
  'Classifier output. Null until classified.';
comment on column public.email_messages.linked_application_id is
  'Application this email was matched to, if any.';
comment on column public.email_messages.parse_failed is
  'True when parsing or classification failed. Forms the inspection queue for changed email templates.';

create index email_messages_user_received_idx on public.email_messages (user_id, received_at desc);
create index email_messages_parse_failed_idx on public.email_messages (created_at) where parse_failed;

alter table public.application_events
  add constraint application_events_email_message_id_fkey
  foreign key (email_message_id) references public.email_messages (id) on delete set null;

-- ---------------------------------------------------------------------------
-- ats_companies
-- ---------------------------------------------------------------------------

create table public.ats_companies (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid references public.companies (id) on delete set null,
  platform        text not null check (platform in ('greenhouse', 'lever', 'ashby', 'workable')),
  board_token     text not null,
  active          boolean not null default true,
  last_polled_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (platform, board_token)
);

comment on table public.ats_companies is
  'Registry of ATS boards for the ingest worker to poll.';
comment on column public.ats_companies.board_token is
  'The {company} slug in the board URL, e.g. boards-api.greenhouse.io/v1/boards/{board_token}/jobs.';

-- ---------------------------------------------------------------------------
-- job_queries
-- ---------------------------------------------------------------------------

create table public.job_queries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text,
  keywords        text not null,
  filters         jsonb not null default '{}',
  digest_enabled  boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.job_queries is
  'Saved searches and alert rules.';
comment on column public.job_queries.keywords is
  'Search string, passed to websearch_to_tsquery against jobs.search_vector.';
comment on column public.job_queries.filters is
  'Extra rules-filter overrides, e.g. {"work_setup": ["remote"], "min_salary": 60000}.';
comment on column public.job_queries.digest_enabled is
  'Include this query in the daily Resend digest.';

create index job_queries_user_idx on public.job_queries (user_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.seeker_profiles
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.resumes
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.resume_versions
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.companies
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.matches
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.applications
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.interviews
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.email_messages
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.ats_companies
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.job_queries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- (select auth.uid()) is evaluated once per statement instead of once per row.

alter table public.profiles            enable row level security;
alter table public.seeker_profiles     enable row level security;
alter table public.resumes             enable row level security;
alter table public.resume_versions     enable row level security;
alter table public.companies           enable row level security;
alter table public.jobs                enable row level security;
alter table public.job_sources         enable row level security;
alter table public.matches             enable row level security;
alter table public.applications        enable row level security;
alter table public.application_events  enable row level security;
alter table public.interviews          enable row level security;
alter table public.email_messages      enable row level security;
alter table public.ats_companies       enable row level security;
alter table public.job_queries         enable row level security;

-- User-owned tables: full access to own rows.

create policy "Users manage own profile" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage own seeker profile" on public.seeker_profiles
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage own resumes" on public.resumes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage own resume versions" on public.resume_versions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage own matches" on public.matches
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage own applications" on public.applications
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage own interviews" on public.interviews
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage own job queries" on public.job_queries
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- application_events: read and insert only. No update or delete policy, so
-- both are denied for users; the append-only trigger also covers the service role.

create policy "Users read own events" on public.application_events
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert own events" on public.application_events
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- email_messages: inserted by the webhook (service role). Users can read,
-- correct a classification or link, and delete their own mail.

create policy "Users read own email" on public.email_messages
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users update own email" on public.email_messages
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete own email" on public.email_messages
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Shared catalog: readable by any signed-in user, written by workers.

create policy "Authenticated read companies" on public.companies
  for select to authenticated
  using (true);

create policy "Authenticated read jobs" on public.jobs
  for select to authenticated
  using (true);

create policy "Users insert pasted jobs" on public.jobs
  for insert to authenticated
  with check ((select auth.uid()) = created_by and source = 'manual');

create policy "Authenticated read job sources" on public.job_sources
  for select to authenticated
  using (true);

-- ats_companies: RLS on with no policies, so only the service role can touch it.
