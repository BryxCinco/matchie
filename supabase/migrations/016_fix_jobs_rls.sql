-- 016_fix_jobs_rls.sql
-- A pasted job description is visible only to the user who pasted it.
--
-- 002 let every signed-in user read every jobs row ("Authenticated read
-- jobs", using (true)). That is right for the shared catalog the workers
-- ingest, but it also exposed source = 'manual' rows: each user's pasted JDs,
-- which show which roles and companies they are applying to, and sometimes
-- a recruiter's contact details. With the public demo login (014), anyone
-- could read the owner's pasted jobs through the REST API.
--
-- Nothing depends on reading another user's manual job: the score-job routes
-- and the tracker only touch the caller's own, the shortlist already skips
-- manual jobs, and the workers use the service role, which bypasses RLS.
-- jobs_created_by_idx (003) covers the created_by check.

drop policy "Authenticated read jobs" on public.jobs;

create policy "Authenticated read shared jobs and own pasted jobs" on public.jobs
  for select to authenticated
  using (source <> 'manual' or created_by = (select auth.uid()));
