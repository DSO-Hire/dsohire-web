-- #88 pricing caps — "# of openings" on a job (standard ATS field).
-- Applied to prod via the Supabase connector on 2026-06-10; repo-sync file.
-- The job cap counts the SUM of openings across status='active' jobs, so a
-- floating role across N sites = 1 opening (counts 1) while N distinct hires =
-- N openings. Default 1; never auto-multiplies by location count.
alter table jobs
  add column if not exists openings integer not null default 1
  constraint jobs_openings_positive check (openings >= 1);
