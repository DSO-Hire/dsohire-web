-- ============================================================
-- DSO Hire — Map Phase C: employer-side precise pins
-- ============================================================
-- Adds precise_latitude / precise_longitude / precise_geocoded_at
-- to dso_locations. These columns are populated by forward-geocoding
-- the FULL street address (address_line1 + city + state + postal_code)
-- and are intended exclusively for employer-facing surfaces.
--
-- Privacy contract:
--   * The existing latitude / longitude columns remain at city-centroid
--     precision and stay the source of truth for ALL public-facing
--     surfaces (/jobs map, /companies/[slug], dashboard mini-map).
--   * The new precise_* columns may render ONLY when the viewer is
--     authenticated as a member of the DSO that owns the location.
--     The application layer enforces this — there is no public-read
--     of the precise columns from the candidate-facing map.
--
-- See /Users/cam/Library/Application Support/Claude/local-agent-mode-sessions/.../memory/project_map_view_pin_rework_2026_05_18.md
-- for the design lock that motivates this column pair.
-- ============================================================

alter table public.dso_locations
  add column if not exists precise_latitude    numeric,
  add column if not exists precise_longitude   numeric,
  add column if not exists precise_geocoded_at timestamptz;

-- Partial index: only rows that actually have precise coords. Keeps
-- the index small until employers start filling out street addresses.
create index if not exists dso_locations_precise_geocoded_idx
  on public.dso_locations (precise_geocoded_at)
  where precise_latitude is not null and precise_longitude is not null;

-- Sanity: precise_latitude / precise_longitude are always set together,
-- never just one. Mirrors the public lat/lng pair constraint above.
alter table public.dso_locations
  drop constraint if exists dso_locations_precise_lat_lng_pair;
alter table public.dso_locations
  add constraint dso_locations_precise_lat_lng_pair
  check (
    (precise_latitude is null and precise_longitude is null)
    or (precise_latitude is not null and precise_longitude is not null)
  );
