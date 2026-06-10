-- #87c — résumé template choice (presentation layer for the résumé builder).
-- Applied to prod via the Supabase connector on 2026-06-10; this file keeps
-- the repo in sync. Accessed via the untyped client, so no database.types.ts
-- change is required.
alter table candidates
  add column if not exists resume_template text not null default 'classic';
