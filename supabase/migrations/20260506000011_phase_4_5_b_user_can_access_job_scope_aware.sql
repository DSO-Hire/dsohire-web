-- Phase 4.5.b — make `user_can_access_job` scope-aware.
--
-- Previous logic: owner/admin/recruiter always pass; HMs pass only if
-- tagged on at least one of the job's locations.
--
-- New logic: same first two clauses, plus a third that lets HMs see
-- regional/corporate-scoped jobs regardless of location tagging. The
-- third clause is technically also true for owner/admin/recruiter on
-- regional/corporate jobs, but they already pass via the first clause —
-- so it's a no-op for non-HM roles.
--
-- Stays SECURITY DEFINER so the inner SELECTs bypass RLS (avoiding the
-- recursion-class bug we caught earlier today on the candidates policy).

CREATE OR REPLACE FUNCTION public.user_can_access_job(p_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.id = p_job_id
      AND j.dso_id = public.current_dso_id()
      AND (
        -- Owner / admin / recruiter — always see every job in the DSO
        public.current_dso_user_role() IN ('owner', 'admin', 'recruiter')
        -- HM with location overlap on this specific job
        OR EXISTS (
          SELECT 1
          FROM public.job_locations jl
          WHERE jl.job_id = j.id
            AND jl.location_id IN (
              SELECT * FROM public.user_accessible_location_ids()
            )
        )
        -- Regional or corporate scope — visible to all DSO members
        -- (HMs included) regardless of location tagging
        OR j.scope IN ('regional', 'corporate')
      )
  );
$function$;
