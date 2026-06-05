-- #71 (2026-06-05) — let "scale" screening questions use the options column.
--
-- The original screening_options_present constraint required options to be
-- non-null ONLY for select kinds. A scale question stores its two end labels in
-- options ([{id:'low',label:…},{id:'high',label:…}]), so it must be allowed to
-- carry options too. Runs in a separate migration from the ADD VALUE (the new
-- 'scale' enum value must be committed before a CHECK can reference it).

alter table public.job_screening_questions
  drop constraint if exists screening_options_present;

alter table public.job_screening_questions
  add constraint screening_options_present
  check (
    (kind in ('single_select', 'multi_select', 'scale')) = (options is not null)
  );
