-- 015_close_event_inserts.sql
-- Only the status trigger may write application_events.
--
-- 002 gave signed-in users an insert policy on application_events, because
-- log_application_status() ran as the caller and a manual move on the board
-- inserts the event as that user. The same policy let any signed-in user
-- insert events directly through PostgREST, with any status and any
-- created_at, skipping the trigger. Analytics read only this table, so a
-- forged row is a forged funnel. With the public demo login (014), anyone
-- can do it.
--
-- Fix: drop the policy, and run the trigger function as its owner (security
-- definer), so it can still insert past RLS. It is safe to elevate:
--   - it only fires as a trigger on applications, whose own RLS policy has
--     already checked that new.user_id is the caller;
--   - every value it writes comes from that row or from the matchie.event_*
--     settings, which only SQL functions can set (PostgREST does not expose
--     set_config);
--   - trigger functions cannot be called as an RPC.
-- Users keep read access to their own events ("Users read own events").

drop policy "Users insert own events" on public.application_events;

-- Same body as 014; only `security definer` is new.
create or replace function public.log_application_status()
returns trigger
language plpgsql
security definer
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

-- Supabase grants EXECUTE on new public functions to anon and authenticated.
-- A trigger does not need the caller to hold it, so take it away.
revoke execute on function public.log_application_status() from public, anon, authenticated;
