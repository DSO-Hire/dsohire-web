-- Marketing leads: every non-checkout way a visitor raises their hand.
--
-- Why a table (2026-09-28): the /contact form only ever emailed
-- cam@dsohire.com, and GoDaddy silently drops dsohire.com -> dsohire.com
-- mail. A lead that only exists as an email can vanish. Every capture now
-- lands here first (durable), then notifies a working inbox.
--
-- Kinds:
--   demo_request  "See it live" / talk-to-us asks from DSO pages
--   calculator    one-field handoff under the agency-cost calculator
--   newsletter    Dental Hiring Report monthly email
--   contact       /contact form
--   job_alert     candidate "tell me when roles open" (empty job board)
--
-- Access: service role only. RLS on with NO policies, and anon /
-- authenticated privileges revoked, so no browser session can read or
-- write a lead. Inserts go through server actions using the service-role
-- client; /admin/leads reads through the same client behind the admin gate.

create table if not exists public.marketing_leads (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  kind            text not null
                  check (kind in ('demo_request','calculator','newsletter','contact','job_alert')),
  contact         text not null check (char_length(contact) between 3 and 320),
  contact_type    text not null check (contact_type in ('email','phone')),
  name            text check (name is null or char_length(name) <= 200),
  company         text check (company is null or char_length(company) <= 200),
  audience        text check (audience is null or audience in ('dso','candidate')),
  -- What the visitor was looking at when they raised their hand
  -- (calculator inputs, subject + message, role filter, etc.).
  context         jsonb not null default '{}'::jsonb,
  -- First-touch attribution captured client-side (src/lib/marketing/attribution.ts).
  source_path     text check (source_path is null or char_length(source_path) <= 500),
  referrer        text check (referrer is null or char_length(referrer) <= 500),
  utm             jsonb not null default '{}'::jsonb,
  status          text not null default 'new'
                  check (status in ('new','contacted','closed','spam')),
  unsubscribed_at timestamptz
);

comment on table public.marketing_leads is
  'Marketing lead captures (demo, calculator, newsletter, contact, job alerts). Service-role only; no RLS policies by design.';

create index if not exists marketing_leads_created_idx
  on public.marketing_leads (created_at desc);
create index if not exists marketing_leads_kind_created_idx
  on public.marketing_leads (kind, created_at desc);

-- One subscription per address for list-style kinds; repeat signups are
-- absorbed with ON CONFLICT DO NOTHING in the action.
create unique index if not exists marketing_leads_list_dedupe
  on public.marketing_leads (kind, lower(contact))
  where kind in ('newsletter','job_alert');

alter table public.marketing_leads enable row level security;
revoke all on public.marketing_leads from anon, authenticated;
