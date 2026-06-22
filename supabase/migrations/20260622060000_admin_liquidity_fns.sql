-- Admin Marketplace Liquidity Radar (Tranche 1, Phase 2).
--
-- Aggregate-only marketplace-health reads, grain = role_category × metro
-- (metro v1 = "City, ST" from dso_locations for demand, candidates current
-- location for supply; CBSA upgrade later). SECURITY DEFINER, service_role-only.
-- No PII: candidate side is counts only; nothing from application_eeo_responses;
-- deleted_at filtered everywhere.

-- Supply vs demand matrix.
create or replace function public.admin_liquidity_matrix()
returns table(role_category text, metro text, demand bigint, supply bigint)
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  with demand as (
    select j.role_category::text                  as role_category,
           (dl.city || ', ' || dl.state)          as metro,
           count(distinct j.id)                   as demand
    from jobs j
    join job_locations jl on jl.job_id = j.id
    join dso_locations dl on dl.id = jl.location_id
    where j.status = 'active' and j.deleted_at is null
      and dl.city is not null and dl.state is not null
    group by 1, 2
  ),
  supply as (
    select r.role                                                    as role_category,
           (c.current_location_city || ', ' || c.current_location_state) as metro,
           count(distinct c.id)                                      as supply
    from candidates c
    cross join lateral unnest(c.desired_roles) as r(role)
    where c.is_searchable = true and c.deleted_at is null
      and c.current_location_city is not null
      and c.current_location_state is not null
    group by 1, 2
  )
  select coalesce(d.role_category, s.role_category) as role_category,
         coalesce(d.metro, s.metro)                as metro,
         coalesce(d.demand, 0)                     as demand,
         coalesce(s.supply, 0)                     as supply
  from demand d
  full outer join supply s
    on d.role_category = s.role_category and d.metro = s.metro
  order by (coalesce(d.demand, 0) + coalesce(s.supply, 0)) desc;
$$;

-- Seller illiquidity: active jobs with zero applications (oldest first).
create or replace function public.admin_liquidity_seller_leaks(p_limit int)
returns table(
  job_id    uuid,
  title     text,
  dso_name  text,
  metro     text,
  posted_at timestamptz,
  days_live numeric
)
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  select j.id,
         j.title,
         d.name as dso_name,
         coalesce(loc.city || ', ' || loc.state, '—') as metro,
         j.posted_at,
         round(extract(epoch from (now() - j.posted_at)) / 86400, 0) as days_live
  from jobs j
  join dsos d on d.id = j.dso_id
  left join lateral (
    select dl.city, dl.state
    from job_locations jl
    join dso_locations dl on dl.id = jl.location_id
    where jl.job_id = j.id
    limit 1
  ) loc on true
  where j.status = 'active' and j.deleted_at is null
    and not exists (select 1 from applications a where a.job_id = j.id)
  order by j.posted_at asc nulls last
  limit greatest(p_limit, 1);
$$;

-- Buyer illiquidity: COUNT of searchable candidates with zero applications
-- (aggregate only — never list candidate identities here).
create or replace function public.admin_liquidity_buyer_leak()
returns bigint
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  select count(*)
  from candidates c
  where c.is_searchable = true and c.deleted_at is null
    and not exists (select 1 from applications a where a.candidate_id = c.id);
$$;

-- Velocity: median days to first applicant, by role.
create or replace function public.admin_liquidity_velocity()
returns table(role_category text, jobs_with_apps bigint, median_days numeric)
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  with firsts as (
    select j.id,
           j.role_category::text as role_category,
           j.posted_at,
           min(a.created_at)     as first_app
    from jobs j
    join applications a on a.job_id = j.id
    where j.deleted_at is null and j.posted_at is not null
    group by 1, 2, 3
  )
  select role_category,
         count(*) as jobs_with_apps,
         round(
           percentile_cont(0.5) within group (
             order by extract(epoch from (first_app - posted_at)) / 86400
           )::numeric, 1
         ) as median_days
  from firsts
  group by 1
  order by 3 desc nulls last;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.admin_liquidity_matrix()',
    'public.admin_liquidity_seller_leaks(int)',
    'public.admin_liquidity_buyer_leak()',
    'public.admin_liquidity_velocity()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated;', fn);
    execute format('grant execute on function %s to service_role;', fn);
  end loop;
end $$;
