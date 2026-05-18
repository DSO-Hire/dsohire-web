-- 20260518000001_user_preferred_timezone.sql
--
-- Phase 5A polish — preferred-timezone storage for candidates + dso_users.
--
-- WHY: Erica's 2026-05-18 testing pass surfaced UTC bleeding into interview
-- confirmation emails, slot-picker emails, inbox, and notifications. Root
-- cause: no column to store the user's preferred display TZ, so every
-- server-render path falls back to the Vercel Node runtime's TZ (UTC).
-- This migration adds the foundational column on both user-shaped tables
-- so render paths can look up "the viewer's preferred TZ" instead of
-- silently defaulting.
--
-- BEHAVIOR:
--   • `preferred_timezone` is a free-text IANA identifier (e.g.
--     "America/Chicago"). The application layer constrains writes to the
--     7 US options in `src/lib/timezones.ts:US_TIMEZONES` — keeping the
--     column free-text means we can broaden the picker later without a
--     schema change.
--   • Default is "America/Chicago" — US-centric per the locked customer
--     posture (memory: feedback_central_time_no_eod_framing,
--     feedback_no_practice_count_ceiling). New rows land sensibly.
--   • Existing rows are backfilled to the same default. No-op for users
--     whose actual TZ matches; users elsewhere will adjust in Settings.
--
-- CONSUMERS (single-commit follow-up): InterviewProposed, InterviewBooked,
-- InterviewReminder email templates; proposeInterview + bookInterview
-- server actions; interview-reminders cron; candidate + employer Settings
-- → Account pages; inbox interview RichCard renderer.
--
-- IDEMPOTENT: uses `if not exists` so re-runs are safe.

-- ─────────────────────────────────────────────────────────────────────
-- candidates.preferred_timezone
-- ─────────────────────────────────────────────────────────────────────

alter table public.candidates
  add column if not exists preferred_timezone text not null default 'America/Chicago';

comment on column public.candidates.preferred_timezone is
  'IANA timezone identifier (e.g. America/Chicago) used to render times in emails, inbox cards, and dashboards. App layer constrains to US_TIMEZONES list; column is free-text to allow broadening later.';

-- ─────────────────────────────────────────────────────────────────────
-- dso_users.preferred_timezone
-- ─────────────────────────────────────────────────────────────────────

alter table public.dso_users
  add column if not exists preferred_timezone text not null default 'America/Chicago';

comment on column public.dso_users.preferred_timezone is
  'IANA timezone identifier (e.g. America/Chicago) used to render times in emails, inbox cards, and dashboards. App layer constrains to US_TIMEZONES list; column is free-text to allow broadening later.';

-- RLS UNCHANGED. Both tables already allow users to update their own row
-- (candidates: WHERE auth_user_id = auth.uid(); dso_users: similar
-- pattern). Adding a column doesn't change which rows a user can touch
-- — only which fields they can write. The settings UI will write to
-- this column via the existing per-row UPDATE policies.
