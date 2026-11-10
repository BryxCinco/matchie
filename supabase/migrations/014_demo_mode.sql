-- 014_demo_mode.sql
-- A public demo account for the portfolio site: visitors sign in with a
-- published password and see a seeded tracker, matches and analytics.
--
-- The demo account must not spend the owner's LLM budget, lock other
-- visitors out, or host files, and its fake history must look real.
--
--   1. profiles.is_demo marks it. Only the service role can set or clear the
--      flag, and a demo profile cannot be deleted, so a visitor cannot
--      unlock the account by editing their own row.
--   2. The app (API routes and Server Actions) refuses LLM scoring, password
--      changes and avatar uploads for demo accounts. Storage refuses demo
--      avatar uploads here too, since the bucket can be written directly.
--   3. seed_demo_application() builds a backdated history through the normal
--      status triggers, so the events are still written only by
--      log_application_status (rule: never insert status events by hand).
--   4. Ghosting detection skips demo accounts: their seeded "applied" cards
--      are weeks old and would otherwise be ghosted and drafted (LLM calls).
--
-- workers/seed-demo.ts creates the account and its data; demo-reset.yml runs
-- it every night, which also undoes anything a visitor changed.

-- ===========================================================================
-- 1. The flag
-- ===========================================================================

alter table public.profiles
  add column is_demo boolean not null default false;

comment on column public.profiles.is_demo is
  'Public demo account: no LLM calls, no password change, no uploads, reset nightly. Set only by the service role (workers/seed-demo.ts).';

-- profiles has a "for all" RLS policy, so without this a signed-in demo
-- visitor could clear the flag, or delete the row, and use the LLM routes.
-- current_user is the PostgREST role of the request: anon and authenticated
-- are visitors; service_role, postgres and cascades from auth.users pass.
create or replace function public.protect_demo_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if (tg_op = 'INSERT' and new.is_demo)
       or (tg_op = 'UPDATE' and new.is_demo is distinct from old.is_demo)
       or (tg_op = 'DELETE' and old.is_demo)
    then
      raise exception 'profiles.is_demo can only be changed by the service role'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_demo_flag
  before insert or update or delete on public.profiles
  for each row execute function public.protect_demo_flag();

-- ===========================================================================
-- 2. Backdated events for the seed
-- ===========================================================================
-- Replace the 004 and 005 versions. Both now read matchie.event_at, the
-- moment the change happened, and fall back to now() as before. Like the
-- other matchie.event_* settings it lasts one transaction and is set only by
-- SQL functions (PostgREST does not expose set_config). The only function
-- that sets it is seed_demo_application(), below, which refuses real users.

create or replace function public.touch_application_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_at timestamptz := coalesce(nullif(current_setting('matchie.event_at', true), '')::timestamptz, now());
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.last_activity_at := v_at;
    if new.applied_at is null and new.status not in ('saved', 'withdrawn') then
      new.applied_at := v_at;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.log_application_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_source public.event_source :=
    coalesce(nullif(current_setting('matchie.event_source', true), ''), 'manual')::public.event_source;
  v_note text := nullif(current_setting('matchie.event_note', true), '');
  v_email_id uuid := nullif(current_setting('matchie.event_email_message_id', true), '')::uuid;
  v_at timestamptz := coalesce(nullif(current_setting('matchie.event_at', true), '')::timestamptz, now());
begin
  if tg_op = 'INSERT' then
    insert into public.application_events (application_id, user_id, from_status, to_status, source, note, email_message_id, created_at)
    values (new.id, new.user_id, null, new.status, v_source, v_note, v_email_id, v_at);
  elsif new.status is distinct from old.status then
    insert into public.application_events (application_id, user_id, from_status, to_status, source, note, email_message_id, created_at)
    values (new.id, new.user_id, old.status, new.status, v_source, v_note, v_email_id, v_at);
  end if;
  return null;
end;
$$;

-- ===========================================================================
-- 3. Seed one demo application with its history
-- ===========================================================================
-- p_history is the application's moves, oldest first:
--   [{"status": "saved", "at": "2026-10-01T09:00:00Z"},
--    {"status": "applied", "at": "..."},
--    {"status": "interview", "at": "...", "source": "email"}]
-- The first move inserts the application, each later one updates its status,
-- and the triggers write the events with those times. Returns the id.

create or replace function public.seed_demo_application(
  p_user_id uuid,
  p_job_id uuid,
  p_history jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_app_id uuid;
  v_step jsonb;
begin
  -- Backdating is for fake history only.
  if not exists (select 1 from public.profiles p where p.user_id = p_user_id and p.is_demo) then
    raise exception 'user % is not a demo account', p_user_id using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_history) is distinct from 'array' or jsonb_array_length(p_history) = 0 then
    raise exception 'p_history must be a non-empty array';
  end if;

  for v_step in select h.step from jsonb_array_elements(p_history) with ordinality as h(step, n) order by h.n loop
    perform set_config('matchie.event_at', v_step ->> 'at', true);
    perform set_config('matchie.event_source', coalesce(v_step ->> 'source', 'manual'), true);

    if v_app_id is null then
      insert into public.applications (user_id, job_id, status)
      values (p_user_id, p_job_id, (v_step ->> 'status')::public.application_status)
      returning id into v_app_id;
    else
      update public.applications
      set status = (v_step ->> 'status')::public.application_status
      where id = v_app_id;
    end if;
  end loop;

  -- Later statements in the same transaction get real times again.
  perform set_config('matchie.event_at', '', true);
  perform set_config('matchie.event_source', '', true);
  return v_app_id;
end;
$$;

comment on function public.seed_demo_application(uuid, uuid, jsonb) is
  'Seed script: inserts a demo application and replays its backdated history through the status triggers. Demo accounts only. Service role only.';

revoke execute on function public.seed_demo_application(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.seed_demo_application(uuid, uuid, jsonb) to service_role;

-- ===========================================================================
-- 4. Ghosting skips demo accounts
-- ===========================================================================
-- Same as 009, plus the is_demo check. create or replace keeps the grants.

create or replace function public.mark_ghosted_applications(p_days integer default 14)
returns table (application_id uuid, user_id uuid)
language plpgsql
set search_path = ''
as $$
begin
  if p_days < 1 then
    raise exception 'p_days must be at least 1, got %', p_days;
  end if;

  perform set_config('matchie.event_source', 'system', true);
  perform set_config('matchie.event_note', format('No reply in %s days', p_days), true);

  return query
  update public.applications a
  set status = 'ghosted',
      -- A fresh ghosting gets a fresh draft; an old one would cite stale dates.
      follow_up_subject = null,
      follow_up_draft = null,
      follow_up_drafted_at = null
  where a.status in ('applied', 'screening', 'assessment', 'interview', 'final')
    and a.last_activity_at < now() - make_interval(days => p_days)
    and not exists (select 1 from public.profiles p where p.user_id = a.user_id and p.is_demo)
  returning a.id, a.user_id;
end;
$$;

-- ===========================================================================
-- 5. No avatar uploads from demo accounts
-- ===========================================================================
-- The avatars bucket is public-read, so an upload from the shared demo login
-- would be free public file hosting for anyone. Replaces the 008 policy.

drop policy "Users upload own avatar" on storage.objects;

create policy "Users upload own avatar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.is_demo)
  );
