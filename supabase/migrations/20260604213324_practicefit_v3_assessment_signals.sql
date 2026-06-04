-- PracticeFit v3 Phase A — assessment signal columns on candidates. These are
-- the work-style / culture / clinical-depth dimensions the ~5-min assessment
-- captures (the moat data no résumé contains). All nullable; the scoring engine
-- adds them in Phase B. Raw answers + metadata stored too for re-scoring,
-- analytics, and application autofill. Existing columns (desired_roles,
-- years_experience_dental, desired_specialty, pms_systems, temp_or_perm,
-- min_salary, availability) already cover the résumé-prefilled basics.

alter table public.candidates
  add column if not exists work_pace text,
  add column if not exists autonomy_pref text,
  add column if not exists patient_facing_energy smallint,
  add column if not exists mentorship_pref text,
  add column if not exists procedures_confident text[] not null default '{}'::text[],
  add column if not exists procedures_growth text[] not null default '{}'::text[],
  add column if not exists practice_feel text,
  add column if not exists ce_growth_importance smallint,
  add column if not exists work_life_priority smallint,
  add column if not exists career_trajectory text,
  add column if not exists commute_max_minutes int,
  add column if not exists comp_priority text,
  add column if not exists relocation_pref text,
  add column if not exists assessment_note text,
  add column if not exists assessment_responses jsonb,
  add column if not exists assessment_completed_at timestamptz,
  add column if not exists assessment_version text;
