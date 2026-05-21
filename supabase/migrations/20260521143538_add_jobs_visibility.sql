-- ============================================================
-- DSO Hire — E1.22 Internal-only jobs
-- ============================================================
-- Adds jobs.visibility {public, internal_only}.
--
--   * public        — discoverable everywhere (job board, map, company
--                     pages, public job count, JobPosting JSON-LD / future
--                     Google for Jobs feed).
--   * internal_only — hidden from every public *discovery* surface, but the
--                     canonical /jobs/[id] page still renders so recruiters
--                     can share a direct link. JobPosting JSON-LD is
--                     suppressed for these (they are not public postings),
--                     which is also the mechanism the eventual Google for
--                     Jobs feed uses to exclude internal roles.
--
-- New column defaults to 'public' so every existing job is unaffected.
-- RLS on `jobs` is intentionally NOT changed — the public-read policy still
-- exposes active jobs by id (direct link), and each discovery surface adds
-- its own `visibility = 'public'` filter at the query layer.
-- ============================================================

-- Brand-new enum type + a column that uses it can live in one transaction
-- (the two-transaction rule only applies to ALTER TYPE ... ADD VALUE on an
-- existing enum, which this is not).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'job_visibility') then
    create type public.job_visibility as enum ('public', 'internal_only');
  end if;
end$$;

alter table public.jobs
  add column if not exists visibility public.job_visibility not null default 'public';

-- ============================================================
-- Replace search_jobs_public to exclude internal-only jobs.
-- Same signature as the radius-aware version (E7.4) — only the WHERE
-- clause gains `and j.visibility = 'public'`.
-- ============================================================

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
    and j.visibility = 'public'
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

-- ============================================================
-- End of E1.22 internal-only jobs migration.
-- ============================================================
