-- ═════════════════════════════════════════════════════════════════════════
-- 20260514000003 — Job verification framework, Tier 2 (Phase 5G.e)
-- ═════════════════════════════════════════════════════════════════════════
--
-- The extensible verification framework, v1 = "requirements + candidate
-- attestation." No third-party data, no FCRA exposure — the candidate
-- self-attests and optionally links an existing profile credential as
-- proof. Tier 3 (Checkr-backed third-party verification) plugs a verified-
-- status path onto application_verifications later, behind counsel review.
--
-- Two tables:
--   • job_verification_requirements — what a job requires. Recruiter-
--     configured in BOTH wizards. RLS mirrors job_screening_questions
--     (DSO owner/admin/recruiter manage; public reads on active jobs).
--   • application_verifications — the candidate's attestation per required
--     verification. RLS mirrors application_question_answers (candidate
--     manages own; the job's DSO reads).
--
-- verification_type is a closed enum, kept 1:1 with the TS module
-- src/lib/verifications/types.ts.
--
-- All `if not exists` / `drop policy if exists` so the migration is
-- safely re-runnable.

-- ── job_verification_requirements ───────────────────────────────────────────

create table if not exists public.job_verification_requirements (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references public.jobs(id) on delete cascade,
  verification_type text not null,
  required        boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint job_verification_requirements_type_check
    check (verification_type in (
      'professional_license',
      'education',
      'certification',
      'right_to_work',
      'background_check_consent'
    )),
  constraint job_verification_requirements_unique unique (job_id, verification_type)
);

create index if not exists idx_job_verification_requirements_job_id
  on public.job_verification_requirements (job_id);

alter table public.job_verification_requirements enable row level security;

drop policy if exists "Job verifications: DSO read own" on public.job_verification_requirements;
create policy "Job verifications: DSO read own"
  on public.job_verification_requirements for select
  using (exists (
    select 1 from public.jobs j
    where j.id = job_verification_requirements.job_id
      and j.dso_id = current_dso_id()
  ));

drop policy if exists "Job verifications: public read active job" on public.job_verification_requirements;
create policy "Job verifications: public read active job"
  on public.job_verification_requirements for select
  using (exists (
    select 1 from public.jobs j
    where j.id = job_verification_requirements.job_id
      and j.status = 'active'::job_status
      and j.deleted_at is null
  ));

drop policy if exists "Job verifications: DSO insert" on public.job_verification_requirements;
create policy "Job verifications: DSO insert"
  on public.job_verification_requirements for insert
  with check (exists (
    select 1 from public.jobs j
    where j.id = job_verification_requirements.job_id
      and j.dso_id = current_dso_id()
      and current_dso_user_role() = any (array['owner'::dso_user_role, 'admin'::dso_user_role, 'recruiter'::dso_user_role])
  ));

drop policy if exists "Job verifications: DSO update" on public.job_verification_requirements;
create policy "Job verifications: DSO update"
  on public.job_verification_requirements for update
  using (exists (
    select 1 from public.jobs j
    where j.id = job_verification_requirements.job_id
      and j.dso_id = current_dso_id()
      and current_dso_user_role() = any (array['owner'::dso_user_role, 'admin'::dso_user_role, 'recruiter'::dso_user_role])
  ))
  with check (exists (
    select 1 from public.jobs j
    where j.id = job_verification_requirements.job_id
      and j.dso_id = current_dso_id()
      and current_dso_user_role() = any (array['owner'::dso_user_role, 'admin'::dso_user_role, 'recruiter'::dso_user_role])
  ));

drop policy if exists "Job verifications: DSO delete" on public.job_verification_requirements;
create policy "Job verifications: DSO delete"
  on public.job_verification_requirements for delete
  using (exists (
    select 1 from public.jobs j
    where j.id = job_verification_requirements.job_id
      and j.dso_id = current_dso_id()
      and current_dso_user_role() = any (array['owner'::dso_user_role, 'admin'::dso_user_role, 'recruiter'::dso_user_role])
  ));

comment on table public.job_verification_requirements is
  '5G.e Tier 2 (2026-05-14). Per-job verification requirements (professional license, education, certification, right-to-work, background-check consent). Recruiter-configured in both wizards.';

-- ── application_verifications ───────────────────────────────────────────────

create table if not exists public.application_verifications (
  id                     uuid primary key default gen_random_uuid(),
  application_id         uuid not null references public.applications(id) on delete cascade,
  verification_type      text not null,
  attested               boolean not null default false,
  attested_at            timestamptz,
  -- Optional link to an existing candidate profile credential as proof.
  linked_credential_type text,
  linked_credential_id   uuid,
  note                   text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint application_verifications_type_check
    check (verification_type in (
      'professional_license',
      'education',
      'certification',
      'right_to_work',
      'background_check_consent'
    )),
  constraint application_verifications_credential_type_check
    check (linked_credential_type is null or linked_credential_type in (
      'candidate_license',
      'candidate_certification',
      'candidate_education'
    )),
  constraint application_verifications_unique unique (application_id, verification_type)
);

create index if not exists idx_application_verifications_application_id
  on public.application_verifications (application_id);

alter table public.application_verifications enable row level security;

drop policy if exists "App verifications: candidate read own" on public.application_verifications;
create policy "App verifications: candidate read own"
  on public.application_verifications for select
  using (exists (
    select 1 from public.applications a
    join public.candidates c on c.id = a.candidate_id
    where a.id = application_verifications.application_id
      and c.auth_user_id = auth.uid()
  ));

drop policy if exists "App verifications: DSO read own jobs" on public.application_verifications;
create policy "App verifications: DSO read own jobs"
  on public.application_verifications for select
  using (exists (
    select 1 from public.applications a
    where a.id = application_verifications.application_id
      and user_can_access_job(a.job_id)
  ));

drop policy if exists "App verifications: candidate insert own" on public.application_verifications;
create policy "App verifications: candidate insert own"
  on public.application_verifications for insert
  with check (exists (
    select 1 from public.applications a
    join public.candidates c on c.id = a.candidate_id
    where a.id = application_verifications.application_id
      and c.auth_user_id = auth.uid()
  ));

drop policy if exists "App verifications: candidate update own" on public.application_verifications;
create policy "App verifications: candidate update own"
  on public.application_verifications for update
  using (exists (
    select 1 from public.applications a
    join public.candidates c on c.id = a.candidate_id
    where a.id = application_verifications.application_id
      and c.auth_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.applications a
    join public.candidates c on c.id = a.candidate_id
    where a.id = application_verifications.application_id
      and c.auth_user_id = auth.uid()
  ));

drop trigger if exists application_verifications_set_updated_at on public.application_verifications;
create trigger application_verifications_set_updated_at
  before update on public.application_verifications
  for each row execute function public.set_updated_at();

comment on table public.application_verifications is
  '5G.e Tier 2 (2026-05-14). Candidate self-attestation per required verification, with an optional link to an existing profile credential as proof. Tier 3 adds a Checkr-backed verified-status path here.';
