-- Corrective re-run of backdate_bridgeway_seed_posted_at.
--
-- The previous migration used `bit(32)::int`, which returns a SIGNED
-- 32-bit int. About half the UUIDs produced negative values, and
-- `NOW() - (negative * interval)` = `NOW() + positive` = future
-- posted_at dates (27 of 48 jobs ended up dated up to 4 weeks ahead).
--
-- Fix: ABS() the result before modulo so we always subtract a
-- non-negative offset. Re-runs over all 48 seed jobs to overwrite
-- the bad future dates from the first attempt.

UPDATE jobs
SET posted_at = NOW() - (
    (ABS(('x' || substring(id::text, 1, 8))::bit(32)::int) % 30) * INTERVAL '1 day'
    + (ABS(('x' || substring(id::text, 10, 4))::bit(16)::int) % 24) * INTERVAL '1 hour'
  )
WHERE dso_id = '806ffa40-9701-4a4a-ae83-3d2bc9c09a33'
  AND slug ~ '^bridgeway-dental-operations-([1-5][0-9]|10)$';
