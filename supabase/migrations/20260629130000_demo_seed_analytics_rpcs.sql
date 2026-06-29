-- Demo-seed analytics helpers.
--
-- analytics.events lives in the `analytics` schema, which is intentionally NOT
-- exposed to PostgREST (the Vantage spine is service-side only). The demo seed
-- runs through supabase-js (both scripts/seed-demo.ts and the /admin reset
-- button), which can only reach exposed schemas — so it can't insert/delete
-- analytics.events directly. These two SECURITY DEFINER functions in `public`
-- give the seed a scoped, service-role-only way to backdate demo events and to
-- wipe ONLY the demo-marked ones (props.seed_batch='demo_v1').
--
-- Execute is granted to service_role only; revoked from anon/authenticated so
-- no signed-in user can reach them.

create or replace function public.demo_seed_insert_events(p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = public, analytics
as $$
declare
  n integer;
begin
  insert into analytics.events (
    occurred_at, event_type, event_name, visitor_id, session_id, path,
    referrer_host, channel, utm_source, utm_medium, utm_campaign, utm_term,
    utm_content, browser, os, device, country, region, props
  )
  select
    (e->>'occurred_at')::timestamptz,
    (e->>'event_type')::smallint,
    e->>'event_name',
    (e->>'visitor_id')::bigint,
    nullif(e->>'session_id', '')::bigint,
    e->>'path',
    e->>'referrer_host',
    e->>'channel',
    e->>'utm_source',
    e->>'utm_medium',
    e->>'utm_campaign',
    e->>'utm_term',
    e->>'utm_content',
    e->>'browser',
    e->>'os',
    e->>'device',
    e->>'country',
    e->>'region',
    coalesce(e->'props', '{}'::jsonb)
  from jsonb_array_elements(p_events) as e;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.demo_seed_delete_events()
returns integer
language plpgsql
security definer
set search_path = public, analytics
as $$
declare
  n integer;
begin
  delete from analytics.events where props->>'seed_batch' = 'demo_v1';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Count of demo-marked events — lets scripts/verify-demo.ts assert backdated
-- analytics landed (it also can't read the analytics schema over PostgREST).
create or replace function public.demo_seed_count_events()
returns integer
language sql
security definer
set search_path = public, analytics
as $$
  select count(*)::int from analytics.events where props->>'seed_batch' = 'demo_v1';
$$;

revoke all on function public.demo_seed_insert_events(jsonb) from public, anon, authenticated;
revoke all on function public.demo_seed_delete_events() from public, anon, authenticated;
revoke all on function public.demo_seed_count_events() from public, anon, authenticated;
grant execute on function public.demo_seed_insert_events(jsonb) to service_role;
grant execute on function public.demo_seed_delete_events() to service_role;
grant execute on function public.demo_seed_count_events() to service_role;
