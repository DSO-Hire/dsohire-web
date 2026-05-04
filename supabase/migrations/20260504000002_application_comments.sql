-- ============================================================
-- DSO Hire — Phase 5A application comments + @-mentions
-- ============================================================
-- Internal team comments per application, with @-mention support.
-- Comment thread renders on /employer/applications/[id], plus a
-- comment-count indicator on the kanban card.
--
-- Conventions:
--   - Soft-delete via deleted_at; partial indexes ignore deleted rows.
--   - Author edits/deletes only allowed within 5 minutes (RLS-enforced).
--   - mentioned_user_ids are auth_user_ids (the auth.users PK), so the
--     server can dispatch Resend emails directly without an extra lookup.
--   - Realtime: applications kanban already subscribes; comments add a
--     dedicated channel scoped to application_id.
-- ============================================================

create table public.application_comments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  author_dso_user_id uuid not null references public.dso_users(id) on delete restrict,
  body text not null check (char_length(body) >= 1 and char_length(body) <= 4000),
  mentioned_user_ids uuid[] not null default '{}',  -- auth_user_ids of mentioned dso_users
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz  -- soft delete
);

create index application_comments_application_id_idx
  on public.application_comments (application_id, created_at desc)
  where deleted_at is null;

create index application_comments_mentions_idx
  on public.application_comments using gin (mentioned_user_ids)
  where deleted_at is null;

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────

alter table public.application_comments enable row level security;

create policy "DSO members can read comments on their applications"
  on public.application_comments for select
  using (
    exists (
      select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
      join public.dso_users du on du.dso_id = j.dso_id
      where a.id = application_comments.application_id
        and du.auth_user_id = auth.uid()
    )
  );

create policy "DSO members can insert their own comments"
  on public.application_comments for insert
  with check (
    author_user_id = auth.uid()
    and exists (
      select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
      join public.dso_users du on du.dso_id = j.dso_id
      where a.id = application_comments.application_id
        and du.auth_user_id = auth.uid()
        and du.id = application_comments.author_dso_user_id
    )
  );

create policy "Authors can update their own comments within 5 minutes"
  on public.application_comments for update
  using (author_user_id = auth.uid() and created_at > now() - interval '5 minutes')
  with check (author_user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- Realtime publication membership (idempotent)
-- ─────────────────────────────────────────────────────────────

do $$
begin
  alter publication supabase_realtime add table public.application_comments;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;

-- ─────────────────────────────────────────────────────────────
-- Trigger: bump updated_at + edited_at on body change
-- ─────────────────────────────────────────────────────────────

create or replace function public.bump_application_comments_updated_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if old.body is distinct from new.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists application_comments_bump_updated_at on public.application_comments;

create trigger application_comments_bump_updated_at
  before update on public.application_comments
  for each row execute function public.bump_application_comments_updated_at();

-- ─────────────────────────────────────────────────────────────
-- View: comment counts per application (for kanban card indicator)
-- ─────────────────────────────────────────────────────────────
-- Inherits RLS via security_invoker so a recruiter only sees counts on
-- applications they could read directly. Definer-side aggregation would
-- leak counts across DSOs; security_invoker keeps the same row scope as
-- the underlying application_comments table.

create or replace view public.application_comment_counts
with (security_invoker = true)
as
  select application_id, count(*)::int as comment_count
    from public.application_comments
   where deleted_at is null
   group by application_id;
