-- Vantage Phase 3 — founder dashboard read RPCs (build spec §7).
--
-- The dashboard reads aggregates only. Because analytics.* is off the REST
-- surface, reads go through these SECURITY DEFINER functions, executable ONLY by
-- service_role (the dashboard runs server-side behind the superadmin gate).
--
-- FIREWALL: these return AGGREGATES (counts, distinct visitor counts) — never a
-- raw visitor row, never PII, never anything from application_eeo_responses. The
-- closed-loop join touches only dsos/candidates/subscriptions and filters
-- deleted_at. Channel attribution is aggregate-only; no individual's anonymous
-- browsing is ever linked to an account.

-- Top-line counts for the three fixed windows + a 5-minute "live now" gauge.
create or replace function public.vantage_overview()
returns jsonb
language sql
security definer
set search_path = analytics, pg_catalog
stable
as $$
  select jsonb_build_object(
    'today', (select jsonb_build_object(
        'visitors', count(distinct visitor_id), 'pageviews', count(*))
      from analytics.events
      where event_type = 1 and occurred_at >= date_trunc('day', now())),
    'last7', (select jsonb_build_object(
        'visitors', count(distinct visitor_id), 'pageviews', count(*))
      from analytics.events
      where event_type = 1 and occurred_at >= now() - interval '7 days'),
    'last30', (select jsonb_build_object(
        'visitors', count(distinct visitor_id), 'pageviews', count(*))
      from analytics.events
      where event_type = 1 and occurred_at >= now() - interval '30 days'),
    'live5min', (select count(distinct visitor_id)
      from analytics.events
      where occurred_at >= now() - interval '5 minutes')
  );
$$;

-- Acquisition by channel over a window.
create or replace function public.vantage_channels(p_days int)
returns table(channel text, visitors bigint, pageviews bigint)
language sql
security definer
set search_path = analytics, pg_catalog
stable
as $$
  select coalesce(channel, 'Direct') as channel,
         count(distinct visitor_id)  as visitors,
         count(*)                    as pageviews
  from analytics.events
  where event_type = 1
    and occurred_at >= now() - make_interval(days => greatest(p_days, 1))
  group by 1
  order by 2 desc, 3 desc;
$$;

-- Top pages over a window.
create or replace function public.vantage_top_pages(p_days int, p_limit int)
returns table(path text, pageviews bigint, visitors bigint)
language sql
security definer
set search_path = analytics, pg_catalog
stable
as $$
  select coalesce(path, '(unknown)')  as path,
         count(*)                     as pageviews,
         count(distinct visitor_id)   as visitors
  from analytics.events
  where event_type = 1
    and occurred_at >= now() - make_interval(days => greatest(p_days, 1))
  group by 1
  order by 2 desc
  limit greatest(p_limit, 1);
$$;

-- Goal counts over a window (drives the funnels).
create or replace function public.vantage_goals(p_days int)
returns table(event_name text, visitors bigint, events bigint)
language sql
security definer
set search_path = analytics, pg_catalog
stable
as $$
  select event_name,
         count(distinct visitor_id) as visitors,
         count(*)                   as events
  from analytics.events
  where event_type = 2
    and occurred_at >= now() - make_interval(days => greatest(p_days, 1))
  group by 1
  order by 3 desc;
$$;

-- Closed-loop: signups + paying by acquisition channel (aggregate join only).
create or replace function public.vantage_acquisition_loop()
returns table(
  channel           text,
  employer_signups  bigint,
  employer_paying   bigint,
  candidate_signups bigint
)
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  with emp as (
    select coalesce(d.acquisition_channel, '(unknown)') as channel,
           count(*)                                     as signups,
           count(*) filter (
             where s.status in ('active', 'trialing')
           )                                            as paying
    from public.dsos d
    left join public.subscriptions s on s.dso_id = d.id
    where d.deleted_at is null
    group by 1
  ),
  cand as (
    select coalesce(acquisition_channel, '(unknown)') as channel,
           count(*)                                   as signups
    from public.candidates
    where deleted_at is null
    group by 1
  )
  select coalesce(emp.channel, cand.channel)  as channel,
         coalesce(emp.signups, 0)             as employer_signups,
         coalesce(emp.paying, 0)              as employer_paying,
         coalesce(cand.signups, 0)            as candidate_signups
  from emp
  full outer join cand on emp.channel = cand.channel
  order by 2 desc, 4 desc;
$$;

-- Lock all reads to service_role (CREATE FUNCTION grants EXECUTE to PUBLIC).
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.vantage_overview()',
    'public.vantage_channels(int)',
    'public.vantage_top_pages(int, int)',
    'public.vantage_goals(int)',
    'public.vantage_acquisition_loop()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated;', fn);
    execute format('grant execute on function %s to service_role;', fn);
  end loop;
end $$;
