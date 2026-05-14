-- ═════════════════════════════════════════════════════════════════════════
-- 20260514000001 — Jobs corporate sandbox fields (Phase 5G.d)
-- ═════════════════════════════════════════════════════════════════════════
--
-- 5G.d — the corporate job wizard at /employer/jobs/new/corporate needs a
-- corporate-shaped field set that the dental-clinical wizard never had.
-- 16 nullable columns on public.jobs. Existing clinical jobs are untouched:
-- every column is nullable or carries a default, and the CHECK constraints
-- only fire when a value is actually set.
--
-- Enum-style columns are validated by CHECK against a closed value set.
-- Keep these CHECKs in sync with the TS module src/lib/corporate/job-fields.ts
-- if a value is ever added or renamed.
--
-- All `if not exists` / `drop constraint if exists` so the migration is
-- safely re-runnable.

alter table public.jobs
  add column if not exists work_mode                     text,
  add column if not exists work_mode_detail              text,
  add column if not exists remote_state_restrictions     text[] not null default '{}',
  add column if not exists travel_expectation            text,
  add column if not exists travel_territory              text,
  add column if not exists reports_to                    text,
  add column if not exists direct_reports_band           text,
  add column if not exists indirect_reports_band         text,
  add column if not exists authority_level               text,
  add column if not exists education_requirement         text,
  add column if not exists industry_experience           text,
  add column if not exists min_years_corporate_experience int,
  add column if not exists max_years_corporate_experience int,
  add column if not exists bonus_structure               text,
  add column if not exists equity_offered                boolean not null default false,
  add column if not exists equity_note                   text;

-- ── Closed-enum CHECK constraints ───────────────────────────────────────────

alter table public.jobs drop constraint if exists jobs_work_mode_check;
alter table public.jobs add  constraint jobs_work_mode_check
  check (work_mode is null or work_mode in ('onsite','remote','hybrid','blended'));

alter table public.jobs drop constraint if exists jobs_travel_expectation_check;
alter table public.jobs add  constraint jobs_travel_expectation_check
  check (travel_expectation is null or travel_expectation in
    ('none','under_10','10_to_25','25_to_50','50_plus'));

alter table public.jobs drop constraint if exists jobs_direct_reports_band_check;
alter table public.jobs add  constraint jobs_direct_reports_band_check
  check (direct_reports_band is null or direct_reports_band in
    ('zero','1_3','4_9','10_plus'));

alter table public.jobs drop constraint if exists jobs_indirect_reports_band_check;
alter table public.jobs add  constraint jobs_indirect_reports_band_check
  check (indirect_reports_band is null or indirect_reports_band in
    ('zero','1_9','10_49','50_plus'));

alter table public.jobs drop constraint if exists jobs_authority_level_check;
alter table public.jobs add  constraint jobs_authority_level_check
  check (authority_level is null or authority_level in
    ('ic','manager','senior_manager','director','vp','svp','c_suite'));

alter table public.jobs drop constraint if exists jobs_education_requirement_check;
alter table public.jobs add  constraint jobs_education_requirement_check
  check (education_requirement is null or education_requirement in
    ('hs','ba_bs','ma_ms','mba','jd','dds_dmd','phd','certification_only','none'));

alter table public.jobs drop constraint if exists jobs_industry_experience_check;
alter table public.jobs add  constraint jobs_industry_experience_check
  check (industry_experience is null or industry_experience in
    ('dso_required','healthcare_adjacent','agnostic'));

-- ── Sanity CHECK on the years range (only fires when both are set) ───────────

alter table public.jobs drop constraint if exists jobs_corporate_experience_range_check;
alter table public.jobs add  constraint jobs_corporate_experience_range_check
  check (
    min_years_corporate_experience is null
    or max_years_corporate_experience is null
    or min_years_corporate_experience <= max_years_corporate_experience
  );

-- ── Column comments ─────────────────────────────────────────────────────────

comment on column public.jobs.work_mode is
  '5G.d (2026-05-14). onsite|remote|hybrid|blended. Required by the corporate wizard; null on clinical jobs.';
comment on column public.jobs.work_mode_detail is
  '5G.d. Free text — e.g. hybrid day-count ("3 days in office Mon/Wed/Fri").';
comment on column public.jobs.remote_state_restrictions is
  '5G.d. Optional state codes a remote role is restricted to, for tax/compliance.';
comment on column public.jobs.travel_expectation is
  '5G.d. none|under_10|10_to_25|25_to_50|50_plus.';
comment on column public.jobs.travel_territory is
  '5G.d. Free-text travel-territory note.';
comment on column public.jobs.reports_to is
  '5G.d. Free text — reporting line title or person.';
comment on column public.jobs.direct_reports_band is
  '5G.d. zero|1_3|4_9|10_plus.';
comment on column public.jobs.indirect_reports_band is
  '5G.d. zero|1_9|10_49|50_plus.';
comment on column public.jobs.authority_level is
  '5G.d. ic|manager|senior_manager|director|vp|svp|c_suite. Required by the corporate wizard; primary candidate-side filter signal.';
comment on column public.jobs.education_requirement is
  '5G.d. hs|ba_bs|ma_ms|mba|jd|dds_dmd|phd|certification_only|none.';
comment on column public.jobs.industry_experience is
  '5G.d. dso_required|healthcare_adjacent|agnostic. The dental-vertical moat for corporate hiring.';
comment on column public.jobs.min_years_corporate_experience is
  '5G.d. Optional min years of corporate-function experience.';
comment on column public.jobs.max_years_corporate_experience is
  '5G.d. Optional max years of corporate-function experience.';
comment on column public.jobs.bonus_structure is
  '5G.d. Free-text bonus structure.';
comment on column public.jobs.equity_offered is
  '5G.d. Whether equity is part of the package.';
comment on column public.jobs.equity_note is
  '5G.d. Free-text equity detail ("0.1-0.5% with 4-yr vest").';
