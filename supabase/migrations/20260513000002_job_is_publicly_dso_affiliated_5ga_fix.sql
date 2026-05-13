-- ═════════════════════════════════════════════════════════════════════════
-- 20260513000002 — job_is_publicly_dso_affiliated 5G.a fix
-- ═════════════════════════════════════════════════════════════════════════
--
-- The 2026-05-08-locked version short-circuited regional/corporate scope
-- to "always publicly affiliated" because at the time there was no way
-- for those scopes to be anchored at private-affiliation practices.
-- 5G.a (2026-05-13) opens up two new shapes:
--   • corporate-scope job WITH a single private-affiliation anchor
--     (e.g. CFO posting anchored at 67 Dental, which is private)
--   • corporate-scope job WITH 0 anchor locations
--
-- The new logic:
--   • 1+ tagged locations: drop the scope short-circuit. Every scope
--     follows most-private-inherits across tagged practices (same rule
--     location-scope jobs already follow).
--   • 0 tagged locations (corporate-scope only): consult the DSO's
--     corporate_affiliation_policy.
--       - strict (default) → public iff NO location is private
--       - permissive       → public iff any location is public
--
-- Effects every public surface that calls job_is_publicly_dso_affiliated
-- (subhead, sidebar copy, JSON-LD, etc.).

CREATE OR REPLACE FUNCTION public.job_is_publicly_dso_affiliated(p_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_scope        text;
  v_dso_id       uuid;
  v_loc_count    int;
  v_policy       text;
  v_any_private  boolean;
  v_any_public   boolean;
BEGIN
  SELECT scope, dso_id INTO v_scope, v_dso_id
    FROM public.jobs WHERE id = p_job_id;

  IF v_scope IS NULL THEN
    -- Job doesn't exist; default true so existing callers don't crash.
    RETURN true;
  END IF;

  SELECT count(*) INTO v_loc_count
    FROM public.job_locations WHERE job_id = p_job_id;

  IF v_loc_count > 0 THEN
    -- Most-private-inherits across tagged practices regardless of scope.
    -- A corporate-scope job anchored at one private practice masks the
    -- corporate name; a regional role spanning a mix of public + private
    -- practices also masks (the candidate doesn't know which practice
    -- they'd actually work at).
    RETURN NOT public.job_has_private_affiliation_inherit(p_job_id);
  END IF;

  -- 0 tagged locations. Legal only for scope=corporate (5G.a anchor-
  -- optional behavior). Other scopes shouldn't reach here because the
  -- wizard + server validation require ≥1 location.
  IF v_scope = 'corporate' THEN
    SELECT corporate_affiliation_policy INTO v_policy
      FROM public.dsos WHERE id = v_dso_id;

    SELECT
      bool_or(NOT public_dso_affiliation),
      bool_or(public_dso_affiliation)
    INTO v_any_private, v_any_public
    FROM public.dso_locations WHERE dso_id = v_dso_id;

    IF v_policy = 'permissive' THEN
      -- Permissive: exposed if any location publicly affiliated.
      RETURN COALESCE(v_any_public, false);
    ELSE
      -- Strict (default): exposed only when NO location is privately
      -- affiliated. Most-private-inherits at the DSO level.
      RETURN NOT COALESCE(v_any_private, false);
    END IF;
  END IF;

  -- Defensive default — shouldn't be reachable.
  RETURN true;
END;
$function$;

COMMENT ON FUNCTION public.job_is_publicly_dso_affiliated(uuid) IS
  '5G.a (2026-05-13): regional/corporate jobs no longer short-circuit to true. Jobs with ≥1 tagged location use most-private-inherits across practices regardless of scope. 0-anchor corporate jobs consult dsos.corporate_affiliation_policy: strict masks when any DSO location is private; permissive exposes when any is public.';
