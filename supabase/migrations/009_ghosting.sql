-- 009_ghosting.sql
-- Ghosting detection (SPEC "Email intelligence"): no reply after 14 days
-- flips an application to ghosted and offers a follow-up draft.
--
-- "Reply" means any activity: last_activity_at moves on every status change
-- (004) and on every email linked to the application (005), so 14 quiet days
-- really are 14 days without a word from the company.

-- ===========================================================================
-- 1. Follow-up draft
-- ===========================================================================
-- Stored, not generated on the fly: drafting is an LLM call, and the tracker
-- should open the draft instantly without spending the token budget again.

alter table public.applications
  add column follow_up_subject text,
  add column follow_up_draft text,
  add column follow_up_drafted_at timestamptz;

comment on column public.applications.follow_up_draft is
  'Follow-up email body drafted when the application was marked ghosted. Written by workers/ghosting-checker.ts.';

-- The checker's two queries: open applications gone quiet, and ghosted ones
-- still waiting for a draft.
create index applications_ghosting_idx
  on public.applications (last_activity_at)
  where status in ('applied', 'screening', 'assessment', 'interview', 'final');

create index applications_needs_draft_idx
  on public.applications (user_id)
  where status = 'ghosted' and follow_up_draft is null;

-- ===========================================================================
-- 2. Mark ghosted applications, in one transaction
-- ===========================================================================
-- Statuses that wait on the company. Not "saved" (never sent), not "offer"
-- (the company is waiting on the candidate), not the closed ones.
--
-- source = 'system' on the resulting application_events rows: set_config and
-- the update must share a transaction, so this is a function (see 005).
-- Returns the ghosted rows so the worker can draft follow-ups for them.

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
  returning a.id, a.user_id;
end;
$$;

comment on function public.mark_ghosted_applications(integer) is
  'Flips open applications with no activity for p_days to ghosted (event source = system). Service role only.';

-- Touches every user's applications, so only the worker may call it.
revoke execute on function public.mark_ghosted_applications(integer) from public, anon, authenticated;
grant execute on function public.mark_ghosted_applications(integer) to service_role;
