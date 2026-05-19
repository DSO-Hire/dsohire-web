-- ============================================================
-- E7.4 — Location radius filter for /jobs
-- ============================================================
-- Adds near_lat / near_lng / within_miles params to search_jobs_public.
-- Uses Haversine formula (no PostGIS extension required) with a bounding-box
-- pre-filter so PostgreSQL can narrow the candidate set cheaply before the
-- exact distance check on each surviving row.
--
-- The app layer geocodes the user's "City, ST" input via the existing
-- Mapbox helper (lib/geocoding/mapbox.ts → geocodeCityState) and passes
-- the resulting center coords + a radius (miles) into the RPC.
--
-- This filter operates on dso_locations.latitude / longitude — the PUBLIC
-- city-centroid coords. The precise_latitude / precise_longitude columns
-- (employer-only, street-level) are intentionally NOT touched here per the
-- privacy posture locked in Map Phase C (2026-05-18).
-- ============================================================

-- Helper: great-circle distance in miles between two lat/lng pairs.
-- Earth radius is 3958.7613 miles (matches the value used in the JS layer
-- if we ever need to re-compute client-side for sort by distance).
create or replace function public._haversine_miles(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
) returns double precision
language sql
immutable
parallel safe
as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else 3958.7613 * 2 * asin(sqrt(
      sin(radians(lat2 - lat1) / 2) ^ 2 +
      cos(radians(lat1)) * cos(radians(lat2)) *
      sin(radians(lng2 - lng1) / 2) ^ 2
    ))
  end;
$$;

grant execute on function public._haversine_miles(
  double precision, double precision, double precision, double precision
) to anon, authenticated, service_role;

-- ============================================================
-- Replace search_jobs_public with radius-aware version.
-- ============================================================
-- New params are appended at the END so existing callers (which use named
-- args via Supabase RPC) keep working without code changes. The radius
-- branch is gated on all three params being present and within_miles > 0;
-- otherwise the filter is a no-op.

create or replace function public.search_jobs_public(
  query_text          text default null,
  state_filter        text default null,
  employment_filter   employment_type default null,
  category_filter     role_category default null,
  posted_within_days  int default null,
  near_lat            double precision default null,
  near_lng            double precision default null,
  within_miles        double precision default null
)
returns setof public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Pre-compute bounding-box deltas for the radius filter so they evaluate
  -- once per query, not once per row. Skipped when has_radius is false.
  lat_delta double precision;
  lng_delta double precision;
  has_radius boolean := near_lat is not null
                    and near_lng is not null
                    and within_miles is not null
                    and within_miles > 0;
begin
  if has_radius then
    -- 1 degree latitude ≈ 69 miles (constant across the globe).
    lat_delta := within_miles / 69.0;
    -- 1 degree longitude ≈ 69 * cos(lat) miles (varies with latitude).
    -- nullif guards against the cos→0 case near the poles; the bbox just
    -- widens to the full longitude range in that pathological case.
    lng_delta := within_miles / nullif(69.0 * cos(radians(near_lat)), 0);
  end if;

  return query
  select j.*
  from public.jobs j
  where j.status = 'active'
    and j.deleted_at is null
    and (query_text is null or j.search_vector @@ plainto_tsquery('english'::regconfig, query_text))
    and (employment_filter is null or j.employment_type = employment_filter)
    and (category_filter is null or j.role_category = category_filter)
    and (
      posted_within_days is null
      or j.posted_at >= now() - (posted_within_days || ' days')::interval
    )
    and (
      state_filter is null
      or nullif(trim(state_filter), '') is null
      or exists (
        select 1
        from public.job_locations jl
        join public.dso_locations dl on dl.id = jl.location_id
        where jl.job_id = j.id
          and dl.state = upper(trim(state_filter))
      )
    )
    and (
      not has_radius
      or exists (
        select 1
        from public.job_locations jl
        join public.dso_locations dl on dl.id = jl.location_id
        where jl.job_id = j.id
          and dl.latitude is not null
          and dl.longitude is not null
          -- Bounding-box pre-filter — sargable, narrows candidate set fast.
          and dl.latitude  between (near_lat - lat_delta) and (near_lat + lat_delta)
          and (
            lng_delta is null
            or dl.longitude between (near_lng - lng_delta) and (near_lng + lng_delta)
          )
          -- Exact distance — only runs on rows that survive the bbox.
          and public._haversine_miles(near_lat, near_lng, dl.latitude, dl.longitude) <= within_miles
      )
    )
  order by
    case when query_text is null then 0
         else ts_rank_cd(j.search_vector, plainto_tsquery('english'::regconfig, query_text))
    end desc,
    j.posted_at desc nulls last;
end;
$$;

-- ============================================================
-- Suggested follow-up (separate migration, not in scope here):
-- ============================================================
-- create index if not exists dso_locations_latlng_idx
--   on public.dso_locations using btree (latitude, longitude)
--   where latitude is not null and longitude is not null;
--
-- For current row counts the table is small enough that a seq scan is
-- faster than the index — revisit once dso_locations >> 1000 rows.
-- ============================================================
