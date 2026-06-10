-- #87 — make Accent the default résumé template for new candidates.
-- Applied to prod via the Supabase connector on 2026-06-10; repo-sync file.
-- Existing rows keep their stored value; only new inserts default to 'accent'.
alter table candidates alter column resume_template set default 'accent';
