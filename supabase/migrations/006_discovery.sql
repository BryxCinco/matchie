-- 006_discovery.sql
-- Automated discovery (SPEC "The matching pipeline"):
--   ingest (workers/ats-poller.ts) -> rules filter + full-text shortlist
--   (shortlist_jobs, below) -> LLM scoring (workers/score-matches.ts)
--   -> daily digest (workers/digest.ts).

-- ===========================================================================
-- 1. Digest bookkeeping
-- ===========================================================================
-- A timestamp, not a boolean: it records when, so "what did yesterday's digest
-- contain" stays answerable, and null still means "not sent yet".

alter table public.matches
  add column digest_sent_at timestamptz;

comment on column public.matches.digest_sent_at is
  'When this match went out in the daily digest. Null = not sent yet. Each match is sent at most once.';

-- The digest query: a user's best unsent matches.
create index matches_digest_pending_idx
  on public.matches (user_id, fit_score desc)
  where digest_sent_at is null;

-- ===========================================================================
-- 2. ATS poll health
-- ===========================================================================

alter table public.ats_companies
  add column last_error text;

comment on column public.ats_companies.last_error is
  'Why the last poll failed (e.g. HTTP 404: wrong board_token), or null if it succeeded.';

-- ===========================================================================
-- 3. Shortlist: rules filter + full-text ranking, in one query
-- ===========================================================================
-- Stages 3 and 4 of the pipeline. Both are free; everything this returns
-- costs one LLM call in the scoring worker, so it is deliberately strict.
--
-- Candidates are jobs that:
--   - came from a worker (not someone's pasted JD),
--   - are still listed (a job_sources sighting in the last p_live_days),
--   - the user has not scored or saved yet.
-- Rules filter (a null on the job side passes: most ATS postings omit salary,
-- geo and years, and a missing value is not a mismatch):
--   - work setup is one the user accepts (empty list = any),
--   - salary_max reaches the user's floor,
--   - experience_min_years is at most the user's years + 1 (a stretch is fine),
--   - within max_commute_km of home, unless remote,
--   - company industry not in avoid_industries.
-- Full-text: the job must match at least one target role or skill; ranked by
-- ts_rank_cd, so title matches (weight A) beat description matches (B).

create or replace function public.shortlist_jobs(
  p_user_id uuid,
  p_limit integer default 30,
  p_live_days integer default 3
)
returns table (job_id uuid, rank real)
language sql
stable
set search_path = ''
as $$
  with seeker as (
    select
      sp.work_setup,
      sp.min_salary,
      sp.years_experience,
      sp.max_commute_km,
      array(select lower(i) from unnest(sp.avoid_industries) i) as avoid_industries,
      p.home_lat,
      p.home_lng,
      -- "frontend developer" or "react" or "postgresql" ...: roles as phrases.
      websearch_to_tsquery(
        'english',
        array_to_string(
          array(
            select '"' || replace(term, '"', '') || '"'
            from unnest(sp.target_roles || sp.skills) term
            where btrim(term) <> ''
          ),
          ' or '
        )
      ) as query
    from public.seeker_profiles sp
    left join public.profiles p on p.user_id = sp.user_id
    where sp.user_id = p_user_id
  )
  select j.id, ts_rank_cd(j.search_vector, s.query) as rank
  from public.jobs j
  cross join seeker s
  left join public.companies c on c.id = j.company_id
  where j.source <> 'manual'
    and s.query is not null
    and j.search_vector @@ s.query
    and exists (
      select 1 from public.job_sources src
      where src.job_id = j.id and src.seen_at > now() - make_interval(days => p_live_days)
    )
    and not exists (select 1 from public.matches m where m.job_id = j.id and m.user_id = p_user_id)
    and not exists (select 1 from public.applications a where a.job_id = j.id and a.user_id = p_user_id)
    and (cardinality(s.work_setup) = 0 or j.work_setup is null or j.work_setup = any (s.work_setup))
    and (s.min_salary is null or j.salary_max is null or j.salary_max >= s.min_salary)
    and (j.experience_min_years is null or j.experience_min_years <= coalesce(s.years_experience, 0) + 1)
    and (c.industry is null or not (lower(c.industry) = any (s.avoid_industries)))
    and (
      s.max_commute_km is null or s.home_lat is null or j.geo is null or j.work_setup = 'remote'
      or extensions.st_dwithin(
        j.geo,
        extensions.st_setsrid(extensions.st_makepoint(s.home_lng, s.home_lat), 4326)::extensions.geography,
        s.max_commute_km * 1000
      )
    )
  order by rank desc, j.created_at desc
  limit greatest(p_limit, 0);
$$;

comment on function public.shortlist_jobs(uuid, integer, integer) is
  'Pipeline stages 3-4: rules filter + full-text shortlist of unscored jobs for one user. Service role only.';

-- Takes any user id, so it must not be callable by signed-in users.
revoke execute on function public.shortlist_jobs(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.shortlist_jobs(uuid, integer, integer) to service_role;
