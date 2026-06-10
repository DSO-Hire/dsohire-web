-- #87 résumé builder enhancements — custom sections + section ordering.
-- Applied to prod via the Supabase connector on 2026-06-10; this file keeps the
-- repo in sync. Both are presentation-layer (accessed via the untyped client),
-- so no database.types.ts change is required.
--   resume_custom_sections: jsonb array of { title, body, date_start, date_end }
--   resume_section_order:    jsonb array of main section keys, in render order
alter table candidates
  add column if not exists resume_custom_sections jsonb not null default '[]'::jsonb,
  add column if not exists resume_section_order jsonb not null default '[]'::jsonb;
