-- 007_shortlist_my_jobs.sql
-- The Discover page's "Unscored" tab: the signed-in user's own shortlist.
--
-- shortlist_jobs() (006) takes any user id, so it is service role only. This
-- wrapper takes no user id: it always uses auth.uid(), so a user can only
-- ever see their own shortlist. It runs as the function owner (security
-- definer) only to be allowed to call shortlist_jobs(); everything it returns
-- is jobs data that authenticated users can already read under RLS.

create or replace function public.shortlist_my_jobs(p_limit integer default 30)
returns table (job_id uuid, rank real)
language sql
stable
security definer
set search_path = ''
as $$
  select s.job_id, s.rank
  from public.shortlist_jobs((select auth.uid()), least(greatest(p_limit, 0), 100)) s
  where (select auth.uid()) is not null;
$$;

comment on function public.shortlist_my_jobs(integer) is
  'Rules filter + full-text shortlist for the signed-in user (auth.uid()). At most 100 rows.';

revoke execute on function public.shortlist_my_jobs(integer) from public, anon;
grant execute on function public.shortlist_my_jobs(integer) to authenticated;
