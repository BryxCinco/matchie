-- 011_shortlist_seniority.sql
-- Seniority rule for the shortlist: a user with under 3 years of experience
-- never sees Senior, Lead, Staff, Principal, Manager, Director or Head roles.
--
-- Why: the years rule (006) only works when the posting states its years,
-- and most ATS postings do not. On the first full run for an entry-level
-- profile, half of the 30 scoring calls went to senior and management roles
-- that all scored 0-15: budget spent on jobs a free SQL check can drop.
--
-- The rule reads the title only. "Sr" is included as the common short form
-- of Senior. Word boundaries (\m \M) keep "Headless" or "Staffing" in. A
-- null years_experience counts as 0, as in the years rule.
--
-- Same signature as 006, so shortlist_my_jobs() (007) picks this up. Only
-- the new "and" clause differs from 006.

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
    -- New in 011: senior and management titles need 3+ years.
    and (
      coalesce(s.years_experience, 0) >= 3
      or j.title !~* '\m(senior|sr|lead|staff|principal|manager|director|head)\M'
    )
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
  'Pipeline stages 3-4: rules filter (incl. seniority, 011) + full-text shortlist of unscored jobs for one user. Service role only.';

-- create or replace keeps the existing grants; restated so this file alone
-- says who may call it.
revoke execute on function public.shortlist_jobs(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.shortlist_jobs(uuid, integer, integer) to service_role;
