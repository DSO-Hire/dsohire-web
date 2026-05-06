-- Hotfix for the recursion bug introduced by 20260506000008 (2026-05-06).
--
-- The original migration's policy queried `applications` directly inside
-- the candidates SELECT policy:
--
--   USING (
--     EXISTS (SELECT 1 FROM applications a
--             WHERE a.candidate_id = candidates.id
--               AND user_can_access_job(a.job_id))
--   )
--
-- Applications RLS has TWO SELECT policies (OR'd):
--   1. user_can_access_job(job_id)              -- DSO path (SECURITY DEFINER, safe)
--   2. EXISTS (SELECT 1 FROM candidates c       -- candidate-self path
--              WHERE c.id = applications.candidate_id
--                AND c.auth_user_id = auth.uid())
--
-- Postgres evaluates BOTH policies even when the first short-circuits to
-- true, so the candidate-self path was always queried — and its inner
-- `FROM candidates c` re-triggered the new candidates policy, which
-- queried applications again, which triggered the candidates policy
-- again, ad infinitum. Postgres detected the cycle and refused to
-- evaluate ANY applications query, which made the kanban + central
-- inbox both render empty even though the data was intact.
--
-- Same family of bug as the 2026-05-05 jobs ↔ job_locations recursion.
-- The lesson is: never inline a join to a table whose RLS could route
-- back through this same table. Always wrap the check in a SECURITY
-- DEFINER helper that bypasses RLS on its inner SELECT.
--
-- Fix:
--   1. Drop the broken policy.
--   2. Create `dso_can_read_candidate(uuid)` SECURITY DEFINER. It joins
--      applications + jobs + dso_users WITHOUT RLS internally, returning
--      true iff the calling auth.uid() is a DSO member of a DSO that
--      owns a job this candidate has applied to.
--   3. Recreate the candidates SELECT policy delegating to that helper.
--      One function call inside the policy — no join chain visible to
--      the RLS engine, so no recursion possible.
--
-- Performance: the function is STABLE so Postgres can cache its result
-- per row within a query. Joins on three indexed columns
-- (applications.candidate_id, jobs.id, dso_users.dso_id+auth_user_id),
-- so the per-row cost is trivial.

DROP POLICY IF EXISTS "Candidates: dso members read applicants" ON public.candidates;

CREATE OR REPLACE FUNCTION public.dso_can_read_candidate(p_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.applications a
    JOIN public.jobs j ON j.id = a.job_id
    JOIN public.dso_users du ON du.dso_id = j.dso_id
    WHERE a.candidate_id = p_candidate_id
      AND du.auth_user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.dso_can_read_candidate(uuid) TO authenticated;

CREATE POLICY "Candidates: dso members read applicants" ON public.candidates
  FOR SELECT
  USING (public.dso_can_read_candidate(id));
