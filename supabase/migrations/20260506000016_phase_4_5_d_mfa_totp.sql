-- ─────────────────────────────────────────────────────────────────────────
-- Phase 4.5.d (original numbering) — 2FA TOTP + recovery codes + org-wide
-- enforcement.
--
-- Scope locked 2026-05-06 evening:
--   • Per-account TOTP enrollment via Supabase Auth's built-in MFA factor
--     API (auth.mfa_factors lives in `auth` schema, managed by Supabase).
--   • Recovery codes — 10 one-time backup codes generated at enrollment,
--     hashed before storage, displayed once to the user. Used to sign in
--     when authenticator is lost.
--   • Org-wide enforcement — Enterprise-tier toggle on dsos.require_mfa.
--     When true, the layout-level guard redirects every DSO member to
--     /auth/mfa/setup (or /challenge) until their session is aal2.
--
-- All adds idempotent.
-- ─────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- 1. mfa_recovery_codes — hashed one-time backup codes
-- ─────────────────────────────────────────────────────────────

create table if not exists public.mfa_recovery_codes (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null references auth.users(id) on delete cascade,
  code_hash     text not null,
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists mfa_recovery_codes_user_idx
  on public.mfa_recovery_codes (auth_user_id);

-- Quick lookup of a candidate hash (used at sign-in challenge time).
create index if not exists mfa_recovery_codes_user_unused_idx
  on public.mfa_recovery_codes (auth_user_id)
  where used_at is null;

alter table public.mfa_recovery_codes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mfa_recovery_codes'
      and policyname = 'MFA codes: users read own'
  ) then
    create policy "MFA codes: users read own"
      on public.mfa_recovery_codes for select
      using (auth_user_id = auth.uid());
  end if;

  -- Insert + update + delete are service-role only — the server action
  -- uses createSupabaseServiceRoleClient() to mutate this table because
  -- code generation + verification needs to happen with full privileges.
  -- (No client-side INSERT/UPDATE/DELETE policies on purpose.)
end$$;

-- ─────────────────────────────────────────────────────────────
-- 2. dsos.require_mfa — org-wide MFA enforcement (Enterprise toggle)
-- ─────────────────────────────────────────────────────────────

alter table public.dsos
  add column if not exists require_mfa boolean not null default false;

comment on column public.dsos.require_mfa is
  'Phase 4.5.d (2FA). When true, every DSO member is redirected to MFA setup/challenge until their session is aal2. Owner-only toggle, gated to Enterprise tier in app layer.';

-- ─────────────────────────────────────────────────────────────
-- 3. Comments on new table
-- ─────────────────────────────────────────────────────────────

comment on table public.mfa_recovery_codes is
  'Phase 4.5.d. One-time backup codes for signing in when an authenticator is lost. Hashed (sha256) before storage; plaintext is shown once at generation time and never again. Service-role writes only.';
