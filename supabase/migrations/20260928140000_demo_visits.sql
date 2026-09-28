-- Demo visits: who opened the live demo (demo.dsohire.com/demo).
--
-- The demo runs on its own deployment + database; its /demo entry route
-- reports each open to PROD (/api/demo-visits) so this table lives next to
-- marketing_leads and shows up in /admin/leads.
--
--   • Personalized outbound links (/demo?for=Bridgeway) collapse into one
--     row per prospect (for_key unique), counting repeat opens: "Bridgeway
--     has opened the demo 3 times, last seen Tuesday."
--   • Anonymous opens (no ?for=) are one row each, so total demo traffic
--     is countable.
--
-- Service role only: RLS on with no policies; anon/authenticated revoked.

create table if not exists public.demo_visits (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  for_label        text check (for_label is null or char_length(for_label) between 1 and 60),
  for_key          text check (for_key is null or char_length(for_key) between 1 and 60),
  visits           integer not null default 1 check (visits >= 1),
  referrer         text check (referrer is null or char_length(referrer) <= 300),
  user_agent       text check (user_agent is null or char_length(user_agent) <= 300),
  last_notified_at timestamptz
);

comment on table public.demo_visits is
  'Live-demo opens reported by the demo deployment. One row per ?for= prospect (visit-counted) or per anonymous open. Service-role only.';

create unique index if not exists demo_visits_for_key_uniq
  on public.demo_visits (for_key) where for_key is not null;
create index if not exists demo_visits_last_seen_idx
  on public.demo_visits (last_seen_at desc);

alter table public.demo_visits enable row level security;
revoke all on public.demo_visits from anon, authenticated;
