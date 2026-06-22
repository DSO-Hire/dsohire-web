-- Admin command center — daily pageview series for the cockpit traffic spark.
--
-- The North-Star strip's traffic sparkline needs a zero-filled per-day count
-- from analytics.events (off the REST surface), so it goes through a
-- service_role-only SECURITY DEFINER RPC like the other vantage_* readers.
-- Aggregate-only; no PII.

create or replace function public.vantage_daily_pageviews(p_days int)
returns table(day date, pageviews bigint)
language sql
security definer
set search_path = analytics, pg_catalog
stable
as $$
  select d::date as day, count(e.id) as pageviews
  from generate_series(
         (now() - make_interval(days => greatest(p_days, 1) - 1))::date,
         now()::date,
         interval '1 day'
       ) d
  left join analytics.events e
    on e.event_type = 1
   and e.occurred_at >= d::date
   and e.occurred_at <  (d::date + 1)
  group by 1
  order by 1;
$$;

revoke all on function public.vantage_daily_pageviews(int) from public, anon, authenticated;
grant execute on function public.vantage_daily_pageviews(int) to service_role;
