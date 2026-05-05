-- ─────────────────────────────────────────────────────────────────────────
-- 20260505000006_hide_stages_from_candidate.sql
--
-- Adds a per-job toggle that lets the employer hide pipeline stage
-- visibility from the candidate. When ON, the candidate sees an
-- abstracted "In review" label on the application detail surface
-- (StatusProgress) and on the dashboard's MyApplicationStages widget,
-- in place of the explicit stage (Reviewed / Interview / Offer).
--
-- Default is FALSE — DSO Hire's stance is candidate transparency by
-- default. The toggle exists for the rare role (e.g., a sensitive
-- C-suite search) where the employer needs minimal candidate visibility.
--
-- See decision lock: 2026-05-05 with Cam.
-- ─────────────────────────────────────────────────────────────────────────

begin;

alter table public.jobs
  add column if not exists hide_stages_from_candidate boolean
    not null default false;

comment on column public.jobs.hide_stages_from_candidate is
  'When true, candidate-side surfaces (StatusProgress on application detail, MyApplicationStages widget) show an abstracted "In review" label in place of the explicit pipeline stage. Default false — DSO Hire ships candidate-transparent by default; this toggle is escape-hatch for sensitive roles.';

commit;
