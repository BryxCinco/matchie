-- 001_extensions_and_enums.sql
-- Extensions and enum types shared by every later migration.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- Supabase convention: extensions live in the `extensions` schema, not public.

-- jobs.geo (geography point) and straight-line distance from home.
create extension if not exists postgis with schema extensions;

-- Fuzzy matching on company names during dedupe and enrichment lookups.
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Tracker status. Stored on applications.status (fast reads) and on
-- application_events.from_status / to_status (history).
create type public.application_status as enum (
  'saved',
  'applied',
  'screening',
  'assessment',
  'interview',
  'final',
  'offer',
  'accepted',
  'rejected',
  'ghosted',
  'withdrawn'
);

-- Who caused a status change: the user, the email classifier, or a worker
-- (e.g. ghosting detection).
create type public.event_source as enum (
  'manual',
  'email',
  'system'
);

create type public.work_setup as enum (
  'onsite',
  'hybrid',
  'remote'
);
