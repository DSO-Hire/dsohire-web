-- ─────────────────────────────────────────────────────────────
-- Phase 5C — atomic view-counter increment
-- ─────────────────────────────────────────────────────────────
--
-- Companion to 20260511000003_phase_5c_analytics.sql. The events
-- table (job_view_events) is the canonical source of truth for
-- analytics, but the legacy `jobs.views` int column has historical
-- readers — the /employer/jobs list (sort, top-performer card,
-- row display) — that we don't want to refactor now. Re-enable the
-- column as a denormalized cache so both surfaces stay in sync.
--
-- A SQL function gives us an atomic UPDATE (no read-then-write race)
-- and avoids round-tripping through RPC parameter parsing for each
-- view. Service role calls it from record-view.ts on every public
-- /jobs/[id] render.

create or replace function public.increment_job_view_count(p_job_id uuid)
returns void
language sql
security definer
as $$
  update public.jobs
  set views = views + 1
  where id = p_job_id;
$$;

-- Grant execute. Service role bypasses ALL grants but we make it
-- explicit for any future caller. authenticated callers don't need
-- it — only the server-side analytics path calls this.
grant execute on function public.increment_job_view_count(uuid) to service_role;

comment on function public.increment_job_view_count is
  'Phase 5C (shipped 2026-05-11). Atomic +1 on jobs.views, paired with the row insert in job_view_events. Keeps the legacy column accurate for /employer/jobs list readers that haven''t been refactored to count from events yet.';

-- ─────────────────────────────────────────────────────────────
-- One-time backfill
-- ─────────────────────────────────────────────────────────────
--
-- Between 20260511000003 going live and this fix landing, view events
-- were recorded but jobs.views stayed at 0. Sync them up so both
-- surfaces show the same number going forward. Idempotent — running
-- this again is a no-op once everything is in sync.

update public.jobs j
set views = coalesce(c.cnt, 0)
from (
  select job_id, count(*)::int as cnt
  from public.job_view_events
  group by job_id
) c
where c.job_id = j.id;
