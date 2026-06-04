-- Anonymity tier 2 (2026-06-04): per-location practice-name anonymity. When a
-- location sets anonymize_name = true, its MASKED public/candidate display name
-- becomes a generic "Dental Office in {city}" instead of the practice name --
-- one level deeper than public_dso_affiliation (which only hides the corporate
-- DSO name). The employer/internal view always sees the real name.
--
-- Default false -> existing masking behavior is unchanged for every current row.

alter table public.dso_locations
  add column if not exists anonymize_name boolean not null default false;
