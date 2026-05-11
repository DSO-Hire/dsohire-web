-- ─────────────────────────────────────────────────────────────
-- Phase 5D — Job attachments (E1.10)
-- ─────────────────────────────────────────────────────────────
--
-- Employer-uploaded documents attached to a job posting: pro forma
-- comp models, benefits PDFs, practice tour decks, schedule
-- templates, day-1 production targets, etc.
--
-- Industry standard at Greenhouse / Lever / Workable / SmartRecruiters;
-- absent from DentalPost / iHireDental / DentalWorkers / DDS Match.
-- Cam brainstormed 2026-05-08; locked PRE-LAUNCH 2026-05-11 in the
-- competitive re-audit (Surface ID E1.10). High leverage for the DSO
-- niche because associate-dentist comp structure varies wildly between
-- groups and surfacing the actual model is exactly the "real signal
-- that other boards can't show" positioning DSO Hire was built around.
--
-- Tier caps (Starter 1-2 / Growth unlimited) enforced in the server
-- action, not in DB — keeps the schema simple and lets us A/B caps later
-- without a migration.
--
-- The `hide_until_applied` flag is the privacy lever: employers can
-- gate sensitive comp models behind the apply gate while keeping the
-- benefits PDF public. Storage policy + row RLS both enforce this.

-- ─────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────

create table public.job_attachments (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null references public.jobs(id) on delete cascade,
  storage_path        text not null,
  display_name        text not null,
  file_size_bytes     bigint not null,
  mime_type           text not null,
  sort_order          smallint not null default 0,
  hide_until_applied  boolean not null default false,
  created_by          uuid references public.dso_users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index job_attachments_job_idx
  on public.job_attachments (job_id, sort_order);

create trigger job_attachments_set_updated_at
  before update on public.job_attachments
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 2. RLS — row-level
-- ─────────────────────────────────────────────────────────────

alter table public.job_attachments enable row level security;

-- Public read: non-gated attachments on active jobs only.
create policy "Job attachments: public read non-gated"
  on public.job_attachments for select
  using (
    hide_until_applied = false
    and exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.status = 'active'
        and j.deleted_at is null
    )
  );

-- Applied candidates see ALL attachments for jobs they've applied to
-- (including hide_until_applied=true ones — that's the whole point of
-- the gate). Uses the same auth.uid() → candidate.auth_user_id pattern
-- used elsewhere.
create policy "Job attachments: applicant read all"
  on public.job_attachments for select
  using (
    exists (
      select 1 from public.applications a
      join public.candidates c on c.id = a.candidate_id
      where a.job_id = job_attachments.job_id
        and c.auth_user_id = auth.uid()
    )
  );

-- DSO members see all attachments for their own DSO's jobs.
create policy "Job attachments: members read own"
  on public.job_attachments for select
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id and j.dso_id = public.current_dso_id()
    )
  );

-- Recruiter/admin/owner write (CRUD).
create policy "Job attachments: recruiter write"
  on public.job_attachments for all
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.dso_id = public.current_dso_id()
        and public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
    )
  )
  with check (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.dso_id = public.current_dso_id()
        and public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 3. Storage bucket — private, signed-URL only
-- ─────────────────────────────────────────────────────────────
--
-- Path convention: `{job_id}/{attachment_id}.{ext}`
-- We rely on this layout in the storage RLS below (splits on '/' to
-- extract the job_id directory).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-attachments',
  'job-attachments',
  false,
  20971520,  -- 20 MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 4. Storage RLS — mirror row-level policies
-- ─────────────────────────────────────────────────────────────
--
-- Path-prefix join: `split_part(name, '/', 1)::uuid = jobs.id`.
-- Storage policies inherit joined-table RLS — but jobs RLS only joins
-- through dso_users (no recursion back through job_attachments), so we
-- don't need a SECURITY DEFINER helper here. If we hit recursion in
-- testing, wrap in a stable function.

create policy "Job attachments storage: dso members read"
  on storage.objects for select
  using (
    bucket_id = 'job-attachments'
    and exists (
      select 1 from public.jobs j
      where j.id = nullif(split_part(name, '/', 1), '')::uuid
        and j.dso_id = public.current_dso_id()
    )
  );

create policy "Job attachments storage: applicant read"
  on storage.objects for select
  using (
    bucket_id = 'job-attachments'
    and exists (
      select 1 from public.applications a
      join public.candidates c on c.id = a.candidate_id
      where a.job_id = nullif(split_part(name, '/', 1), '')::uuid
        and c.auth_user_id = auth.uid()
    )
  );

create policy "Job attachments storage: public read non-gated"
  on storage.objects for select
  using (
    bucket_id = 'job-attachments'
    and exists (
      select 1 from public.job_attachments ja
      join public.jobs j on j.id = ja.job_id
      where ja.storage_path = storage.objects.name
        and ja.hide_until_applied = false
        and j.status = 'active'
        and j.deleted_at is null
    )
  );

create policy "Job attachments storage: recruiter write"
  on storage.objects for insert
  with check (
    bucket_id = 'job-attachments'
    and exists (
      select 1 from public.jobs j
      where j.id = nullif(split_part(name, '/', 1), '')::uuid
        and j.dso_id = public.current_dso_id()
        and public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
    )
  );

create policy "Job attachments storage: recruiter update"
  on storage.objects for update
  using (
    bucket_id = 'job-attachments'
    and exists (
      select 1 from public.jobs j
      where j.id = nullif(split_part(name, '/', 1), '')::uuid
        and j.dso_id = public.current_dso_id()
        and public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
    )
  );

create policy "Job attachments storage: recruiter delete"
  on storage.objects for delete
  using (
    bucket_id = 'job-attachments'
    and exists (
      select 1 from public.jobs j
      where j.id = nullif(split_part(name, '/', 1), '')::uuid
        and j.dso_id = public.current_dso_id()
        and public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 5. Comments
-- ─────────────────────────────────────────────────────────────

comment on table public.job_attachments is
  'E1.10 (Phase 5D, shipped 2026-05-11). Employer-uploaded job documents (pro forma comp, benefits PDFs, practice tour decks). Tier caps enforced in server action.';

comment on column public.job_attachments.hide_until_applied is
  'When true, only DSO members + candidates who have applied to this job can read the row + the storage object. Public surfaces see only the (non-hidden) attachment list.';
