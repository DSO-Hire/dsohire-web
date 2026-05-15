-- ─────────────────────────────────────────────────────────────────────────
-- 20260515000002 — Inbox rich-messaging foundation
--
-- Lays the schema groundwork for the full inbox rework. Today's migration
-- is FOUNDATION ONLY — backend dispatch helpers, attachment upload flow,
-- RichCard renderers, and the two sharpened-asks (clickable application
-- link from the inbox thread + the notification counters) are code-side
-- work that follow in subsequent sessions.
--
-- What exists today:
--   • application_messages (Phase 5A)            — bidirectional body-text messaging
--   • application_messages.event_kind            — Phase 4.8 system events
--   • inbox_archived_threads (Phase 4.8)         — per-user archive flags
--   • application_message_unread_counts (view)   — per-application unread tallies
--
-- What this migration adds:
--   1. `kind text` discriminator on application_messages — ('text' | 'system' | 'rich_card').
--      Lets RichCards (inline offer previews, interview proposals, reference
--      results, document shares) live in the same thread as plain text and
--      system events, with a renderer that picks visual treatment by kind.
--   2. `payload jsonb` for structured RichCard data — offer_id, status_link,
--      interview_proposal_id, document refs, etc. The renderer reads this
--      to draw the card body; `body` keeps a text-fallback summary so email
--      digests and a11y readers degrade gracefully.
--   3. Three-way consistency CHECK replacing the old system/text two-way
--      version — keeps the model honest about which fields each kind requires.
--   4. application_message_attachments table — 0..N files per message,
--      with size cap, mime tracked, and uploader audit. RLS mirrors the
--      parent message (participants only).
--   5. application-message-attachments storage bucket (private) +
--      participant-scoped RLS on storage.objects via path-derived
--      application_id (path convention: <application_id>/<message_id>/<file>).
--
-- What is NOT added (deferred to a later session, by design):
--   • Per-member read receipts (multi-recipient). Current single `read_at`
--     stays as the side-level read mark; that's sufficient for v1 unread
--     counters. A separate application_message_reads table is the right
--     shape when we want "did Jordan specifically see this" granularity.
--   • In-thread Accept/Decline action server endpoints for offer RichCards.
--     /o/[token] still handles the audit-grade response capture; the
--     inbox card will surface that flow in-place once the dispatcher and
--     renderer ship.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Add `kind` discriminator + `payload` jsonb on application_messages.
alter table public.application_messages
  add column kind text not null default 'text'
    check (kind in ('text', 'system', 'rich_card'));

alter table public.application_messages
  add column payload jsonb;

-- 2. Backfill existing system rows. event_kind non-null today ⇒ kind='system'.
--    Everything else stays at the column default 'text'.
update public.application_messages
   set kind = 'system'
 where event_kind is not null;

-- 3. Replace the prior two-way consistency CHECK with a three-way one.
alter table public.application_messages
  drop constraint if exists application_messages_system_consistency;

alter table public.application_messages
  add constraint application_messages_kind_consistency check (
    (kind = 'text'      and sender_user_id is not null and event_kind is null) or
    (kind = 'system'    and sender_user_id is null     and event_kind is not null) or
    (kind = 'rich_card' and sender_user_id is not null and payload is not null)
  );

-- 4. Per-application kind filter index.
create index if not exists application_messages_kind_idx
  on public.application_messages (application_id, kind)
  where deleted_at is null;

-- 5. Attachments table.
create table public.application_message_attachments (
  id                  uuid primary key default gen_random_uuid(),
  message_id          uuid not null references public.application_messages(id) on delete cascade,
  storage_path        text not null,
  file_name           text not null check (char_length(file_name) between 1 and 255),
  mime_type           text not null check (char_length(mime_type) between 1 and 100),
  size_bytes          bigint not null check (size_bytes > 0 and size_bytes <= 26214400), -- 25 MB
  uploaded_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at          timestamptz not null default now()
);

create index application_message_attachments_message_id_idx
  on public.application_message_attachments (message_id, created_at);

alter table public.application_message_attachments enable row level security;

-- READ: application participants only — mirrors parent application_messages RLS.
create policy "Application participants read attachments"
  on public.application_message_attachments for select using (
    exists (
      select 1
        from public.application_messages m
        join public.applications a on a.id = m.application_id
        left join public.candidates c on c.id = a.candidate_id
        left join public.jobs j on j.id = a.job_id
        left join public.dso_users du on du.dso_id = j.dso_id
       where m.id = application_message_attachments.message_id
         and (c.auth_user_id = auth.uid() or du.auth_user_id = auth.uid())
    )
  );

-- INSERT: uploader must be auth.uid() AND a participant.
create policy "Application participants insert attachments"
  on public.application_message_attachments for insert with check (
    uploaded_by_user_id = auth.uid()
    and exists (
      select 1
        from public.application_messages m
        join public.applications a on a.id = m.application_id
        left join public.candidates c on c.id = a.candidate_id
        left join public.jobs j on j.id = a.job_id
        left join public.dso_users du on du.dso_id = j.dso_id
       where m.id = application_message_attachments.message_id
         and (c.auth_user_id = auth.uid() or du.auth_user_id = auth.uid())
    )
  );

-- 6. Storage bucket for the attachment binaries — private, signed URLs only.
insert into storage.buckets (id, name, public)
values ('application-message-attachments', 'application-message-attachments', false)
on conflict (id) do nothing;

-- Storage RLS — participants of the application can read/write objects
-- whose path begins with their application_id.
-- Path convention: <application_id>/<message_id>/<timestamp-filename>
create policy "Participants read their thread attachment objects"
  on storage.objects for select to authenticated using (
    bucket_id = 'application-message-attachments'
    and exists (
      select 1
        from public.applications a
        left join public.candidates c on c.id = a.candidate_id
        left join public.jobs j on j.id = a.job_id
        left join public.dso_users du on du.dso_id = j.dso_id
       where a.id::text = split_part(name, '/', 1)
         and (c.auth_user_id = auth.uid() or du.auth_user_id = auth.uid())
    )
  );

create policy "Participants upload thread attachment objects"
  on storage.objects for insert to authenticated with check (
    bucket_id = 'application-message-attachments'
    and exists (
      select 1
        from public.applications a
        left join public.candidates c on c.id = a.candidate_id
        left join public.jobs j on j.id = a.job_id
        left join public.dso_users du on du.dso_id = j.dso_id
       where a.id::text = split_part(name, '/', 1)
         and (c.auth_user_id = auth.uid() or du.auth_user_id = auth.uid())
    )
  );
