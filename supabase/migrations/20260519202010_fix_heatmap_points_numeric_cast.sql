-- ============================================================
-- Fix get_heatmap_points type mismatch.
-- ============================================================
-- The dso_locations.latitude/longitude columns are NUMERIC, but the
-- function signature declared double precision return columns —
-- PG raises "structure of query does not match function result type"
-- at execution time.
--
-- Fix: cast the columns to double precision in the SELECT. Function
-- signature stays as double precision (which is what the app layer
-- + h3-js expect downstream).
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
    dl.latitude::double precision,
    dl.longitude::double precision,
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
