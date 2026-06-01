-- Group chat for the teammate DM widget (2026-06-01).
-- dm_participants is already an N-party join table (PK is conversation_id +
-- dso_user_id, no two-party limit), so groups need only two columns on the
-- conversation: an optional human title and an explicit is_group flag. The
-- flag is authoritative (a 1:1 that loses a participant shouldn't read as a
-- group, and a 3-person group that drops to 2 shouldn't flip to a DM).
--
-- Group membership stays INTERNAL — teammates only. Candidate conversations
-- remain the application_messages thread (practice speaks as one voice); the
-- group-create action enforces same-DSO teammate ids only.

alter table public.dm_conversations
  add column if not exists title text,
  add column if not exists is_group boolean not null default false;

comment on column public.dm_conversations.title is
  'Optional group name. Null for 1:1 DMs (title derived from the other participant).';
comment on column public.dm_conversations.is_group is
  'True for multi-teammate group chats. Authoritative — not derived from participant count.';
