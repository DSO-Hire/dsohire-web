-- ─────────────────────────────────────────────────────────────────────────
-- 20260506000004_phase_4_3_f_data_account.sql
--
-- Phase 4.3.f Data & Account tab.
-- Canonical scope: Competitive Research/Parity_Sprint_Scope_2026-05-06.md §4.3.f
--
-- Adds the soft-delete grace period for candidate account deletion:
--   • candidates.deleted_at timestamptz — when the account was soft-
--     deleted. NULL = active. After 30 days, a future cron job
--     hard-deletes the row + cascades to all child tables. Setting
--     this column ALSO signs the user out (handled in app code,
--     not the schema).
--
-- No enum changes. Single transaction.
-- ─────────────────────────────────────────────────────────────────────────

begin;

alter table public.candidates
  add column if not exists deleted_at timestamptz;

-- Partial index so the future hard-delete cron + active-candidate
-- queries don't have to scan every row.
create index if not exists candidates_deleted_at_idx
  on public.candidates (deleted_at)
  where deleted_at is not null;

commit;
