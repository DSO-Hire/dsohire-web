-- Tier 2 Phase D — quality controls foundation (Day 21 2026-05-27).
-- See /Business Plan & Strategy/InApp_Support_Tier_2_Spec_2026-05-27.md.
--
-- Two additions:
--   1. support_chat_feedback — thumbs up/down + optional note per
--      assistant message. Drives the conversation flagging surface
--      and gives Cam direct user signal on where Claude underperforms.
--   2. Review fields on support_requests so the admin dashboard can
--      track which conversations Cam has spot-checked.

create type support_review_status as enum (
  'unreviewed',
  'reviewed',
  'flagged_bad'
);

alter table public.support_requests
  add column if not exists review_status support_review_status not null default 'unreviewed',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewer_notes text,
  add column if not exists auto_flag_reason text;

create index if not exists support_requests_review_status_idx
  on public.support_requests (review_status)
  where review_status in ('unreviewed', 'flagged_bad');

create table public.support_chat_feedback (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null references public.support_chat_messages(id) on delete cascade,
  request_id      uuid not null references public.support_requests(id) on delete cascade,
  auth_user_id    uuid not null references auth.users(id) on delete cascade,
  rating          text not null check (rating in ('up', 'down')),
  note            text,
  created_at      timestamptz not null default now()
);

create index support_chat_feedback_request_idx
  on public.support_chat_feedback (request_id);
create index support_chat_feedback_rating_idx
  on public.support_chat_feedback (rating, created_at desc);

alter table public.support_chat_feedback enable row level security;

create policy "support_chat_feedback: author inserts own"
  on public.support_chat_feedback for insert
  with check (auth_user_id = auth.uid());

create policy "support_chat_feedback: author reads own"
  on public.support_chat_feedback for select
  using (auth_user_id = auth.uid());

comment on table public.support_chat_feedback is
  'Tier 2 Phase D. Thumbs up/down + optional note per assistant message. Thumbs down auto-flags the parent conversation for review.';
