-- Practice Fit v2 (Phase A.2) — real commute distance.
--
-- Stores geocoded centroids of the candidate's DESIRED markets so the
-- location dimension can score on stated target markets (relocation-aware)
-- instead of a brittle city-string match. City-level only — never derived
-- from a home/street address (privacy principle). Populated server-side by
-- the score loader from the existing desired_locations ("City, ST").
alter table public.candidates
  add column if not exists desired_location_points jsonb not null default '[]'::jsonb;

comment on column public.candidates.desired_location_points is
  'Practice Fit v2 (A.2): [{label,lat,lng}] centroids of desired_locations. City-level, never from a home address. Filled by the PF score loader.';

-- Location scoring changed (distance-decay) — wipe the recomputable cache.
truncate table public.practice_fit_scores;
