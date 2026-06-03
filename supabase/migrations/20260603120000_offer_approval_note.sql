-- N12 Phase 2 — approver/sender note on the offer send row. Carries the
-- rejection reason (or an optional approval note) so the original sender
-- sees WHY a pending offer was rejected, directly on the application.
alter table public.application_offer_sends
  add column if not exists approval_note text;
