-- ─────────────────────────────────────────────────────────────────────────
-- 20260507000002_phase_4_5_g_account_deletion.sql
--
-- Phase 4.5.g — Account deletion (employer side) + restore-on-sign-in.
--
-- Candidate-side `candidates.deleted_at` already shipped in
-- 20260506000004 (Phase 4.3.f). This migration adds the matching
-- column on `dsos`, plus the partial index for the future hard-delete
-- cron sweep.
--
-- Cascade strategy: the existing FKs from jobs / applications / dso_users /
-- dso_locations / dso_photos / etc. all use `on delete cascade` against
-- `dsos.id`, so a DELETE FROM dsos WHERE id = X will drop every related
-- row in one shot. The cron is responsible for ordering:
--   1. Cancel Stripe subscription (so the customer isn't billed for an
--      org that no longer exists)
--   2. Remove storage files (DSO logo, location logos, dso_photos,
--      employer-attached resumes if any)
--   3. DELETE FROM dsos WHERE id = X (cascades to all child rows)
--   4. Delete admin/team-member auth.users rows for any user whose ONLY
--      role was tied to this DSO (we don't delete users who also have a
--      candidate or admin role)
--
-- No enum changes; single transaction. Safe to apply alongside any
-- pending application traffic — the deleted_at column starts NULL on
-- every existing row, so legacy reads keep working.
-- ─────────────────────────────────────────────────────────────────────────

begin;

alter table public.dsos
  add column if not exists deleted_at timestamptz;

-- Partial index so the future hard-delete cron + active-DSO queries
-- don't have to scan every row. Mirrors candidates_deleted_at_idx
-- from 20260506000004.
create index if not exists dsos_deleted_at_idx
  on public.dsos (deleted_at)
  where deleted_at is not null;

commit;

-- ─────────────────────────────────────────────────────────────────────
-- After applying:
--   • No types regen needed — server.ts dropped the <Database> generic
--     months ago, so .from("dsos").update({ deleted_at }) falls through.
--   • Hard-delete cron + restore-on-sign-in app code lands in this PR.
-- ─────────────────────────────────────────────────────────────────────
