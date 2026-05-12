-- ─────────────────────────────────────────────────────────────────────
-- 20260512000005_jobs_schedule_dimensions.sql
--
-- Track F — Practice Fit schedule overlap dimension.
--
-- Adds three columns to jobs that describe when the role is staffed:
--   • schedule_days       text[]    — abbreviated day keys: mon, tue,
--                                     wed, thu, fri, sat, sun. Empty
--                                     array means "not specified" and
--                                     the dim is excluded from the score.
--   • schedule_evenings   boolean   — true if the role works evenings
--                                     (≥ 5pm).
--   • schedule_weekends   boolean   — true if the role includes Sat/Sun.
--                                     Redundant with schedule_days
--                                     containing 'sat'/'sun', but kept
--                                     as a fast yes/no flag for jobs that
--                                     don't want to enumerate days.
--
-- The candidate side already has schedule_preferences (boolean per day +
-- evenings) on the candidates row. Practice Fit's schedule_overlap
-- dimension intersects the two.
-- ─────────────────────────────────────────────────────────────────────
-- Postgres-enum-two-transaction rule: this migration touches no enums.
-- Safe in a single transaction.
-- ─────────────────────────────────────────────────────────────────────

begin;

alter table public.jobs
  add column if not exists schedule_days       text[] not null default '{}'::text[],
  add column if not exists schedule_evenings   boolean not null default false,
  add column if not exists schedule_weekends   boolean not null default false;

-- CHECK constraint on schedule_days values — keep the set bounded so a
-- typo in the wizard doesn't silently break Practice Fit matching.
alter table public.jobs
  drop constraint if exists jobs_schedule_days_check;
alter table public.jobs
  add  constraint jobs_schedule_days_check
  check (
    schedule_days <@ array['mon','tue','wed','thu','fri','sat','sun']::text[]
  );

-- No new index — schedule_days is a small array on a moderately-sized
-- table; Practice Fit reads jobs by id (the lookup is already indexed by
-- PK). A GIN index would only help if we filter jobs by schedule_days at
-- the DB layer, which we don't today.

commit;

-- ─────────────────────────────────────────────────────────────────────
-- Post-apply: hand-patch src/lib/supabase/database.types.ts to add the
-- three new columns to jobs.Row / Insert / Update.
-- ─────────────────────────────────────────────────────────────────────
