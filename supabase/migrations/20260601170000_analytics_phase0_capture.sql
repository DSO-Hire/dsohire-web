-- Analytics Phase 0 — new data capture (2026-06-01)
--
-- Additive only (new nullable column + new table + new column), safe to apply
-- ahead of the consuming code. Captures the three signals the analytics
-- research flagged as "needs new data": time-to-first-response, structured
-- offer-decline reasons, and apply-form completion rate.

-- ─────────────────────────────────────────────────────────────
-- 1. applications.first_response_at — time-to-first-response metric.
--    Set to the timestamp of the first employer→candidate outbound message.
-- ─────────────────────────────────────────────────────────────
alter table public.applications
  add column if not exists first_response_at timestamptz;

create index if not exists applications_first_response_idx
  on public.applications (first_response_at desc nulls last)
  where first_response_at is not null;

-- ─────────────────────────────────────────────────────────────
-- 2. application_offer_responses.decline_reason_code — STRUCTURED decline
--    reason (aggregatable). The existing free-text `reason` is retained for
--    detail; this column powers the decline-reason breakdown chart.
-- ─────────────────────────────────────────────────────────────
alter table public.application_offer_responses
  add column if not exists decline_reason_code text;

-- ─────────────────────────────────────────────────────────────
-- 3. application_starts — append-only apply-form START events.
--    Application completion rate = submitted applications ÷ starts.
--    Mirrors job_view_events: service-role inserts, DSO members read via RLS.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.application_starts (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  session_id  text,
  started_at  timestamptz not null default now()
);

create index if not exists application_starts_job_idx
  on public.application_starts (job_id, started_at desc);

alter table public.application_starts enable row level security;

create policy "Application starts: members read own"
  on public.application_starts for select
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id and j.dso_id = public.current_dso_id()
    )
  );
-- No anon insert policy — public apply-flow start pings go through a server
-- action using the service-role client, mirroring job_view_events.

-- ─────────────────────────────────────────────────────────────
-- 4. Comments
-- ─────────────────────────────────────────────────────────────
comment on table public.application_starts is
  'Analytics Phase 0 (2026-06-01). Append-only apply-form start events. Completion rate = submitted applications / starts. Service-role inserts; DSO members read via RLS.';
comment on column public.applications.first_response_at is
  'Analytics Phase 0. Timestamp of first employer->candidate outbound message; powers time-to-first-response.';
comment on column public.application_offer_responses.decline_reason_code is
  'Analytics Phase 0. Structured decline reason (aggregatable); free-text reason retained for detail.';
