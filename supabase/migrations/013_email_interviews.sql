-- 013_email_interviews.sql
-- Interview invites found by the email poller become interviews rows, so the
-- dashboard's "Upcoming interviews" fills itself (SPEC "Email intelligence").
--
-- The poller already moves the application to "interview" (005). This adds
-- the round and, when the email states one, the date and time. The date is
-- read in the same LLM call that classifies the email; no extra call.

-- ===========================================================================
-- 1. Where a row came from
-- ===========================================================================

alter table public.interviews
  add column source text not null default 'manual' check (source in ('manual', 'email')),
  add column email_message_id uuid references public.email_messages (id) on delete set null;

comment on column public.interviews.source is
  'manual: added by the user. email: created or last updated from an invite by the email poller.';
comment on column public.interviews.email_message_id is
  'The invite (or reschedule) email this row was last updated from.';

-- ===========================================================================
-- 2. Record an invite
-- ===========================================================================
-- One function so "which round is this?" is decided in one transaction:
--
--   - The email names a round ("second interview"): upsert that round.
--   - It does not, and the application has an interview still ahead (or one
--     with no date yet): this is a confirmation or reschedule of that one,
--     so update it rather than invent a new round.
--   - Otherwise: the next round (1 for the first invite).
--
-- A date in the email replaces the stored one (the latest email is the
-- latest schedule); an email without a date never clears one.
-- Returns the round number.

create or replace function public.record_email_interview(
  p_application_id uuid,
  p_email_message_id uuid,
  p_round smallint default null,
  p_scheduled_at timestamptz default null
)
returns smallint
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_id uuid;
  v_round smallint;
begin
  select a.user_id into v_user_id from public.applications a where a.id = p_application_id;
  if not found then
    raise exception 'application % not found', p_application_id using errcode = 'P0002';
  end if;

  if p_round is not null then
    insert into public.interviews (application_id, user_id, round, scheduled_at, source, email_message_id)
    values (p_application_id, v_user_id, p_round, p_scheduled_at, 'email', p_email_message_id)
    on conflict (application_id, round) do update
      set scheduled_at = coalesce(excluded.scheduled_at, public.interviews.scheduled_at),
          source = 'email',
          email_message_id = excluded.email_message_id;
    return p_round;
  end if;

  -- 12 hours of slack: an invite that arrives on the day of the interview
  -- (a "joining link" email) still belongs to that interview.
  select i.id, i.round into v_id, v_round
  from public.interviews i
  where i.application_id = p_application_id
    and (i.scheduled_at is null or i.scheduled_at > now() - interval '12 hours')
  order by i.round desc
  limit 1;

  if found then
    update public.interviews
    set scheduled_at = coalesce(p_scheduled_at, scheduled_at),
        source = 'email',
        email_message_id = p_email_message_id
    where id = v_id;
    return v_round;
  end if;

  select coalesce(max(i.round), 0) + 1 into v_round
  from public.interviews i
  where i.application_id = p_application_id;

  insert into public.interviews (application_id, user_id, round, scheduled_at, source, email_message_id)
  values (p_application_id, v_user_id, v_round, p_scheduled_at, 'email', p_email_message_id);
  return v_round;
end;
$$;

comment on function public.record_email_interview(uuid, uuid, smallint, timestamptz) is
  'Email poller: creates or updates the interviews row for an invite. Service role only.';

-- Takes any application id, so it must not be callable by signed-in users.
revoke execute on function public.record_email_interview(uuid, uuid, smallint, timestamptz) from public, anon, authenticated;
grant execute on function public.record_email_interview(uuid, uuid, smallint, timestamptz) to service_role;
