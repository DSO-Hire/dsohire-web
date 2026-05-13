-- ═════════════════════════════════════════════════════════════════════════
-- 20260513000005 — E2.10 Soft knockout with surface tagging
-- ═════════════════════════════════════════════════════════════════════════
--
-- Per the locked design (project_knockout_pattern_research_2026_05_13.md):
-- DSO Hire does NOT auto-reject candidates for failing knockout questions.
-- Instead we tag failing applications + surface them in the employer UI
-- so the recruiter makes the call. Matches Greenhouse/Ashby's 2026 retreat
-- from auto-reject; aligns with EEOC 2026 human-in-the-loop guidance;
-- pairs with the locked legal-shield posture (less risk by default).
--
-- The 5 locked design decisions translate into schema as follows:
--   1. Specific failed-question chip on kanban → applications.knockout_failed_questions text[]
--   2. Employer-only detail callout → reuses #1 + application_question_answers (existing)
--   3. NO candidate-side surface → app stays status='new', no rejection event fires
--   4. NO per-DSO hard-reject toggle → we don't even add the column
--   5. Comparison operators per kind → job_screening_questions.knockout_correct_answer jsonb
--
-- Apps inserted by the apply flow STILL get status='new' regardless of
-- knockout results. The recruiter sees the chip + decides what to do.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. job_screening_questions: knockout flag + correct-answer payload
-- ─────────────────────────────────────────────────────────────────────────
--
-- knockout boolean — wizard surfaces this as a "Mark as knockout" checkbox
-- on each screening question. Mirror of the library's `knockout: true` flag
-- but per-job-instance so a recruiter can customize.
--
-- knockout_correct_answer jsonb — shape varies by question kind:
--   yes_no:        { "expected": "yes" | "no" }
--   single_select: { "expected_option_ids": ["...", "..."] } (any match passes)
--   multi_select:  { "must_include_option_ids": ["...", "..."] } (all must match)
--   number:        { "operator": ">=" | "<=" | "=", "value": <number> }
--   short_text:    null — knockout disabled for free text (too ambiguous)
--   long_text:     null — same
-- App-layer validates the shape on insert + when reading.

alter table public.job_screening_questions
  add column if not exists knockout boolean not null default false,
  add column if not exists knockout_correct_answer jsonb;

comment on column public.job_screening_questions.knockout is
  'E2.10 (2026-05-13). When true, the candidate''s answer is evaluated against knockout_correct_answer; failure surfaces as a soft tag on the application (no auto-reject).';

comment on column public.job_screening_questions.knockout_correct_answer is
  'E2.10. Shape varies by kind: yes_no={expected}, single_select={expected_option_ids[]}, multi_select={must_include_option_ids[]}, number={operator,value}. Null when knockout=false or kind doesn''t support knockout (short_text/long_text).';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. applications: knockout failure tracking
-- ─────────────────────────────────────────────────────────────────────────
--
-- knockout_failed_questions text[] — array of question prompts (truncated)
-- the candidate failed. Storing the prompt text instead of an id-array
-- means historical applications still render even if a screening question
-- gets renamed/deleted later (audit-trail durability per the offer-letter
-- pattern from Track E).
--
-- knockout_failed_at timestamptz — null when no failures. Useful for
-- analytics ("applications-with-knockout-failures over time") and for
-- sorting the kanban filter.

alter table public.applications
  add column if not exists knockout_failed_questions text[] not null default '{}'::text[],
  add column if not exists knockout_failed_at timestamptz;

comment on column public.applications.knockout_failed_questions is
  'E2.10 (2026-05-13). Snapshotted prompts of knockout questions the candidate failed. Drives the kanban ⚠ chip + application detail callout. Empty array when no failures.';

comment on column public.applications.knockout_failed_at is
  'E2.10. Set on apply when at least one knockout failure occurs. Null otherwise.';

-- Useful index for the kanban filter ("hide knockout failures" toggle).
create index if not exists idx_applications_knockout_failed_at
  on public.applications (job_id, knockout_failed_at)
  where knockout_failed_at is not null;
