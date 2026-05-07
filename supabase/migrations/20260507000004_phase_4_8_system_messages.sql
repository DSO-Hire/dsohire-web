-- ─────────────────────────────────────────────────────────────────────────
-- 20260507000004_phase_4_8_system_messages.sql
--
-- Phase 4.8 follow-up — automated system messages in the inbox.
--
-- Cam's idea: turn the inbox into an email supplement, not just a chat
-- log. Every interaction email also drops a system message in the
-- thread so the inbox is the durable record. Stage moves, apply
-- receipts, withdraws, etc.
--
-- Schema model:
--   • Keep `sender_role` enum at ('candidate','employer'). For system
--     events we encode the AUDIENCE-SPEAKING-FOR — a stage-move
--     message uses sender_role='employer' because the DSO is informing
--     the candidate. The candidate's unread-count query (which counts
--     messages where sender_role = the OTHER side) automatically picks
--     these up without changes.
--   • Make sender_user_id nullable. System events have no human sender;
--     the dispatcher uses the service-role client to insert.
--   • Add `event_kind text`. Non-NULL marks a system message. NULL =
--     human-typed message. Renderer picks visual treatment from this.
--
-- Backwards-compatible: every existing row has sender_user_id NOT NULL
-- and event_kind NULL — they satisfy the new CHECK trivially.
--
-- RLS:
--   • Existing READ policy keeps working (it checks application
--     participation, not sender). Both sides can read system events
--     just like they can read each other's messages.
--   • Existing INSERT policy still requires sender_user_id = auth.uid()
--     so HUMAN inserts can't be system-spoofed. System inserts go
--     through the service-role client which bypasses RLS.
--   • Existing UPDATE policy (5-minute edit window) still requires
--     sender_user_id = auth.uid() — system messages can't be edited
--     by anyone (sender_user_id is NULL, never matches auth.uid()).
-- ─────────────────────────────────────────────────────────────────────────

begin;

-- 1. Make sender_user_id nullable.
alter table public.application_messages
  alter column sender_user_id drop not null;

-- 2. Add event_kind for system messages.
alter table public.application_messages
  add column if not exists event_kind text;

-- 3. Consistency CHECK — exactly one of (event_kind, sender_user_id)
--    is NULL. event_kind NOT NULL ⇒ system; event_kind NULL ⇒ human.
alter table public.application_messages
  drop constraint if exists application_messages_system_consistency;

alter table public.application_messages
  add constraint application_messages_system_consistency check (
    (event_kind is not null and sender_user_id is null)
    or (event_kind is null and sender_user_id is not null)
  );

-- 4. Useful index for system-event analytics + future filtering.
create index if not exists application_messages_event_kind_idx
  on public.application_messages (event_kind)
  where event_kind is not null and deleted_at is null;

commit;

-- ─────────────────────────────────────────────────────────────────────
-- After applying:
--   • dispatchInboxSystemMessage helper (src/lib/inbox/dispatch-system.ts)
--     uses service-role client to insert with event_kind set + sender_user_id NULL.
--   • Existing query helpers (queries.ts) need no change — system rows
--     just look like regular messages with an extra event_kind field.
--   • Renderer (MessagesThread + inbox-view preview) checks event_kind
--     and uses a centered-banner treatment instead of an avatar bubble.
-- ─────────────────────────────────────────────────────────────────────
