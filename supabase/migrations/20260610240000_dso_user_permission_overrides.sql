-- #83 granular team permissions — per-teammate capability overrides on top of
-- the role preset. jsonb map of Capability -> bool; {} = pure preset (the
-- default, so every existing teammate is unchanged). Resolved by
-- effectivePermissions() in src/lib/permissions/capabilities.ts. Admin-only
-- capabilities can't be granted to non-admins regardless of what's stored here
-- (re-enforced in the resolver + the grant action). Applied to prod via the
-- connector on 2026-06-10; repo-sync file.
alter table dso_users add column if not exists permission_overrides jsonb not null default '{}'::jsonb;
