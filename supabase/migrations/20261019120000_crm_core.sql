-- DSO Hire CRM, phase 1 (2026-10-19).
--
-- A DSO Hire port of the EDC CRM (edc-web /crm), translated from M&A
-- advisory to SaaS sales:
--   EDC crm_sellers / crm_buyers   ->  crm_accounts (dental groups we sell to)
--   EDC crm_contacts               ->  crm_contacts (people at an account)
--   EDC crm_deals                  ->  crm_opportunities (a subscription sale)
--   EDC crm_deal_events            ->  crm_events (one activity log: notes,
--                                      stage moves, emails, calls, demo opens)
--   EDC crm_tasks                  ->  crm_tasks (ball in court: us / prospect / partner)
--   EDC crm_lead_triage            ->  crm_lead_triage (over marketing_leads;
--                                      the raw lead row stays immutable)
--   EDC prefs / bell reads / weights -> same tables, same shapes
--
-- Access model (same layering as EDC): every table has RLS enabled AND
-- forced, with one policy `using (private.is_crm_admin())`. The function
-- requires BOTH an admin_users row with role 'superadmin' AND an aal2 JWT
-- (a verified second factor this session). The app checks the same thing in
-- the layout and in every server action; Postgres refuses on its own if
-- either is missing. Own-row tables (prefs, notification reads) add
-- user_id = auth.uid().
--
-- Nothing here touches EDC: different project, different database.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_crm_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (
       select 1 from public.admin_users a
       where a.auth_user_id = auth.uid() and a.role = 'superadmin'
     );
$$;
revoke all on function private.is_crm_admin() from public;
grant execute on function private.is_crm_admin() to authenticated;

/* ---------------- accounts ---------------- */
create table public.crm_accounts (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 1 and 160),
  website          text check (website is null or char_length(website) <= 300),
  hq_state         text check (hq_state is null or char_length(hq_state) <= 40),
  states           text[] not null default '{}',
  locations        integer check (locations is null or locations between 0 and 5000),
  locations_note   text check (locations_note is null or char_length(locations_note) <= 300),
  open_roles       integer check (open_roles is null or open_roles between 0 and 100000),
  hiring_signal    text check (hiring_signal is null or char_length(hiring_signal) <= 2000),
  growth_signal    text check (growth_signal is null or char_length(growth_signal) <= 2000),
  current_tool     text check (current_tool is null or char_length(current_tool) <= 200),
  hiring_owner_title text check (hiring_owner_title is null or char_length(hiring_owner_title) <= 200),
  fit_tier         text check (fit_tier is null or fit_tier in ('A','B','C')),
  status           text not null default 'target'
                   check (status in ('target','contacted','engaged','customer','churned','disqualified')),
  source           text not null default 'research'
                   check (source in ('research','website','demo','referral','warm_intro','outbound','inbound','conference','other')),
  owner_id         uuid references auth.users(id) on delete set null,
  warmth           smallint check (warmth is null or warmth between 1 and 5),
  last_touch_at    timestamptz,
  next_step        text check (next_step is null or char_length(next_step) <= 300),
  next_step_due    date,
  notes            text check (notes is null or char_length(notes) <= 20000),
  -- Research provenance: source URLs and the date the facts were seen.
  sources          text[] not null default '{}',
  researched_on    date,
  -- Links to the rest of DSO Hire:
  demo_for_key     text unique check (demo_for_key is null or char_length(demo_for_key) between 1 and 60),
  dso_id           uuid references public.dsos(id) on delete set null,
  archived_at      timestamptz,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index crm_accounts_name_uniq on public.crm_accounts (lower(name)) where archived_at is null;
create index crm_accounts_status_idx on public.crm_accounts (status) where archived_at is null;
create index crm_accounts_next_step_idx on public.crm_accounts (next_step_due) where archived_at is null;

/* ---------------- contacts ---------------- */
create table public.crm_contacts (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.crm_accounts(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 160),
  title        text check (title is null or char_length(title) <= 160),
  role         text not null default 'other'
               check (role in ('decision_maker','champion','connector','recruiter','user','other')),
  email        text check (email is null or char_length(email) <= 320),
  phone        text check (phone is null or char_length(phone) <= 40),
  linkedin_url text check (linkedin_url is null or char_length(linkedin_url) <= 300),
  notes        text check (notes is null or char_length(notes) <= 5000),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index crm_contacts_account_idx on public.crm_contacts (account_id);

/* ---------------- opportunities ---------------- */
create table public.crm_opportunities (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.crm_accounts(id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 160),
  stage             text not null default 'target' check (char_length(stage) between 1 and 40),
  custom_stages     text[],
  owner_id          uuid references auth.users(id) on delete set null,
  primary_contact_id uuid references public.crm_contacts(id) on delete set null,
  plan_tier         text check (plan_tier is null or plan_tier in ('solo','growth','scale','enterprise')),
  billing           text check (billing is null or billing in ('monthly','annual')),
  -- Monthly value in dollars (annual plans: the monthly equivalent).
  mrr               numeric(10,2) check (mrr is null or mrr >= 0),
  close_probability smallint check (close_probability is null or close_probability between 0 and 100),
  target_close      date,
  next_step         text check (next_step is null or char_length(next_step) <= 300),
  next_step_due     date,
  stage_changed_at  timestamptz not null default now(),
  lost_reason       text check (lost_reason is null or lost_reason in
                    ('no_response','no_budget','timing','chose_competitor','staying_with_agency','staying_with_current_tool','not_a_fit','went_dark','other')),
  lost_note         text check (lost_note is null or char_length(lost_note) <= 2000),
  lost_at           timestamptz,
  won_at            timestamptz,
  notes             text check (notes is null or char_length(notes) <= 20000),
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index crm_opps_stage_idx on public.crm_opportunities (stage);
create index crm_opps_account_idx on public.crm_opportunities (account_id);

/* ---------------- events (the activity log) ---------------- */
create table public.crm_events (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.crm_accounts(id) on delete cascade,
  opportunity_id uuid references public.crm_opportunities(id) on delete set null,
  contact_id     uuid references public.crm_contacts(id) on delete set null,
  kind           text not null check (kind in
                 ('note','email','call','meeting','linkedin','stage_change','field_change','demo_open','lead','won','lost','task_done','import')),
  body           text check (body is null or char_length(body) <= 20000),
  meta           jsonb not null default '{}'::jsonb,
  occurred_at    timestamptz not null default now(),
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index crm_events_account_time_idx on public.crm_events (account_id, occurred_at desc);
create index crm_events_opp_time_idx on public.crm_events (opportunity_id, occurred_at desc);
create index crm_events_time_idx on public.crm_events (occurred_at desc);

/* ---------------- tasks ---------------- */
create table public.crm_tasks (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid references public.crm_accounts(id) on delete cascade,
  opportunity_id uuid references public.crm_opportunities(id) on delete cascade,
  contact_id     uuid references public.crm_contacts(id) on delete set null,
  title          text not null check (char_length(title) between 1 and 300),
  notes          text check (notes is null or char_length(notes) <= 5000),
  ball           text not null default 'us' check (ball in ('us','prospect','partner')),
  priority       text not null default 'normal' check (priority in ('high','normal','low')),
  repeat         text not null default 'none' check (repeat in ('none','weekly','monthly')),
  owner_id       uuid references auth.users(id) on delete set null,
  due_date       date,
  waiting_since  timestamptz,
  completed_at   timestamptz,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index crm_tasks_open_idx on public.crm_tasks (due_date) where completed_at is null;
create index crm_tasks_account_idx on public.crm_tasks (account_id);
create index crm_tasks_opp_idx on public.crm_tasks (opportunity_id);

/* ---------------- lead triage (over marketing_leads) ---------------- */
create table public.crm_lead_triage (
  lead_id            uuid primary key references public.marketing_leads(id) on delete cascade,
  status             text not null default 'new'
                     check (status in ('new','contacted','qualified','disqualified','converted')),
  owner_id           uuid references auth.users(id) on delete set null,
  disqualify_reason  text check (disqualify_reason is null or disqualify_reason in
                     ('spam','candidate','vendor','duplicate','not_a_fit','test','other')),
  account_id         uuid references public.crm_accounts(id) on delete set null,
  first_contacted_at timestamptz,
  status_changed_at  timestamptz not null default now(),
  check (status <> 'disqualified' or disqualify_reason is not null)
);

/* ---------------- workspace: prefs, bell reads, settings ---------------- */
create table public.crm_user_prefs (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  density          text not null default 'comfortable' check (density in ('comfortable','compact')),
  motion           text not null default 'full' check (motion in ('full','reduced')),
  today_scope      text not null default 'mine' check (today_scope in ('mine','all')),
  quiet_after_days smallint not null default 7 check (quiet_after_days between 3 and 90),
  bell_seen_at     timestamptz,
  updated_at       timestamptz not null default now()
);

create table public.crm_notification_reads (
  user_id   uuid not null references auth.users(id) on delete cascade,
  event_key text not null check (char_length(event_key) between 1 and 200),
  read_at   timestamptz not null default now(),
  primary key (user_id, event_key)
);

create table public.crm_workspace_settings (
  id             boolean primary key default true check (id),
  stage_weights  jsonb not null default '{}'::jsonb,
  updated_by     uuid references auth.users(id) on delete set null,
  updated_at     timestamptz not null default now()
);
insert into public.crm_workspace_settings (id) values (true) on conflict do nothing;

/* ---------------- RLS: enabled, forced, admin+aal2 only ---------------- */
do $$
declare t text;
begin
  foreach t in array array['crm_accounts','crm_contacts','crm_opportunities','crm_events','crm_tasks','crm_lead_triage','crm_workspace_settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for all to authenticated using (private.is_crm_admin()) with check (private.is_crm_admin())', t || '_admin', t);
  end loop;
end $$;

-- Settings row: no deletes, ever.
revoke delete on public.crm_workspace_settings from authenticated;

-- Own-row tables.
alter table public.crm_user_prefs enable row level security;
alter table public.crm_user_prefs force row level security;
revoke all on public.crm_user_prefs from anon;
grant select, insert, update on public.crm_user_prefs to authenticated;
create policy crm_user_prefs_own on public.crm_user_prefs for all to authenticated
  using (private.is_crm_admin() and user_id = auth.uid())
  with check (private.is_crm_admin() and user_id = auth.uid());

alter table public.crm_notification_reads enable row level security;
alter table public.crm_notification_reads force row level security;
revoke all on public.crm_notification_reads from anon;
grant select, insert, delete on public.crm_notification_reads to authenticated;
create policy crm_notification_reads_own on public.crm_notification_reads for all to authenticated
  using (private.is_crm_admin() and user_id = auth.uid())
  with check (private.is_crm_admin() and user_id = auth.uid());

-- The CRM reads (never writes) the lead + demo tables through the admin
-- session. They stay service-role-only for everyone else.
create policy marketing_leads_crm_read on public.marketing_leads for select to authenticated
  using (private.is_crm_admin());
grant select on public.marketing_leads to authenticated;
create policy demo_visits_crm_read on public.demo_visits for select to authenticated
  using (private.is_crm_admin());
grant select on public.demo_visits to authenticated;
