-- 2026-05-19 follow-up to the Bridgeway national seed.
--
-- The seed migration set posted_at = NOW() for all 48 new Bridgeway
-- jobs, which dominated the search_jobs_public top-60 ranking and
-- pushed Cam's older Prairie Village jobs out (only 1 of 4 public
-- ones survived the slice). Distributing posted_at across the past
-- 30 days lets the seed jobs slot naturally into the relevance
-- order without crowding out everything else.
--
-- Only touches the Bridgeway seed cohort (slug pattern
-- bridgeway-dental-operations-10..57) — preserves any non-seed
-- jobs added afterward, and won't touch slugs 1..9 (the older
-- Bridgeway jobs that pre-dated the seed).
--
-- Pseudo-random spread anchored on the job id so the result is
-- deterministic per re-run — `random()` would shuffle differently
-- every time, making historical comparisons confusing.
--
-- UUID positions used: 1-8 (first hex segment before the dash) and
-- 10-13 (first 4 hex chars of the second segment, after the dash at
-- position 9). Avoids hyphens in the hex-to-int conversion.
--
-- NOTE: this initial version had a signed-int bug — see the
-- 20260519220500_fix_backdate_bridgeway_seed_signed_modulo follow-up
-- which wraps both modulos in ABS() before computing the offset.

UPDATE jobs
SET posted_at = NOW() - (
    (('x' || substring(id::text, 1, 8))::bit(32)::int % 30) * INTERVAL '1 day'
    + (('x' || substring(id::text, 10, 4))::bit(16)::int % 24) * INTERVAL '1 hour'
  )
WHERE dso_id = '806ffa40-9701-4a4a-ae83-3d2bc9c09a33'
  AND slug ~ '^bridgeway-dental-operations-([1-5][0-9]|10)$';
