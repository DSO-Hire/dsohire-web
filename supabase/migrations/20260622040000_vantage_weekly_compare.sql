-- Vantage Phase 4 — week-over-week compare for the founder digest (build spec §7).
--
-- Returns this-week vs previous-week aggregates so the Monday email can show
-- movement. Aggregate-only, no PII; signups/paid are counted from goal events
-- (same anonymous visitor space). SECURITY DEFINER, service_role-only.

create or replace function public.vantage_weekly_compare()
returns jsonb
language sql
security definer
set search_path = analytics, pg_catalog
stable
as $$
  with tw as (
    select * from analytics.events where occurred_at >= now() - interval '7 days'
  ),
  pw as (
    select * from analytics.events
    where occurred_at >= now() - interval '14 days'
      and occurred_at <  now() - interval '7 days'
  )
  select jsonb_build_object(
    'this_week', jsonb_build_object(
      'visitors',          (select count(distinct visitor_id) from tw where event_type = 1),
      'pageviews',         (select count(*)                   from tw where event_type = 1),
      'employer_signups',  (select count(*) from tw where event_name = 'signup_employer'),
      'candidate_signups', (select count(*) from tw where event_name = 'signup_candidate'),
      'paid',              (select count(*) from tw where event_name = 'checkout_success')
    ),
    'prev_week', jsonb_build_object(
      'visitors',          (select count(distinct visitor_id) from pw where event_type = 1),
      'pageviews',         (select count(*)                   from pw where event_type = 1),
      'employer_signups',  (select count(*) from pw where event_name = 'signup_employer'),
      'candidate_signups', (select count(*) from pw where event_name = 'signup_candidate'),
      'paid',              (select count(*) from pw where event_name = 'checkout_success')
    )
  );
$$;

revoke all on function public.vantage_weekly_compare() from public, anon, authenticated;
grant execute on function public.vantage_weekly_compare() to service_role;
