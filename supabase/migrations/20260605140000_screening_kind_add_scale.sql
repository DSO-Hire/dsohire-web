-- #71 (2026-06-05) — add a "scale" (slider / drag) screening-question kind.
--
-- A scale question asks the candidate to drag a 1–5 slider between two labeled
-- ends (e.g. "Prefer clinical focus" ↔ "I love patient interaction"). The
-- candidate's answer is a number stored in application_question_answers.answer_number.
-- The two end labels are stored in job_screening_questions.options as
-- [{id:'low',label:…},{id:'high',label:…}].
--
-- NOTE: this must be its OWN migration (separate transaction). A new enum value
-- added by ALTER TYPE ... ADD VALUE cannot be REFERENCED (e.g. in a CHECK
-- constraint literal) until the transaction that added it has committed. The
-- options-constraint change that references 'scale' lives in the next migration
-- (20260605140100).

alter type public.screening_question_kind add value if not exists 'scale';
