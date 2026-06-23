-- ─────────────────────────────────────────────────────────────────
-- 20260623000500_prospect_sequences.sql  (Sourcing CRM — Phase 3)
--
-- Extend (don't fork) the N16 nurture engine to non-applicant prospects:
--   • application_id becomes nullable
--   • subject_kind discriminates application vs prospect enrollments
--   • prospect_thread_id binds a prospect enrollment to its thread
--   • parallel partial-unique: one active enrollment per prospect thread
--     (mirrors the existing one-active-per-application index)
--
-- All additive. Existing rows default to subject_kind='application' and keep
-- their application_id, so the live applicant nurture is unaffected. The
-- existing (application_id) WHERE status='active' unique index is safe with NULL
-- application_id (NULLs don't conflict).
-- ─────────────────────────────────────────────────────────────────

begin;

alter table public.automation_sequence_enrollments
  alter column application_id drop not null;

alter table public.automation_sequence_enrollments
  add column if not exists subject_kind text not null default 'application'
    check (subject_kind in ('application','prospect')),
  add column if not exists prospect_thread_id uuid
    references public.prospect_threads(id) on delete cascade;

-- One active enrollment per prospect thread.
create unique index if not exists automation_seq_enroll_one_active_prospect
  on public.automation_sequence_enrollments (prospect_thread_id)
  where status = 'active' and prospect_thread_id is not null;

-- A row must carry the ref matching its kind. NOT VALID first, then validate so
-- the (all-application) existing rows are checked explicitly.
alter table public.automation_sequence_enrollments
  add constraint automation_seq_enroll_subject_chk check (
    (subject_kind = 'application' and application_id is not null)
    or (subject_kind = 'prospect' and prospect_thread_id is not null)
  ) not valid;

alter table public.automation_sequence_enrollments
  validate constraint automation_seq_enroll_subject_chk;

commit;
