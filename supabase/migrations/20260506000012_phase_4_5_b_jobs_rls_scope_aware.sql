-- Phase 4.5.b — make the Jobs SELECT policy scope-aware.
--
-- The previous policy (from Phase 3a HM scaffolding) gated HMs by
-- `job_has_accessible_location(id)`. With the new `jobs.scope` field,
-- HMs ALSO need access to jobs scoped 'regional' or 'corporate'
-- regardless of which locations they're tagged on. Owners / admins /
-- recruiters are unchanged — they always see every job in the DSO.
--
-- We replace the existing policy in place rather than DROP+CREATE so
-- there's no momentary "no policy" window where reads would deny.

ALTER POLICY "Jobs: members read own DSO" ON public.jobs
  USING (
    (dso_id = public.current_dso_id())
    AND (
      public.current_dso_user_role()
        = ANY (ARRAY['owner'::dso_user_role, 'admin'::dso_user_role, 'recruiter'::dso_user_role])
      OR public.job_has_accessible_location(id)
      OR scope IN ('regional', 'corporate')
    )
  );
