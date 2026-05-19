-- ============================================================
-- Drop the old 5-param search_jobs_public overload.
-- ============================================================
-- The E7.4 migration (jobs_radius_search) added near_lat/near_lng/within_miles
-- as new optional params. PostgreSQL's CREATE OR REPLACE FUNCTION only
-- replaces when the parameter signature matches exactly — adding new
-- params creates a NEW function alongside the old one, not a replacement.
--
-- Result: two overloads of search_jobs_public coexisted briefly, and any
-- RPC call from the app matched both (since the app sends 5 named args
-- and both overloads accept those 5). PostgREST returned an
-- "ambiguous function" error and /jobs rendered "No jobs found" across
-- the board.
--
-- Fix: drop the old 5-param version explicitly. Only the new 8-param
-- version remains. The drop is signature-specific so it cannot
-- accidentally remove the new version.
--
-- Learning for next session: when adding params to an existing RPC,
-- include a `DROP FUNCTION IF EXISTS public.foo(<old signature>);` at
-- the TOP of the new migration so this never happens again.
-- ============================================================

drop function if exists public.search_jobs_public(
  text,
  text,
  employment_type,
  role_category,
  integer
);
