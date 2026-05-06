-- ─────────────────────────────────────────────────────────────────────────
-- 20260506000003_phase_4_3_d_privacy.sql
--
-- Phase 4.3.d Privacy & Visibility tab (parity sprint).
-- Canonical scope: Competitive Research/Parity_Sprint_Scope_2026-05-06.md §4.3.d
--
-- Adds the schema needed for the candidate Settings → Privacy & Visibility
-- tab. The 3-state visibility (cv_visibility) shipped in 4.2.a; the
-- per-work-history auto-blocklist flag shipped in 4.1. This migration
-- finishes the privacy story:
--
--   1. candidate_blocked_employers table — DSO-level block list.
--      Cap of 100 enforced at the app layer (server action).
--      Practice-level only per locked R4; corporate-parent rollup
--      deferred to Phase 5C.
--
--   2. Three new columns on candidates (kept as text + CHECK rather
--      than enums to avoid the two-transaction rule and to make
--      future extensions schema-free):
--        - resume_visibility       — 'public' | 'verified_dso_only' | 'after_apply' | 'hidden'
--        - contact_info_visibility — 'always' | 'after_apply'
--        - practice_fit_consent    — 'off' | 'results_only' | 'full'
--
-- Defaults are privacy-positive per the locked working-hygienist story:
--   resume_visibility       = 'after_apply'
--   contact_info_visibility = 'after_apply'
--   practice_fit_consent    = 'off'
--
-- No enum changes — safe to run as a single transaction.
-- ─────────────────────────────────────────────────────────────────────────

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. candidate_blocked_employers
-- ═════════════════════════════════════════════════════════════════════════

create table public.candidate_blocked_employers (
  id              uuid primary key default gen_random_uuid(),
  candidate_id    uuid not null references public.candidates(id) on delete cascade,
  dso_id          uuid not null references public.dsos(id) on delete cascade,
  reason_optional text,
  created_at      timestamptz not null default now(),
  unique (candidate_id, dso_id)
);

create index candidate_blocked_employers_candidate_idx
  on public.candidate_blocked_employers (candidate_id);

create index candidate_blocked_employers_dso_idx
  on public.candidate_blocked_employers (dso_id);

alter table public.candidate_blocked_employers enable row level security;

-- Candidate full RW their own block list.
create policy "Candidates manage their own block list"
  on public.candidate_blocked_employers for all
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

-- DSO members can SELECT their own row in this table — used by job
-- search filters to verify they're not surfaced to a candidate who
-- blocked them. They can't see WHO blocked them; the SELECT is
-- aggregate-only at the API layer.
create policy "DSO members read their own blocked rows"
  on public.candidate_blocked_employers for select
  to authenticated
  using (
    dso_id = public.current_dso_id()
  );

grant select, insert, update, delete on public.candidate_blocked_employers to authenticated;


-- ═════════════════════════════════════════════════════════════════════════
-- 2. Privacy columns on candidates
-- ═════════════════════════════════════════════════════════════════════════

alter table public.candidates
  add column if not exists resume_visibility       text not null default 'after_apply',
  add column if not exists contact_info_visibility text not null default 'after_apply',
  add column if not exists practice_fit_consent    text not null default 'off';

-- CHECK constraints (drop-and-add so the migration is rerunnable).
alter table public.candidates
  drop constraint if exists candidates_resume_visibility_check;
alter table public.candidates
  add constraint candidates_resume_visibility_check
  check (resume_visibility in ('public', 'verified_dso_only', 'after_apply', 'hidden'));

alter table public.candidates
  drop constraint if exists candidates_contact_info_visibility_check;
alter table public.candidates
  add constraint candidates_contact_info_visibility_check
  check (contact_info_visibility in ('always', 'after_apply'));

alter table public.candidates
  drop constraint if exists candidates_practice_fit_consent_check;
alter table public.candidates
  add constraint candidates_practice_fit_consent_check
  check (practice_fit_consent in ('off', 'results_only', 'full'));

commit;

-- ─────────────────────────────────────────────────────────────────────
-- End of Phase 4.3.d migration. Apply via Supabase SQL Editor — single
-- transaction, no enum split.
-- ─────────────────────────────────────────────────────────────────────
