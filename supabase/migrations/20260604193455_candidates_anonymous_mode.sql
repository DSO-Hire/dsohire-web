-- Candidate anonymous-but-discoverable mode (2026-06-04). When on, employers
-- discovering the candidate (Talent Pool browse/search, candidate detail reached
-- from browse) see a generic label ("Dental Assistant in Denver") + no photo
-- instead of name/avatar — but the structured profile (skills, experience, fit)
-- stays searchable. Identity reveals once the candidate applies to one of that
-- DSO's jobs (they've chosen to reveal). Default false -> no behavior change.

alter table public.candidates
  add column if not exists anonymous_mode boolean not null default false;
