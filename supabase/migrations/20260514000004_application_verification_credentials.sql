-- ═════════════════════════════════════════════════════════════════════════
-- 20260514000004 — Multi-credential links per verification (5G.e Tier 2)
-- ═════════════════════════════════════════════════════════════════════════
--
-- 5G.e shipped earlier today with `application_verifications` holding a
-- SINGLE linked credential (linked_credential_type + linked_credential_id).
-- The stress test surfaced the real case: a candidate legitimately holds
-- multiple credentials under one requirement (several certifications, a
-- couple of state licenses). Migrate to a join table so each
-- `application_verifications` row carries 0..N credential links.
--
-- Done now, deliberately: 5G.e shipped hours ago, so there is exactly ONE
-- test application with linked credentials. The backfill is trivial and we
-- can drop the singular columns cleanly — no vestigial schema, no messy
-- backfill later.
--
-- NOTE on posture: this table stores the candidate's links to THEIR OWN
-- first-party credentials. It is never a verification assertion by DSO Hire
-- — see feedback_verification_conduit_not_verifier.md. Candidate furnishes;
-- employer evaluates; DSO Hire is the conduit.
--
-- All `if not exists` / `drop ... if exists` so the migration is re-runnable.

-- ── join table ──────────────────────────────────────────────────────────────

create table if not exists public.application_verification_credentials (
  id uuid primary key default gen_random_uuid(),
  application_verification_id uuid not null
    references public.application_verifications(id) on delete cascade,
  credential_type text not null,
  credential_id   uuid not null,
  created_at      timestamptz not null default now(),
  constraint avc_credential_type_check
    check (credential_type in (
      'candidate_license',
      'candidate_certification',
      'candidate_education'
    )),
  constraint avc_unique
    unique (application_verification_id, credential_type, credential_id)
);

create index if not exists idx_avc_application_verification_id
  on public.application_verification_credentials (application_verification_id);

alter table public.application_verification_credentials enable row level security;

-- RLS — one hop further than application_verifications: through
-- application_verifications -> applications. Mirrors that table's model
-- (candidate manages own; the job's DSO reads).

drop policy if exists "AVC: candidate read own" on public.application_verification_credentials;
create policy "AVC: candidate read own"
  on public.application_verification_credentials for select
  using (exists (
    select 1
    from public.application_verifications av
    join public.applications a on a.id = av.application_id
    join public.candidates c on c.id = a.candidate_id
    where av.id = application_verification_credentials.application_verification_id
      and c.auth_user_id = auth.uid()
  ));

drop policy if exists "AVC: DSO read own jobs" on public.application_verification_credentials;
create policy "AVC: DSO read own jobs"
  on public.application_verification_credentials for select
  using (exists (
    select 1
    from public.application_verifications av
    join public.applications a on a.id = av.application_id
    where av.id = application_verification_credentials.application_verification_id
      and user_can_access_job(a.job_id)
  ));

drop policy if exists "AVC: candidate insert own" on public.application_verification_credentials;
create policy "AVC: candidate insert own"
  on public.application_verification_credentials for insert
  with check (exists (
    select 1
    from public.application_verifications av
    join public.applications a on a.id = av.application_id
    join public.candidates c on c.id = a.candidate_id
    where av.id = application_verification_credentials.application_verification_id
      and c.auth_user_id = auth.uid()
  ));

drop policy if exists "AVC: candidate delete own" on public.application_verification_credentials;
create policy "AVC: candidate delete own"
  on public.application_verification_credentials for delete
  using (exists (
    select 1
    from public.application_verifications av
    join public.applications a on a.id = av.application_id
    join public.candidates c on c.id = a.candidate_id
    where av.id = application_verification_credentials.application_verification_id
      and c.auth_user_id = auth.uid()
  ));

-- ── backfill from the singular columns, then retire them ────────────────────

insert into public.application_verification_credentials
  (application_verification_id, credential_type, credential_id)
select id, linked_credential_type, linked_credential_id
from public.application_verifications
where linked_credential_type is not null
  and linked_credential_id is not null
on conflict do nothing;

alter table public.application_verifications
  drop constraint if exists application_verifications_credential_type_check;
alter table public.application_verifications
  drop column if exists linked_credential_type,
  drop column if exists linked_credential_id;

comment on table public.application_verification_credentials is
  '5G.e Tier 2 (2026-05-14). 0..N links to a candidate''s OWN profile credentials per application_verifications row — supersedes the singular linked_credential_* columns. Candidate furnishes; never a verification assertion by DSO Hire.';
