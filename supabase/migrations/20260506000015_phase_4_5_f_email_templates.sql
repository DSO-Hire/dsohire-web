-- ─────────────────────────────────────────────────────────────────────────
-- Phase 4.5.f — Email template editor
--
-- Scope locked 2026-05-06 evening:
--   • DSO-customizable templates: candidate-facing only (apply confirmation
--     + message received + stage-changed). Stage-changed dispatch wiring
--     lands later — we ship the editor now so the table + RLS exist.
--   • One row per (dso_id, kind). Subject + body_html both editable.
--     Mergefield syntax: {{candidate.first_name}}, {{job.title}}, etc.
--     Validation lives in the app layer (renderer enforces the allowlist).
--   • Tier gating: Growth + Enterprise. Lookup short-circuits for Starter
--     so the dispatcher just uses the system default.
--
-- Idempotent — re-running is harmless.
-- ─────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- 1. email_template_kind enum
-- ─────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_type where typname = 'email_template_kind') then
    create type email_template_kind as enum (
      'candidate.application_received',
      'application.message_received',
      'candidate.stage_changed'
    );
  end if;
end$$;

-- ─────────────────────────────────────────────────────────────
-- 2. email_templates table
-- ─────────────────────────────────────────────────────────────

create table if not exists public.email_templates (
  id           uuid primary key default gen_random_uuid(),
  dso_id       uuid not null references public.dsos(id) on delete cascade,
  kind         email_template_kind not null,
  subject      text not null,
  body_html    text not null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (dso_id, kind)
);

create index if not exists email_templates_dso_idx
  on public.email_templates (dso_id);

-- Length sanity caps. Subjects under 200 chars (deliverability-friendly);
-- body_html under 50K (rich content but not bloat).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'email_templates_subject_len_chk'
  ) then
    alter table public.email_templates
      add constraint email_templates_subject_len_chk
      check (char_length(subject) between 1 and 200);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'email_templates_body_len_chk'
  ) then
    alter table public.email_templates
      add constraint email_templates_body_len_chk
      check (char_length(body_html) between 1 and 50000);
  end if;
end$$;

-- updated_at trigger — mirrors the pattern used on dsos / dso_users / etc.
drop trigger if exists email_templates_set_updated_at on public.email_templates;
create trigger email_templates_set_updated_at
  before update on public.email_templates
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 3. RLS — members read; admins write
-- ─────────────────────────────────────────────────────────────

alter table public.email_templates enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'email_templates'
      and policyname = 'Email templates: members read own'
  ) then
    create policy "Email templates: members read own"
      on public.email_templates for select
      using (dso_id = public.current_dso_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'email_templates'
      and policyname = 'Email templates: admin insert'
  ) then
    create policy "Email templates: admin insert"
      on public.email_templates for insert
      with check (public.is_dso_admin(dso_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'email_templates'
      and policyname = 'Email templates: admin update'
  ) then
    create policy "Email templates: admin update"
      on public.email_templates for update
      using (public.is_dso_admin(dso_id))
      with check (public.is_dso_admin(dso_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'email_templates'
      and policyname = 'Email templates: admin delete'
  ) then
    create policy "Email templates: admin delete"
      on public.email_templates for delete
      using (public.is_dso_admin(dso_id));
  end if;
end$$;

-- ─────────────────────────────────────────────────────────────
-- 4. Comments
-- ─────────────────────────────────────────────────────────────

comment on table  public.email_templates is
  'Phase 4.5.f. Per-DSO custom email templates. One row per (dso_id, kind). Renderer in src/lib/email/templates/renderer.ts substitutes {{var.path}} tokens. Tier-gated: Growth + Enterprise only — Starter lookups return null so the dispatcher falls back to system defaults.';
comment on column public.email_templates.subject is
  'Subject line — supports the same mergefield syntax as body_html. ≤ 200 chars.';
comment on column public.email_templates.body_html is
  'Body sanitized HTML (Tiptap output). Rendered through the email-render sanitizer before send. ≤ 50000 chars.';
