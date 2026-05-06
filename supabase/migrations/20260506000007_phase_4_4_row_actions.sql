-- ─────────────────────────────────────────────────────────────────────────
-- 20260506000007_phase_4_4_row_actions.sql
--
-- Phase 4.4 row actions (withdraw + self-update + hide).
-- Canonical scope: Competitive Research/Parity_Sprint_Scope_2026-05-06.md §4.4
--
-- Schema additions:
--   • applications.hidden_at         — when candidate hid the row from
--                                       their own list. Independent of
--                                       application status; the employer
--                                       still sees the application.
--   • applications.withdrawn_at      — when candidate clicked Withdraw.
--                                       Paired with the existing
--                                       application_status enum value
--                                       'withdrawn'.
--   • applications.self_reported_status — candidate's self-reported
--                                       status (Indeed pattern).
--                                       Independent of `status`, which
--                                       remains the employer's truth.
--                                       Lets the candidate flip to
--                                       Interviewing / Offer / Hired /
--                                       No longer interested without
--                                       waiting for employer to act.
--   • application_withdraw_reasons   — private-to-candidate table that
--                                       stores the optional reason
--                                       chips + textarea. Employer
--                                       never reads this table.
--
-- Doesn't extend the application_status enum (per scope §7.3, the
-- candidate-side flips live in `self_reported_status`, not enum
-- additions). Single transaction, no enum-add-value.
-- ─────────────────────────────────────────────────────────────────────────

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Columns on applications
-- ═════════════════════════════════════════════════════════════════════════

alter table public.applications
  add column if not exists hidden_at            timestamptz,
  add column if not exists withdrawn_at         timestamptz,
  add column if not exists self_reported_status text;

alter table public.applications
  drop constraint if exists applications_self_reported_status_check;
alter table public.applications
  add constraint applications_self_reported_status_check
  check (
    self_reported_status is null
    or self_reported_status in (
      'interviewing',
      'offer_received',
      'hired',
      'no_longer_interested'
    )
  );

-- Partial index for fast Hidden-tab queries (only candidates who've
-- hidden at least one application).
create index if not exists applications_hidden_at_idx
  on public.applications (candidate_id, hidden_at)
  where hidden_at is not null;

-- ═════════════════════════════════════════════════════════════════════════
-- 2. application_withdraw_reasons — private to candidate
-- ═════════════════════════════════════════════════════════════════════════

create table public.application_withdraw_reasons (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null unique
                    references public.applications(id) on delete cascade,
  reason_chips    text[] not null default '{}'::text[],
  reason_text     text,
  created_at      timestamptz not null default now()
);

alter table public.application_withdraw_reasons enable row level security;

-- Candidate full RW their own row. Joined through applications →
-- candidates → auth_user_id.
create policy "Candidates manage their own withdraw reasons"
  on public.application_withdraw_reasons for all
  to authenticated
  using (
    application_id in (
      select a.id
        from public.applications a
        join public.candidates c on c.id = a.candidate_id
       where c.auth_user_id = auth.uid()
    )
  )
  with check (
    application_id in (
      select a.id
        from public.applications a
        join public.candidates c on c.id = a.candidate_id
       where c.auth_user_id = auth.uid()
    )
  );

-- IMPORTANT: NO DSO read policy. Withdraw reasons are private to the
-- candidate by design (locked rule R11 / scope §7.2). The employer
-- only sees the status flip + an auto-system comment in the kanban —
-- never the candidate's reason.

grant select, insert, update, delete
  on public.application_withdraw_reasons to authenticated;

commit;
