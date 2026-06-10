-- ─────────────────────────────────────────────────────────────────────────
-- 20260610270000_fix_confidential_rls_recursion.sql  (#83 Phase 4 HOTFIX)
--
-- INCIDENT (2026-06-10): every jobs query failed with
--   ERROR 42P17: infinite recursion detected in policy for relation "jobs"
-- which the app rendered as empty states platform-wide (jobs list, analytics,
-- talent pool, applications). No data was lost — queries errored, rows were
-- untouched.
--
-- ROOT CAUSE: 20260610260000 recreated "Jobs: members read own DSO" from the
-- OLD 20260505000003 migration TEXT (direct EXISTS subquery on
-- job_locations). A later migration had already rewritten the job_locations
-- policies to route through the SECURITY DEFINER user_can_access_job()
-- precisely to break the jobs ⇄ job_locations policy cycle; restoring the
-- old text resurrected it:
--   jobs(member read) → job_locations → job_locations(public read) → jobs → ∞
-- The new job_team_access policies also referenced public.jobs directly
-- (same trap, second cycle).
--
-- LESSON (now a hard rule): when REPLACING a live RLS policy, read the LIVE
-- definition from pg_policies first — never reconstruct from historical
-- migration files. And never reference another RLS'd table directly inside
-- a policy expression on these tables; route through SECURITY DEFINER
-- helpers, which terminate RLS expansion.
--
-- FIX: user_can_access_job() already encodes membership + role + HM location
-- scope + Phase 4 confidentiality — so it IS the member policy. No policy
-- below references any table directly.
-- ─────────────────────────────────────────────────────────────────────────

begin;

drop policy if exists "Jobs: members read own DSO" on public.jobs;
create policy "Jobs: members read own DSO"
  on public.jobs for select
  using (public.user_can_access_job(id));

drop policy if exists "Job team access: members read" on public.job_team_access;
create policy "Job team access: members read"
  on public.job_team_access for select
  using (public.user_can_access_job(job_id));

drop policy if exists "Job team access: admin insert" on public.job_team_access;
create policy "Job team access: admin insert"
  on public.job_team_access for insert
  with check (
    public.current_dso_user_role() in ('owner', 'admin')
    and public.user_can_access_job(job_id)
  );

drop policy if exists "Job team access: admin delete" on public.job_team_access;
create policy "Job team access: admin delete"
  on public.job_team_access for delete
  using (
    public.current_dso_user_role() in ('owner', 'admin')
    and public.user_can_access_job(job_id)
  );

-- The public jobs policy calls user_assigned_to_job() and is evaluated for
-- anonymous visitors too — make sure anon can execute the helper.
grant execute on function public.user_assigned_to_job(uuid) to anon;

commit;
