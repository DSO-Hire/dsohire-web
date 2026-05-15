-- Split candidates.full_name into first_name + last_name + optional salutation.
--
-- full_name is RETAINED as a STORED generated column derived from
-- first_name/last_name, so the ~85 existing read paths keep working
-- untouched. Only WRITE paths move to first/last (signup, apply wizard,
-- profile edit, resume import). The email split(/\s+/)[0] first-name hack
-- is replaced platform-wide by reading first_name directly.
--
-- salutation is an OPTIONAL prefix (fixed dropdown). "Dr." matters for the
-- dental audience. Never a required signup field.

-- 1. New columns
ALTER TABLE public.candidates
  ADD COLUMN first_name text,
  ADD COLUMN last_name  text,
  ADD COLUMN salutation text;

-- 2. Salutation CHECK — fixed dropdown list, mirrors src/lib/candidate/salutations.ts 1:1
ALTER TABLE public.candidates
  ADD CONSTRAINT candidates_salutation_check
  CHECK (salutation IS NULL OR salutation IN ('Dr.', 'Prof.', 'Mr.', 'Mrs.', 'Ms.', 'Mx.'));

-- 3. Backfill: collapse internal whitespace, last token -> last_name, the
--    rest -> first_name. Single-token names -> first_name only.
--    Null/blank full_name -> both null (guests, legacy imports).
UPDATE public.candidates
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

-- 4. Replace full_name with a generated column derived from first/last.
ALTER TABLE public.candidates DROP COLUMN full_name;
ALTER TABLE public.candidates
  ADD COLUMN full_name text
  GENERATED ALWAYS AS (
    NULLIF(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
  ) STORED;
