-- ─────────────────────────────────────────────────────────────────
-- 20260623000400_prospect_threads.sql  (Sourcing CRM — Phase 2)
--
-- The double-blind, on-platform reply channel (Option C). A DSO can message a
-- prospect; the candidate reads + replies IN-APP. The candidate's email is
-- NEVER exposed to the DSO; the masked identity de-masks to the DSO only when
-- the candidate applies OR explicitly reveals (candidate_revealed).
--
-- RLS mirrors application_messages: participant-only. Candidate participates via
-- candidates.auth_user_id = auth.uid(); DSO participates via dso_id =
-- current_dso_id(). System rows (nudges) are written by the service-role client
-- (bypasses RLS). No recursion: policies only reference candidates/threads, not
-- each other (avoids the prior 42P17 cycle class).
-- ─────────────────────────────────────────────────────────────────

begin;

create table if not exists public.prospect_threads (
  id                 uuid primary key default gen_random_uuid(),
  dso_id             uuid not null references public.dsos(id) on delete cascade,
  candidate_id       uuid not null references public.candidates(id) on delete cascade,
  created_by         uuid references public.dso_users(id) on delete set null,
  status             text not null default 'active'
                       check (status in ('active','muted','blocked','converted')),
  -- Candidate has chosen to share identity with this DSO (de-masks like an apply).
  candidate_revealed boolean not null default false,
  -- Set on conversion so the prospect history survives into the application.
  application_id     uuid references public.applications(id) on delete set null,
  last_message_at    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (dso_id, candidate_id)
);

create index if not exists prospect_threads_dso_idx
  on public.prospect_threads (dso_id, last_message_at desc nulls last);
create index if not exists prospect_threads_candidate_idx
  on public.prospect_threads (candidate_id, last_message_at desc nulls last);

create table if not exists public.prospect_messages (
  id                 uuid primary key default gen_random_uuid(),
  thread_id          uuid not null references public.prospect_threads(id) on delete cascade,
  sender_role        text not null check (sender_role in ('dso','candidate','system')),
  sender_user_id     uuid references auth.users(id) on delete set null,
  sender_dso_user_id uuid references public.dso_users(id) on delete set null,
  body               text not null check (char_length(body) between 1 and 8000),
  read_at            timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists prospect_messages_thread_idx
  on public.prospect_messages (thread_id, created_at);

alter table public.prospect_threads enable row level security;
alter table public.prospect_messages enable row level security;

-- ── prospect_threads policies ──────────────────────────────────────
-- Read: either participant.
create policy "prospect_threads: participant read"
  on public.prospect_threads
  for select to authenticated
  using (
    dso_id = public.current_dso_id()
    or candidate_id in (
      select c.id from public.candidates c where c.auth_user_id = auth.uid()
    )
  );

-- Insert: DSO members (owner/admin/recruiter) create threads for their DSO.
create policy "prospect_threads: dso insert"
  on public.prospect_threads
  for insert to authenticated
  with check (
    dso_id = public.current_dso_id()
    and public.current_dso_user_role() = any (
      array['owner','admin','recruiter']::dso_user_role[]
    )
  );

-- Update by the DSO (e.g. mark converted).
create policy "prospect_threads: dso update"
  on public.prospect_threads
  for update to authenticated
  using (dso_id = public.current_dso_id())
  with check (dso_id = public.current_dso_id());

-- Update by the candidate (mute / block / reveal on their own thread).
create policy "prospect_threads: candidate update"
  on public.prospect_threads
  for update to authenticated
  using (
    candidate_id in (
      select c.id from public.candidates c where c.auth_user_id = auth.uid()
    )
  )
  with check (
    candidate_id in (
      select c.id from public.candidates c where c.auth_user_id = auth.uid()
    )
  );

-- ── prospect_messages policies ─────────────────────────────────────
-- Read: participant of the parent thread.
create policy "prospect_messages: participant read"
  on public.prospect_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.prospect_threads t
      where t.id = prospect_messages.thread_id
        and (
          t.dso_id = public.current_dso_id()
          or t.candidate_id in (
            select c.id from public.candidates c where c.auth_user_id = auth.uid()
          )
        )
    )
  );

-- Insert by the DSO into its own thread.
create policy "prospect_messages: dso insert"
  on public.prospect_messages
  for insert to authenticated
  with check (
    sender_role = 'dso'
    and sender_user_id = auth.uid()
    and exists (
      select 1 from public.prospect_threads t
      where t.id = prospect_messages.thread_id
        and t.dso_id = public.current_dso_id()
    )
  );

-- Insert by the candidate into their own thread.
create policy "prospect_messages: candidate insert"
  on public.prospect_messages
  for insert to authenticated
  with check (
    sender_role = 'candidate'
    and sender_user_id = auth.uid()
    and exists (
      select 1 from public.prospect_threads t
      where t.id = prospect_messages.thread_id
        and t.candidate_id in (
          select c.id from public.candidates c where c.auth_user_id = auth.uid()
        )
    )
  );

commit;
