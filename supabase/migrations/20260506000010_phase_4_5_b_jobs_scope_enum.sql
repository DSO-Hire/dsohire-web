-- Phase 4.5.b — locked Q3 decision: jobs.scope enum.
--
-- A job's `scope` controls who in the DSO can see it:
--   location  (default) — HMs see ONLY if tagged on at least one of the
--                         job's job_locations rows (existing behavior)
--   regional             — HMs see regardless of location tagging; meant
--                         for cross-practice/multi-location roles where
--                         any qualifying HM can staff
--   corporate            — same as regional in v1; reserved as the
--                         semantic distinction when we ship region-level
--                         grouping later
--
-- Owner / admin / recruiter always see every job in their DSO regardless
-- of scope (their role bypass is unchanged).
--
-- This is a NEW enum (not an extension), so the two-transaction rule
-- (feedback_postgres_enum_two_transactions.md) doesn't apply. The CHECK
-- runs in a single transaction.

CREATE TYPE public.job_scope AS ENUM ('location', 'regional', 'corporate');

ALTER TABLE public.jobs
  ADD COLUMN scope public.job_scope NOT NULL DEFAULT 'location';

COMMENT ON COLUMN public.jobs.scope IS
  'Controls HM visibility. location = HMs gated by job_locations overlap with their dso_user_locations; regional/corporate = HMs see regardless of location tagging. Owner/admin/recruiter always see all jobs in their DSO.';
