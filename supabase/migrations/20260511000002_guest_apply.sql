-- ─────────────────────────────────────────────────────────────
-- E2.1 / Phase 5F — Guest apply (auth-optional path)
-- ─────────────────────────────────────────────────────────────
--
-- Cam 2026-05-11 re-audit: 12 of 14 competitors offer guest apply
-- (Indeed, LinkedIn, ZipRecruiter, Workable, Greenhouse, Lever, Ashby,
-- SmartRecruiters, Workday, Rippling). DSO Hire today forces account
-- creation. Locked PRE-LAUNCH 2026-05-11.
--
-- Approach: extend the candidates table to allow guest rows where
-- `auth_user_id` is null and `email` carries the unverified identifier.
-- A guest can later "claim" their account through the existing
-- /auth/callback handler — emailed magic-link verify → auth.users row
-- created → callback links auth_user_id to the existing guest candidate
-- (matched by lower(email)), flips is_guest = false.
--
-- Schema constraint: every candidates row is EITHER auth-linked
-- (auth_user_id set, is_guest = false) OR guest (auth_user_id null,
-- is_guest = true, email set). Enforced via CHECK constraint.
--
-- RLS continues to work unchanged:
--   - Self-read via `auth_user_id = auth.uid()` — guests can't (no
--     session), which is correct.
--   - DSO-side read via `dso_can_read_candidate()` SECURITY DEFINER —
--     joins through applications.candidate_id, so guest rows are
--     visible to DSO members of jobs the guest applied to. Correct.

-- ─────────────────────────────────────────────────────────────
-- 1. Allow nullable auth_user_id, add email + is_guest + claim_expires_at
-- ─────────────────────────────────────────────────────────────

alter table public.candidates
  alter column auth_user_id drop not null;

alter table public.candidates
  add column email text,
  add column is_guest boolean not null default false,
  add column claim_expires_at timestamptz;

-- ─────────────────────────────────────────────────────────────
-- 2. Constraints
-- ─────────────────────────────────────────────────────────────

alter table public.candidates
  add constraint candidates_auth_or_guest_check
  check (
    (auth_user_id is not null and is_guest = false)
    or (auth_user_id is null and is_guest = true and email is not null)
  );

-- Index for fast email lookups during the claim flow.
-- (lower(email)) so the index matches case-insensitive comparisons.
create index candidates_guest_email_idx
  on public.candidates (lower(email))
  where is_guest = true;

-- ─────────────────────────────────────────────────────────────
-- 3. Comments
-- ─────────────────────────────────────────────────────────────

comment on column public.candidates.is_guest is
  'Guest apply path (E2.1, shipped 2026-05-11). true → row was created via guest apply with email only, no auth.users link. Flips to false when the candidate claims their account (callback links auth_user_id by email match).';

comment on column public.candidates.email is
  'Required when is_guest=true; null for auth-linked candidates (email is read via auth.users join). Maintained on claim → still null because we keep auth.users as the source of truth post-claim.';

comment on column public.candidates.claim_expires_at is
  'Soft TTL for the guest claim window. Default 90 days from creation (set by server action). Past expiry the candidate row stays readable to the employer (their application is still on record) but the candidate cannot retroactively claim — they would need to sign up fresh.';
