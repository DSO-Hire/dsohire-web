-- Vantage (first-party analytics) — Phase 0 foundation.
--
-- Net-new, isolated `analytics` schema. Nothing in the app references it yet;
-- this migration only stands up the storage + the cookieless-identity salt
-- machinery. The beacon (/p/e), goals, and dashboard land in later phases.
--
-- WHY A SEPARATE SCHEMA: beacon traffic is high-write append-only. Keeping it
-- out of `public` avoids vacuum/lock contention with the app tables and lets us
-- lock the whole surface down with a single "no grants to anon/authenticated"
-- posture (see GRANTS below) on top of RLS.
--
-- PRIVACY FIREWALL (build spec §3): rows carry ONLY a daily-rotating salted
-- hash (visitor_id) — never a raw IP, full User-Agent, candidate_id, user_id,
-- or email. The raw IP/UA are hash inputs computed in the beacon and discarded
-- in the same function (see src/lib/analytics/visitor-hash.ts). This file just
-- guarantees the columns to store PII don't exist.
--
-- Identity model (mirrors Plausible): visitor_id = signed int64 of the first
-- 8 bytes of SHA-256(daily_salt ‖ ip ‖ ua ‖ host). The salt rotates daily and
-- salts older than 48h are deleted, so a returning visitor is a brand-new
-- anonymous hash the next day — no cross-day/-device/-site linkage is possible.

create schema if not exists analytics;

-- ---------------------------------------------------------------------------
-- Raw event spine: one row per pageview (event_type=1) or goal (event_type=2).
-- ---------------------------------------------------------------------------
create table if not exists analytics.events (
  id            bigint        generated always as identity,
  occurred_at   timestamptz   not null default now(),
  event_type    smallint      not null,              -- 1=pageview, 2=goal
  event_name    text          not null,              -- 'pageview' | 'signup_employer' | ...
  visitor_id    bigint        not null,              -- daily salted hash (NOT pii)
  session_id    bigint,                              -- v1: day-bucket hash (§4.4)
  path          text,                                -- query-stripped to the §3.1 whitelist
  referrer_host text,
  channel       text,                                -- derived: Direct/Organic Search/... (§4.5)
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_term      text,
  utm_content   text,
  browser       text,                                -- derived server-side from UA, then UA discarded
  os            text,
  device        text,
  country       text,                                -- from x-vercel-ip-* headers (coarse)
  region        text,
  props         jsonb,                               -- small, non-PII (e.g. {"tier":"growth"})
  -- Composite PK now so monthly RANGE partitioning on occurred_at is drop-in
  -- later (Phase 5 / §9) without a table rewrite.
  primary key (id, occurred_at)
);

comment on table analytics.events is
  'Vantage raw event spine (pageviews + goals). Anonymous: visitor_id is a daily salted hash, never tied to a candidate/user/email. No raw IP or full UA is ever stored here.';
comment on column analytics.events.visitor_id is
  'Daily salted hash (signed int64). Resets every 24h via analytics.rotate_salt(). NOT PII.';
comment on column analytics.events.path is
  'Request path, query string stripped to the utm_*/ref/source whitelist before storage (§3.1).';

-- occurred_at range scans (every dashboard window) → BRIN is tiny + ideal for
-- append-only time-ordered data.
create index if not exists events_occurred_brin
  on analytics.events using brin (occurred_at);
-- Goal/funnel lookups by name within a window.
create index if not exists events_name_time
  on analytics.events (event_name, occurred_at);
-- Acquisition-by-channel within a window (the screen Cam lives in).
create index if not exists events_channel_time
  on analytics.events (channel, occurred_at);

-- ---------------------------------------------------------------------------
-- Rotating salt(s) for the cookieless hash. Keep current + previous; the
-- rotation job deletes anything older than 48h.
-- ---------------------------------------------------------------------------
create table if not exists analytics.salts (
  id          bigint generated always as identity primary key,
  salt        bytea not null,
  created_at  timestamptz not null default now()
);

comment on table analytics.salts is
  'Daily-rotating secret salt for the cookieless visitor hash. 16 random bytes, rotated daily by analytics.rotate_salt() via pg_cron; rows >48h deleted. Never leaves the server.';

-- ---------------------------------------------------------------------------
-- RLS: enable on both, define NO policies. With no policy, anon/authenticated
-- are denied entirely; the service-role client bypasses RLS. Combined with the
-- "no grants to anon/authenticated" posture below, the schema is private.
-- ---------------------------------------------------------------------------
alter table analytics.events enable row level security;
alter table analytics.salts  enable row level security;

-- ---------------------------------------------------------------------------
-- GRANTS: only service_role (the createSupabaseServiceRoleClient() identity)
-- and postgres get access. anon/authenticated are granted NOTHING — a new
-- schema has no default grants, and we deliberately add none for them.
-- ---------------------------------------------------------------------------
grant usage on schema analytics to service_role;
grant all on all tables in schema analytics to service_role;
grant usage, select on all sequences in schema analytics to service_role;
alter default privileges in schema analytics grant all on tables to service_role;
alter default privileges in schema analytics grant usage, select on sequences to service_role;

-- ---------------------------------------------------------------------------
-- Salt rotation via pg_cron (no HTTP, no Vercel entry).
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

-- SECURITY DEFINER so the cron job (runs as the table owner) can write/prune
-- regardless of the invoking role. gen_random_bytes lives in the `extensions`
-- schema (pgcrypto); pin search_path so the function resolves it explicitly.
create or replace function analytics.rotate_salt()
returns void
language sql
security definer
set search_path = analytics, extensions, pg_catalog
as $$
  insert into analytics.salts (salt) values (extensions.gen_random_bytes(16));
  delete from analytics.salts where created_at < now() - interval '48 hours';
$$;

comment on function analytics.rotate_salt() is
  'Mints a fresh 16-byte salt and prunes salts older than 48h. Scheduled daily by pg_cron (job: vantage-salt-rotation).';

-- Seed an initial salt so the beacon has one before the first cron tick.
insert into analytics.salts (salt) values (extensions.gen_random_bytes(16));

-- Rotate daily at 00:05 UTC. unschedule first so re-running this migration
-- (or applying it via both file + connector) doesn't create a duplicate job.
select cron.unschedule('vantage-salt-rotation')
  where exists (select 1 from cron.job where jobname = 'vantage-salt-rotation');
select cron.schedule('vantage-salt-rotation', '5 0 * * *', $$select analytics.rotate_salt();$$);
