-- ─────────────────────────────────────────────────────────────────────────
-- 20260709120000_search_jobs_min_comp.sql
--
-- Min-comp filter for the public /jobs search (comp-filter spec 2026-07-09).
--
-- Recreated from the LIVE definition (pg_get_functiondef, 2026-07-09) — not
-- an older migration file. Two changes only:
--   1. New trailing param `min_comp numeric default null`.
--   2. New predicate: (min_comp is null or j.est_annual_max >= min_comp).
--      Jobs with NO published range (est_annual_max null) are excluded when
--      the filter is active; the /jobs UI surfaces a "N roles hidden" note
--      so they don't vanish without a trace.
--
-- est_annual_max is the employer's good-faith expected annual earnings
-- ceiling (20260612210000_comp_model_atoms.sql). Filtering on the max means
-- "this role can pay at least X" — the candidate-friendly reading.
--
-- Signature change → drop the exact old signature first, then re-grant.
-- The saved-search alert dispatcher calls this same function with the same
-- stored filters, so filter and alerts can't drift.
-- ─────────────────────────────────────────────────────────────────────────

begin;

drop function if exists public.search_jobs_public(
  text, text, employment_type, role_category, integer,
  double precision, double precision, double precision, text[]
);

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
    -- Min-comp gate — null-passthrough AND. Jobs without a published
    -- est_annual_max are excluded when a floor is set (UI shows a count).
    and (min_comp is null or j.est_annual_max >= min_comp)
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
