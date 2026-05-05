-- ─────────────────────────────────────────────────────────────────────────
-- 20260505000004_invite_scoped_locations.sql
--
-- Phase 3a of the hiring-manager persona work, locked 2026-05-05.
--
-- Adds a `scoped_location_ids` column to `dso_invitations` so that when an
-- admin invites a hiring_manager, the location scope is captured at
-- invite-creation time and applied when the invitee accepts.
--
-- The column is a UUID array, nullable. NULL or empty array for non-HM
-- invites (which is the existing default behavior — Phase 1 didn't need
-- any change here). For hiring_manager invites, the array contains the
-- dso_locations.id values to be inserted into dso_user_locations on
-- acceptance.
--
-- Validation lives in application code, not the database. We can't enforce
-- "every UUID in this array references a dso_locations row in the same
-- DSO as the invite" with a CHECK constraint without a complex trigger,
-- and we'd have to handle the validation in JS for the form anyway. The
-- acceptInvitation server action filters by dso_id + the array on insert,
-- so a malformed value just creates fewer dso_user_locations rows than
-- expected.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.dso_invitations
  add column if not exists scoped_location_ids uuid[];

comment on column public.dso_invitations.scoped_location_ids is
  'For hiring_manager invites: dso_locations.id values to scope the user to '
  'on acceptance. NULL or empty array for owner/admin/recruiter invites.';
