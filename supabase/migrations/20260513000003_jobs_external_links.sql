-- ═════════════════════════════════════════════════════════════════════════
-- 20260513000003 — Jobs external links
-- ═════════════════════════════════════════════════════════════════════════
--
-- E1.12 — external links on a job posting. Recruiters paste links to
-- video tours, benefits PDFs, "meet the team" pages, ADA practice
-- accreditation, etc. Stored as a small jsonb array of {label,url}
-- objects so the order is preserved and we don't need a side table for
-- a feature that caps at ~5 links per job.
--
-- Validation lives at the app layer (max 5 entries, label ≤80 chars,
-- url must parse to a valid https or http URL); enforcing it via CHECK
-- would block legitimate edits if the spec ever loosens.

alter table public.jobs
  add column if not exists external_links jsonb not null default '[]'::jsonb;

comment on column public.jobs.external_links is
  'E1.12 (2026-05-13). Array of {label: string, url: string} pairs. Surfaced on the public job page below benefits. Capped + validated at the app layer (max 5 entries, label <= 80 chars, http(s) URLs only).';
