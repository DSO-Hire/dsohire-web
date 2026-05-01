-- ============================================================
-- Fix: search_jobs_public was broken at runtime.
-- ============================================================
-- The 20260501000002_jobs_schema.sql definition used
--   select distinct j.* from jobs j left join job_locations jl ... left join dso_locations dl ...
--   order by case when query_text is null then 0
--                else ts_rank_cd(j.search_vector, plainto_tsquery(...)) end desc,
--            j.posted_at desc nulls last
-- but Postgres rejects this with
--   ERROR: 42P10: for SELECT DISTINCT, ORDER BY expressions must appear in select list
-- because `ts_rank_cd(j.search_vector, ...)` isn't in `j.*`. The error fires
-- on every invocation, so /jobs has been silently returning zero results for
-- candidates since the schema was deployed (the page swallows the RPC error
-- and shows "NO JOBS FOUND").
--
-- Fix: drop DISTINCT entirely. We were only using it to dedupe the
-- one-job-many-locations cartesian from the LEFT JOIN to job_locations. The
-- state filter is the only thing that needed the join, so move it into an
-- EXISTS subquery and select straight from jobs — one row per job, no
-- duplicates, ORDER BY ts_rank_cd is allowed.
-- ============================================================

create or replace function public.search_jobs_public(
  query_text          text default null,
  state_filter        text default null,
  employment_filter   employment_type default null,
  category_filter     role_category default null,
  posted_within_days  int default null
)
returns setof public.jobs
language plpgsql
security definer
set search_path = public
as $$
begin
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
      or exists (
        select 1
        from public.job_locations jl
        join public.dso_locations dl on dl.id = jl.location_id
        where jl.job_id = j.id
          and dl.state = state_filter
      )
    )
  order by
    case when query_text is null then 0
         else ts_rank_cd(j.search_vector, plainto_tsquery('english'::regconfig, query_text))
    end desc,
    j.posted_at desc nulls last;
end;
$$;
