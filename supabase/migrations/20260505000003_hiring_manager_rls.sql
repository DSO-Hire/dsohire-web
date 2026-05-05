-- ─────────────────────────────────────────────────────────────────────────
-- 20260505000003_hiring_manager_rls.sql
--
-- Phase 2 of the hiring-manager persona work, locked 2026-05-05.
--
-- Phase 1 (20260505000002_hiring_manager_persona.sql) added:
--   - 'hiring_manager' enum value on dso_user_role
--   - dso_user_locations join table with RLS
--   - public.user_accessible_location_ids() helper function
--
-- This migration (Phase 2) updates RLS on the 7 tables that hold per-job /
-- per-application data so that hiring managers see ONLY rows tied to their
-- scoped locations. Owner/admin/recruiter behavior is unchanged — they
-- continue to see every row in their DSO.
--
-- Tables updated:
--   1. jobs                          — SELECT scoped by job_locations
--   2. job_locations                 — SELECT scoped to HM's locations
--   3. applications                  — SELECT + UPDATE scoped via parent job
--   4. application_status_events     — SELECT scoped via parent application
--   5. application_question_answers  — DSO SELECT scoped via parent app
--   6. application_comments          — SELECT + INSERT scoped via parent app
--   7. application_scorecards        — SELECT + INSERT scoped via parent app
--   8. application_messages          — DSO SELECT + INSERT scoped via parent app
--
-- The pattern: a new helper function `user_can_access_job(p_job_id uuid)`
-- centralizes the "can the current user access this job?" logic. RLS
-- policies on application-related tables EXISTS-join to applications and
-- call the helper. Tables that read jobs directly use the helper inline
-- because they don't need the application join.
--
-- Insert/update policies on jobs and job_locations themselves are NOT
-- touched — the existing policies already restrict writes to
-- ('owner', 'admin', 'recruiter') via current_dso_user_role(), which
-- naturally excludes hiring_manager. No code change needed there.
--
-- Insert policies on application_messages, application_comments, and
-- application_scorecards ARE updated — HMs CAN insert their own rows on
-- applications they can access. Update policies (5-min author edit window,
-- reviewer-only updates) are NOT touched — they already constrain writes
-- to the row's own author/reviewer, so they don't need scope changes.
-- ─────────────────────────────────────────────────────────────────────────

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Helper function: user_can_access_job
--
-- Returns true if the currently signed-in user has access to a given
-- job. Centralizes the role + location-scope logic so individual RLS
-- policies stay readable.
--
--   owner / admin / recruiter   → any job in their DSO
--   hiring_manager              → any job where at least one
--                                 job_locations row points at a
--                                 location in their scoped set
--   anyone else                 → false
-- ─────────────────────────────────────────────────────────────────────

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
  );
$$;

grant execute on function public.user_can_access_job(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 2. jobs — SELECT for DSO members
--
-- HMs see only jobs where at least one job_locations row points at one
-- of their scoped locations. Public-read policy ("Jobs: public read
-- active") is unchanged — anyone can read active, non-deleted jobs
-- regardless of role.
-- ─────────────────────────────────────────────────────────────────────

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
  );


-- ─────────────────────────────────────────────────────────────────────
-- 3. job_locations — members SELECT
-- ─────────────────────────────────────────────────────────────────────

drop policy if exists "Job locations: members read own" on public.job_locations;
create policy "Job locations: members read own"
  on public.job_locations for select
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.dso_id = public.current_dso_id()
        and (
          public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
          or location_id in (select * from public.user_accessible_location_ids())
        )
    )
  );


-- ─────────────────────────────────────────────────────────────────────
-- 4. applications — DSO SELECT + DSO UPDATE
--
-- HMs need to update applications.status to move candidates between
-- stages (locked decision: HMs CAN move stages). The UPDATE policy is
-- replaced to allow any role with job access, not just admin/recruiter.
-- Existing candidate-side policies (insert, withdraw) are untouched.
-- ─────────────────────────────────────────────────────────────────────

drop policy if exists "Applications: DSO read own jobs" on public.applications;
create policy "Applications: DSO read own jobs"
  on public.applications for select
  using (public.user_can_access_job(job_id));

drop policy if exists "Applications: DSO update" on public.applications;
create policy "Applications: DSO update"
  on public.applications for update
  using (public.user_can_access_job(job_id))
  with check (public.user_can_access_job(job_id));


-- ─────────────────────────────────────────────────────────────────────
-- 5. application_status_events — DSO SELECT
--
-- No INSERT/UPDATE/DELETE policies — writes happen through triggers
-- with security definer. We only update the read policy.
-- ─────────────────────────────────────────────────────────────────────

drop policy if exists "Status events: DSO read own" on public.application_status_events;
create policy "Status events: DSO read own"
  on public.application_status_events for select
  using (
    exists (
      select 1 from public.applications a
      where a.id = application_id
        and public.user_can_access_job(a.job_id)
    )
  );


-- ─────────────────────────────────────────────────────────────────────
-- 6. application_question_answers — DSO SELECT
--
-- Candidate read/insert/update policies are unchanged. Only the DSO
-- read is rewired to use the helper.
-- ─────────────────────────────────────────────────────────────────────

drop policy if exists "Answers: DSO read own jobs" on public.application_question_answers;
create policy "Answers: DSO read own jobs"
  on public.application_question_answers for select
  using (
    exists (
      select 1 from public.applications a
      where a.id = application_id
        and public.user_can_access_job(a.job_id)
    )
  );


-- ─────────────────────────────────────────────────────────────────────
-- 7. application_comments — SELECT + INSERT
--
-- HMs can comment on applications at scoped locations. Update policy
-- (5-minute author edit window) is unchanged — author_user_id =
-- auth.uid() already restricts updates to the author themselves.
-- ─────────────────────────────────────────────────────────────────────

drop policy if exists "DSO members can read comments on their applications"
  on public.application_comments;
create policy "DSO members can read comments on their applications"
  on public.application_comments for select
  using (
    exists (
      select 1 from public.applications a
      where a.id = application_comments.application_id
        and public.user_can_access_job(a.job_id)
    )
  );

drop policy if exists "DSO members can insert their own comments"
  on public.application_comments;
create policy "DSO members can insert their own comments"
  on public.application_comments for insert
  with check (
    author_user_id = auth.uid()
    and exists (
      select 1
      from public.applications a
      join public.dso_users du on du.id = author_dso_user_id
      where a.id = application_comments.application_id
        and du.auth_user_id = auth.uid()
        and public.user_can_access_job(a.job_id)
    )
  );


-- ─────────────────────────────────────────────────────────────────────
-- 8. application_scorecards — SELECT + INSERT
--
-- HMs can write scorecards on applications at scoped locations (locked
-- decision). Reviewer-only update policy is unchanged.
-- ─────────────────────────────────────────────────────────────────────

drop policy if exists "DSO members read scorecards on their applications"
  on public.application_scorecards;
create policy "DSO members read scorecards on their applications"
  on public.application_scorecards for select
  using (
    exists (
      select 1 from public.applications a
      where a.id = application_scorecards.application_id
        and public.user_can_access_job(a.job_id)
    )
  );

drop policy if exists "DSO members insert their own scorecards"
  on public.application_scorecards;
create policy "DSO members insert their own scorecards"
  on public.application_scorecards for insert
  with check (
    reviewer_user_id = auth.uid()
    and exists (
      select 1
      from public.applications a
      join public.dso_users du on du.id = reviewer_dso_user_id
      where a.id = application_scorecards.application_id
        and du.auth_user_id = auth.uid()
        and public.user_can_access_job(a.job_id)
    )
  );


-- ─────────────────────────────────────────────────────────────────────
-- 9. application_messages — DSO SELECT + INSERT (DSO half of the OR)
--
-- Messages have two participant types: candidate and DSO. The candidate
-- half of the OR is unchanged. The DSO half is rewired through the
-- helper so HMs can read/send messages on applications at their
-- scoped locations. Sender-only update policy is unchanged.
-- ─────────────────────────────────────────────────────────────────────

drop policy if exists "Application participants read messages"
  on public.application_messages;
create policy "Application participants read messages"
  on public.application_messages for select
  using (
    exists (
      select 1
      from public.applications a
      join public.candidates c on c.id = a.candidate_id
      where a.id = application_messages.application_id
        and c.auth_user_id = auth.uid()
    )
    or
    exists (
      select 1
      from public.applications a
      where a.id = application_messages.application_id
        and public.user_can_access_job(a.job_id)
    )
  );

drop policy if exists "Application participants insert their own messages"
  on public.application_messages;
create policy "Application participants insert their own messages"
  on public.application_messages for insert
  with check (
    sender_user_id = auth.uid()
    and (
      exists (
        select 1
        from public.applications a
        join public.candidates c on c.id = a.candidate_id
        where a.id = application_messages.application_id
          and c.auth_user_id = auth.uid()
      )
      or
      exists (
        select 1
        from public.applications a
        where a.id = application_messages.application_id
          and public.user_can_access_job(a.job_id)
      )
    )
  );

commit;

-- ─────────────────────────────────────────────────────────────────────
-- Smoke test (run separately after applying):
--
-- -- 1. As an authenticated owner/admin/recruiter, this should return
-- --    every job in your DSO (current behavior, unchanged):
-- set role authenticated;
-- select id, title from public.jobs limit 5;
--
-- -- 2. As an authenticated hiring_manager (after Phase 3 ships the
-- --    invite flow and you've created one in dev), should return only
-- --    jobs where job_locations intersects dso_user_locations:
-- select id, title from public.jobs limit 5;
-- reset role;
-- ─────────────────────────────────────────────────────────────────────
