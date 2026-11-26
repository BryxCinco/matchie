-- 017_multi_user.sql
-- Invite-only accounts, a shared LLM budget split fairly between users, and
-- self-service account deletion.
--
-- Until now Matchie had one owner: sign-ups were off in Supabase Auth
-- (commit 58d25ba, "sign-in only") and every worker served one
-- MATCHIE_USER_ID. This migration knowingly reverses the sign-in-only rule:
-- the before-user-created auth hook below replaces its reason, because a
-- stranger cannot create an account without an invite code.
--
-- The binding constraint is the free-tier LLM budget (about 50 calls a day
-- for every feature together). consume_llm_quota() is the one gate every
-- LLM call passes, from the app and from the workers:
--   - reserved users (the owner) have their own cap and never touch the
--     shared pool, so invited users cannot crowd the owner out; workers may
--     spend at most 15 of the owner's 25, so email and Paste JD keep 10;
--   - everyone else shares what is left, with a per-user cap, and workers
--     may spend at most part of it, so Paste JD and Analyze always have
--     calls left;
--   - demo accounts are always refused.
-- The owner is marked llm_reserved by hand (README), never here, so no real
-- user id lands in this public repo.
--
-- Design: docs/superpowers/specs/2026-11-26-multi-user-design.md
--
-- Safe to re-run: a first attempt that stopped halfway can be run again
-- (if not exists, create or replace, drop ... if exists before create).

-- ===========================================================================
-- 1. Invite codes and the sign-up hook
-- ===========================================================================

create table if not exists public.invite_codes (
  code        text primary key,
  max_uses    integer not null default 1 check (max_uses > 0),
  used_count  integer not null default 0 check (used_count >= 0),
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

comment on table public.invite_codes is
  'Sign-up invite codes. Created by the owner in the SQL editor; read only by hook_check_invite().';

-- RLS on with no policies: only the service role and security definer
-- functions can read or write codes.
alter table public.invite_codes enable row level security;

-- Supabase Auth "before user created" hook. Enable it in the dashboard:
-- Authentication > Hooks > Before User Created > Postgres > hook_check_invite.
-- The code arrives as options.data.invite_code from auth.signUp().
-- One UPDATE checks and spends a use atomically, so two sign-ups racing for
-- the last use cannot both pass.
create or replace function public.hook_check_invite(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := nullif(btrim(event -> 'user' -> 'user_metadata' ->> 'invite_code'), '');
  v_used text;
begin
  -- The nightly demo reset (workers/seed-demo.ts) creates the demo user with
  -- the service role. app_metadata cannot be set from a client sign-up, so
  -- this is not a way around the code.
  if (event -> 'user' -> 'app_metadata' ->> 'matchie_demo') = 'true' then
    return '{}'::jsonb;
  end if;

  if v_code is not null then
    update public.invite_codes
       set used_count = used_count + 1
     where code = v_code
       and used_count < max_uses
       and (expires_at is null or expires_at > now())
    returning code into v_used;
  end if;

  if v_used is null then
    return jsonb_build_object(
      'error', jsonb_build_object('http_code', 403, 'message', 'That invite code is not valid.')
    );
  end if;
  return '{}'::jsonb;
end;
$$;

revoke execute on function public.hook_check_invite(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_check_invite(jsonb) to supabase_auth_admin;

-- ===========================================================================
-- 2. LLM quota
-- ===========================================================================

alter table public.profiles
  add column if not exists daily_llm_quota integer check (daily_llm_quota >= 0),
  add column if not exists llm_reserved boolean not null default false;

comment on column public.profiles.daily_llm_quota is
  'LLM calls a day for this user; null = the default in consume_llm_quota(). Set only by the service role.';
comment on column public.profiles.llm_reserved is
  'Reserved share of the LLM budget (the owner): own cap only, outside the shared pool. Set only by the service role.';

-- profiles has a "for all" RLS policy (002), so without this any user could
-- give themself a bigger quota or a reserved share. Same pattern as
-- protect_demo_flag() (014).
create or replace function public.protect_llm_quota_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if (tg_op = 'INSERT' and (new.llm_reserved or new.daily_llm_quota is not null))
       or (tg_op = 'UPDATE' and (new.llm_reserved is distinct from old.llm_reserved
                                 or new.daily_llm_quota is distinct from old.daily_llm_quota))
    then
      raise exception 'LLM quota columns can only be changed by the service role'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_llm_quota on public.profiles;
create trigger profiles_protect_llm_quota
  before insert or update on public.profiles
  for each row execute function public.protect_llm_quota_columns();

create table if not exists public.llm_usage (
  user_id       uuid not null references auth.users (id) on delete cascade,
  day           date not null,
  calls         integer not null default 0 check (calls >= 0),
  worker_calls  integer not null default 0 check (worker_calls >= 0),
  primary key (user_id, day)
);

comment on table public.llm_usage is
  'LLM calls per user per day (Asia/Manila). calls is the total; worker_calls the part spent by workers. Written only by consume_llm_quota().';

alter table public.llm_usage enable row level security;

drop policy if exists "Users read own usage" on public.llm_usage;
create policy "Users read own usage" on public.llm_usage
  for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.consume_llm_quota(p_user_id uuid, p_calls integer, p_worker boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_global          constant integer := 45; -- all users, all features, per day
  c_default_quota   constant integer := 8;  -- per invited user
  c_reserved_quota  constant integer := 25; -- per reserved user (the owner)
  c_worker_cap      constant integer := 5;  -- of an invited user's quota, for workers
  c_reserved_worker_cap constant integer := 15; -- of a reserved user's quota, for workers
  v_day             date := (now() at time zone 'Asia/Manila')::date;
  v_demo            boolean;
  v_reserved        boolean;
  v_quota           integer;
  v_calls           integer;
  v_worker_calls    integer;
  v_pool            integer;
  v_pool_used       integer;
begin
  if p_user_id is null or p_calls is null or p_calls < 1 then
    raise exception 'consume_llm_quota: invalid arguments' using errcode = 'invalid_parameter_value';
  end if;

  -- One lock per day: concurrent callers check the totals one at a time, so
  -- two calls at cap - 1 cannot both pass.
  perform pg_advisory_xact_lock(hashtext('llm_usage:' || v_day::text));

  select p.is_demo, p.llm_reserved, p.daily_llm_quota
    into v_demo, v_reserved, v_quota
    from public.profiles p
   where p.user_id = p_user_id;

  if coalesce(v_demo, false) then
    return false;
  end if;
  v_reserved := coalesce(v_reserved, false);
  v_quota := coalesce(v_quota, case when v_reserved then c_reserved_quota else c_default_quota end);

  select u.calls, u.worker_calls
    into v_calls, v_worker_calls
    from public.llm_usage u
   where u.user_id = p_user_id and u.day = v_day;
  v_calls := coalesce(v_calls, 0);
  v_worker_calls := coalesce(v_worker_calls, 0);

  if v_calls + p_calls > v_quota then
    return false;
  end if;

  -- Workers never take a user's whole quota: the rest is for Paste JD,
  -- Analyze and (for the owner) email classification.
  if p_worker and v_worker_calls + p_calls > (case when v_reserved then c_reserved_worker_cap else c_worker_cap end) then
    return false;
  end if;

  if not v_reserved then
    select greatest(c_global - coalesce(sum(coalesce(p.daily_llm_quota, c_reserved_quota)), 0), 0)
      into v_pool
      from public.profiles p
     where p.llm_reserved;

    select coalesce(sum(u.calls), 0)
      into v_pool_used
      from public.llm_usage u
      join public.profiles p on p.user_id = u.user_id
     where u.day = v_day and not p.llm_reserved;

    if v_pool_used + p_calls > v_pool then
      return false;
    end if;
  end if;

  insert into public.llm_usage as u (user_id, day, calls, worker_calls)
  values (p_user_id, v_day, p_calls, case when p_worker then p_calls else 0 end)
  on conflict (user_id, day) do update
    set calls = u.calls + excluded.calls,
        worker_calls = u.worker_calls + excluded.worker_calls;

  return true;
end;
$$;

revoke execute on function public.consume_llm_quota(uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.consume_llm_quota(uuid, integer, boolean) to service_role;

-- The app's entry point: the user id comes from the session, never from the
-- request. Interactive calls are never worker calls.
create or replace function public.consume_my_llm_quota(p_calls integer)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then false
    else public.consume_llm_quota((select auth.uid()), p_calls, false)
  end;
$$;

revoke execute on function public.consume_my_llm_quota(integer) from public, anon, authenticated;
grant execute on function public.consume_my_llm_quota(integer) to authenticated;

-- Interactive calls the signed-in user has left today, for the UI badge.
-- Mirrors consume_llm_quota()'s rules without spending anything.
create or replace function public.my_llm_quota_left()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c_global          constant integer := 45;
  c_default_quota   constant integer := 8;
  c_reserved_quota  constant integer := 25;
  v_uid             uuid := (select auth.uid());
  v_day             date := (now() at time zone 'Asia/Manila')::date;
  v_demo            boolean;
  v_reserved        boolean;
  v_quota           integer;
  v_calls           integer;
  v_pool            integer;
  v_pool_used       integer;
begin
  if v_uid is null then
    return 0;
  end if;

  select p.is_demo, p.llm_reserved, p.daily_llm_quota
    into v_demo, v_reserved, v_quota
    from public.profiles p
   where p.user_id = v_uid;
  if coalesce(v_demo, false) then
    return 0;
  end if;
  v_reserved := coalesce(v_reserved, false);
  v_quota := coalesce(v_quota, case when v_reserved then c_reserved_quota else c_default_quota end);

  select coalesce(sum(u.calls), 0) into v_calls
    from public.llm_usage u
   where u.user_id = v_uid and u.day = v_day;

  if v_reserved then
    return greatest(v_quota - v_calls, 0);
  end if;

  select greatest(c_global - coalesce(sum(coalesce(p.daily_llm_quota, c_reserved_quota)), 0), 0)
    into v_pool
    from public.profiles p
   where p.llm_reserved;

  select coalesce(sum(u.calls), 0) into v_pool_used
    from public.llm_usage u
    join public.profiles p on p.user_id = u.user_id
   where u.day = v_day and not p.llm_reserved;

  return greatest(least(v_quota - v_calls, v_pool - v_pool_used), 0);
end;
$$;

revoke execute on function public.my_llm_quota_left() from public, anon, authenticated;
grant execute on function public.my_llm_quota_left() to authenticated;

-- ===========================================================================
-- 3. Self-service account deletion
-- ===========================================================================
-- Every user table references auth.users (id) on delete cascade (002, and
-- llm_usage above); jobs.created_by is on delete set null. Deleting the
-- auth.users row therefore removes all of the user's rows. Storage objects
-- (avatars) do not cascade; the settings action removes them first.
-- Refused for the demo (shared login) and for reserved users, so the owner
-- cannot delete their account by accident from the UI.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  if exists (
    select 1 from public.profiles p
     where p.user_id = v_uid and (p.is_demo or p.llm_reserved)
  ) then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;

  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
