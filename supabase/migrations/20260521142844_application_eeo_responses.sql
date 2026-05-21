-- ============================================================
-- DSO Hire — E2.17 Voluntary EEO / demographic self-identification
-- ============================================================
-- Optional, voluntary self-ID collected on the apply *success* screen
-- (post-application), one row per application. This data is LEGALLY
-- SENSITIVE and intentionally segregated:
--
--   * It is NEVER joined into any non-EEO query path.
--   * No employer / DSO / hiring-manager RLS policy exists on this
--     table — recruiters and anyone who makes hiring decisions can
--     never read individual responses. Default-deny RLS *is* the
--     firewall here (the absence of an employer policy is deliberate).
--   * Future aggregate diversity reporting (E6.8) reads this table via
--     the service role ONLY, and must apply small-cell suppression
--     (hide any bucket with < 5 responses) to prevent re-identification.
--   * Answering is voluntary; the apply flow never gates on it. Every
--     field carries an explicit "decline to self-identify" value.
--
-- Field option sets follow standard ATS voluntary self-ID norms
-- (Greenhouse / Lever). Stored as text + CHECK rather than enums — this
-- avoids the two-transaction enum-extension dance and keeps the option
-- sets cheap to evolve. App-side validation lives in src/lib/eeo/options.ts;
-- the CHECK constraints are defense-in-depth.
-- ============================================================

create table public.application_eeo_responses (
  id                 uuid primary key default gen_random_uuid(),
  application_id     uuid not null unique
                       references public.applications(id) on delete cascade,
  gender             text,
  race_ethnicity     text,
  veteran_status     text,
  disability_status  text,
  submitted_at       timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint eeo_gender_chk check (
    gender is null or gender in
      ('male', 'female', 'non_binary', 'decline')
  ),
  constraint eeo_race_chk check (
    race_ethnicity is null or race_ethnicity in
      ('hispanic_latino', 'white', 'black_african_american',
       'native_hawaiian_pacific_islander', 'asian',
       'american_indian_alaska_native', 'two_or_more_races', 'decline')
  ),
  constraint eeo_veteran_chk check (
    veteran_status is null or veteran_status in
      ('protected_veteran', 'not_protected_veteran', 'decline')
  ),
  constraint eeo_disability_chk check (
    disability_status is null or disability_status in
      ('yes', 'no', 'decline')
  )
);

create trigger application_eeo_responses_set_updated_at
  before update on public.application_eeo_responses
  for each row execute function public.set_updated_at();

create index application_eeo_responses_app_idx
  on public.application_eeo_responses (application_id);

-- ============================================================
-- RLS — candidate-own only. NO employer/DSO policy by design.
-- ============================================================

alter table public.application_eeo_responses enable row level security;

-- Candidate: read their own response (lets the success screen show a
-- "recorded — thank you" state without re-prompting).
create policy "EEO: candidate read own"
  on public.application_eeo_responses for select
  using (
    exists (
      select 1 from public.applications a
      join public.candidates c on c.id = a.candidate_id
      where a.id = application_id and c.auth_user_id = auth.uid()
    )
  );

-- Candidate: insert a response tied to their own application.
create policy "EEO: candidate insert own"
  on public.application_eeo_responses for insert
  with check (
    exists (
      select 1 from public.applications a
      join public.candidates c on c.id = a.candidate_id
      where a.id = application_id and c.auth_user_id = auth.uid()
    )
  );

-- Candidate: update their own response (change or clear an answer).
create policy "EEO: candidate update own"
  on public.application_eeo_responses for update
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

-- DELIBERATELY NO employer / DSO / hiring-manager policy. Individual EEO
-- responses are firewalled from anyone who makes hiring decisions.
-- Aggregate reporting (E6.8) reads via the service role only.
-- ============================================================
-- End of E2.17 EEO self-identification migration.
-- ============================================================
