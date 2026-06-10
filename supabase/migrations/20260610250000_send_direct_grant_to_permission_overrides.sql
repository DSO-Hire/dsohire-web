-- #83 Phase 2 — single source of truth for direct offer-send.
--
-- The legacy per-teammate grant dso_users.can_send_offers_directly (N12) is
-- superseded by permission_overrides->'offers.send_direct'. Copy every live
-- grant into the overrides map; the app stops reading/writing the old column
-- as of this release. Column is KEPT (not dropped) for rollback safety —
-- drop in a later release once the override path has soaked.
--
-- Owner/admin need no row: ROLE_DEFAULTS already grants them
-- offers.send_direct, so only recruiter/hiring_manager grants migrate.

update dso_users
set permission_overrides =
  coalesce(permission_overrides, '{}'::jsonb)
    || jsonb_build_object('offers.send_direct', true)
where can_send_offers_directly is true
  and role in ('recruiter', 'hiring_manager');

comment on column dso_users.can_send_offers_directly is
  'DEPRECATED (#83 Phase 2, 2026-06-10): migrated into permission_overrides->offers.send_direct. No longer read or written by the app. Drop after one stable release.';
