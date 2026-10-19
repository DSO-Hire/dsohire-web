-- DSO Hire CRM v2 (2026-10-19): email templates, saved views, proposals,
-- and the link between CRM accounts and paying DSOs.
--
-- Same rules as crm_core: RLS enabled + forced, CRM admins (superadmin +
-- aal2 via private.is_crm_admin()) only. Saved views are own-row.

/* ---------------- email templates (editable in Settings) ---------------- */
create table public.crm_email_templates (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique check (key ~ '^[a-z0-9_]{2,40}$'),
  name        text not null check (char_length(name) between 1 and 80),
  channel     text not null default 'email' check (channel in ('email','linkedin')),
  subject     text check (subject is null or char_length(subject) <= 200),
  body        text not null check (char_length(body) between 1 and 5000),
  -- days until the follow-up this template suggests (null = none)
  next_step_days smallint check (next_step_days is null or next_step_days between 1 and 60),
  next_step   text check (next_step is null or char_length(next_step) <= 200),
  sort        smallint not null default 0,
  archived_at timestamptz,
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- Signature appended to every composed email. Cold email needs a mailing
-- address (CAN-SPAM); the compose panel warns while it is missing.
alter table public.crm_workspace_settings
  add column email_signature text not null default E'Cam Eslinger\nFounder, DSO Hire\ndsohire.com'
    check (char_length(email_signature) <= 1000),
  add column mailing_address text check (mailing_address is null or char_length(mailing_address) <= 300);

/* Seeded from docs/sales/outreach-kit.md. Merge fields:
   {first_name} {group} {demo_link} {calc_link} {signal} {referrer} */
insert into public.crm_email_templates (key, name, channel, subject, body, next_step_days, next_step, sort) values
('cold_first', 'Cold: first touch', 'email', '{group}''s hiring',
E'Hi {first_name},\n\n{signal}\n\nGroups growing like that usually end up paying for every listing at every office, or a 15–25% agency fee on the hard-to-fill roles. DSO Hire is one flat monthly fee for every location: post once to all of them, run one pipeline, no placement fees.\n\nI set up a live demo for {group}. It''s the real product, nothing to sign up for: {demo_link}\n\nWorth 15 minutes to see whether it fits how you hire?',
 4, 'Follow-up 1: send the pre-filled cost calculator', 10),
('cold_follow_1', 'Cold: follow-up 1 (day 3–4)', 'email', 'Re: {group}''s hiring',
E'Hi {first_name}, one concrete thing in case it''s useful: here''s the cost math for a group your size, with your numbers pre-filled: {calc_link}. Takes about 30 seconds to adjust.',
 6, 'Follow-up 2: last touch', 20),
('cold_follow_2', 'Cold: follow-up 2 (last one)', 'email', 'Re: {group}''s hiring',
E'Hi {first_name}, I''ll leave it here. If hiring across your offices ever gets painful, the demo stays open: {demo_link}. And if someone else at {group} owns recruiting, I''d be grateful for a name.',
 null, null, 30),
('warm_operator', 'Warm: someone inside a group', 'email', 'built something for groups like {group}',
E'Hi {first_name},\n\nHope things are good at {group}. Quick one: after ten years on the business side of dentistry I built DSO Hire, a hiring platform just for dental groups. One flat monthly fee covers every location, there are no per-listing or placement fees, and every applicant gets a fit score against how your practices actually run.\n\nI''d value your honest take, even if it''s "not for us." Here''s a live version you can click around, no sign-up: {demo_link}\n\nIf it''s useful, I''m happy to walk you through it for 15 minutes. If not, tell me what''s missing; that''s just as valuable right now.',
 5, 'Check in on the warm note', 40),
('warm_connector', 'Warm: ask for an intro', 'email', 'quick favor?',
E'Hi {first_name},\n\nI launched DSO Hire, a flat-fee hiring platform built only for multi-location dental groups (no placement fees, no per-listing fees). I''m looking for a few operators who are hiring across several offices and would give it an honest look.\n\nWho''s the one person you''d introduce me to? A name is plenty; I''ll take it from there and mention you sent me.\n\nLive demo if you''re curious: {demo_link}\n\nThanks either way,',
 4, 'Nudge for the intro', 50),
('linkedin_connect', 'LinkedIn: connection note', 'linkedin', null,
E'Hi {first_name}, I built DSO Hire, a flat-fee hiring platform just for multi-location dental groups. Noticed {group} is growing across offices. Would love to connect, and here''s a live demo if you''re curious: {demo_link}',
 7, 'Follow up on LinkedIn if they accept', 60);

/* ---------------- saved views (own-row) ---------------- */
create table public.crm_saved_views (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  surface    text not null check (surface in ('accounts','pipeline','inbox','tasks')),
  name       text not null check (char_length(name) between 1 and 60),
  query      text not null check (char_length(query) <= 1000),
  sort       smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (owner_id, surface, name)
);
create index crm_saved_views_owner_idx on public.crm_saved_views (owner_id, surface, sort);

/* ---------------- proposals ---------------- */
create sequence public.crm_quote_number_seq start 1001;
create table public.crm_quotes (
  id              uuid primary key default gen_random_uuid(),
  number          integer not null unique default nextval('public.crm_quote_number_seq'),
  opportunity_id  uuid not null references public.crm_opportunities(id) on delete cascade,
  account_id      uuid not null references public.crm_accounts(id) on delete cascade,
  contact_id      uuid references public.crm_contacts(id) on delete set null,
  plan_tier       text not null check (plan_tier in ('solo','growth','scale','enterprise')),
  billing         text not null check (billing in ('monthly','annual')),
  -- price per month as quoted; list price unless Enterprise is custom
  monthly_price   numeric(10,2) not null check (monthly_price >= 0),
  locations       integer check (locations is null or locations between 1 and 5000),
  valid_until     date not null,
  intro           text check (intro is null or char_length(intro) <= 2000),
  notes           text check (notes is null or char_length(notes) <= 2000),
  status          text not null default 'draft' check (status in ('draft','sent','accepted','declined','expired')),
  sent_at         timestamptz,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index crm_quotes_opp_idx on public.crm_quotes (opportunity_id, created_at desc);
alter sequence public.crm_quote_number_seq owned by public.crm_quotes.number;

/* ---------------- account <-> paying DSO ---------------- */
create unique index if not exists crm_accounts_dso_uidx on public.crm_accounts (dso_id) where dso_id is not null;

/* ---------------- RLS ---------------- */
do $$
declare t text;
begin
  foreach t in array array['crm_email_templates','crm_quotes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for all to authenticated using (private.is_crm_admin()) with check (private.is_crm_admin())', t || '_admin', t);
  end loop;
end $$;
grant usage on sequence public.crm_quote_number_seq to authenticated;

alter table public.crm_saved_views enable row level security;
alter table public.crm_saved_views force row level security;
revoke all on public.crm_saved_views from anon;
grant select, insert, update, delete on public.crm_saved_views to authenticated;
create policy crm_saved_views_own on public.crm_saved_views for all to authenticated
  using (private.is_crm_admin() and owner_id = auth.uid())
  with check (private.is_crm_admin() and owner_id = auth.uid());

-- The CRM's "Link to DSO" picker reads the DSO list (read-only).
create policy dsos_crm_read on public.dsos for select to authenticated
  using (private.is_crm_admin());
