-- ─────────────────────────────────────────────────────────────────────────
-- 20260508000002_audit_events.sql
--
-- Phase 4.5.e — Activity & audit log MVP.
--
-- Single append-only table that captures meaningful actions across the
-- DSO surface — stage moves, role changes, affiliation policy flips,
-- team invites, etc. The recording layer lives in app code
-- (src/lib/audit/record.ts) so each mutation site can hand-shape its
-- summary copy without rebuilding tables on schema changes.
--
-- Why an `audit_events` table vs. trigger-based capture:
--   - Triggers run inside the same transaction as the mutation; one
--     bad column or RLS edge case can swallow the parent write. App-
--     side recording fails open (the action succeeds even if the
--     audit insert errors — we log to console.warn) so we never lose
--     a customer-facing operation to an audit-log bug.
--   - Summary copy needs to know HUMAN context (who got moved? from
--     what stage? to what stage?) which requires joining several
--     tables. Easier to assemble at the action layer than pull
--     together in PL/pgSQL.
--
-- RLS:
--   - SELECT — DSO members can read their own DSO's events. HMs are
--     scoped via the standard current_dso_id() helper; further HM-
--     filtering (only seeing events on their own location set) is a
--     follow-up if it surfaces as a real ask.
--   - No INSERT/UPDATE/DELETE policies. The recordAuditEvent helper
--     uses the service-role client, so RLS never gates the write.
--     Append-only by convention; without an UPDATE/DELETE policy, any
--     leak of session credentials still can't tamper with history.
--
-- Retention:
--   - Stored indefinitely at the DB level. The app-side query layer
--     enforces tier-graduated retention windows (Starter 7d / Pro+ 30d
--     / Enterprise indefinite) at read time so we don't lose history
--     when a DSO downgrades. A future cleanup cron can purge per
--     contract once we have actual customers + a billing-status SLA.
-- ─────────────────────────────────────────────────────────────────────────

begin;

create table public.audit_events (
  id              uuid primary key default gen_random_uuid(),
  dso_id          uuid not null references public.dsos(id) on delete cascade,
  -- Actor context (snapshotted at event time so the row stays
  -- meaningful even after the user is deleted/renamed/role-changed).
  actor_user_id        uuid references auth.users(id) on delete set null,
  actor_dso_user_id    uuid references public.dso_users(id) on delete set null,
  actor_name           text,
  actor_role           text,
  -- Event details. event_kind uses dotted namespace strings to keep
  -- filtering granular (e.g. application.stage_moved,
  -- application.affiliation_revealed, team.member_invited,
  -- team.role_changed, settings.affiliation_policy_changed,
  -- location.affiliation_toggled, location.created, location.deleted,
  -- job.created, job.deleted, job.status_changed, mfa.enrolled,
  -- mfa.disabled, mfa.recovery_used).
  event_kind     text not null,
  target_table   text,
  target_id      uuid,
  summary        text not null,
  metadata       jsonb default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

-- Common access patterns: most-recent events for a DSO, scoped by
-- event-kind filter or by actor filter. Three indexes cover the
-- expected sort+filter combos without going overboard.
create index audit_events_dso_created_idx
  on public.audit_events (dso_id, created_at desc);
create index audit_events_kind_idx
  on public.audit_events (dso_id, event_kind, created_at desc);
create index audit_events_actor_idx
  on public.audit_events (dso_id, actor_dso_user_id, created_at desc);

alter table public.audit_events enable row level security;

create policy "Audit events: DSO members read own DSO"
  on public.audit_events for select
  to authenticated
  using (dso_id = public.current_dso_id());

-- No INSERT/UPDATE/DELETE policies — service role bypasses RLS for
-- the recording helper, and the absence of write policies prevents
-- session-level tampering with history.

grant select on public.audit_events to authenticated;

comment on table public.audit_events is
  'Append-only audit log of meaningful actions across the DSO surface. '
  'Inserted via service-role helper at the app layer; readable by any '
  'DSO member via RLS. Retention is enforced at read time by tier; '
  'no DB-side cleanup yet.';

comment on column public.audit_events.event_kind is
  'Dotted namespace event identifier — e.g. application.stage_moved, '
  'team.role_changed, settings.affiliation_policy_changed. Stable strings; '
  'rename = orphan all historical rows for that event filter.';

comment on column public.audit_events.summary is
  'Human-readable single-line summary of what happened. Source of truth '
  'for the audit table UI. Hand-shaped at the recording site.';

comment on column public.audit_events.metadata is
  'Per-event_kind structured payload — e.g. { from_status, to_status, '
  'application_id } for application.stage_moved. Schema is loose by '
  'design so new event kinds can ship without migrations.';

commit;
