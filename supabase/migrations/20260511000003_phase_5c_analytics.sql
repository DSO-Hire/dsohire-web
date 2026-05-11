-- ─────────────────────────────────────────────────────────────
-- Phase 5C — Analytics + reporting foundation
-- ─────────────────────────────────────────────────────────────
--
-- Cam 2026-05-11 (re-audit Day 1): E6 reporting bucket was 0% full
-- pre-launch. This migration is the timeseries spine for everything
-- downstream — per-job analytics widget, DSO-wide dashboard, funnel
-- viz, source attribution, time-to-hire metric, weekly digest.
--
-- Three additions:
--   1. `job_view_events` — append-only timeseries of public-page views.
--      Records every render of /jobs/[id] for both anonymous and
--      authenticated viewers. Server inserts via service role; reads
--      gated to DSO members via RLS.
--   2. `applications.source` — nullable text, attribution channel
--      (e.g., 'indeed', 'companies', 'linkedin', 'direct'). Captured
--      from the apply flow's incoming ?source= parameter.
--   3. `applications.hired_at` — timestamp set automatically by trigger
--      when status transitions to 'hired'. Powers time-to-hire metric
--      without scanning application_status_events for every page load.

-- ─────────────────────────────────────────────────────────────
-- 1. job_view_events
-- ─────────────────────────────────────────────────────────────

create table public.job_view_events (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid not null references public.jobs(id) on delete cascade,
  viewed_at         timestamptz not null default now(),
  session_id        text,
  source            text,
  referer_host      text,
  is_authenticated  boolean not null default false
);

create index job_view_events_job_idx
  on public.job_view_events (job_id, viewed_at desc);

create index job_view_events_source_idx
  on public.job_view_events (source)
  where source is not null;

alter table public.job_view_events enable row level security;

-- DSO members can read view events for their own DSO's jobs.
create policy "Job view events: members read own"
  on public.job_view_events for select
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id and j.dso_id = public.current_dso_id()
    )
  );

-- No anon insert policy — service-role client only. Public visitors
-- triggering inserts go through a server action that uses the admin
-- client.

-- ─────────────────────────────────────────────────────────────
-- 2. applications.source + applications.hired_at
-- ─────────────────────────────────────────────────────────────

alter table public.applications
  add column source text,
  add column hired_at timestamptz;

create index applications_source_idx
  on public.applications (source)
  where source is not null;

create index applications_hired_at_idx
  on public.applications (hired_at desc nulls last)
  where hired_at is not null;

-- ─────────────────────────────────────────────────────────────
-- 3. Trigger: auto-set hired_at on status='hired' transition
-- ─────────────────────────────────────────────────────────────
--
-- Fires on UPDATE only, and only when the status actually changes to
-- 'hired' (not on no-op updates of a row already in that state). If
-- hired_at was manually set by an admin earlier, the trigger respects
-- the existing value (no overwrite).

create or replace function public.applications_set_hired_at()
returns trigger
language plpgsql
as $$
begin
  if (NEW.status = 'hired')
     and (OLD.status is distinct from 'hired')
     and (NEW.hired_at is null) then
    NEW.hired_at = now();
  end if;
  return NEW;
end;
$$;

create trigger applications_set_hired_at_trigger
  before update on public.applications
  for each row execute function public.applications_set_hired_at();

-- Backfill: for any application currently in status='hired' but with
-- a null hired_at, set hired_at to the row's updated_at. This catches
-- pre-existing 'hired' applications (likely none in prod since the
-- feature was never wired, but defensive).
update public.applications
set hired_at = updated_at
where status = 'hired' and hired_at is null;

-- ─────────────────────────────────────────────────────────────
-- 4. Comments
-- ─────────────────────────────────────────────────────────────

comment on table public.job_view_events is
  'Phase 5C (shipped 2026-05-11). Append-only public-page view log. Powers per-job + DSO-wide analytics. Service-role inserts only; DSO members read via RLS.';

comment on column public.applications.source is
  'Phase 5C source attribution. Captured from the ?source= URL parameter on apply. Examples: indeed, companies, linkedin, direct, careers, qrcode-flyer, dso-newsletter.';

comment on column public.applications.hired_at is
  'Phase 5C time-to-hire metric. Auto-set by trigger on status transition to "hired"; nullable until then. Used as the canonical hire timestamp (jobs.posted_at to applications.hired_at = time-to-hire days).';
