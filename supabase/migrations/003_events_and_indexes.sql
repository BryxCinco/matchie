-- 003_events_and_indexes.sql
-- Append-only enforcement, auth -> profiles sync, FK indexes, job retention.

-- ===========================================================================
-- 1. Append-only application_events
-- ===========================================================================
-- Every status change is a new row; history is never rewritten. UPDATE and
-- TRUNCATE are always rejected, for every role including the service role.
--
-- DELETE is rejected too, with one exception: cascades. When a user deletes
-- an application (applications -> application_events, on delete cascade) or
-- deletes their account (auth.users -> application_events, on delete
-- cascade), Postgres removes the parent row first and then deletes the
-- events. If the trigger blocked those, a user could never delete an
-- application or their account. So a DELETE is allowed only when its parent
-- application or its owner no longer exists, i.e. the event is being removed
-- as part of a cascade, not edited out of a still-living history.
--
-- security definer: the check must see auth.users and see past RLS on
-- applications, which the calling role (authenticated) cannot.

create or replace function public.prevent_application_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.applications a where a.id = old.application_id)
       or not exists (select 1 from auth.users u where u.id = old.user_id)
    then
      return old;  -- cascade from a deleted application or user: allow
    end if;
  end if;

  raise exception 'application_events is append-only: % is not allowed', tg_op
    using errcode = 'restrict_violation',
          hint = 'Insert a new event to record a status change.';
end;
$$;

create trigger application_events_append_only
  before update or delete on public.application_events
  for each row execute function public.prevent_application_event_mutation();

-- Row triggers do not fire on TRUNCATE, so block it with a statement trigger.
-- tg_op is 'TRUNCATE' here, so the function falls through to the exception.
create trigger application_events_no_truncate
  before truncate on public.application_events
  for each statement execute function public.prevent_application_event_mutation();

-- ===========================================================================
-- 2. auth.users -> public.profiles sync
-- ===========================================================================
-- Every sign-up gets a profiles row so the app never has to handle a missing
-- profile. Runs inside the sign-up transaction: if this fails, sign-up fails.
--
-- Email is deliberately NOT copied into profiles. auth.users.email is the
-- source of truth, a copy would go stale when the user changes their email,
-- and it would be one more place holding PII. Server code that needs it
-- (e.g. the digest worker) reads it from auth.users with the service role.
--
-- security definer: the trigger fires as supabase_auth_admin, which has no
-- rights on public tables. search_path = '' forces fully qualified names so
-- the function cannot be hijacked by objects in another schema.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, locale)
  values (
    new.id,
    -- Honour a locale passed at sign-up via options.data.locale; else 'en'.
    case
      when new.raw_user_meta_data ->> 'locale' in ('en', 'tl')
        then new.raw_user_meta_data ->> 'locale'
      else 'en'
    end
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- 3. Indexes
-- ===========================================================================

-- --- Already created in 002 -------------------------------------------------
-- Restated with `if not exists` and the same names, so these are no-ops and
-- only document the hot query paths in one place.

-- Dashboard and digest: a user's matches, best first.
create index if not exists matches_user_score_idx
  on public.matches (user_id, fit_score desc);

-- Timeline: one application's events in order.
create index if not exists application_events_application_idx
  on public.application_events (application_id, created_at asc);

-- Distance filter: ST_DWithin(jobs.geo, home, max_commute_km * 1000).
create index if not exists jobs_geo_idx
  on public.jobs using gist (geo);

-- Recency and retention. There is no is_active column: a job is "active"
-- until retention deletes it. A partial index on `created_at > now() - ...`
-- is not possible (index predicates must be immutable), and a btree on
-- created_at serves both ASC and DESC scans, so this one index covers it.
create index if not exists jobs_created_at_idx
  on public.jobs (created_at);

-- --- New: indexes on foreign keys missing from 002 --------------------------
-- Postgres does not index the referencing side of an FK. Without these, every
-- delete on the parent (or ON DELETE SET NULL) seq-scans the child table.

-- delete_old_jobs() checks "no application for this job"; 002 has
-- applications_job_id_idx for that. These cover the remaining FKs.

-- Deleting a resume version nulls applications.resume_version_id.
create index if not exists applications_resume_version_idx
  on public.applications (resume_version_id)
  where resume_version_id is not null;

-- Deleting an application nulls email_messages.linked_application_id.
create index if not exists email_messages_linked_application_idx
  on public.email_messages (linked_application_id)
  where linked_application_id is not null;

-- Deleting an email nulls application_events.email_message_id.
create index if not exists application_events_email_message_idx
  on public.application_events (email_message_id)
  where email_message_id is not null;

-- Deleting a user nulls jobs.created_by; also "jobs I pasted" lookups.
create index if not exists jobs_created_by_idx
  on public.jobs (created_by)
  where created_by is not null;

-- delete_old_jobs() cascades into resume_versions.job_id (set null).
create index if not exists resume_versions_job_idx
  on public.resume_versions (job_id)
  where job_id is not null;

-- Deleting a user cascades into these tables by user_id.
create index if not exists resumes_user_idx          on public.resumes (user_id);
create index if not exists resume_versions_user_idx  on public.resume_versions (user_id);

-- Deleting a company nulls ats_companies.company_id.
create index if not exists ats_companies_company_idx
  on public.ats_companies (company_id)
  where company_id is not null;

-- Ingest worker: which boards are due for a poll.
create index if not exists ats_companies_due_idx
  on public.ats_companies (last_polled_at nulls first)
  where active;

-- ===========================================================================
-- 4. Job retention
-- ===========================================================================
-- Keeps the database under the 500 MB free-tier ceiling. Called nightly by a
-- GitHub Actions workflow (service role) as:
--   select public.delete_old_jobs();
--
-- A job is deleted when ALL of these hold:
--   - it was created more than `retention_days` ago;
--   - no platform has listed it within that window (job_sources.seen_at).
--     A posting that is still live keeps its row, its matches and its id;
--   - no application references it. applications.job_id is ON DELETE
--     RESTRICT anyway, so this check also avoids aborting the whole batch.
--
-- Cascades: job_sources and matches rows are deleted, resume_versions.job_id
-- is set null. Returns the number of jobs deleted, for the workflow log.

create or replace function public.delete_old_jobs(retention_days integer default 60)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  cutoff        timestamptz := now() - make_interval(days => retention_days);
  deleted_count integer;
begin
  if retention_days < 1 then
    raise exception 'retention_days must be at least 1, got %', retention_days;
  end if;

  delete from public.jobs j
  where j.created_at < cutoff
    and not exists (
      select 1 from public.applications a where a.job_id = j.id
    )
    and not exists (
      select 1 from public.job_sources s where s.job_id = j.id and s.seen_at >= cutoff
    );

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- Supabase grants EXECUTE on new public functions to anon and authenticated,
-- which would expose this as an RPC any signed-in user could call. Only the
-- worker may run it.
revoke execute on function public.delete_old_jobs(integer) from public, anon, authenticated;
grant  execute on function public.delete_old_jobs(integer) to service_role;
