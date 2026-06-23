-- ─────────────────────────────────────────────────────────────────
-- 20260623000300_prospect_pipeline.sql  (Sourcing CRM — Phase 1)
--
-- Turns the flat talent pool into a stage-able prospect pipeline:
--   • pipeline_stage + last_activity_at on dso_talent_pool_entries
--     (the pool row IS the prospect record — keeps unique(dso,candidate))
--   • dso_prospect_activities — the prospect timeline, separate from the
--     application audit trail.
--
-- No privacy posture changes here: this is the DSO's own organizational layer
-- over candidates it already discovered. Masking still happens at render time
-- via anonymity.ts; the candidate is told nothing by a save (#52).
-- ─────────────────────────────────────────────────────────────────

begin;

-- 1. Pipeline stage enum ---------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'prospect_pipeline_stage') then
    create type prospect_pipeline_stage as enum (
      'sourced', 'contacted', 'responded', 'nurturing', 'converted', 'archived'
    );
  end if;
end$$;

-- 2. Stage + activity columns on the pool entry ----------------------
alter table public.dso_talent_pool_entries
  add column if not exists pipeline_stage prospect_pipeline_stage not null default 'sourced',
  add column if not exists last_activity_at timestamptz not null default now();

comment on column public.dso_talent_pool_entries.pipeline_stage is
  'Sourcing CRM prospect stage. Applied candidates render as converted at read time regardless of stored value (see talent-pool pipeline view).';

-- 3. Prospect activity timeline --------------------------------------
create table if not exists public.dso_prospect_activities (
  id                 uuid primary key default gen_random_uuid(),
  dso_id             uuid not null references public.dsos(id) on delete cascade,
  candidate_id       uuid not null references public.candidates(id) on delete cascade,
  kind               text not null check (kind in (
                       'saved','outreach_sent','opened','replied',
                       'stage_change','converted','opted_out')),
  actor_dso_user_id  uuid references public.dso_users(id) on delete set null,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create index if not exists dso_prospect_activities_dso_created_idx
  on public.dso_prospect_activities (dso_id, created_at desc);
create index if not exists dso_prospect_activities_dso_candidate_idx
  on public.dso_prospect_activities (dso_id, candidate_id);

alter table public.dso_prospect_activities enable row level security;

-- DSO members read their own org's activity.
create policy "prospect_activities: dso read"
  on public.dso_prospect_activities
  for select to authenticated
  using (dso_id = public.current_dso_id());

-- Owner/admin/recruiter write (matches talent-pool write role). System rows
-- (auto converted, sequence sends) go through the service-role client, which
-- bypasses RLS.
create policy "prospect_activities: recruiter write"
  on public.dso_prospect_activities
  for insert to authenticated
  with check (
    dso_id = public.current_dso_id()
    and public.current_dso_user_role() = any (
      array['owner','admin','recruiter']::dso_user_role[]
    )
  );

commit;
