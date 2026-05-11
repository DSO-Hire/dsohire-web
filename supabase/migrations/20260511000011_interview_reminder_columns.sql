-- ─────────────────────────────────────────────────────────────
-- Interview reminders — track 24h + 1h reminder sends
-- ─────────────────────────────────────────────────────────────
--
-- Adds two timestamp columns on interview_bookings so the every-30-min
-- reminder cron can dedupe — once we've sent the 24h reminder for a
-- booking, we never send it again, even if the cron re-runs over the
-- same window.

alter table public.interview_bookings
  add column reminder_24h_sent_at timestamptz,
  add column reminder_1h_sent_at  timestamptz;

create index interview_bookings_pending_reminders_idx
  on public.interview_bookings (id)
  where reminder_24h_sent_at is null or reminder_1h_sent_at is null;

comment on column public.interview_bookings.reminder_24h_sent_at is
  'Phase 5A Day 3 (shipped 2026-05-11). Timestamp the 24-hour reminder was sent. Null = not yet sent.';

comment on column public.interview_bookings.reminder_1h_sent_at is
  'Phase 5A Day 3 (shipped 2026-05-11). Timestamp the 1-hour reminder was sent. Null = not yet sent.';
