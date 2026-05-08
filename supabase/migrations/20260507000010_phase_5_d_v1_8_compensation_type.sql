-- ─────────────────────────────────────────────────────────────────────────
-- 20260507000010_phase_5_d_v1_8_compensation_type.sql
--
-- Phase 5D v1.8 — flexible compensation expression on jobs.
--
-- Before: every job posting forced a min + max range. That was rigid:
--   • A practice posting "Hourly: $50/hr exact" had to set min=max=50.
--   • A "starting at $190K" associate role had to leave max blank, but
--     the UI rendered it as a one-sided range.
--   • DOE / "discussed at offer" jobs couldn't express that intent at
--     all — they had to either lie or leave both fields blank.
--
-- After (this migration + matching code in v1.8):
--   compensation_type ∈ {range, starting_at, up_to, exact, doe}
--     • range       — both min + max set   (legacy default)
--     • starting_at — min set, max ignored ("From $50K/yr")
--     • up_to       — max set, min ignored ("Up to $80K/yr")
--     • exact       — min set, max = min   ("$50/hr")
--     • doe         — neither set; "Discussed at offer stage"
--
-- Backfill: derive a sensible type from the existing min/max state so
-- jobs posted before v1.8 keep displaying the same way they did
-- pre-migration.
--
-- Practice Fit comp dim: 'doe' jobs treat the dim as excluded (no
-- comparable number); 'starting_at' uses min as the ceiling for
-- comparison; 'up_to' uses max; 'exact' compares both at the same value.
-- ─────────────────────────────────────────────────────────────────────────

begin;

alter table public.jobs
  add column if not exists compensation_type text not null default 'range'
    check (
      compensation_type in ('range','starting_at','up_to','exact','doe')
    );

-- Backfill existing rows from min/max state.
update public.jobs set compensation_type = case
  when compensation_min is not null and compensation_max is not null
    and compensation_min = compensation_max then 'exact'
  when compensation_min is not null and compensation_max is not null then 'range'
  when compensation_min is not null and compensation_max is null then 'starting_at'
  when compensation_min is null and compensation_max is not null then 'up_to'
  else 'range'
end;

-- v1.8 reworks how comp drives the Practice Fit cache. Wipe so rows
-- recompute against the new compensation_type-aware comp dim. Cheap
-- (structured math); narrative regen on first expand is also cheap.
delete from public.practice_fit_scores;

commit;
