-- ─────────────────────────────────────────────────────────────────────────
-- 20260709150000_search_jobs_comp_fallback.sql
--
-- Comp-filter follow-up (Cam, 2026-07-09): the min_comp predicate only read
-- est_annual_max, but most non-doctor roles publish comp as an HOURLY range
-- (hygienist $45-62/hr, DA $22-32/hr) with no est_annual atoms — so every
-- threshold below ~$100k was useless for them and the roles got "hidden".
--
-- The filter now compares against an EFFECTIVE annual max:
--   1. est_annual_max when present (the good-faith comp atom wins), else
--   2. the published visible comp range annualized:
--        hourly × 2080 (40h × 52w) · daily × 260 (5d × 52w) · annual as-is.
--
-- Same body as 20260709120000 otherwise; signature unchanged, so no drop
-- needed — but keep the grants explicit anyway.
-- Mirrored in TS by effectiveAnnualMax() in src/lib/jobs/saved-search-filters.ts
-- (the /jobs hidden-count note + alert email comp labels) — keep in sync.
-- ─────────────────────────────────────────────────────────────────────────

begin;

create or replace function public.search_jobs_public(
  query_text         text             default null,
  state_filter       text             default null,
  employment_filter  employment_type  default null,
  category_filter    role_category    default null,
  posted_within_days integer          default null,
  near_lat           double precision default null,
  near_lng           double precision default null,
  within_miles       double precision default null,
  states_filter      text[]           default null,
  min_comp           numeric          default null
)
returns setof jobs
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    -- Min-comp gate — null-passthrough AND against the EFFECTIVE annual max:
    -- est_annual_max, else visible published comp annualized (hourly × 2080,
    -- daily × 260). Roles with no comp signal at all are excluded when a
    -- floor is set (the /jobs UI counts them in an honesty note).
    and (
      min_comp is null
      or coalesce(
           j.est_annual_max,
           case
             when j.compensation_visible and j.compensation_max is not null then
               case j.compensation_period
                 when 'hourly' then j.compensation_max * 2080
                 when 'daily'  then j.compensation_max * 260
                 when 'annual' then j.compensation_max
               end
           end
         ) >= min_comp
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
    -- Multi-state gate — independent null-passthrough AND. A job matches if
    -- ANY of its locations is in the selected set.
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
$function$;

grant execute on function public.search_jobs_public(
  text, text, employment_type, role_category, integer,
  double precision, double precision, double precision, text[], numeric
) to anon, authenticated, service_role;

commit;
