-- 012_resume_skills_search.sql
-- Makes the shortlist search with everything the user has told Matchie, not
-- only the five skills typed into the profile form:
--
--   1. Resume skills and past role titles join the search, next to the
--      profile's target roles and skills. Soft skills ("communication",
--      "teamwork") are dropped first: nearly every JD mentions them, so they
--      would let any job through.
--   2. Alternatives: each term is expanded with related terms from
--      search_vocabulary ("IT Support" also finds "Help Desk" and "Service
--      Desk"; "React" also finds "ReactJS").
--   3. Ranking: target roles beat skills, and title matches beat matches
--      found only in the description.
--   4. Location: seeker_profiles gets home_city and preferred_locations.
--      Jobs in a preferred location rank higher. The ATS poller also keeps
--      postings in those places (lib/ats.ts), not only PH and open remote.
--
-- Rules filter (006) and the seniority rule (011) are unchanged.

-- ===========================================================================
-- 1. Location preferences
-- ===========================================================================

alter table public.seeker_profiles
  add column home_city text check (char_length(home_city) <= 120),
  add column preferred_locations text[] not null default '{}';

comment on column public.seeker_profiles.home_city is
  'City only (e.g. "Quezon City"), never a street address: it is sent to the LLM as part of the candidate block.';
comment on column public.seeker_profiles.preferred_locations is
  'Cities or countries the seeker wants to work in. Ranks matching jobs higher, and the ATS poller keeps postings there.';

-- ===========================================================================
-- 2. Search vocabulary: alternatives and soft skills
-- ===========================================================================
-- Terms are lower case. Terms that share an alias_group stand in for each
-- other in the search. soft = true marks a term that is never searched.
-- Add rows in a later migration; the shortlist reads this table every run.

create table public.search_vocabulary (
  term         text primary key check (term = lower(btrim(term)) and term <> ''),
  alias_group  text,
  soft         boolean not null default false,
  check (alias_group is not null or soft)
);

comment on table public.search_vocabulary is
  'Shortlist search terms: alias groups (related roles and skill spellings) and soft skills to ignore. Read by shortlist_jobs().';

-- Only shortlist_jobs() reads it (as the service role, or as the owner via
-- shortlist_my_jobs). No policies: signed-in users have no direct access.
alter table public.search_vocabulary enable row level security;
revoke all on public.search_vocabulary from anon, authenticated;

insert into public.search_vocabulary (term, alias_group) values
  -- Related roles
  ('frontend developer', 'role:frontend'), ('front-end developer', 'role:frontend'), ('front end developer', 'role:frontend'),
  ('frontend engineer', 'role:frontend'), ('front-end engineer', 'role:frontend'), ('ui developer', 'role:frontend'),
  ('ui engineer', 'role:frontend'), ('react developer', 'role:frontend'), ('web developer', 'role:frontend'),

  ('backend developer', 'role:backend'), ('back-end developer', 'role:backend'), ('back end developer', 'role:backend'),
  ('backend engineer', 'role:backend'), ('back-end engineer', 'role:backend'), ('api developer', 'role:backend'),

  ('full stack developer', 'role:fullstack'), ('full-stack developer', 'role:fullstack'), ('fullstack developer', 'role:fullstack'),
  ('full stack engineer', 'role:fullstack'), ('full-stack engineer', 'role:fullstack'), ('fullstack engineer', 'role:fullstack'),

  ('software engineer', 'role:software'), ('software developer', 'role:software'), ('application developer', 'role:software'),
  ('programmer', 'role:software'),

  ('it support', 'role:it-support'), ('it help desk', 'role:it-support'), ('help desk', 'role:it-support'),
  ('helpdesk', 'role:it-support'), ('service desk', 'role:it-support'), ('technical support', 'role:it-support'),
  ('desktop support', 'role:it-support'), ('it support specialist', 'role:it-support'), ('it technician', 'role:it-support'),
  ('support engineer', 'role:it-support'), ('technical support engineer', 'role:it-support'),

  ('system administrator', 'role:sysadmin'), ('systems administrator', 'role:sysadmin'), ('sysadmin', 'role:sysadmin'),
  ('it administrator', 'role:sysadmin'), ('network administrator', 'role:sysadmin'),

  ('qa engineer', 'role:qa'), ('quality assurance', 'role:qa'), ('software tester', 'role:qa'),
  ('test engineer', 'role:qa'), ('qa tester', 'role:qa'),

  ('devops engineer', 'role:devops'), ('site reliability engineer', 'role:devops'), ('platform engineer', 'role:devops'),
  ('cloud engineer', 'role:devops'),

  ('data analyst', 'role:data-analyst'), ('business intelligence analyst', 'role:data-analyst'), ('bi analyst', 'role:data-analyst'),
  ('reporting analyst', 'role:data-analyst'),

  ('data engineer', 'role:data-engineer'), ('etl developer', 'role:data-engineer'), ('analytics engineer', 'role:data-engineer'),

  ('mobile developer', 'role:mobile'), ('android developer', 'role:mobile'), ('ios developer', 'role:mobile'),
  ('flutter developer', 'role:mobile'), ('react native developer', 'role:mobile'),

  ('ui/ux designer', 'role:design'), ('ux designer', 'role:design'), ('ui designer', 'role:design'),
  ('product designer', 'role:design'), ('web designer', 'role:design'),

  -- Spellings of the same skill
  ('react', 'skill:react'), ('reactjs', 'skill:react'), ('react.js', 'skill:react'),
  ('javascript', 'skill:js'), ('js', 'skill:js'), ('ecmascript', 'skill:js'),
  ('node', 'skill:node'), ('nodejs', 'skill:node'), ('node.js', 'skill:node'),
  ('next.js', 'skill:next'), ('nextjs', 'skill:next'),
  ('vue', 'skill:vue'), ('vuejs', 'skill:vue'), ('vue.js', 'skill:vue'),
  ('angular', 'skill:angular'), ('angularjs', 'skill:angular'),
  ('postgresql', 'skill:postgres'), ('postgres', 'skill:postgres'),
  ('html', 'skill:html'), ('html5', 'skill:html'),
  ('css', 'skill:css'), ('css3', 'skill:css'),
  ('tailwind', 'skill:tailwind'), ('tailwind css', 'skill:tailwind'), ('tailwindcss', 'skill:tailwind'),
  ('kubernetes', 'skill:k8s'), ('k8s', 'skill:k8s'),
  ('aws', 'skill:aws'), ('amazon web services', 'skill:aws'),
  ('gcp', 'skill:gcp'), ('google cloud', 'skill:gcp'), ('google cloud platform', 'skill:gcp'),
  ('azure', 'skill:azure'), ('microsoft azure', 'skill:azure'),
  ('ci/cd', 'skill:cicd'), ('continuous integration', 'skill:cicd'),
  ('rest api', 'skill:rest'), ('rest apis', 'skill:rest'), ('restful api', 'skill:rest'), ('restful apis', 'skill:rest'),
  ('active directory', 'skill:ad'), ('microsoft active directory', 'skill:ad'),
  ('troubleshooting', 'skill:troubleshooting'), ('technical troubleshooting', 'skill:troubleshooting');

insert into public.search_vocabulary (term, soft) values
  ('communication', true), ('communication skills', true), ('verbal communication', true), ('written communication', true),
  ('teamwork', true), ('team player', true), ('collaboration', true), ('leadership', true),
  ('problem solving', true), ('problem-solving', true), ('critical thinking', true), ('analytical thinking', true),
  ('time management', true), ('adaptability', true), ('flexibility', true), ('creativity', true),
  ('attention to detail', true), ('detail-oriented', true), ('work ethic', true), ('hardworking', true),
  ('interpersonal skills', true), ('organization', true), ('organizational skills', true), ('multitasking', true),
  ('self-motivated', true), ('fast learner', true), ('quick learner', true), ('decision making', true),
  ('conflict resolution', true), ('emotional intelligence', true), ('public speaking', true), ('presentation skills', true),
  ('negotiation', true), ('customer focus', true), ('english', true), ('filipino', true), ('tagalog', true);

-- ===========================================================================
-- 3. Shortlist
-- ===========================================================================
-- Same signature as 006/011, so shortlist_my_jobs() (007) picks this up.
--
-- Search terms, all lower-cased and capped at 80 characters:
--   role:  target_roles, plus the titles of past roles on the resume
--   skill: profile skills, plus resume skills
-- Soft skills are removed, then every term is expanded with its alias group.
--
-- Rank (higher is better):
--   + 4    a role term is in the job title
--   + 1.5  a skill term is in the job title
--   + 2 x  ts_rank_cd for role terms   (title A beats description B)
--   + 1 x  ts_rank_cd for skill terms
--   + 1    the job location names a preferred location

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
      sp.target_roles,
      sp.skills,
      sp.work_setup,
      sp.min_salary,
      sp.years_experience,
      sp.max_commute_km,
      array(select lower(i) from unnest(sp.avoid_industries) i) as avoid_industries,
      array(
        select lower(btrim(l)) from unnest(sp.preferred_locations) l where btrim(l) <> ''
      ) as preferred_locations,
      p.home_lat,
      p.home_lng,
      r.content as resume
    from public.seeker_profiles sp
    left join public.profiles p on p.user_id = sp.user_id
    left join public.resumes r on r.user_id = sp.user_id and r.is_master
    where sp.user_id = p_user_id
  ),
  raw_terms as (
    select 'role' as kind, t as term from seeker s, unnest(s.target_roles) t
    union all
    select 'role', e ->> 'title'
    from seeker s,
      jsonb_array_elements(case when jsonb_typeof(s.resume -> 'experience') = 'array' then s.resume -> 'experience' else '[]'::jsonb end) e
    union all
    select 'skill', t from seeker s, unnest(s.skills) t
    union all
    select 'skill', t
    from seeker s,
      jsonb_array_elements_text(case when jsonb_typeof(s.resume -> 'skills') = 'array' then s.resume -> 'skills' else '[]'::jsonb end) t
  ),
  terms as (
    select distinct rt.kind, lower(btrim(rt.term)) as term
    from raw_terms rt
    where btrim(coalesce(rt.term, '')) <> ''
      -- Longer "terms" are sentences a parser put in the wrong field.
      and char_length(btrim(rt.term)) <= 80
      and not exists (
        select 1 from public.search_vocabulary v where v.term = lower(btrim(rt.term)) and v.soft
      )
  ),
  expanded as (
    select kind, term from terms
    union
    select t.kind, alt.term
    from terms t
    join public.search_vocabulary v on v.term = t.term and v.alias_group is not null
    join public.search_vocabulary alt on alt.alias_group = v.alias_group and not alt.soft
  ),
  queries as (
    -- "frontend developer" or "react" or ...: every term as a phrase.
    -- string_agg over no rows is null, so a missing kind matches nothing.
    select
      (select websearch_to_tsquery('english', string_agg('"' || replace(term, '"', '') || '"', ' or '))
       from expanded where kind = 'role') as roles,
      (select websearch_to_tsquery('english', string_agg('"' || replace(term, '"', '') || '"', ' or '))
       from expanded where kind = 'skill') as skills
  )
  select
    j.id,
    (
      case when ts_filter(j.search_vector, '{a}') @@ q.roles then 4 else 0 end
      + case when ts_filter(j.search_vector, '{a}') @@ q.skills then 1.5 else 0 end
      + 2 * coalesce(ts_rank_cd(j.search_vector, q.roles), 0)
      + coalesce(ts_rank_cd(j.search_vector, q.skills), 0)
      + case
          when j.location is not null
            and exists (select 1 from unnest(s.preferred_locations) l where strpos(lower(j.location), l) > 0)
          then 1 else 0
        end
    )::real as rank
  from public.jobs j
  cross join seeker s
  cross join queries q
  left join public.companies c on c.id = j.company_id
  where j.source <> 'manual'
    and (coalesce(j.search_vector @@ q.roles, false) or coalesce(j.search_vector @@ q.skills, false))
    and exists (
      select 1 from public.job_sources src
      where src.job_id = j.id and src.seen_at > now() - make_interval(days => p_live_days)
    )
    and not exists (select 1 from public.matches m where m.job_id = j.id and m.user_id = p_user_id)
    and not exists (select 1 from public.applications a where a.job_id = j.id and a.user_id = p_user_id)
    and (cardinality(s.work_setup) = 0 or j.work_setup is null or j.work_setup = any (s.work_setup))
    and (s.min_salary is null or j.salary_max is null or j.salary_max >= s.min_salary)
    and (j.experience_min_years is null or j.experience_min_years <= coalesce(s.years_experience, 0) + 1)
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
  'Pipeline stages 3-4: rules filter + full-text shortlist of unscored jobs for one user, searching profile and resume terms with aliases (012). Service role only.';

revoke execute on function public.shortlist_jobs(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.shortlist_jobs(uuid, integer, integer) to service_role;
