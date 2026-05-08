-- ─────────────────────────────────────────────────────────────────────────
-- 20260508000001_private_dso_affiliation.sql
--
-- Phase 1 of the launch-blocker private DSO affiliation work, locked
-- 2026-05-08 (originally parked 2026-05-07; 7 questions answered + scope
-- expanded today to make the candidate-reveal policy DSO-configurable).
--
-- Many mid-market DSOs acquire individual practices and intentionally
-- don't advertise the corporate ownership. "Jones Family Dental" gets
-- bought by Heartland or Pacific Dental, the storefront / Google
-- Business Profile / patient-facing brand stays "Jones Family Dental"
-- forever, but corporate handles hiring + payroll + ops. Today our site
-- exposes the DSO ownership on every job page, public DSO profile, apply
-- flow, and email — that's a non-starter for those acquired locations.
--
-- This migration adds the data model. App-layer wiring (the display
-- helper + 11 touchpoint replacements + admin UI) lands in subsequent
-- commits without further migrations.
--
-- Locked decisions (see project_private_dso_affiliation_per_location.md
-- in memory for full rationale):
--   Q1 Default for new locations: PUBLIC (true)
--   Q2 Candidate reveal: configurable per-DSO via enum (never / after_hire / per_application)
--   Q3 Multi-location jobs: most-private inherits (any private → whole job private)
--   Q4 All-private DSO: keep /companies/[slug] but hide locations + jobs
--   Q5 JSON-LD hiringOrganization.name: practice name only (no parentOrganization)
--   Q6 UI label: "Display [DSO name] on the public job page"
--   Q7 DSO browse: private locations excluded from "Filter by DSO"
--
-- ─────────────────────────────────────────────────────────────────────────
-- POSTGRES GOTCHA — same rule as the hiring_manager enum migration on
-- 2026-05-05: CREATE TYPE on its own auto-commits (good); using the new
-- enum value inside the same transaction would fail. We split the file
-- into TWO statements:
--   Step 1: CREATE TYPE on its own (auto-commits as a single statement)
--   Step 2: Everything else, in one transaction
--
-- supabase db push handles the boundary automatically. SQL Editor users:
-- two clicks of Run, splitting at the marker comment below.
-- ─────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════
-- STEP 1 — Create the enum (run this first, alone)
-- ═════════════════════════════════════════════════════════════════════════

create type public.dso_affiliation_reveal_policy as enum (
  'never',
  'after_hire',
  'per_application'
);


-- ═════════════════════════════════════════════════════════════════════════
-- STEP 2 — Columns + indexes + grants (run after Step 1 commits)
-- ═════════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1. dso_locations.public_dso_affiliation
--    The per-location toggle. true = public surfaces show the DSO name
--    when this location is the (or one of the) location(s) for a job.
--    false = public surfaces show only the practice name.
-- ─────────────────────────────────────────────────────────────────────

alter table public.dso_locations
  add column if not exists public_dso_affiliation boolean not null default true;

comment on column public.dso_locations.public_dso_affiliation is
  'When true (default), public surfaces show the DSO name alongside the practice. '
  'When false, public surfaces show only the practice name — used for acquired '
  'practices that retain their original brand publicly while corporate handles '
  'hiring internally. See project_private_dso_affiliation_per_location.md.';


-- ─────────────────────────────────────────────────────────────────────
-- 2. dsos.affiliation_reveal_policy
--    The DSO-level policy for when (if ever) a candidate learns the
--    corporate name behind a private-affiliation practice. Default
--    'never' is the safest if the DSO never explicitly sets it.
--
--    - never: candidate never sees the DSO name regardless of stage
--    - after_hire: candidate sees the DSO name once status='hired'
--    - per_application: an "Reveal DSO" button on the kanban flips
--      visibility for that one application
-- ─────────────────────────────────────────────────────────────────────

alter table public.dsos
  add column if not exists affiliation_reveal_policy
    public.dso_affiliation_reveal_policy not null default 'never';

comment on column public.dsos.affiliation_reveal_policy is
  'For candidates applying to a private-affiliation location: when (if ever) '
  'they learn the corporate DSO name. Default never. Configurable per DSO; '
  'see feedback_dso_sandbox_philosophy.md for why this is per-DSO not product-wide.';


-- ─────────────────────────────────────────────────────────────────────
-- 3. applications.affiliation_revealed (+ audit columns)
--    Per-application override for policy = per_application. The "Reveal
--    DSO" button flips affiliation_revealed = true and stamps the audit
--    columns. Once revealed, can't be un-revealed (the candidate already
--    saw it; pretending otherwise would be misleading).
-- ─────────────────────────────────────────────────────────────────────

alter table public.applications
  add column if not exists affiliation_revealed boolean not null default false,
  add column if not exists affiliation_revealed_at timestamptz,
  add column if not exists affiliation_revealed_by_dso_user_id
    uuid references public.dso_users(id) on delete set null;

comment on column public.applications.affiliation_revealed is
  'Per-application override of the DSO affiliation_reveal_policy. Only '
  'meaningful when policy = per_application. Set to true via the "Reveal DSO" '
  'button on the kanban / application detail. One-way flip — once revealed, '
  'cannot be undone (candidate already saw the corporate name).';

-- Index for the candidate-side lookup pattern: when rendering the
-- candidate's application detail, we need to know if THIS application
-- was per-app revealed. Most queries will hit by id which already has
-- the PK index, but a partial index on the affirmative case keeps the
-- "show me all reveal-events for this DSO" admin query fast.
create index if not exists applications_affiliation_revealed_idx
  on public.applications (affiliation_revealed_at)
  where affiliation_revealed = true;


-- ─────────────────────────────────────────────────────────────────────
-- 4. Helper: job_has_private_affiliation_inherit
--    Returns true if ANY of the job's linked locations has
--    public_dso_affiliation = false. The "most-private inherits" rule
--    from Q3 — one private location flips the whole job private.
--    SECURITY DEFINER so it bypasses RLS on the dso_locations join
--    when called from RLS policies / public surfaces. Stable.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.job_has_private_affiliation_inherit(p_job_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.job_locations jl
    join public.dso_locations dl on dl.id = jl.location_id
    where jl.job_id = p_job_id
      and dl.public_dso_affiliation = false
  );
$$;

grant execute on function public.job_has_private_affiliation_inherit(uuid) to anon, authenticated;

comment on function public.job_has_private_affiliation_inherit(uuid) is
  'True if the job has any linked location with public_dso_affiliation = false. '
  'Implements the "most-private inherits" rule (Q3) — one private location '
  'flips the whole job private in public surfaces.';


-- ─────────────────────────────────────────────────────────────────────
-- 5. Helper: job_is_publicly_dso_affiliated
--    The inverse of the above with a more readable name for use sites
--    that want a "should I show the DSO name?" check at the public
--    layer. Returns true iff EVERY location on the job is public AND
--    the job has at least one location (defensive against orphan jobs
--    with no job_locations rows — those are usually corporate-scope so
--    don't have job_locations; corporate scope visibility is governed
--    elsewhere by jobs.scope, not this helper).
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.job_is_publicly_dso_affiliated(p_job_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  -- Corporate / regional jobs: governed by jobs.scope, not by location
  -- tagging. Default these to publicly affiliated since they're DSO-wide
  -- by definition (the DSO IS the employer; there's no acquired-brand
  -- mask). DSOs that want the corporate-jobs surface kept private
  -- entirely should not list corporate roles publicly in the first
  -- place — that's a product decision, not a per-job toggle.
  select case
    when (select scope from public.jobs where id = p_job_id) in ('regional', 'corporate')
      then true
    else not public.job_has_private_affiliation_inherit(p_job_id)
  end;
$$;

grant execute on function public.job_is_publicly_dso_affiliated(uuid) to anon, authenticated;

comment on function public.job_is_publicly_dso_affiliated(uuid) is
  'True if public surfaces should display the DSO name for this job. '
  'False if any linked location is private (inherits most-private per Q3). '
  'Corporate + regional scope jobs always return true — their visibility '
  'is governed by jobs.scope, not by location-level affiliation toggles.';


-- ─────────────────────────────────────────────────────────────────────
-- 6. RLS — per-app reveal rights
--    The "Reveal DSO" button needs to update applications.affiliation_
--    revealed. Existing applications UPDATE policy goes through
--    user_can_access_job(job_id) — that already correctly scopes to
--    DSO members + HMs at the right locations. The policy already
--    allows updating any column on applications, including the new
--    one. No new policy needed; relies on the existing scope rules.
--
--    Defense in depth at the app layer: the server action that flips
--    the bit also checks (a) DSO policy = per_application, (b) caller
--    is owner/admin/recruiter or HM with location access, (c) sets the
--    audit columns. Centralized in src/lib/dso/affiliation-reveal.ts.
-- ─────────────────────────────────────────────────────────────────────

commit;


-- ─────────────────────────────────────────────────────────────────────
-- Smoke tests (run separately after applying):
--
-- -- 1. Default values are populated:
-- select count(*) from public.dso_locations where public_dso_affiliation is null;
-- -- → 0 expected
-- select count(*) from public.dsos where affiliation_reveal_policy is null;
-- -- → 0 expected
--
-- -- 2. Helper round-trip on an existing job:
-- select id, public.job_is_publicly_dso_affiliated(id) from public.jobs limit 5;
--
-- -- 3. Flip a test location private and verify the helper updates:
-- update public.dso_locations set public_dso_affiliation = false
--   where id = '<some_test_location_id>';
-- select id, public.job_is_publicly_dso_affiliated(id)
--   from public.jobs
--   where id in (
--     select job_id from public.job_locations
--     where location_id = '<some_test_location_id>'
--   );
-- -- → false expected for all of those jobs
-- ─────────────────────────────────────────────────────────────────────
