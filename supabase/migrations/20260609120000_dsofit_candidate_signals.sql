-- #50/#52 DSOFit — candidate corporate signal columns (captured by the DSOFit
-- assessment) + one new job-side column (domain_preference). All nullable/
-- additive; inert until the assessment + corporate wizard write to them. The
-- other job-side signals reuse existing columns (work_mode, travel_expectation,
-- authority_level, direct_reports_band, reports_to) mapped in the PF loader.
-- Applied to prod via connector 2026-06-09.
alter table public.candidates
  add column if not exists dsofit_function_targets text[],
  add column if not exists seniority_level text,
  add column if not exists mgmt_span text,
  add column if not exists pl_scope text,
  add column if not exists org_scale_experience text,
  add column if not exists domain_background text,
  add column if not exists domain_years integer,
  add column if not exists work_mode_pref text,
  add column if not exists travel_tolerance text,
  add column if not exists corporate_comp_interests text[],
  add column if not exists dsofit_skills text[],
  add column if not exists clinician_exploring_corporate boolean,
  add column if not exists dsofit_assessment_completed_at timestamptz;

alter table public.jobs
  add column if not exists domain_preference text;
