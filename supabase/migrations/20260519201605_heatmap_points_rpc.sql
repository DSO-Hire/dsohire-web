-- ============================================================
-- get_heatmap_points — feeder query for Phase D heatmap aggregation.
-- ============================================================
-- Returns one row per public DSO location that has both coordinates
-- and at least one active job. Pre-aggregated job_count per location
-- so the app layer just bins by hex without a second query.
--
-- Filters applied (intentionally restrictive):
--   • dso_locations.latitude IS NOT NULL AND longitude IS NOT NULL
--   • dso_locations.public_dso_affiliation = true (Map Phase C privacy
--     posture — never plot private locations)
--   • Owning DSO has status = 'active' (suspended/pending DSOs out)
--   • Job is status = 'active' AND deleted_at IS NULL
--
-- Returns:
--   latitude, longitude, job_count, metro
-- where metro = "City, ST" — used as the hex hover-popup label.
--
-- Security: SECURITY DEFINER so the function can read across DSOs
-- without per-row RLS overhead on every map render. The where-clause
-- enforces the same privacy guarantees that RLS would (only
-- public_dso_affiliation = true is exposed).
--
-- NOTE: superseded by 20260519202010_fix_heatmap_points_numeric_cast
-- which casts the numeric latitude/longitude columns to double
-- precision (kept here for ledger integrity; the type mismatch was
-- caught on first execution and patched in the next migration).
-- ============================================================

create or replace function public.get_heatmap_points()
returns table (
  latitude double precision,
  longitude double precision,
  job_count bigint,
  metro text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    dl.latitude,
    dl.longitude,
    count(j.id) as job_count,
    case
      when dl.city is not null and dl.state is not null
        then dl.city || ', ' || dl.state
      when dl.city is not null then dl.city
      when dl.state is not null then dl.state
      else null
    end as metro
  from public.dso_locations dl
  join public.dsos d on d.id = dl.dso_id
  join public.job_locations jl on jl.location_id = dl.id
  join public.jobs j on j.id = jl.job_id
  where dl.latitude is not null
    and dl.longitude is not null
    and dl.public_dso_affiliation = true
    and d.status = 'active'
    and j.status = 'active'
    and j.deleted_at is null
  group by dl.id, dl.latitude, dl.longitude, dl.city, dl.state
  having count(j.id) > 0;
end;
$$;

grant execute on function public.get_heatmap_points() to anon, authenticated, service_role;
