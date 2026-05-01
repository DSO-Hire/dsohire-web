-- ============================================================
-- DSO Hire — Phase 2 location geocoding
-- ============================================================
-- Adds latitude / longitude / geocoded_at to dso_locations so the
-- public /jobs map view can render privacy-preserving radius circles.
--
-- Privacy contract: only the city + state are ever sent to the
-- geocoder. We never store coordinates derived from a street address.
-- The columns sit alongside address_line1 etc. but they are populated
-- exclusively by the city+state geocoding pipeline (see
-- src/lib/geocoding/mapbox.ts).
--
-- The map UI then renders an 8–10 mile translucent heritage-green
-- circle around each (lat, lng) point, so the actual office is "somewhere
-- inside" without us ever leaking the precise location.
-- ============================================================

alter table public.dso_locations
  add column if not exists latitude    numeric,
  add column if not exists longitude   numeric,
  add column if not exists geocoded_at timestamptz;

-- Geocoded-locations index — speeds up the map query that filters out
-- rows we haven't geocoded yet. Partial so it stays small.
create index if not exists dso_locations_geocoded_idx
  on public.dso_locations (geocoded_at)
  where latitude is not null and longitude is not null;

-- Sanity: latitude / longitude are always set together, never just one.
alter table public.dso_locations
  drop constraint if exists dso_locations_lat_lng_pair;
alter table public.dso_locations
  add constraint dso_locations_lat_lng_pair
  check (
    (latitude is null and longitude is null)
    or (latitude is not null and longitude is not null)
  );
