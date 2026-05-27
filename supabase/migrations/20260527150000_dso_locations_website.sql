-- Add per-location website URL. Cam Day 21 2026-05-27.
-- Optional. Surfaced on the candidate-facing job listing only when
-- public_dso_affiliation = true so private-affiliation locations don't
-- leak the DSO connection through an outbound link.
alter table public.dso_locations
  add column if not exists website text;

comment on column public.dso_locations.website is
  'Per-location practice website URL. Optional. Surfaced on the candidate-facing job listing only when public_dso_affiliation=true. No URL validation at the DB layer — app layer normalizes/validates before write.';
