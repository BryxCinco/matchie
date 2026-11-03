-- 004_application_status_events.sql
-- Every application status change writes an application_events row, enforced
-- by triggers so no code path (app, email worker, ghosting job) can skip it.
-- The status update and its event commit in the same transaction.

-- ===========================================================================
-- 1. Keep last_activity_at and applied_at in step with status
-- ===========================================================================
-- BEFORE trigger: adjusts the row being written.
--   - last_activity_at: any status change counts as activity, which is what
--     ghosting detection measures.
--   - applied_at: set the first time the application moves past "saved".
--     Withdrawing a saved job does not count as applying.

create or replace function public.touch_application_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.last_activity_at := now();
    if new.applied_at is null and new.status not in ('saved', 'withdrawn') then
      new.applied_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger applications_touch_status
  before insert or update of status on public.applications
  for each row execute function public.touch_application_status();

-- ===========================================================================
-- 2. Log every status change to application_events
-- ===========================================================================
-- AFTER trigger: the application row exists, so the composite FK on
-- application_events (application_id, user_id) is satisfied.
--
-- source and note default to 'manual' and null. A worker that changes status
-- on someone's behalf sets them first, in the same transaction:
--   select set_config('matchie.event_source', 'email', true);
--   select set_config('matchie.event_note', 'Rejection email from Acme', true);
-- The third argument (true) scopes the setting to the transaction. Users
-- cannot set these: PostgREST does not expose set_config.
--
-- security invoker (the default): a signed-in user's insert passes the
-- "Users insert own events" RLS policy because new.user_id is their own id.

create or replace function public.log_application_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_source public.event_source :=
    coalesce(nullif(current_setting('matchie.event_source', true), ''), 'manual')::public.event_source;
  v_note text := nullif(current_setting('matchie.event_note', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.application_events (application_id, user_id, from_status, to_status, source, note)
    values (new.id, new.user_id, null, new.status, v_source, v_note);
  elsif new.status is distinct from old.status then
    insert into public.application_events (application_id, user_id, from_status, to_status, source, note)
    values (new.id, new.user_id, old.status, new.status, v_source, v_note);
  end if;
  return null;  -- AFTER trigger: return value is ignored
end;
$$;

create trigger applications_log_status
  after insert or update of status on public.applications
  for each row execute function public.log_application_status();
