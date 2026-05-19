-- ============================================================
-- Soft-delete the test DSO placeholders by flipping to suspended.
-- ============================================================
-- Cam 2026-05-19 cleanup: Douche Dental Partners, both Eslinger
-- Dental Consultants entries (the real + the Fake), and Pig dental
-- are obvious test data that shouldn't surface on /companies or
-- in any /jobs feed. Soft-delete (status='suspended') keeps the
-- data + their /companies/[slug] direct links from 404ing if any
-- external system references them, while pulling them out of the
-- public directory + active-jobs queries.
--
-- Longhorn Dental Partners and "dso hire" intentionally NOT touched
-- (Cam keeping Longhorn for now; "dso hire" is the test sandbox).
--
-- To reverse: update dsos set status='active' where slug in (...).
-- ============================================================

update public.dsos
set status = 'suspended'
where name in (
  'Douche Dental Partners',
  'Eslinger Dental Consultants',
  'Eslinger Dental Consultants Fake',
  'Pig dental'
);

-- Archive the active jobs on those DSOs so they fall out of /jobs too
-- (the directory filter is status='active' but jobs have their own status).
update public.jobs
set status = 'archived'::public.job_status
where dso_id in (
  select id from public.dsos
  where name in (
    'Douche Dental Partners',
    'Eslinger Dental Consultants',
    'Eslinger Dental Consultants Fake',
    'Pig dental'
  )
)
and status = 'active';
