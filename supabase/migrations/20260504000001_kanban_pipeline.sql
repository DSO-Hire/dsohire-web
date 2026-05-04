-- ============================================================
-- DSO Hire — Phase 5A kanban pipeline migration
-- ============================================================
-- Adds stage_entered_at + pipeline_position to public.applications
-- to power the employer pipeline kanban (Phase 5A).
--
-- - stage_entered_at: timestamp the row last entered its current
--   status. Auto-bumped via BEFORE UPDATE trigger on status changes.
--   Backfilled from application_status_events (most-recent event for
--   each application) where available; falls back to created_at.
-- - pipeline_position: reserved for sprint #2 manual reordering inside
--   a column. Unused this PR; nullable numeric for future fractional
--   indexing without rewrites.
-- - Adds applications to the supabase_realtime publication so the
--   kanban can subscribe to row-level changes. Idempotent: catches the
--   "already a member" case in a DO block so re-applies are safe.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Columns
-- ─────────────────────────────────────────────────────────────

alter table public.applications
  add column if not exists stage_entered_at timestamptz not null default now();

alter table public.applications
  add column if not exists pipeline_position numeric;

-- ─────────────────────────────────────────────────────────────
-- Backfill stage_entered_at
-- ─────────────────────────────────────────────────────────────
-- Use the latest application_status_events row per application when
-- the table exists; otherwise fall back to applications.created_at.
-- Wrapped in a DO block so this migration is resilient to either
-- environment (e.g., a future DB without the events table).
-- ─────────────────────────────────────────────────────────────

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name   = 'application_status_events'
  ) then
    update public.applications a
       set stage_entered_at = coalesce(latest.created_at, a.created_at)
      from (
        select distinct on (application_id)
               application_id,
               created_at
          from public.application_status_events
         order by application_id, created_at desc
      ) latest
     where latest.application_id = a.id;
  else
    update public.applications
       set stage_entered_at = created_at;
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────
-- Trigger: bump stage_entered_at whenever status changes
-- ─────────────────────────────────────────────────────────────

create or replace function public.bump_application_stage_entered_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    new.stage_entered_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists applications_bump_stage_entered_at on public.applications;

create trigger applications_bump_stage_entered_at
  before update of status on public.applications
  for each row execute function public.bump_application_stage_entered_at();

-- ─────────────────────────────────────────────────────────────
-- Realtime publication membership
-- ─────────────────────────────────────────────────────────────
-- supabase_realtime is created by Supabase; ALTER PUBLICATION ADD TABLE
-- raises duplicate_object (42710) if the table is already a member.
-- Catch and ignore so re-runs are no-ops.
-- ─────────────────────────────────────────────────────────────

do $$
begin
  alter publication supabase_realtime add table public.applications;
exception
  when duplicate_object then null;
  when undefined_object then
    -- supabase_realtime publication missing (non-Supabase env). Skip.
    null;
end
$$;
