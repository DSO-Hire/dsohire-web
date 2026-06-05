-- PracticeFit v3.1 (2026-06-05) — question-bank expansion signal columns on
-- candidates. Five new always-additive, nullable signals captured by the
-- expanded ~5-min assessment:
--   • pms_proficiency       — depth on top of the pms_systems multi-select
--   • team_size_pref        — day-to-day team size the candidate wants
--   • patient_population_pref— patient populations they enjoy caring for
--   • benefit_priorities    — which benefits actually move the needle
--   • deal_breakers         — ALLOWLIST-only; signal only, NEVER auto-screens
--
-- pms_proficiency piggybacks the existing pms_fluency dimension; the other four
-- are new dimensions that stay UNSCORED until a practice-profile mirror exists
-- (mirrors how the Phase B.1 culture dims started — missing data never
-- penalizes). No scoring math changes here, so existing scores don't move.

alter table public.candidates
  add column if not exists pms_proficiency text,
  add column if not exists team_size_pref text,
  add column if not exists patient_population_pref text[] not null default '{}'::text[],
  add column if not exists benefit_priorities text[] not null default '{}'::text[],
  add column if not exists deal_breakers text[] not null default '{}'::text[];
