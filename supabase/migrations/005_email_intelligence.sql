-- 005_email_intelligence.sql
-- Support for the email poller (workers/email-poller.ts): dedupe inbound mail,
-- keep the classifier's verdict, and apply email-driven status changes with
-- source = 'email' on the resulting application_events row.

-- ===========================================================================
-- 1. email_messages: dedupe key and classifier output
-- ===========================================================================

alter table public.email_messages
  add column message_id text,
  add column classification_confidence smallint
    check (classification_confidence between 0 and 100),
  add column classification_reasoning text;

comment on column public.email_messages.message_id is
  'RFC 5322 Message-ID. The poller re-reads a time window on every run; this stops a message being stored, classified (an LLM call) or applied twice.';
comment on column public.email_messages.classification_confidence is
  '0-100 from the classifier. Status changes are applied only above the poller''s threshold.';
comment on column public.email_messages.classification_reasoning is
  'One-sentence explanation from the classifier, for reviewing its decisions.';

create unique index email_messages_user_message_id_key
  on public.email_messages (user_id, message_id)
  where message_id is not null;

-- ===========================================================================
-- 2. Events record which email caused them
-- ===========================================================================
-- Replaces the 004 version: also reads matchie.event_email_message_id, so an
-- email-driven event points at its email_messages row.

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
begin
  if tg_op = 'INSERT' then
    insert into public.application_events (application_id, user_id, from_status, to_status, source, note, email_message_id)
    values (new.id, new.user_id, null, new.status, v_source, v_note, v_email_id);
  elsif new.status is distinct from old.status then
    insert into public.application_events (application_id, user_id, from_status, to_status, source, note, email_message_id)
    values (new.id, new.user_id, old.status, new.status, v_source, v_note, v_email_id);
  end if;
  return null;
end;
$$;

-- ===========================================================================
-- 3. Apply an email to an application, in one transaction
-- ===========================================================================
-- Why a function: set_config(..., true) lasts until the end of the current
-- transaction, and every PostgREST request is its own transaction. Calling
-- set_config and then updating in two requests would lose the setting, and
-- the event would be logged as 'manual'. Here both happen in one call.
--
-- p_to_status null: the email is linked but changes nothing (e.g. a second
-- interview invite). last_activity_at is still bumped, because a reply from
-- the company means the application is not ghosted.
--
-- Deciding *whether* to change status (confidence threshold, never moving
-- backwards) is done by the caller; see statusFromClassification() in
-- lib/email-classifier.ts.

create or replace function public.apply_email_to_application(
  p_application_id uuid,
  p_email_message_id uuid,
  p_to_status public.application_status default null,
  p_note text default null
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('matchie.event_source', 'email', true);
  perform set_config('matchie.event_note', coalesce(p_note, ''), true);
  perform set_config('matchie.event_email_message_id', p_email_message_id::text, true);

  update public.applications
  set status = coalesce(p_to_status, status),
      last_activity_at = now()
  where id = p_application_id;

  if not found then
    raise exception 'application % not found', p_application_id using errcode = 'P0002';
  end if;
end;
$$;

-- Service role only (the poller). A signed-in user calling this could mark
-- their own events as source = 'email'.
revoke execute on function public.apply_email_to_application(uuid, uuid, public.application_status, text)
  from public, anon, authenticated;
grant execute on function public.apply_email_to_application(uuid, uuid, public.application_status, text)
  to service_role;
