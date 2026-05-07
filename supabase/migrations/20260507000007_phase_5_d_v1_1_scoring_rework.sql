-- ─────────────────────────────────────────────────────────────────────────
-- 20260507000007_phase_5_d_v1_1_scoring_rework.sql
--
-- Phase 5D v1.1 — Practice Fit scoring rework.
--
-- Direction (locked 2026-05-07): role becomes a FILTER, not a scoring
-- dimension; missing data drops out of the score (proportional reweight)
-- instead of being penalized; specialty + years-of-experience added as
-- new scoring dimensions.
--
-- New jobs columns
-- ─────────────────────────────────────────────────────────────────────
--   • specialty             text[]  — controlled by SPECIALTIES canonical
--                                     list (general_dentistry, pediatric,
--                                     orthodontics, endo, perio, etc.).
--                                     Multi-select; jobs that span multiple
--                                     specialties (e.g. "GP with ortho
--                                     focus") can list both. Empty array
--                                     when the posting is specialty-agnostic
--                                     (admin/front-desk roles).
--   • min_years_experience  int     — optional minimum dental experience
--                                     to qualify. Nullable: most postings
--                                     don't gate on years.
--
-- Cache invalidation
-- ─────────────────────────────────────────────────────────────────────
-- v1.1 changes the dimension set (drops `role`, adds `specialty` +
-- `years_experience`) and the weight table. Existing practice_fit_scores
-- rows have stale `dimensions` jsonb keyed by old dim names. Clearing
-- forces a clean recompute on next page render. Cost is tiny — the
-- compute is pure structured math, no AI cost. Narratives are also
-- cleared because their input_hash includes the dimension labels.
-- ─────────────────────────────────────────────────────────────────────

begin;

-- 1. New job columns.
alter table public.jobs
  add column if not exists specialty            text[] not null default '{}'::text[],
  add column if not exists min_years_experience int;

-- Lightweight index for filter queries that hit specialty (e.g. job
-- search "show me only pediatric postings"). GIN over the array is
-- the right shape since we're checking element membership.
create index if not exists jobs_specialty_idx
  on public.jobs using gin (specialty);

-- 2. Cache wipe for the new scoring shape.
delete from public.practice_fit_scores;

commit;
