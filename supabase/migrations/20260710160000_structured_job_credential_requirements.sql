-- Punch #3 (2026-07-10) — structured credential requirements on jobs.
--
-- Required license types (DDS, RDH, EFDA, …) and certification kinds
-- (cpr_bls, radiology, …) were free text only — the fit engine mined
-- them from title/requirements/description via regex heuristics
-- (job-text-signals.ts). These columns make them first-class data:
--   • the wizard captures them as structured multi-selects,
--   • the fit engine prefers them over text detection when non-empty
--     (certs_required input; hashed, so caches self-invalidate),
--   • later phases can hard-gate (knockouts) and filter on them.
--
-- Values are app-canonical (LICENSE_TYPES / CERTIFICATION_KINDS in
-- src/lib/candidate/canonical-lists.ts) — same enforcement posture as
-- the candidate credential tables: canonical list lives in the app,
-- columns stay text[] so list growth needs no migration.

alter table public.jobs
  add column if not exists required_license_types text[] not null default '{}',
  add column if not exists required_certifications text[] not null default '{}';

comment on column public.jobs.required_license_types is
  'Structured license requirements (canonical LICENSE_TYPES values, e.g. RDH, DDS). Empty = no explicit license requirement.';
comment on column public.jobs.required_certifications is
  'Structured certification requirements (canonical CERTIFICATION_KINDS values, e.g. cpr_bls, radiology). Empty = fit engine falls back to free-text detection.';
