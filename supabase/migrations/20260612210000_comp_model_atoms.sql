-- #128 — dental-native compensation model (Day 33, 2026-06-12).
-- Spec: Business Plan & Strategy/Compensation_Model_Redesign_2026-06-12.md
-- (LOCKED by Cam — model names, strong-nudge-never-block est. range,
-- worker_classification as a neutral display field).
--
-- ADDITIVE ONLY: new enum types + nullable columns on jobs.
-- comp_model NULL (or 'simple') = byte-identical legacy behavior for
-- every existing row — the current compensation_* fields stay the
-- source of truth for simple-range postings. No data migration.
--
-- 'hourly' guarantee_kind is included now so the Phase D hygienist
-- hourly-plus-percent variant needs no second enum migration.

create type comp_model as enum (
  'simple',
  'guarantee_plus_percent',
  'percent_only',
  'draw_against_percent',
  'salary_vs_percent'
);

create type comp_guarantee_kind as enum (
  'none',
  'hourly',
  'daily',
  'per_period',
  'annual_salary'
);

create type comp_guarantee_duration as enum (
  'permanent',
  'intro_90d',
  'intro_6mo',
  'year_1',
  'years_1_3',
  'custom'
);

create type comp_percent_basis as enum (
  'production',
  'adjusted_production',
  'collections',
  'case_starts'
);

create type comp_lab_fee_policy as enum (
  'practice_paid',
  'split_50',
  'deducted',
  'other'
);

create type comp_reconciliation as enum (
  'greater_of',
  'draw_against',
  'additive'
);

create type comp_pay_cadence as enum (
  'weekly',
  'biweekly',
  'semimonthly',
  'monthly'
);

create type worker_classification as enum (
  'w2',
  'c1099',
  'either_negotiable'
);

alter table jobs
  add column if not exists comp_model comp_model,
  -- Guarantee layer
  add column if not exists guarantee_kind comp_guarantee_kind,
  add column if not exists guarantee_amount numeric,
  add column if not exists guarantee_duration comp_guarantee_duration,
  -- Variable layer
  add column if not exists percent_rate_min numeric,
  add column if not exists percent_rate_max numeric,
  add column if not exists percent_basis comp_percent_basis,
  add column if not exists percent_tiers_note text,
  -- Basis fine print (display-only chips)
  add column if not exists hygiene_exam_credited boolean,
  add column if not exists hygienist_work_credited boolean,
  add column if not exists lab_fee_policy comp_lab_fee_policy,
  add column if not exists basis_exclusions_note text,
  -- Mechanics
  add column if not exists reconciliation comp_reconciliation,
  add column if not exists pay_cadence comp_pay_cadence,
  -- The anchor: good-faith expected annual earnings. The ONLY comp
  -- fact PracticeFit ever scores for percentage models (engine rule,
  -- memo §6). Strong-nudged in the wizard, never required (Cam).
  add column if not exists est_annual_min numeric,
  add column if not exists est_annual_max numeric,
  -- Orthogonal to comp model AND to employment_type schedule patterns.
  add column if not exists worker_classification worker_classification;

comment on column jobs.comp_model is
  '#128 dental-native comp. NULL/simple = legacy compensation_* fields rule.';
comment on column jobs.est_annual_min is
  '#128 good-faith expected annual earnings (low). The only comp input PracticeFit scores for percentage models.';
comment on column jobs.worker_classification is
  '#128 W-2 vs 1099 vs negotiable. Neutral display fact — never advice, no detector (memo §7).';
