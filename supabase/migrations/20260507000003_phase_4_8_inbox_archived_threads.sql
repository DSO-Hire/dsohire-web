-- ─────────────────────────────────────────────────────────────────────────
-- 20260507000003_phase_4_8_inbox_archived_threads.sql
--
-- Phase 4.8 — Inbox v0 archive flag.
--
-- "Archived" in inbox-speak = this thread no longer shows in the
-- default list. Per-user-per-application, NOT per-application — an
-- employer team member archiving a thread doesn't hide it from their
-- teammates, and a candidate archiving a thread doesn't hide it from
-- the DSO.
--
-- Schema kept dumb on purpose:
--   • One row per (auth_user_id, application_id) means archived
--   • Absent row means active
--   • Unarchive = DELETE the row
--   • Cap is per-user soft (no hard cap; users can archive freely)
--
-- RLS: each user manages their own rows. We don't need a read policy
-- for "the other side" — archiving is a private list, never surfaced
-- across the candidate↔DSO boundary.
-- ─────────────────────────────────────────────────────────────────────────

begin;

create table public.inbox_archived_threads (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid not null,
  application_id  uuid not null references public.applications(id) on delete cascade,
  archived_at     timestamptz not null default now(),
  unique (auth_user_id, application_id)
);

create index inbox_archived_threads_user_idx
  on public.inbox_archived_threads (auth_user_id, archived_at desc);

create index inbox_archived_threads_application_idx
  on public.inbox_archived_threads (application_id);

alter table public.inbox_archived_threads enable row level security;

create policy "Users manage own archive flags"
  on public.inbox_archived_threads for all
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

grant select, insert, delete on public.inbox_archived_threads to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────
-- After applying:
--   • No types regen needed — server.ts dropped the <Database> generic.
--   • Inbox UI server-fetches archive flags + filters out archived
--     threads from the default list. Archived tab shows ONLY archived.
-- ─────────────────────────────────────────────────────────────────────
