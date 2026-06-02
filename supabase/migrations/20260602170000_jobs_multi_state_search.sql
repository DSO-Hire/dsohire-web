-- ============================================================
-- Multi-state filter for /jobs search (2026-06-02)
-- ============================================================
-- Appends `states_filter text[]` to search_jobs_public so the public job
-- board's STATE filter can select more than one state. Mirrors the E7.4
-- radius overload pattern: drop the prior 8-arg signature, recreate with
-- the new arg appended (default null).
--
-- The new gate is an INDEPENDENT null-passthrough AND alongside the legacy
-- single `state_filter` gate, so a deploy of this migration AHEAD of the
-- app code does NOT break /jobs: old code still passes the single
-- `state_filter` (which works unchanged), and new code passes the
-- `states_filter` array instead. A job matches if ANY of its locations is
-- in the selected set (same one-to-many semantics as the single filter).
-- ============================================================

drop function if exists public.search_jobs_public(
  text, text, employment_type, role_category, int,
  double precision, double precision, double precision
);

create or replace function public.search_jobs_public(
  query_text          text default null,
  state_filter        text default null,
  employment_filter   employment_type default null,
  category_filter     role_category default null,
  posted_within_days  int default null,
  near_lat            double precision default null,
  near_lng            double precision default null,
  within_miles        double precision default null,
  states_filter       text[] default null
)
returns setof public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  lat_delta double precision;
  lng_delta double precision;
  has_radius boolean := near_lat is not null
                    and near_lng is not null
                    and within_miles is not null
                    and within_miles > 0;
begin
  if has_radius then
    lat_delta := within_miles / 69.0;
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
    -- Legacy single-state gate (kept for backward compatibility).
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
    -- Multi-state gate — independent null-passthrough AND.
    and (
      states_filter is null
      or array_length(states_filter, 1) is null
      or exists (
        select 1
        from public.job_locations jl
        join public.dso_locations dl on dl.id = jl.location_id
        where jl.job_id = j.id
          and upper(dl.state) = any (
            select upper(trim(s))
            from unnest(states_filter) as s
            where nullif(trim(s), '') is not null
          )
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
          and dl.latitude  between (near_lat - lat_delta) and (near_lat + lat_delta)
          and (
            lng_delta is null
            or dl.longitude between (near_lng - lng_delta) and (near_lng + lng_delta)
          )
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

grant execute on function public.search_jobs_public(
  text, text, employment_type, role_category, int,
  double precision, double precision, double precision, text[]
) to anon, authenticated, service_role;
