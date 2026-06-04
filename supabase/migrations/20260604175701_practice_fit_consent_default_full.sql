-- PracticeFit is now ON by default (consent 'full') for every candidate, per the
-- locked v2 "ON-by-default + opt-out" strategy. Two changes:
--   1. New candidates inherit 'full' (the column default; candidate inserts omit
--      this field, so the default governs new signups).
--   2. Silent backfill of existing candidates from 'off'/null -> 'full' (Cam
--      decision 2026-06-04; pre-launch test data). Candidates can still opt out.

alter table public.candidates
  alter column practice_fit_consent set default 'full';

update public.candidates
  set practice_fit_consent = 'full'
  where practice_fit_consent is null or practice_fit_consent = 'off';
