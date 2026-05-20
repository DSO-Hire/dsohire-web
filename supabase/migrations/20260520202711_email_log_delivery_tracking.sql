-- ============================================================
-- E8.12 — Resend delivery-event tracking on email_log
--
-- email_log already records the send attempt (status sent/failed/skipped +
-- resend_message_id). This migration adds the columns the Resend webhook
-- (/api/resend/webhook) advances as delivery events arrive: delivered,
-- bounced, complained, opened, clicked. The existing `status` text column is
-- reused (no CHECK constraint), so it can also hold 'delivered' / 'bounced' /
-- 'complained' once those events land.
--
-- An index on resend_message_id makes the webhook's per-event lookup fast.
-- ============================================================

alter table public.email_log
  add column if not exists delivered_at  timestamptz,
  add column if not exists bounced_at    timestamptz,
  add column if not exists complained_at timestamptz,
  add column if not exists opened_at     timestamptz,
  add column if not exists clicked_at    timestamptz,
  add column if not exists bounce_kind   text,         -- Resend bounce.type (hard/soft/…)
  add column if not exists last_event    text,         -- most recent Resend event type
  add column if not exists last_event_at timestamptz;  -- when that event arrived

create index if not exists email_log_resend_message_id_idx
  on public.email_log (resend_message_id);

-- ============================================================
-- End E8.12 delivery-tracking migration.
-- ============================================================
