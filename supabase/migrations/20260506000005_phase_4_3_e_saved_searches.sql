-- ─────────────────────────────────────────────────────────────────────────
-- 20260506000005_phase_4_3_e_saved_searches.sql
--
-- Phase 4.3.e Credentials tab v1 — saved searches sub-feature.
-- Canonical scope: Competitive Research/Parity_Sprint_Scope_2026-05-06.md §4.3.e
--
-- A saved search is a candidate's named filter on /candidate/jobs that
-- can dispatch alerts (instant / daily / weekly / off) when new jobs
-- match. v1 of this migration ships the schema + the Settings CRUD UI;
-- the cron job that compares new jobs against saved searches and
-- dispatches via the notification orchestration layer is a follow-up
-- (see ROADMAP "Saved-search alert dispatch pipeline").
--
-- CE tracking, license expiry reminder cadence, and certificate file
-- uploads are deferred to a dedicated session — too much for a single
-- migration when CE alone needs a storage bucket + state-requirements
-- lookup table.
-- ─────────────────────────────────────────────────────────────────────────

begin;

create table public.candidate_saved_searches (
  id                  uuid primary key default gen_random_uuid(),
  candidate_id        uuid not null references public.candidates(id) on delete cascade,
  name                text not null,
  filter_state        jsonb not null default '{}'::jsonb,
  -- Alert dispatch cadence. 'off' = saved-but-no-alerts.
  frequency           text not null default 'instant'
    check (frequency in ('instant', 'daily', 'weekly', 'off')),
  -- Last time the dispatcher emitted a job_alert.match for this search.
  -- The cron job (future) uses this as the lower-bound when computing
  -- "new since last dispatch."
  last_dispatched_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger candidate_saved_searches_set_updated_at
  before update on public.candidate_saved_searches
  for each row execute function public.set_updated_at();

create index candidate_saved_searches_candidate_idx
  on public.candidate_saved_searches (candidate_id, updated_at desc);

-- For the future cron: index on frequency so the dispatcher can pull
-- only the searches it needs to evaluate per cadence run.
create index candidate_saved_searches_frequency_idx
  on public.candidate_saved_searches (frequency)
  where frequency <> 'off';

alter table public.candidate_saved_searches enable row level security;

create policy "Candidates manage their own saved searches"
  on public.candidate_saved_searches for all
  to authenticated
  using (
    candidate_id in (
      select id from public.candidates where auth_user_id = auth.uid()
    )
  )
  with check (
    candidate_id in (
      select id from public.candidates where auth_user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.candidate_saved_searches to authenticated;

commit;
