-- ─────────────────────────────────────────────────────────────────────────
-- 20260505000005_fix_jobs_rls_recursion.sql
--
-- Hotfix for "infinite recursion detected in policy for relation 'jobs'"
-- which surfaced 2026-05-05 PM the moment Cam tried to post a new job.
--
-- Root cause:
--   The Phase 2 HM RLS migration (20260505000003) wrote two policies that
--   cross-reference each other:
--
--     - "Jobs: members read own DSO" on public.jobs
--         exists (select 1 from public.job_locations where ...)
--
--     - "Job locations: members read own" on public.job_locations
--         exists (select 1 from public.jobs where ...)
--
--   When inserting a new job, the RETURNING clause needs to evaluate
--   the SELECT policy on jobs. That policy queries job_locations, which
--   triggers the SELECT policy on job_locations, which queries jobs back.
--   Postgres detects the cycle and aborts with 42P17.
--
-- Fix:
--   Wrap the cross-table reads in SECURITY DEFINER helpers so they bypass
--   RLS on the inner tables. Two helpers do the work — one already exists
--   (`user_can_access_job(uuid)`), and one new one for the location-set
--   check (`job_has_accessible_location(uuid)`).
--
-- Both helpers are owned by the supabase admin role (created with
-- security definer) so their internal SELECTs run unrestricted; the policy
-- still gates by current_dso_id() / current_dso_user_role() / accessible
-- locations, so end-user scope is unchanged.
-- ─────────────────────────────────────────────────────────────────────────

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1. New SECURITY DEFINER helper: job_has_accessible_location
--
-- Returns true when the current user has at least one job_location on
-- the given job within their accessible-location set. Encapsulates the
-- inner read so the jobs SELECT policy doesn't have to cross over to
-- job_locations RLS directly.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.job_has_accessible_location(p_job_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.job_locations jl
    where jl.job_id = p_job_id
      and jl.location_id in (select * from public.user_accessible_location_ids())
  );
$$;

grant execute on function public.job_has_accessible_location(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 2. jobs — SELECT for DSO members (rewritten to use the helper)
--
-- Same end-user scope as before:
--   - Same DSO required.
--   - Owner/admin/recruiter see every job.
--   - HMs see only jobs that intersect their accessible locations.
--
-- Difference: the location-set check now runs through a SECURITY DEFINER
-- helper, so we no longer trip job_locations RLS from inside this policy.
-- ─────────────────────────────────────────────────────────────────────

drop policy if exists "Jobs: members read own DSO" on public.jobs;
create policy "Jobs: members read own DSO"
  on public.jobs for select
  using (
    dso_id = public.current_dso_id()
    and (
      public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
      or public.job_has_accessible_location(jobs.id)
    )
  );


-- ─────────────────────────────────────────────────────────────────────
-- 3. job_locations — members SELECT (rewritten to use user_can_access_job)
--
-- Same end-user scope:
--   - Owner/admin/recruiter see all locations on jobs in their DSO.
--   - HMs see only the location rows that match their accessible set
--     (this remains the tighter scope — they don't see sibling location
--     rows on the same job that they can't access).
--
-- The "can the user touch this job at all?" half is delegated to the
-- existing SECURITY DEFINER helper, which avoids the loop back to the
-- jobs policy.
-- ─────────────────────────────────────────────────────────────────────

drop policy if exists "Job locations: members read own" on public.job_locations;
create policy "Job locations: members read own"
  on public.job_locations for select
  using (
    public.user_can_access_job(job_id)
    and (
      public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
      or location_id in (select * from public.user_accessible_location_ids())
    )
  );

commit;

-- ─────────────────────────────────────────────────────────────────────
-- Smoke test (run separately after applying):
--
-- -- 1. As owner/admin/recruiter, posting a new job should now succeed.
-- -- 2. SELECT * from public.jobs should still scope to current DSO only.
-- -- 3. (After Phase 3) HM accounts should still see only jobs whose
-- --    locations intersect their dso_user_locations rows.
-- ─────────────────────────────────────────────────────────────────────
