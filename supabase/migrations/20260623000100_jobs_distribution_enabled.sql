-- ─────────────────────────────────────────────────────────────────
-- 20260623000100_jobs_distribution_enabled.sql  (Job Distribution — Phase 1)
--
-- Per-job opt-out for external distribution (syndication feed, public jobs
-- JSON API, embeddable widget/iframe). Defaults true so public active jobs
-- syndicate by default; the employer can switch an individual job off from
-- the Careers & Distribution settings screen.
--
-- This is independent of the hard exclusions: confidential jobs and
-- internal_only jobs are NEVER distributed regardless of this flag, and the
-- DSO-level is_demo flag + the launch gate still apply on top.
-- ─────────────────────────────────────────────────────────────────

begin;

alter table public.jobs
  add column if not exists distribution_enabled boolean not null default true;

comment on column public.jobs.distribution_enabled is
  'Per-job opt-out for external distribution (feed/API/embed). Default true for public active jobs. Confidential and internal_only jobs are always excluded regardless. Toggled from the employer Careers & Distribution settings screen. Enforced in public.list_distribution_jobs().';

commit;
