-- ─────────────────────────────────────────────────────────────
-- Talent Pool — outbound outreach log (E7.10, Phase 5D Day 2)
-- ─────────────────────────────────────────────────────────────
--
-- Persists every outbound message from a DSO to a candidate's inbox
-- triggered through the talent-pool surface. Distinct from the
-- application-thread messaging (which is per-application) — this
-- captures sourcing-pre-application outreach. The DSO sees a history
-- of past outreach on the candidate detail page so they don't pester
-- the same candidate twice.
--
-- Send mechanics: server action invokes the existing sendEmail()
-- helper. From = no-reply@dsohire.com; reply-to = the sending
-- recruiter's email so the candidate replies land in the recruiter's
-- inbox directly. We don't surface the candidate's email to the
-- sender — the platform owns the relay.

create table public.dso_outreach_messages (
  id              uuid primary key default gen_random_uuid(),
  dso_id          uuid not null references public.dsos(id) on delete cascade,
  candidate_id    uuid not null references public.candidates(id) on delete cascade,
  sent_by         uuid references public.dso_users(id) on delete set null,
  subject         text not null,
  body            text not null,
  sent_at         timestamptz not null default now(),
  resend_message_id text,
  opened_at       timestamptz,
  replied_at      timestamptz
);

create index dso_outreach_messages_candidate_idx
  on public.dso_outreach_messages (candidate_id, sent_at desc);

create index dso_outreach_messages_dso_idx
  on public.dso_outreach_messages (dso_id, sent_at desc);

alter table public.dso_outreach_messages enable row level security;

-- DSO members read their own DSO's outreach history. Lets the team
-- page see who's been reaching out + the candidate detail page show
-- prior outreach.
create policy "Outreach: members read own DSO"
  on public.dso_outreach_messages for select
  using (dso_id = public.current_dso_id());

-- Recruiter+ insert. RLS will reject inserts where dso_id doesn't
-- match the caller's DSO.
create policy "Outreach: recruiter insert"
  on public.dso_outreach_messages for insert
  with check (
    dso_id = public.current_dso_id()
    and public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
  );

-- Updates only for system-managed columns (opened_at, replied_at)
-- via service role. No tenant-side update path; the messages are
-- append-only.

comment on table public.dso_outreach_messages is
  'E7.10 (Phase 5D Day 2, shipped 2026-05-11). Outbound sourcing messages from DSO recruiters to talent-pool candidates. Append-only. Distinct from application_messages which is per-application.';