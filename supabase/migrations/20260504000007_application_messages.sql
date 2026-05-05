-- ============================================================
-- DSO Hire — Phase 5A direct candidate ↔ DSO messaging
-- ============================================================
-- Direct two-way messaging between candidates and DSO members on an
-- application. Distinct from `application_comments` (internal-team-only)
-- and from `application_status_events` (audit trail).
--
-- Conventions:
--   - Soft-delete via deleted_at; partial indexes ignore deleted rows.
--   - Sender edits/deletes only allowed within 5 minutes (RLS-enforced).
--   - sender_role denormalized at insert so client renders skip a join.
--   - read_at marking is recipient-driven and routed through a server
--     action with the service-role client (no permissive UPDATE policy
--     for non-senders).
-- ============================================================

create table public.application_messages (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  -- Derived at insert time based on which side the sender is on. Exists as a
  -- denormalized column so client renders don't need a join just to know who
  -- sent the message. The trigger below keeps it in sync.
  sender_role text not null check (sender_role in ('candidate','employer')),
  -- For employer-side messages, the dso_users.id of the sender. NULL for
  -- candidate-side messages.
  sender_dso_user_id uuid references public.dso_users(id) on delete restrict,
  body text not null check (char_length(body) >= 1 and char_length(body) <= 5000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create index application_messages_application_id_idx
  on public.application_messages (application_id, created_at desc)
  where deleted_at is null;

create index application_messages_sender_user_id_idx
  on public.application_messages (sender_user_id);

alter table public.application_messages enable row level security;

-- READ: candidate (matching the application's candidate via auth_user_id) OR
-- any DSO member of the job's DSO.
create policy "Application participants read messages"
  on public.application_messages for select using (
    exists (
      select 1
      from public.applications a
      join public.candidates c on c.id = a.candidate_id
      where a.id = application_messages.application_id
        and c.auth_user_id = auth.uid()
    )
    or
    exists (
      select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
      join public.dso_users du on du.dso_id = j.dso_id
      where a.id = application_messages.application_id
        and du.auth_user_id = auth.uid()
    )
  );

-- INSERT: sender must be auth.uid() AND must be a participant. The trigger
-- below validates sender_role + sender_dso_user_id consistency.
create policy "Application participants insert their own messages"
  on public.application_messages for insert with check (
    sender_user_id = auth.uid()
    and (
      exists (
        select 1
        from public.applications a
        join public.candidates c on c.id = a.candidate_id
        where a.id = application_messages.application_id
          and c.auth_user_id = auth.uid()
      )
      or
      exists (
        select 1
        from public.applications a
        join public.jobs j on j.id = a.job_id
        join public.dso_users du on du.dso_id = j.dso_id
        where a.id = application_messages.application_id
          and du.auth_user_id = auth.uid()
      )
    )
  );

-- UPDATE: sender within 5 minutes of creation. Used for edit + soft-delete.
-- read_at marking by the OTHER side is routed through a server action with
-- service-role; do not add a permissive UPDATE policy for non-senders.
create policy "Senders update their own messages within 5 minutes"
  on public.application_messages for update using (
    sender_user_id = auth.uid()
    and created_at > now() - interval '5 minutes'
  ) with check (sender_user_id = auth.uid());

do $$
begin
  alter publication supabase_realtime add table public.application_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

create or replace function public.bump_application_messages_updated_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if old.body is distinct from new.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists application_messages_bump_updated_at on public.application_messages;

create trigger application_messages_bump_updated_at
  before update on public.application_messages
  for each row execute function public.bump_application_messages_updated_at();

-- Unread-count view for the dashboard / candidate inbox surfaces.
create or replace view public.application_message_unread_counts
with (security_invoker = true)
as
  select
    application_id,
    sender_role,
    count(*)::int as unread_count
  from public.application_messages
  where deleted_at is null and read_at is null
  group by application_id, sender_role;
