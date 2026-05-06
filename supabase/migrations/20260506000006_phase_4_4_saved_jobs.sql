-- ─────────────────────────────────────────────────────────────────────────
-- 20260506000006_phase_4_4_saved_jobs.sql
--
-- Phase 4.4 saved-jobs slice (parity sprint).
-- Canonical scope: Competitive Research/Parity_Sprint_Scope_2026-05-06.md §4.4
--
-- Creates the saved_jobs table that powers the bookmark control on
-- /jobs/[id] + the future "Saved" tab on /candidate/applications.
--
-- One row per (candidate_id, job_id). Re-saving an already-saved job is
-- a no-op; un-saving deletes the row. Soft-delete + history are
-- intentionally not modeled — saving + unsaving are low-stakes
-- operations that don't need an audit trail.
--
-- Single transaction. No enum changes.
-- ─────────────────────────────────────────────────────────────────────────

begin;

create table public.saved_jobs (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid not null references public.candidates(id) on delete cascade,
  job_id        uuid not null references public.jobs(id) on delete cascade,
  saved_at      timestamptz not null default now(),
  unique (candidate_id, job_id)
);

create index saved_jobs_candidate_idx
  on public.saved_jobs (candidate_id, saved_at desc);

create index saved_jobs_job_idx
  on public.saved_jobs (job_id);

alter table public.saved_jobs enable row level security;

-- Candidate manages their own saved-jobs list. No DSO-side reads — we
-- don't surface "X candidates saved this job" anywhere yet, and even
-- when we do, it'll be aggregate-count only (never a list of who).
create policy "Candidates manage their own saved jobs"
  on public.saved_jobs for all
  to authenticated
  using (
    candidate_id in (
      select id from public.candidates where auth_user_id = auth.uid()
    )
  )
  with check (
    candidate_id in (
      select id from public.candidates where auth_user_id = auth.uid()
    )
  );

grant select, insert, delete on public.saved_jobs to authenticated;

commit;
