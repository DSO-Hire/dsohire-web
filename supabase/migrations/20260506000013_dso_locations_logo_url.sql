-- Per-location logo (Phase 4.5.c follow-up, 2026-05-06).
-- DSOs commonly retain pre-acquisition branding on individual practices
-- ("67 Dental" might keep its old logo even after rolling up under a
-- larger DSO). The existing dsos.logo_url is the parent brand; this
-- column is the per-practice override.
--
-- Falls back gracefully: when null, the Avatar primitive renders
-- deterministic-color initials from the location name (matches the
-- candidate avatar pattern). The display surfaces never show "no logo"
-- as a shame state.

ALTER TABLE public.dso_locations
  ADD COLUMN logo_url text NULL;

COMMENT ON COLUMN public.dso_locations.logo_url IS
  'Public storage URL for this practice''s logo. Renders next to the location name in employer-facing lists. Falls back to deterministic-color initials when null.';
