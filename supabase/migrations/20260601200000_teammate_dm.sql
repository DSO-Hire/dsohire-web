-- Teammate direct messaging (Day 24) — net-new schema powering the pop-up
-- chat widget's teammate-collaboration side. (Candidate messaging reuses the
-- existing application_messages inbox.)
--
-- Security model: reads are gated by is_dm_participant() (SECURITY DEFINER, so
-- it can read dm_participants without triggering RLS recursion). Conversation +
-- participant creation happens via the service-role client in a server action
-- with explicit same-DSO checks; message inserts go through the authenticated
-- client and the participant+sender RLS check below.

-- Current user's dso_users.id (companion to current_dso_id()).
create or replace function public.current_dso_user_id()
returns uuid language sql security definer stable set search_path = public as $$
  select id from public.dso_users where auth_user_id = auth.uid() limit 1
$$;

create table if not exists public.dm_conversations (
  id              uuid primary key default gen_random_uuid(),
  dso_id          uuid not null references public.dsos(id) on delete cascade,
  created_by      uuid references public.dso_users(id) on delete set null,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create index if not exists dm_conversations_dso_idx
  on public.dm_conversations (dso_id, last_message_at desc);

create table if not exists public.dm_participants (
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  dso_user_id     uuid not null references public.dso_users(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, dso_user_id)
);
create index if not exists dm_participants_user_idx
  on public.dm_participants (dso_user_id);

create table if not exists public.dm_messages (
  id                 uuid primary key default gen_random_uuid(),
  conversation_id    uuid not null references public.dm_conversations(id) on delete cascade,
  sender_dso_user_id uuid not null references public.dso_users(id) on delete cascade,
  body               text not null,
  created_at         timestamptz not null default now()
);
create index if not exists dm_messages_conv_idx
  on public.dm_messages (conversation_id, created_at);

-- Participant check — SECURITY DEFINER avoids RLS recursion on dm_participants.
create or replace function public.is_dm_participant(conv_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.dm_participants p
    where p.conversation_id = conv_id
      and p.dso_user_id = public.current_dso_user_id()
  )
$$;

alter table public.dm_conversations enable row level security;
alter table public.dm_participants  enable row level security;
alter table public.dm_messages       enable row level security;

create policy "dm_conv: participants read"
  on public.dm_conversations for select using (public.is_dm_participant(id));
create policy "dm_conv: update own-dso"
  on public.dm_conversations for update using (dso_id = public.current_dso_id());

create policy "dm_part: participants read"
  on public.dm_participants for select using (public.is_dm_participant(conversation_id));
create policy "dm_part: update self"
  on public.dm_participants for update using (dso_user_id = public.current_dso_user_id());

create policy "dm_msg: participants read"
  on public.dm_messages for select using (public.is_dm_participant(conversation_id));
create policy "dm_msg: participants send"
  on public.dm_messages for insert with check (
    public.is_dm_participant(conversation_id)
    and sender_dso_user_id = public.current_dso_user_id()
  );

-- Realtime for live DM delivery.
alter publication supabase_realtime add table public.dm_messages;

comment on table public.dm_conversations is
  'Day 24 — teammate direct-message conversations (per DSO). Powers the pop-up chat widget.';
