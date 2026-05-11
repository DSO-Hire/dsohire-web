-- ─────────────────────────────────────────────────────────────
-- Phase 5A — Interview scheduling (E3.16, Day 1)
-- ─────────────────────────────────────────────────────────────
--
-- Three tables make up the booking model:
--
--   interview_proposals          one row per proposal an employer
--                                sends to a candidate (1 - N times)
--   interview_proposal_options   the actual time slots offered, FK to
--                                proposal; one of them gets booked
--   interview_bookings           candidate's accepted slot
--                                (unique on proposal_id — one booking
--                                per proposal)
--
-- Status lifecycle on interview_proposals:
--   pending   → sent, no slot selected yet
--   booked    → candidate picked a slot
--   cancelled → either party cancelled before booking
--   expired   → all proposed times in the past with no booking
--
-- Day-2 / Day-3 additions (deferred): calendar event ids, conferencing
-- link metadata, reminder-sent timestamps.

create type interview_proposal_status as enum (
  'pending',
  'booked',
  'cancelled',
  'expired'
);

create type interview_kind as enum (
  'phone',
  'video',
  'in_person',
  'other'
);

create table public.interview_proposals (
  id                    uuid primary key default gen_random_uuid(),
  application_id        uuid not null references public.applications(id) on delete cascade,
  proposed_by           uuid references public.dso_users(id) on delete set null,
  status                interview_proposal_status not null default 'pending',
  interview_kind        interview_kind not null default 'video',
  location_text         text,         -- "Zoom link", "Practice address", phone number, etc.
  duration_minutes      int not null default 30,
  message_to_candidate  text,
  cancelled_at          timestamptz,
  cancellation_reason   text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index interview_proposals_application_idx
  on public.interview_proposals (application_id, created_at desc);

create trigger interview_proposals_set_updated_at
  before update on public.interview_proposals
  for each row execute function public.set_updated_at();

create table public.interview_proposal_options (
  id            uuid primary key default gen_random_uuid(),
  proposal_id   uuid not null references public.interview_proposals(id) on delete cascade,
  start_at      timestamptz not null,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create index interview_proposal_options_proposal_idx
  on public.interview_proposal_options (proposal_id, sort_order);

create table public.interview_bookings (
  id                       uuid primary key default gen_random_uuid(),
  proposal_id              uuid not null references public.interview_proposals(id) on delete cascade,
  selected_option_id       uuid not null references public.interview_proposal_options(id) on delete cascade,
  candidate_confirmed_at   timestamptz not null default now(),
  candidate_notes          text,
  unique (proposal_id)
);

create index interview_bookings_option_idx
  on public.interview_bookings (selected_option_id);

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────
--
-- Two principals matter:
--   • DSO members of the application's job's DSO — full read+write on
--     proposals and options. They CREATE proposals; the candidate
--     books one option.
--   • The candidate (auth.uid matches candidates.auth_user_id of the
--     application) — read proposals + options on their own apps,
--     INSERT into bookings.
--
-- Use SECURITY DEFINER helper to bypass any recursion through
-- applications RLS (per the candidates RLS recursion lesson on
-- 2026-05-06).

alter table public.interview_proposals enable row level security;
alter table public.interview_proposal_options enable row level security;
alter table public.interview_bookings enable row level security;

create or replace function public.user_can_access_application_interview(
  p_application_id uuid
)
returns boolean
language sql
security definer
stable
as $$
  -- DSO side: caller is a member of the application's job's DSO.
  select exists (
    select 1
    from public.applications a
    join public.jobs j on j.id = a.job_id
    join public.dso_users du on du.dso_id = j.dso_id
    where a.id = p_application_id
      and du.auth_user_id = auth.uid()
  )
  -- OR candidate side: caller is the candidate on this application.
  or exists (
    select 1
    from public.applications a
    join public.candidates c on c.id = a.candidate_id
    where a.id = p_application_id
      and c.auth_user_id = auth.uid()
  );
$$;

-- Proposals
create policy "Interview proposals: app-scoped read"
  on public.interview_proposals for select
  using (public.user_can_access_application_interview(application_id));

create policy "Interview proposals: recruiter write"
  on public.interview_proposals for all
  using (
    exists (
      select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
      where a.id = application_id
        and j.dso_id = public.current_dso_id()
        and public.current_dso_user_role() in ('owner', 'admin', 'recruiter', 'hiring_manager')
    )
  )
  with check (
    exists (
      select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
      where a.id = application_id
        and j.dso_id = public.current_dso_id()
        and public.current_dso_user_role() in ('owner', 'admin', 'recruiter', 'hiring_manager')
    )
  );

-- Options
create policy "Interview options: app-scoped read"
  on public.interview_proposal_options for select
  using (
    exists (
      select 1 from public.interview_proposals p
      where p.id = proposal_id
        and public.user_can_access_application_interview(p.application_id)
    )
  );

create policy "Interview options: recruiter write"
  on public.interview_proposal_options for all
  using (
    exists (
      select 1
      from public.interview_proposals p
      join public.applications a on a.id = p.application_id
      join public.jobs j on j.id = a.job_id
      where p.id = proposal_id
        and j.dso_id = public.current_dso_id()
        and public.current_dso_user_role() in ('owner', 'admin', 'recruiter', 'hiring_manager')
    )
  )
  with check (
    exists (
      select 1
      from public.interview_proposals p
      join public.applications a on a.id = p.application_id
      join public.jobs j on j.id = a.job_id
      where p.id = proposal_id
        and j.dso_id = public.current_dso_id()
        and public.current_dso_user_role() in ('owner', 'admin', 'recruiter', 'hiring_manager')
    )
  );

-- Bookings
create policy "Interview bookings: app-scoped read"
  on public.interview_bookings for select
  using (
    exists (
      select 1 from public.interview_proposals p
      where p.id = proposal_id
        and public.user_can_access_application_interview(p.application_id)
    )
  );

-- Candidate can insert their booking. DSO members can also insert
-- on behalf (e.g., a recruiter who confirms a phone-call slot for the
-- candidate during a screening call).
create policy "Interview bookings: candidate or recruiter insert"
  on public.interview_bookings for insert
  with check (
    exists (
      select 1
      from public.interview_proposals p
      where p.id = proposal_id
        and public.user_can_access_application_interview(p.application_id)
    )
  );

-- Candidate or DSO can delete a booking (= "I need to reschedule").
create policy "Interview bookings: app-scoped delete"
  on public.interview_bookings for delete
  using (
    exists (
      select 1 from public.interview_proposals p
      where p.id = proposal_id
        and public.user_can_access_application_interview(p.application_id)
    )
  );

comment on table public.interview_proposals is
  'E3.16 (Phase 5A, Day 1 shipped 2026-05-11). Employer-proposed interview slots awaiting candidate selection. One-of-N pick model — candidate books one option to confirm.';

comment on table public.interview_proposal_options is
  'Time options attached to an interview_proposals row. start_at only; duration lives on the parent (proposals.duration_minutes).';

comment on table public.interview_bookings is
  'Confirmed interview — one per proposal (unique constraint). Delete to reschedule (parent proposal flips back to pending via app-side flow).';