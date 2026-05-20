-- Split dso_users.full_name into first_name + last_name, mirroring the
-- candidate name split (20260515000001). full_name becomes a STORED generated
-- column so all existing read paths keep working; only the two write paths
-- (employer sign-up + invite acceptance) move to first/last.

-- 1. New columns
ALTER TABLE public.dso_users
  ADD COLUMN first_name text,
  ADD COLUMN last_name  text;

-- 2. Backfill: collapse internal whitespace, last token -> last_name, the rest
--    -> first_name. Single-token names -> first_name only. Null/blank -> both null.
UPDATE public.dso_users
SET
  first_name = CASE
    WHEN full_name IS NULL OR trim(full_name) = '' THEN NULL
    WHEN position(' ' IN trim(regexp_replace(full_name, '\s+', ' ', 'g'))) = 0
      THEN trim(regexp_replace(full_name, '\s+', ' ', 'g'))
    ELSE regexp_replace(trim(regexp_replace(full_name, '\s+', ' ', 'g')), '\s+\S+$', '')
  END,
  last_name = CASE
    WHEN full_name IS NULL OR trim(full_name) = '' THEN NULL
    WHEN position(' ' IN trim(regexp_replace(full_name, '\s+', ' ', 'g'))) = 0
      THEN NULL
    ELSE regexp_replace(trim(regexp_replace(full_name, '\s+', ' ', 'g')), '^.*\s+', '')
  END;

-- 3. Replace full_name with a generated column derived from first/last.
ALTER TABLE public.dso_users DROP COLUMN full_name;
ALTER TABLE public.dso_users
  ADD COLUMN full_name text
  GENERATED ALWAYS AS (
    NULLIF(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
  ) STORED;
