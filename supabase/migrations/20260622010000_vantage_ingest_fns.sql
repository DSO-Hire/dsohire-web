-- Vantage Phase 1 — ingestion RPCs.
--
-- The `analytics` schema is deliberately NOT exposed to PostgREST (only `public`
-- is on this project), so the beacon can't `.from('analytics.events')` over the
-- REST API. That's a feature, not a problem: we reach the schema through two
-- SECURITY DEFINER functions in `public`, executable ONLY by service_role. The
-- analytics tables stay completely off the public API surface — extra defense
-- on top of the RLS + no-grants posture from Phase 0.
--
-- PRIVACY: neither function ever receives a raw IP or User-Agent. The visitor
-- hash is computed in Node (src/lib/analytics/visitor-hash.ts) from the salt +
-- request headers, which are discarded there; only the finished bigint hash and
-- non-PII derived fields cross into the DB. The salt itself leaves the DB (to
-- Node) via vantage_current_salt() — that's Plausible's model; the salt is not
-- PII and is deleted within 48h.

-- ---------------------------------------------------------------------------
-- Hand the current salt (hex) to the Node beacon so it can compute the hash.
-- ---------------------------------------------------------------------------
create or replace function public.vantage_current_salt()
returns text
language sql
security definer
set search_path = analytics, pg_catalog
as $$
  select encode(salt, 'hex') from analytics.salts order by created_at desc limit 1;
$$;

comment on function public.vantage_current_salt() is
  'Returns the current daily salt as hex for the cookieless visitor hash. service_role only.';

-- ---------------------------------------------------------------------------
-- Insert one Vantage event. visitor_id/session_id arrive as TEXT and are cast
-- to bigint inside, sidestepping any JSON int64 precision loss on the wire.
-- ---------------------------------------------------------------------------
create or replace function public.vantage_record_event(
  p_event_type   smallint,
  p_event_name   text,
  p_visitor_id   text,
  p_session_id   text,
  p_path         text,
  p_referrer_host text,
  p_channel      text,
  p_utm_source   text,
  p_utm_medium   text,
  p_utm_campaign text,
  p_utm_term     text,
  p_utm_content  text,
  p_browser      text,
  p_os           text,
  p_device       text,
  p_country      text,
  p_region       text,
  p_props        jsonb
)
returns void
language sql
security definer
set search_path = analytics, pg_catalog
as $$
  insert into analytics.events (
    event_type, event_name, visitor_id, session_id, path, referrer_host,
    channel, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    browser, os, device, country, region, props
  ) values (
    p_event_type, p_event_name, p_visitor_id::bigint,
    nullif(p_session_id, '')::bigint, p_path, p_referrer_host,
    p_channel, p_utm_source, p_utm_medium, p_utm_campaign, p_utm_term, p_utm_content,
    p_browser, p_os, p_device, p_country, p_region, p_props
  );
$$;

comment on function public.vantage_record_event(
  smallint, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, jsonb) is
  'Inserts one Vantage event into analytics.events. service_role only. Never receives raw IP/UA.';

-- ---------------------------------------------------------------------------
-- Lock execution to service_role. CREATE FUNCTION grants EXECUTE to PUBLIC by
-- default, which would expose these as anon/authenticated RPCs — revoke that.
-- ---------------------------------------------------------------------------
revoke all on function public.vantage_current_salt() from public, anon, authenticated;
revoke all on function public.vantage_record_event(
  smallint, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, jsonb) from public, anon, authenticated;

grant execute on function public.vantage_current_salt() to service_role;
grant execute on function public.vantage_record_event(
  smallint, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, jsonb) to service_role;
