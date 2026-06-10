-- ─────────────────────────────────────────────────────────────────────────
-- 20260610260000_confidential_jobs.sql  (#83 Phase 4)
--
-- Confidential-search jobs — the DSOFit C-suite differentiator (#56). A
-- group quietly replacing a CFO/COO can restrict the posting + its
-- applicants to owner/admin + explicitly assigned teammates.
--
--   1. jobs.confidential boolean (default false — nothing changes for
--      existing rows).
--   2. job_team_access — which dso_users are assigned to a confidential
--      job. RLS-enabled (PostgREST exposes it otherwise).
--   3. user_assigned_to_job() helper (security definer — also dodges any
--      policy recursion through jobs).
--   4. user_can_access_job() REPLACED with a confidentiality clause — this
--      is the central choke point used by the RLS policies on
--      applications / status events / answers / comments / scorecards /
--      messages (20260505000003), so every employer surface that reads
--      through the user-scoped client (jobs list, applications inbox,
--      Smart Picks, Today's Top Fits, dashboard feeds, search) inherits
--      the filter with no app-code changes.
--   5. "Jobs: members read own DSO" policy gains the same clause.
--   6. "Jobs: public read active" policy closes the member side-door:
--      RLS policies OR together, so without this a non-assigned teammate
--      would still read an ACTIVE confidential job through the public
--      policy. Candidates + anonymous visitors (current_dso_id() is null,
--      or member of a DIFFERENT dso) are unaffected — confidential is
--      employer-side internal visibility, NOT candidate-facing hiding.
--
-- P0 anonymity: this stacks ON TOP of anonymous_mode candidate masking
-- (anonymousDisplayLabel / getDsoAppliedCandidateIds) — those helpers are
-- untouched and still applied by every discovery surface.
-- ─────────────────────────────────────────────────────────────────────────

begin;

-- 1. Flag column ----------------------------------------------------------
alter table public.jobs
  add column if not exists confidential boolean not null default false;

comment on column public.jobs.confidential is
  '#83 Phase 4: employer-side visibility restriction. true = only owner/admin + job_team_access assignees see this job (and its applicants) in the employer workspace. Public/candidate visibility is unaffected.';

-- 2. Assignment table ------------------------------------------------------
create table public.job_team_access (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  dso_user_id uuid not null references public.dso_users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (job_id, dso_user_id)
);

create index job_team_access_job_idx  on public.job_team_access (job_id);
create index job_team_access_user_idx on public.job_team_access (dso_user_id);

alter table public.job_team_access enable row level security;

-- 3. Helper: is the signed-in user assigned to this job? -------------------
create or replace function public.user_assigned_to_job(p_job_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.job_team_access jta
    join public.dso_users du on du.id = jta.dso_user_id
    where jta.job_id = p_job_id
      and du.auth_user_id = auth.uid()
  );
$$;

grant execute on function public.user_assigned_to_job(uuid) to authenticated;

-- RLS on job_team_access: members of the job's DSO who clear the job's
-- confidentiality may read the assignment list; only owner/admin write.
create policy "Job team access: members read"
  on public.job_team_access for select
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.dso_id = public.current_dso_id()
        and (
          j.confidential = false
          or public.current_dso_user_role() in ('owner', 'admin')
          or public.user_assigned_to_job(j.id)
        )
    )
  );

create policy "Job team access: admin insert"
  on public.job_team_access for insert
  with check (
    public.current_dso_user_role() in ('owner', 'admin')
    and exists (
      select 1 from public.jobs j
      where j.id = job_id and j.dso_id = public.current_dso_id()
    )
  );

create policy "Job team access: admin delete"
  on public.job_team_access for delete
  using (
    public.current_dso_user_role() in ('owner', 'admin')
    and exists (
      select 1 from public.jobs j
      where j.id = job_id and j.dso_id = public.current_dso_id()
    )
  );

-- 4. user_can_access_job — REPLACED with the confidentiality clause --------
-- (original from 20260505000003: role/location scope only)
create or replace function public.user_can_access_job(p_job_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.jobs j
    where j.id = p_job_id
      and j.dso_id = public.current_dso_id()
      and (
        public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
        or exists (
          select 1
          from public.job_locations jl
          where jl.job_id = j.id
            and jl.location_id in (select * from public.user_accessible_location_ids())
        )
      )
      and (
        j.confidential = false
        or public.current_dso_user_role() in ('owner', 'admin')
        or public.user_assigned_to_job(j.id)
      )
  );
$$;

-- 5. Jobs member-read policy — same clause ---------------------------------
drop policy if exists "Jobs: members read own DSO" on public.jobs;
create policy "Jobs: members read own DSO"
  on public.jobs for select
  using (
    dso_id = public.current_dso_id()
    and (
      public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
      or exists (
        select 1
        from public.job_locations jl
        where jl.job_id = jobs.id
          and jl.location_id in (select * from public.user_accessible_location_ids())
      )
    )
    and (
      confidential = false
      or public.current_dso_user_role() in ('owner', 'admin')
      or public.user_assigned_to_job(jobs.id)
    )
  );

-- 6. Jobs public-read policy — close the member side-door ------------------
-- current_dso_id() is null for candidates/anonymous → `is distinct from`
-- keeps the public path open for them; members of the OWNING dso must
-- clear confidentiality to read through ANY select policy.
drop policy if exists "Jobs: public read active" on public.jobs;
create policy "Jobs: public read active"
  on public.jobs for select
  using (
    status = 'active'
    and deleted_at is null
    and (
      confidential = false
      or dso_id is distinct from public.current_dso_id()
      or public.current_dso_user_role() in ('owner', 'admin')
      or public.user_assigned_to_job(jobs.id)
    )
  );

commit;
