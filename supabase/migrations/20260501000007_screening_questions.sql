-- ============================================================
-- DSO Hire — Phase 2 screening questions
-- ============================================================
-- Adds two tables that power the candidate apply wizard's
-- screening-questions step and the (next-session) job posting
-- wizard's question authoring UI.
--
--   public.job_screening_questions
--     One row per custom question on a job. Ordered by sort_order.
--     Question kinds: short_text, long_text, yes_no, single_select,
--                     multi_select, number.
--     `options jsonb` holds the choice list for select kinds — shape is
--     [{"id":"opt_1","label":"…"}, …]. Null for non-select kinds.
--
--   public.application_question_answers
--     One row per (application, question) pair. Stores the typed answer
--     in whichever column matches the question kind:
--       - text kinds      → answer_text
--       - yes_no          → answer_text ('yes' | 'no')
--       - single_select   → answer_choice  (option id)
--       - multi_select    → answer_choices (array of option ids)
--       - number          → answer_number
--     Application can re-submit and we upsert by (application_id, question_id).
--
-- RLS principles:
--   Questions
--     candidate read   → any active job's questions (so the apply page can render)
--     DSO    read      → questions on their own DSO's jobs
--     DSO    write     → DSO admins/recruiters on their own DSO's jobs
--   Answers
--     candidate read   → answers on their own applications
--     candidate write  → answers tied to their own application; insert/update only
--     DSO    read      → answers on applications to their DSO's jobs
--     (no DSO writes — answers are candidate-authored)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Idempotent cleanup
-- ─────────────────────────────────────────────────────────────

drop table if exists public.application_question_answers cascade;
drop table if exists public.job_screening_questions      cascade;
drop type  if exists public.screening_question_kind      cascade;

-- ─────────────────────────────────────────────────────────────
-- Enum
-- ─────────────────────────────────────────────────────────────

create type public.screening_question_kind as enum (
  'short_text',
  'long_text',
  'yes_no',
  'single_select',
  'multi_select',
  'number'
);

-- ─────────────────────────────────────────────────────────────
-- job_screening_questions
-- ─────────────────────────────────────────────────────────────

create table public.job_screening_questions (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  prompt      text not null,
  helper_text text,
  kind        public.screening_question_kind not null,
  options     jsonb,                                   -- [{"id":"opt_1","label":"…"}, …]
  required    boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger job_screening_questions_set_updated_at
  before update on public.job_screening_questions
  for each row execute function public.set_updated_at();

create index job_screening_questions_job_idx
  on public.job_screening_questions (job_id, sort_order);

-- Sanity: select-kind questions must have at least one option, and
-- options must have the {id,label} shape.
alter table public.job_screening_questions
  add constraint screening_options_present
  check (
    (kind in ('single_select', 'multi_select')) = (options is not null)
  );

-- ─────────────────────────────────────────────────────────────
-- application_question_answers
-- ─────────────────────────────────────────────────────────────

create table public.application_question_answers (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.applications(id) on delete cascade,
  question_id     uuid not null references public.job_screening_questions(id) on delete cascade,
  answer_text     text,
  answer_choice   text,        -- option id for single_select / 'yes'|'no' for yes_no
  answer_choices  text[],      -- option ids for multi_select
  answer_number   numeric,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (application_id, question_id)
);

create trigger application_question_answers_set_updated_at
  before update on public.application_question_answers
  for each row execute function public.set_updated_at();

create index application_question_answers_app_idx
  on public.application_question_answers (application_id);

-- ============================================================
-- RLS — job_screening_questions
-- ============================================================

alter table public.job_screening_questions       enable row level security;
alter table public.application_question_answers  enable row level security;

-- Candidate / public: read questions on active jobs (so the apply page can render).
create policy "Screening Q: public read active job"
  on public.job_screening_questions for select
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.status = 'active'
        and j.deleted_at is null
    )
  );

-- DSO members: read questions on their own DSO's jobs (drafts included).
create policy "Screening Q: DSO read own"
  on public.job_screening_questions for select
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.dso_id = public.current_dso_id()
    )
  );

-- DSO admins/recruiters: insert/update/delete questions on their own DSO's jobs.
create policy "Screening Q: DSO insert"
  on public.job_screening_questions for insert
  with check (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.dso_id = public.current_dso_id()
        and public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
    )
  );

create policy "Screening Q: DSO update"
  on public.job_screening_questions for update
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.dso_id = public.current_dso_id()
        and public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
    )
  )
  with check (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.dso_id = public.current_dso_id()
        and public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
    )
  );

create policy "Screening Q: DSO delete"
  on public.job_screening_questions for delete
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.dso_id = public.current_dso_id()
        and public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
    )
  );

-- ============================================================
-- RLS — application_question_answers
-- ============================================================

-- Candidate: read answers on their own applications.
create policy "Answers: candidate read own"
  on public.application_question_answers for select
  using (
    exists (
      select 1 from public.applications a
      join public.candidates c on c.id = a.candidate_id
      where a.id = application_id and c.auth_user_id = auth.uid()
    )
  );

-- Candidate: insert answers tied to their own application.
create policy "Answers: candidate insert own"
  on public.application_question_answers for insert
  with check (
    exists (
      select 1 from public.applications a
      join public.candidates c on c.id = a.candidate_id
      where a.id = application_id and c.auth_user_id = auth.uid()
    )
  );

-- Candidate: update their own answers (re-apply / fix typo).
create policy "Answers: candidate update own"
  on public.application_question_answers for update
  using (
    exists (
      select 1 from public.applications a
      join public.candidates c on c.id = a.candidate_id
      where a.id = application_id and c.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.applications a
      join public.candidates c on c.id = a.candidate_id
      where a.id = application_id and c.auth_user_id = auth.uid()
    )
  );

-- DSO: read answers on applications to their jobs.
create policy "Answers: DSO read own jobs"
  on public.application_question_answers for select
  using (
    exists (
      select 1 from public.applications a
      join public.jobs j on j.id = a.job_id
      where a.id = application_id and j.dso_id = public.current_dso_id()
    )
  );

-- ============================================================
-- End of screening questions migration. Apply via Supabase SQL Editor.
-- ============================================================
