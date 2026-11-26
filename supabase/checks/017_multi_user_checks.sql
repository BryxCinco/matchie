-- Manual checks for 017_multi_user.sql. Paste into the Supabase SQL editor
-- after applying 017. Everything runs in one transaction that is rolled
-- back, so it leaves no rows behind. Any failed assert aborts with a message;
-- "ROLLBACK" with no error means every check passed.
--
-- Fake users only (ids below). Real profiles are neutralised inside the
-- transaction so they do not change the pool sizes.

begin;

-- Neutralise real data for the duration of the transaction.
update public.profiles set llm_reserved = false, daily_llm_quota = null;
delete from public.llm_usage;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'check-u1@example.invalid'),
  ('00000000-0000-4000-8000-0000000000a2', 'check-u2@example.invalid'),
  ('00000000-0000-4000-8000-0000000000a3', 'check-u3@example.invalid'),
  ('00000000-0000-4000-8000-0000000000b1', 'check-owner@example.invalid'),
  ('00000000-0000-4000-8000-0000000000d1', 'check-demo@example.invalid');

insert into public.profiles (user_id) values
  ('00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-8000-0000000000a3'),
  ('00000000-0000-4000-8000-0000000000b1'),
  ('00000000-0000-4000-8000-0000000000d1')
on conflict (user_id) do nothing;

update public.profiles set llm_reserved = true where user_id = '00000000-0000-4000-8000-0000000000b1';
update public.profiles set is_demo = true where user_id = '00000000-0000-4000-8000-0000000000d1';

-- Quota: own cap, worker cap, shared pool, reserved share, demo.
do $$
declare
  u1 constant uuid := '00000000-0000-4000-8000-0000000000a1';
  u2 constant uuid := '00000000-0000-4000-8000-0000000000a2';
  u3 constant uuid := '00000000-0000-4000-8000-0000000000a3';
  owner_id constant uuid := '00000000-0000-4000-8000-0000000000b1';
  demo constant uuid := '00000000-0000-4000-8000-0000000000d1';
  i integer;
begin
  -- Invited user: 8 calls a day, the 9th is refused.
  for i in 1..8 loop
    assert public.consume_llm_quota(u1, 1, false), format('u1 call %s should pass', i);
  end loop;
  assert not public.consume_llm_quota(u1, 1, false), 'u1 call 9 should be refused (own cap 8)';

  -- Workers stop at 5 of an invited user's calls; interactive still passes.
  for i in 1..5 loop
    assert public.consume_llm_quota(u2, 1, true), format('u2 worker call %s should pass', i);
  end loop;
  assert not public.consume_llm_quota(u2, 1, true), 'u2 worker call 6 should be refused (worker cap 5)';
  assert public.consume_llm_quota(u2, 1, false), 'u2 interactive call after worker cap should pass';

  -- Shared pool = 45 - 25 (one reserved user) = 20. Used so far: 8 + 6 = 14.
  for i in 1..6 loop
    assert public.consume_llm_quota(u3, 1, false), format('u3 call %s should pass (pool not full)', i);
  end loop;
  assert not public.consume_llm_quota(u3, 1, false), 'u3 call 7 should be refused (pool of 20 is full)';

  -- The reserved user is still served with the pool full, up to 25. Workers
  -- may take at most 15 of them, so email and interactive use keep 10.
  for i in 1..15 loop
    assert public.consume_llm_quota(owner_id, 1, true), format('owner worker call %s should pass', i);
  end loop;
  assert not public.consume_llm_quota(owner_id, 1, true), 'owner worker call 16 should be refused (reserved worker cap 15)';
  for i in 1..10 loop
    assert public.consume_llm_quota(owner_id, 1, false), format('owner interactive call %s should pass', i);
  end loop;
  assert not public.consume_llm_quota(owner_id, 1, false), 'owner call 26 should be refused (reserved cap 25)';
  assert (select sum(calls) from public.llm_usage u join public.profiles p using (user_id) where not p.llm_reserved) = 20,
    'reserved calls must not count against the shared pool';

  -- Demo is always refused.
  assert not public.consume_llm_quota(demo, 1, false), 'demo must be refused';

  -- Bad arguments raise.
  begin
    perform public.consume_llm_quota(u1, 0, false);
    raise exception 'p_calls = 0 should raise';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

-- What the badge shows, as each user.
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);
  assert public.my_llm_quota_left() = 0, 'u3 has own calls left but the pool is full: 0';
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
  assert public.my_llm_quota_left() = 0, 'owner used all 25: 0';
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
  assert public.my_llm_quota_left() = 0, 'demo: 0';
  assert not public.consume_my_llm_quota(1), 'demo via the app wrapper must be refused';
end;
$$;

-- Users cannot raise their own quota or mark themselves reserved.
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  set local role authenticated;
  begin
    update public.profiles set llm_reserved = true where user_id = '00000000-0000-4000-8000-0000000000a1';
    raise exception 'user set llm_reserved on themself';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set daily_llm_quota = 999 where user_id = '00000000-0000-4000-8000-0000000000a1';
    raise exception 'user raised their own daily_llm_quota';
  exception when insufficient_privilege then null;
  end;
  reset role;
end;
$$;

-- Invite hook: a code works until it is used up; expired and unknown fail.
insert into public.invite_codes (code, max_uses) values ('CHECK-ONCE', 1);
insert into public.invite_codes (code, max_uses, expires_at) values ('CHECK-EXPIRED', 5, now() - interval '1 day');
do $$
begin
  assert public.hook_check_invite('{"user":{"user_metadata":{"invite_code":" CHECK-ONCE "}}}') = '{}'::jsonb,
    'valid code (with spaces) should pass';
  assert public.hook_check_invite('{"user":{"user_metadata":{"invite_code":"CHECK-ONCE"}}}') ? 'error',
    'used-up code should fail';
  assert public.hook_check_invite('{"user":{"user_metadata":{"invite_code":"CHECK-EXPIRED"}}}') ? 'error',
    'expired code should fail';
  assert public.hook_check_invite('{"user":{"user_metadata":{"invite_code":"NOPE"}}}') ? 'error',
    'unknown code should fail';
  assert public.hook_check_invite('{"user":{"user_metadata":{}}}') ? 'error',
    'missing code should fail';
  -- The nightly demo reset creates the demo user with the service role, which
  -- alone can set app_metadata.
  assert public.hook_check_invite('{"user":{"user_metadata":{},"app_metadata":{"matchie_demo":true}}}') = '{}'::jsonb,
    'the demo user created by seed-demo should pass without a code';
  assert public.hook_check_invite('{"user":{"user_metadata":{"matchie_demo":true}}}') ? 'error',
    'user_metadata (client-settable) must not bypass the code';
  assert (select used_count from public.invite_codes where code = 'CHECK-ONCE') = 1,
    'a valid sign-up spends exactly one use';
end;
$$;

-- Account deletion: refused for reserved and demo; removes the caller only.
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
  begin
    perform public.delete_my_account();
    raise exception 'reserved user deleted themself';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
  begin
    perform public.delete_my_account();
    raise exception 'demo user deleted themself';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  perform public.delete_my_account();
  assert not exists (select 1 from auth.users where id = '00000000-0000-4000-8000-0000000000a1'), 'u1 should be gone';
  assert not exists (select 1 from public.profiles where user_id = '00000000-0000-4000-8000-0000000000a1'), 'u1 profile should cascade';
  assert not exists (select 1 from public.llm_usage where user_id = '00000000-0000-4000-8000-0000000000a1'), 'u1 usage should cascade';
  assert exists (select 1 from auth.users where id = '00000000-0000-4000-8000-0000000000a2'), 'u2 must be untouched';
end;
$$;

rollback;
