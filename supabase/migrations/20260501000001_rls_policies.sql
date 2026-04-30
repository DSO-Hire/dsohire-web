-- ============================================================
-- DSO Hire — Phase 1 RLS policies
-- ============================================================
-- Encodes the access rules from schema_and_routes_sketch.md §
-- "Row-Level Security — the policies that actually matter".
--
-- The TL;DR per table:
--   dsos               — DSO members can read/write their own DSO; anyone can
--                        read where status='active' (for /companies/[slug])
--   dso_locations      — same as dsos
--   dso_users          — DSO members read each other; only owner/admin can
--                        invite/remove team
--   candidates         — candidate owns their row; DSO users can NEVER browse
--                        candidates directly (only via applications, Phase 2)
--   admin_users        — service-role bypass only; no public access
--   subscriptions      — DSO members read; only owner can change billing
--   invoices           — DSO owner/admin read-only
--   audit_log          — service-role write; admin_users read
--   email_log          — service-role write; admin_users read
--
-- Helper functions (see bottom): public.current_dso_id() and
-- public.is_dso_admin() are used by policies to avoid duplicating join logic.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Helper functions
-- ─────────────────────────────────────────────────────────────

-- Returns the dso_id of the currently signed-in DSO user, or NULL.
create or replace function public.current_dso_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select dso_id from public.dso_users where auth_user_id = auth.uid()
$$;

-- Returns the role of the currently signed-in DSO user, or NULL.
create or replace function public.current_dso_user_role()
returns dso_user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.dso_users where auth_user_id = auth.uid()
$$;

-- Returns true if the current user is an owner or admin of the given DSO.
create or replace function public.is_dso_admin(target_dso_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.dso_users
    where auth_user_id = auth.uid()
      and dso_id = target_dso_id
      and role in ('owner', 'admin')
  )
$$;

-- Returns true if the current user is an internal admin (Cam, support staff).
create or replace function public.is_internal_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users where auth_user_id = auth.uid()
  )
$$;

-- ─────────────────────────────────────────────────────────────
-- Enable RLS on every table
-- ─────────────────────────────────────────────────────────────

alter table public.dsos               enable row level security;
alter table public.dso_slug_history   enable row level security;
alter table public.dso_locations      enable row level security;
alter table public.dso_users          enable row level security;
alter table public.candidates         enable row level security;
alter table public.admin_users        enable row level security;
alter table public.subscriptions      enable row level security;
alter table public.invoices           enable row level security;
alter table public.audit_log          enable row level security;
alter table public.email_log          enable row level security;

-- ─────────────────────────────────────────────────────────────
-- DSOs
-- ─────────────────────────────────────────────────────────────

-- Anyone (incl. anon visitors) can read active DSOs for the public directory.
create policy "DSOs: public read active"
  on public.dsos for select
  using (status = 'active');

-- DSO members read their own DSO regardless of status (e.g. while pending).
create policy "DSOs: members read own"
  on public.dsos for select
  using (id = public.current_dso_id());

-- Only owner/admin can update DSO settings (description, logo, slug, etc.).
create policy "DSOs: admin update"
  on public.dsos for update
  using (public.is_dso_admin(id))
  with check (public.is_dso_admin(id));

-- DSO insert is handled server-side at sign-up (service-role) — no direct
-- client insert. Same for delete.

-- Internal admins can read everything via service-role bypass.

-- ─────────────────────────────────────────────────────────────
-- DSO slug history (read-only on the public side; service-role writes)
-- ─────────────────────────────────────────────────────────────

create policy "Slug history: public read"
  on public.dso_slug_history for select
  using (true);

-- ─────────────────────────────────────────────────────────────
-- DSO locations
-- ─────────────────────────────────────────────────────────────

create policy "Locations: public read active DSO locations"
  on public.dso_locations for select
  using (
    exists (
      select 1 from public.dsos d
      where d.id = dso_id and d.status = 'active'
    )
  );

create policy "Locations: members read own"
  on public.dso_locations for select
  using (dso_id = public.current_dso_id());

create policy "Locations: admin write"
  on public.dso_locations for all
  using (public.is_dso_admin(dso_id))
  with check (public.is_dso_admin(dso_id));

-- ─────────────────────────────────────────────────────────────
-- DSO users (employer-side team)
-- ─────────────────────────────────────────────────────────────

-- Members can see their teammates.
create policy "DSO users: read own DSO members"
  on public.dso_users for select
  using (dso_id = public.current_dso_id());

-- A user can update their own profile row.
create policy "DSO users: update self"
  on public.dso_users for update
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- Only owner/admin can invite or remove DSO users.
create policy "DSO users: admin invite/remove"
  on public.dso_users for insert
  with check (public.is_dso_admin(dso_id));

create policy "DSO users: admin delete"
  on public.dso_users for delete
  using (public.is_dso_admin(dso_id));

-- Only owner/admin can change a teammate's role.
create policy "DSO users: admin change role"
  on public.dso_users for update
  using (public.is_dso_admin(dso_id))
  with check (public.is_dso_admin(dso_id));

-- ─────────────────────────────────────────────────────────────
-- Candidates
-- ─────────────────────────────────────────────────────────────

-- Candidate reads/writes their own row.
create policy "Candidates: read self"
  on public.candidates for select
  using (auth_user_id = auth.uid());

create policy "Candidates: update self"
  on public.candidates for update
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

create policy "Candidates: insert self"
  on public.candidates for insert
  with check (auth_user_id = auth.uid());

create policy "Candidates: delete self"
  on public.candidates for delete
  using (auth_user_id = auth.uid());

-- DSO users CANNOT browse candidates directly. They only see candidates
-- through applications they own (added in the Phase 2 jobs migration).
-- The `is_searchable` flag opens this up if/when we ship a candidate-search
-- feature on a higher tier — that policy gets added at that time.

-- ─────────────────────────────────────────────────────────────
-- Admin users — no public access. Service-role bypass only.
-- ─────────────────────────────────────────────────────────────

create policy "Admin users: read self"
  on public.admin_users for select
  using (auth_user_id = auth.uid());

-- All other admin_users operations go through service-role.

-- ─────────────────────────────────────────────────────────────
-- Subscriptions
-- ─────────────────────────────────────────────────────────────

create policy "Subscriptions: members read own DSO"
  on public.subscriptions for select
  using (dso_id = public.current_dso_id());

-- Subscription writes happen via Stripe webhooks (service-role) — no client
-- write access except for the cancel_at_period_end toggle by owner.
create policy "Subscriptions: owner toggle cancel"
  on public.subscriptions for update
  using (public.is_dso_admin(dso_id))
  with check (public.is_dso_admin(dso_id));

-- ─────────────────────────────────────────────────────────────
-- Invoices (read-only for DSO admins; written by Stripe webhook)
-- ─────────────────────────────────────────────────────────────

create policy "Invoices: DSO admin read"
  on public.invoices for select
  using (
    exists (
      select 1 from public.subscriptions s
      where s.id = subscription_id
        and public.is_dso_admin(s.dso_id)
    )
  );

-- ─────────────────────────────────────────────────────────────
-- Audit log + email log (internal-admin read; service-role write)
-- ─────────────────────────────────────────────────────────────

create policy "Audit log: internal admin read"
  on public.audit_log for select
  using (public.is_internal_admin());

create policy "Email log: internal admin read"
  on public.email_log for select
  using (public.is_internal_admin());

-- Email log: a DSO can read entries related to their own DSO.
create policy "Email log: DSO admin read related"
  on public.email_log for select
  using (
    related_dso_id is not null
      and public.is_dso_admin(related_dso_id)
  );

-- ============================================================
-- End of RLS policies. Re-grant if you ever DROP TABLE — RLS does
-- not survive a recreate.
-- ============================================================
