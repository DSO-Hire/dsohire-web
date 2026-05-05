-- ─────────────────────────────────────────────────────────────────────────
-- 20260505000002_hiring_manager_persona.sql
--
-- Phase 1 of the hiring-manager persona work, locked 2026-05-05.
--
-- Adds a fourth role to dso_user_role: 'hiring_manager'. Hiring managers are
-- dentist-owners or local managers at DSO-affiliated practices who retain
-- clinical autonomy and need their own login — but should ONLY see jobs and
-- applications tied to the practice locations they're scoped to.
--
-- This migration delivers the foundation:
--   1. New enum value 'hiring_manager' on dso_user_role
--   2. New join table dso_user_locations (many-to-many between dso_users and
--      dso_locations) with RLS
--   3. Helper function user_accessible_location_ids() that returns the set of
--      location IDs the current authenticated user has access to:
--        - owner / admin / recruiter → every location in their DSO
--        - hiring_manager → only locations they're explicitly scoped to via
--          dso_user_locations
--
-- Phase 2 (separate migration) will rewrite RLS on jobs, applications,
-- application_comments, application_scorecards, application_status_events,
-- screening_question_answers, and application_messages to use this helper.
-- This migration is a no-op for existing users — owner/admin/recruiter
-- behavior is unchanged because user_accessible_location_ids() returns the
-- same set it always did for those roles.
--
-- Phase 3 (UI work) will wire /employer/team to invite hiring managers with
-- a location multi-select, and update server actions / components to enforce
-- the locked permission decisions:
--   - HMs cannot create jobs (admin/recruiter only)
--   - HMs cannot use bulk actions
--   - HMs cannot invite team members
--   - HMs CAN view applications, move stages, write scorecards, comment,
--     @mention, and use the AI rejection-reason suggester at scoped locations
--   - HMs are uncapped per DSO (matches the locked tier matrix promise)
--
-- Decisions logged in chat 2026-05-05 PM. Cam confirmed all four defaults.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POSTGRES GOTCHA (lesson learned 2026-05-05): ALTER TYPE ... ADD VALUE
-- and any code that REFERENCES the new enum value (function bodies, RLS
-- policies, etc.) must be in separate transactions. Postgres requires the
-- new value to be committed before it can be used.
--
-- This file is structured as TWO statements:
--   Step 1: The ALTER TYPE on its own — auto-commits as a single statement.
--   Step 2: Everything else, wrapped in a single transaction.
--
-- When applying via Supabase SQL Editor, run them as TWO separate clicks of
-- the Run button (split at the comment marker below). When applying via
-- `supabase db push`, the CLI handles the boundary automatically.
-- ─────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════
-- STEP 1 — Extend the enum (run this first, alone)
-- ═════════════════════════════════════════════════════════════════════════

alter type public.dso_user_role add value if not exists 'hiring_manager';


-- ═════════════════════════════════════════════════════════════════════════
-- STEP 2 — Everything else (run after Step 1 commits)
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1. New join table: dso_user_locations
--    A hiring manager can be scoped to multiple locations, and a
--    location can have multiple HMs. owner/admin/recruiter rows do NOT
--    need entries here — they have access to everything in their DSO
--    by virtue of role alone (see helper function below).
-- ─────────────────────────────────────────────────────────────────────

create table public.dso_user_locations (
  id              uuid primary key default gen_random_uuid(),
  dso_user_id     uuid not null references public.dso_users(id) on delete cascade,
  dso_location_id uuid not null references public.dso_locations(id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (dso_user_id, dso_location_id)
);

create index dso_user_locations_user_idx     on public.dso_user_locations (dso_user_id);
create index dso_user_locations_location_idx on public.dso_user_locations (dso_location_id);

-- ─────────────────────────────────────────────────────────────────────
-- 2. Helper function: user_accessible_location_ids()
--
-- Returns the set of dso_locations.id values the currently signed-in
-- user can access. Used by RLS policies in Phase 2 to scope rows on
-- jobs / applications / etc. by location.
--
--   owner / admin / recruiter   → all locations in their DSO
--   hiring_manager              → only their assigned locations
--   anyone else (no membership) → empty set
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.user_accessible_location_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  -- owner / admin / recruiter: every location in their DSO
  select dl.id
  from public.dso_locations dl
  where dl.dso_id in (
    select du.dso_id
    from public.dso_users du
    where du.auth_user_id = auth.uid()
      and du.role in ('owner', 'admin', 'recruiter')
  )
  union
  -- hiring_manager: only their explicitly scoped locations
  select dul.dso_location_id
  from public.dso_user_locations dul
  join public.dso_users du
    on du.id = dul.dso_user_id
   and du.auth_user_id = auth.uid()
   and du.role = 'hiring_manager';
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. RLS on dso_user_locations
--
-- DSO members can read their DSO's location assignments (so HMs see
-- which locations they cover, and admins see who's scoped where).
-- Only owner/admin can write — recruiter and hiring_manager cannot
-- assign or unassign location scopes. This matches the locked decision
-- "Assign HMs to locations" → owner/admin only.
-- ─────────────────────────────────────────────────────────────────────

alter table public.dso_user_locations enable row level security;

-- Anyone in the DSO can SELECT — needed so HMs can see their own scoping
-- and so the team-management UI can render the full assignment picture.
create policy "DSO members can read location assignments in their DSO"
  on public.dso_user_locations
  for select
  to authenticated
  using (
    dso_user_id in (
      select id from public.dso_users where dso_id = public.current_dso_id()
    )
  );

-- INSERT: only owner/admin, and only for users in their own DSO.
create policy "DSO admins can assign locations to users"
  on public.dso_user_locations
  for insert
  to authenticated
  with check (
    public.is_dso_admin(
      (select dso_id from public.dso_users where id = dso_user_id)
    )
  );

-- DELETE: only owner/admin, and only for users in their own DSO.
create policy "DSO admins can unassign locations from users"
  on public.dso_user_locations
  for delete
  to authenticated
  using (
    public.is_dso_admin(
      (select dso_id from public.dso_users where id = dso_user_id)
    )
  );

-- We deliberately do NOT add an UPDATE policy — assignments are
-- immutable. To change a scope, the admin deletes the old row and
-- inserts a new one. Keeps the audit story clean and avoids having to
-- think about which fields can be mutated.

-- ─────────────────────────────────────────────────────────────────────
-- 4. Permissions: grant access to authenticated users
-- ─────────────────────────────────────────────────────────────────────

grant select, insert, delete on public.dso_user_locations to authenticated;
grant execute on function public.user_accessible_location_ids() to authenticated;

commit;
