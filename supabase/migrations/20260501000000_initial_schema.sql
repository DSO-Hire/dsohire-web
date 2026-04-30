-- ============================================================
-- DSO Hire — Phase 1 schema migration
-- ============================================================
-- Source of truth: src/Website & Tech/schema_and_routes_sketch.md
-- All decisions encoded here come from the 8 open questions resolved
-- on 2026-04-30 (one auth identity per role, separate Stripe Founding
-- price, passive candidate accounts, etc.).
--
-- Phase 1 = profiles + DSOs + subscriptions + system tables.
-- Phase 2 (jobs + applications) ships in a separate later migration.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Idempotent cleanup — drops any partial state from a prior failed
-- run so re-running this migration is safe.
-- ─────────────────────────────────────────────────────────────

drop table if exists public.email_log         cascade;
drop table if exists public.audit_log          cascade;
drop table if exists public.invoices           cascade;
drop table if exists public.subscriptions      cascade;
drop table if exists public.admin_users        cascade;
drop table if exists public.candidates         cascade;
drop table if exists public.dso_users          cascade;
drop table if exists public.dso_locations      cascade;
drop table if exists public.dso_slug_history   cascade;
drop table if exists public.dsos               cascade;

drop function if exists public.set_updated_at() cascade;

drop type if exists subscription_status      cascade;
drop type if exists subscription_tier        cascade;
drop type if exists admin_role               cascade;
drop type if exists candidate_availability   cascade;
drop type if exists dso_status               cascade;
drop type if exists dso_user_role            cascade;

-- ─────────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;          -- gen_random_uuid()
create extension if not exists pg_trgm;            -- typo-tolerant search (Q7)
create extension if not exists unaccent;           -- accent-insensitive search

-- ─────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────

create type dso_user_role as enum ('owner', 'admin', 'recruiter');

create type dso_status as enum ('pending', 'active', 'suspended', 'cancelled');

create type candidate_availability as enum (
  'immediate',
  '2_weeks',
  '1_month',
  'passive'
);

create type admin_role as enum ('superadmin', 'support');

create type subscription_tier as enum ('founding', 'starter', 'growth', 'enterprise');

create type subscription_status as enum (
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid'
);

-- ─────────────────────────────────────────────────────────────
-- updated_at trigger function (reused on every table)
-- ─────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- DSOs (customer organizations)
-- ─────────────────────────────────────────────────────────────

create table public.dsos (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  legal_name          text,
  website             text,
  description         text,
  logo_url            text,
  headquarters_city   text,
  headquarters_state  text,
  practice_count      int,
  slug                text not null unique,
  verified_at         timestamptz,
  status              dso_status not null default 'pending',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger dsos_set_updated_at
  before update on public.dsos
  for each row execute function public.set_updated_at();

create index dsos_slug_idx on public.dsos (slug);
create index dsos_status_idx on public.dsos (status) where status = 'active';

-- ─────────────────────────────────────────────────────────────
-- DSO slug history (Q5 — 301 redirect support on slug changes)
-- ─────────────────────────────────────────────────────────────

create table public.dso_slug_history (
  id          uuid primary key default gen_random_uuid(),
  dso_id      uuid not null references public.dsos(id) on delete cascade,
  from_slug   text not null unique,
  changed_at  timestamptz not null default now()
);

create index dso_slug_history_dso_idx on public.dso_slug_history (dso_id);

-- ─────────────────────────────────────────────────────────────
-- DSO locations (practice offices)
-- ─────────────────────────────────────────────────────────────

create table public.dso_locations (
  id              uuid primary key default gen_random_uuid(),
  dso_id          uuid not null references public.dsos(id) on delete cascade,
  name            text not null,
  address_line1   text,
  address_line2   text,
  city            text,
  state           text,
  postal_code     text,
  lat             numeric(9, 6),
  lng             numeric(9, 6),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger dso_locations_set_updated_at
  before update on public.dso_locations
  for each row execute function public.set_updated_at();

create index dso_locations_dso_idx on public.dso_locations (dso_id);
create index dso_locations_state_idx on public.dso_locations (state);

-- ─────────────────────────────────────────────────────────────
-- DSO users (employer-side profiles, joined to auth.users)
-- ─────────────────────────────────────────────────────────────

create table public.dso_users (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid not null unique references auth.users(id) on delete cascade,
  dso_id          uuid not null references public.dsos(id) on delete cascade,
  role            dso_user_role not null default 'recruiter',
  full_name       text,
  phone           text,
  avatar_url      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger dso_users_set_updated_at
  before update on public.dso_users
  for each row execute function public.set_updated_at();

create index dso_users_dso_idx on public.dso_users (dso_id);
create unique index dso_users_one_owner_per_dso
  on public.dso_users (dso_id)
  where role = 'owner';

-- ─────────────────────────────────────────────────────────────
-- Candidates (job seekers, joined to auth.users)
-- ─────────────────────────────────────────────────────────────

create table public.candidates (
  id                  uuid primary key default gen_random_uuid(),
  auth_user_id        uuid not null unique references auth.users(id) on delete cascade,
  full_name           text,
  phone               text,
  headline            text,
  summary             text,
  years_experience    int,
  current_title       text,            -- "current_role" is reserved in Postgres
  desired_roles       text[],
  desired_locations   text[],
  availability        candidate_availability,
  resume_url          text,
  linkedin_url        text,
  avatar_url          text,
  is_searchable       boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger candidates_set_updated_at
  before update on public.candidates
  for each row execute function public.set_updated_at();

-- Candidate search vector deferred to v1.1+ when the candidate-search
-- feature ships. The generated-column immutability rules around
-- setweight() + to_tsvector() with weight literals are finicky enough that
-- it's not worth solving for a feature gated behind `is_searchable`.
-- Q7 (Postgres tsvector + pg_trgm) still applies — it gets implemented
-- in the JOBS table migration (Phase 2 Week 3) where it actually matters.
create index candidates_searchable_idx
  on public.candidates (is_searchable) where is_searchable = true;

-- ─────────────────────────────────────────────────────────────
-- Admin users (Cam-only — internal staff)
-- ─────────────────────────────────────────────────────────────

create table public.admin_users (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid not null unique references auth.users(id) on delete cascade,
  role            admin_role not null default 'support',
  full_name       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger admin_users_set_updated_at
  before update on public.admin_users
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Subscriptions (one active subscription per DSO)
-- ─────────────────────────────────────────────────────────────

create table public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  dso_id                    uuid not null unique references public.dsos(id) on delete cascade,
  stripe_customer_id        text,
  stripe_subscription_id    text unique,
  stripe_price_id           text,
  tier                      subscription_tier not null,
  status                    subscription_status not null default 'incomplete',
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  cancel_at_period_end      boolean not null default false,
  seats_used                int not null default 0,
  listings_used             int not null default 0,
  founding_locked_until     timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create index subscriptions_status_idx on public.subscriptions (status);
create index subscriptions_tier_idx on public.subscriptions (tier);

-- ─────────────────────────────────────────────────────────────
-- Invoices (mirrored from Stripe webhook events)
-- ─────────────────────────────────────────────────────────────

create table public.invoices (
  id                  uuid primary key default gen_random_uuid(),
  subscription_id     uuid not null references public.subscriptions(id) on delete cascade,
  stripe_invoice_id   text not null unique,
  amount_cents        int not null,
  currency            text not null default 'usd',
  status              text not null,
  invoice_pdf_url     text,
  hosted_invoice_url  text,
  period_start        timestamptz,
  period_end          timestamptz,
  paid_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index invoices_subscription_idx on public.invoices (subscription_id);
create index invoices_status_idx on public.invoices (status);

-- ─────────────────────────────────────────────────────────────
-- Audit log (cheap to add now; pays off for SOC 2 + support later)
-- ─────────────────────────────────────────────────────────────

create table public.audit_log (
  id              uuid primary key default gen_random_uuid(),
  actor_id        uuid references auth.users(id) on delete set null,
  action          text not null,
  target_table    text,
  target_id       uuid,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);

create index audit_log_actor_idx on public.audit_log (actor_id);
create index audit_log_action_idx on public.audit_log (action);
create index audit_log_target_idx on public.audit_log (target_table, target_id);

-- ─────────────────────────────────────────────────────────────
-- Email log (Resend send debugging)
-- ─────────────────────────────────────────────────────────────

create table public.email_log (
  id                    uuid primary key default gen_random_uuid(),
  to_email              text not null,
  from_email            text,
  template              text not null,
  subject               text,
  resend_message_id     text,
  status                text not null,
  error                 text,
  related_dso_id        uuid references public.dsos(id) on delete set null,
  related_candidate_id  uuid references public.candidates(id) on delete set null,
  created_at            timestamptz not null default now()
);

create index email_log_to_idx on public.email_log (to_email);
create index email_log_template_idx on public.email_log (template);
create index email_log_status_idx on public.email_log (status);

-- ============================================================
-- End of Phase 1 schema migration.
-- Next: 20260501000001_rls_policies.sql wires Row-Level Security.
-- ============================================================
