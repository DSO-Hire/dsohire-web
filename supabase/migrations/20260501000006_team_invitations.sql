-- ============================================================
-- DSO Hire — team invitations
-- ============================================================
-- Adds the dso_invitations table that backs the /employer/team flow.
--
-- Lifecycle:
--   1. Owner/admin invites by email → row inserted with token + expires_at
--   2. We email the invitee a link to /employer/invite/[token]
--   3. Invitee accepts → accepted_at set, dso_users row created
--   4. OR owner/admin revokes → revoked_at set
--   5. OR token expires → still a row; we filter on expires_at when listing
--
-- A single (dso_id, email) pair can only have ONE pending invitation at a
-- time — partial unique index enforces that. Once accepted or revoked, the
-- row is "closed" and a new pending invite can be created for the same email.
-- ============================================================

create table public.dso_invitations (
  id              uuid primary key default gen_random_uuid(),
  dso_id          uuid not null references public.dsos(id) on delete cascade,
  email           text not null,
  role            dso_user_role not null,
  token           text not null unique,
  invited_by      uuid references public.dso_users(id) on delete set null,
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now()
);

create index dso_invitations_dso_idx on public.dso_invitations (dso_id);
create index dso_invitations_token_idx on public.dso_invitations (token);
create index dso_invitations_email_idx on public.dso_invitations (lower(email));

-- Only one OPEN (not accepted, not revoked) invite per (dso, email).
create unique index dso_invitations_unique_pending
  on public.dso_invitations (dso_id, lower(email))
  where accepted_at is null and revoked_at is null;

-- ============================================================
-- RLS
-- ============================================================

alter table public.dso_invitations enable row level security;

-- DSO admins (owner/admin) can read all of their DSO's invitations.
create policy "Invitations: admin read"
  on public.dso_invitations for select
  using (public.is_dso_admin(dso_id));

-- DSO admins can insert invitations for their own DSO.
create policy "Invitations: admin insert"
  on public.dso_invitations for insert
  with check (public.is_dso_admin(dso_id));

-- DSO admins can revoke (or otherwise update) their DSO's invitations.
create policy "Invitations: admin update"
  on public.dso_invitations for update
  using (public.is_dso_admin(dso_id))
  with check (public.is_dso_admin(dso_id));

-- Service-role bypasses everything for the token-lookup path on the
-- accept page — no public-read policy on tokens (we don't want to leak
-- the existence of valid tokens via probing).
-- Accept-flow writes (setting accepted_at) also go through service-role.
