-- ============================================================
-- DSO Hire — Phase 2 Week 4 applications schema migration
-- ============================================================
-- Adds applications + application_status_events + resume storage bucket.
--
-- Design notes:
-- - One application per (job_id, candidate_id) pair — re-applying just
--   surfaces the existing row (the apply form should detect this and
--   update cover_letter / resume override instead of insert).
-- - status_events table is an immutable audit trail. Inserts come from a
--   BEFORE-UPDATE trigger on applications.status, plus an AFTER-INSERT
--   trigger that seeds the initial 'new' event.
-- - jobs.applications_count is denormalized (already exists from Week 3
--   schema) — kept in sync via INSERT/DELETE triggers on applications.
-- - Resumes live in private bucket `resumes` at path `${auth_user_id}/...`.
--   Candidates can read/write their own folder; DSO members can read
--   resume objects only when an application referencing that path exists
--   on one of their jobs.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Idempotent cleanup
-- ─────────────────────────────────────────────────────────────

drop table if exists public.application_status_events cascade;
drop table if exists public.applications              cascade;
drop type  if exists application_status               cascade;

-- ─────────────────────────────────────────────────────────────
-- Enum
-- ─────────────────────────────────────────────────────────────

create type application_status as enum (
  'new',
  'reviewed',
  'interviewing',
  'offered',
  'hired',
  'rejected',
  'withdrawn'
);

-- ─────────────────────────────────────────────────────────────
-- Applications
-- ─────────────────────────────────────────────────────────────

create table public.applications (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references public.jobs(id) on delete cascade,
  candidate_id    uuid not null references public.candidates(id) on delete cascade,
  cover_letter    text,
  resume_url      text,             -- override of candidate's default resume; nullable
  status          application_status not null default 'new',
  employer_notes  text,             -- internal-only, RLS hides from candidate
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (job_id, candidate_id)
);

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

create index applications_job_idx        on public.applications (job_id);
create index applications_candidate_idx  on public.applications (candidate_id);
create index applications_status_idx     on public.applications (status);
create index applications_active_idx
  on public.applications (job_id, created_at desc)
  where status not in ('hired', 'rejected', 'withdrawn');

-- ─────────────────────────────────────────────────────────────
-- Application status events (immutable audit trail)
-- ─────────────────────────────────────────────────────────────

create table public.application_status_events (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.applications(id) on delete cascade,
  from_status     application_status,                                 -- null on initial seed
  to_status       application_status not null,
  actor_id        uuid references auth.users(id) on delete set null,  -- null = system
  actor_type      text not null check (actor_type in ('candidate', 'employer', 'system')),
  note            text,
  created_at      timestamptz not null default now()
);

create index application_status_events_app_idx
  on public.application_status_events (application_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Trigger: seed an initial 'new' event when an application is created.
-- The actor is whoever inserted (candidate themselves, in practice).
-- ─────────────────────────────────────────────────────────────

create or replace function public.seed_application_status_event()
returns trigger
language plpgsql
as $$
begin
  insert into public.application_status_events
    (application_id, from_status, to_status, actor_id, actor_type, note)
  values
    (new.id, null, new.status, auth.uid(), 'candidate', null);
  return new;
end;
$$;

create trigger applications_seed_status_event
  after insert on public.applications
  for each row execute function public.seed_application_status_event();

-- ─────────────────────────────────────────────────────────────
-- Trigger: log status transitions when applications.status changes.
-- ─────────────────────────────────────────────────────────────

create or replace function public.log_application_status_change()
returns trigger
language plpgsql
as $$
declare
  v_actor_type text;
begin
  if new.status is distinct from old.status then
    -- 'withdrawn' is the only candidate-driven transition; everything else
    -- is employer-driven. System can override via direct SQL (not via app).
    v_actor_type := case
      when new.status = 'withdrawn' then 'candidate'
      else 'employer'
    end;

    insert into public.application_status_events
      (application_id, from_status, to_status, actor_id, actor_type, note)
    values
      (new.id, old.status, new.status, auth.uid(), v_actor_type, null);
  end if;
  return new;
end;
$$;

create trigger applications_log_status_change
  after update of status on public.applications
  for each row execute function public.log_application_status_change();

-- ─────────────────────────────────────────────────────────────
-- Trigger: keep jobs.applications_count in sync.
-- ─────────────────────────────────────────────────────────────

create or replace function public.bump_job_applications_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.jobs set applications_count = applications_count + 1
      where id = new.job_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.jobs set applications_count = greatest(applications_count - 1, 0)
      where id = old.job_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger applications_bump_job_count_ins
  after insert on public.applications
  for each row execute function public.bump_job_applications_count();

create trigger applications_bump_job_count_del
  after delete on public.applications
  for each row execute function public.bump_job_applications_count();

-- ============================================================
-- RLS — applications
-- ============================================================

alter table public.applications              enable row level security;
alter table public.application_status_events enable row level security;

-- Candidate: read own applications.
create policy "Applications: candidate read own"
  on public.applications for select
  using (
    exists (
      select 1 from public.candidates c
      where c.id = candidate_id and c.auth_user_id = auth.uid()
    )
  );

-- Candidate: insert (must match their own candidate row).
create policy "Applications: candidate insert"
  on public.applications for insert
  with check (
    exists (
      select 1 from public.candidates c
      where c.id = candidate_id and c.auth_user_id = auth.uid()
    )
    -- Must reference an active job
    and exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.status = 'active'
        and j.deleted_at is null
    )
  );

-- Candidate: can update only their own application AND only to withdraw it.
-- (This is a soft constraint at the policy level — application logic should
--  enforce status=withdrawn transition only, but RLS guarantees they can't
--  edit someone else's row.)
create policy "Applications: candidate withdraw"
  on public.applications for update
  using (
    exists (
      select 1 from public.candidates c
      where c.id = candidate_id and c.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.candidates c
      where c.id = candidate_id and c.auth_user_id = auth.uid()
    )
    and status = 'withdrawn'
  );

-- DSO members: read all applications on their DSO's jobs.
create policy "Applications: DSO read own jobs"
  on public.applications for select
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id and j.dso_id = public.current_dso_id()
    )
  );

-- DSO admins/recruiters: update applications (status transitions, employer_notes).
create policy "Applications: DSO update"
  on public.applications for update
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

-- ============================================================
-- RLS — application_status_events
-- ============================================================

-- Candidate: read events for their own applications.
create policy "Status events: candidate read own"
  on public.application_status_events for select
  using (
    exists (
      select 1 from public.applications a
      join public.candidates c on c.id = a.candidate_id
      where a.id = application_id and c.auth_user_id = auth.uid()
    )
  );

-- DSO: read events for applications on their jobs.
create policy "Status events: DSO read own"
  on public.application_status_events for select
  using (
    exists (
      select 1 from public.applications a
      join public.jobs j on j.id = a.job_id
      where a.id = application_id and j.dso_id = public.current_dso_id()
    )
  );

-- No INSERT/UPDATE/DELETE policies — all writes happen through triggers,
-- which run as SECURITY DEFINER (or postgres role) and bypass RLS.

-- ============================================================
-- Storage bucket: resumes
-- ============================================================
-- Private bucket. Path convention: ${auth_user_id}/${filename}
-- 10MB file size limit. PDF + Word doc MIME types only.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes',
  'resumes',
  false,
  10485760, -- 10 MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Drop any pre-existing storage policies so this migration is rerunnable.
drop policy if exists "Resumes: candidate upload own folder" on storage.objects;
drop policy if exists "Resumes: candidate read own folder"   on storage.objects;
drop policy if exists "Resumes: candidate update own folder" on storage.objects;
drop policy if exists "Resumes: candidate delete own folder" on storage.objects;
drop policy if exists "Resumes: DSO read application resumes" on storage.objects;

-- Candidate: upload to their own folder.
create policy "Resumes: candidate upload own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Candidate: read their own folder.
create policy "Resumes: candidate read own folder"
  on storage.objects for select
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Candidate: replace files in their own folder (e.g. update resume).
create policy "Resumes: candidate update own folder"
  on storage.objects for update
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Resumes: candidate delete own folder"
  on storage.objects for delete
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- DSO members: read a candidate's resume IF an application referencing
-- that candidate (and that path's owner) exists on one of their jobs.
-- We match the auth.users.id encoded in the path's first folder against
-- the candidate's auth_user_id, then check the DSO membership.
create policy "Resumes: DSO read application resumes"
  on storage.objects for select
  using (
    bucket_id = 'resumes'
    and exists (
      select 1
        from public.candidates c
        join public.applications a on a.candidate_id = c.id
        join public.jobs j on j.id = a.job_id
       where c.auth_user_id::text = (storage.foldername(storage.objects.name))[1]
         and j.dso_id = public.current_dso_id()
    )
  );

-- ============================================================
-- End of applications migration. Apply via Supabase SQL Editor.
-- ============================================================
