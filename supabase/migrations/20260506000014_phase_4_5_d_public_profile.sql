-- ─────────────────────────────────────────────────────────────────────────
-- Phase 4.5.d — Public DSO Profile Builder
--
-- Scope locked 2026-05-06 PM:
--   • Description editor flips to Tiptap rich text (column is reused — the
--     /companies/[slug] page will switch to a sanitized HTML render).
--   • dsos gains: mission, banner_url, brand_color, why_join_us (jsonb
--     blocks), culture_chips (text[]), contact_cta_label, contact_cta_url
--   • dso_photos child table (max 6 per DSO, enforced server-side; RLS
--     mirrors dsos: public read on active, admin write).
--   • Slug-history trigger records the OLD slug whenever a DSO admin
--     changes dsos.slug, so old links 301 forever via the existing
--     /companies/[slug] redirect path. Trigger is SECURITY DEFINER so it
--     can insert into dso_slug_history (which has no INSERT policy by
--     design — only the public-read SELECT policy).
--
-- All adds are non-destructive and idempotent (IF NOT EXISTS / ON CONFLICT).
-- ─────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- 1. dsos: profile columns
-- ─────────────────────────────────────────────────────────────

alter table public.dsos add column if not exists mission           text;
alter table public.dsos add column if not exists banner_url        text;
alter table public.dsos add column if not exists brand_color       text;
alter table public.dsos add column if not exists why_join_us       jsonb       not null default '[]'::jsonb;
alter table public.dsos add column if not exists culture_chips     text[]      not null default '{}'::text[];
alter table public.dsos add column if not exists contact_cta_label text;
alter table public.dsos add column if not exists contact_cta_url   text;

-- Length / shape sanity caps. These are conservative enough that a typo
-- can't bloat a row, while leaving real recruitment-marketing copy room
-- to breathe.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'dsos_mission_len_chk'
  ) then
    alter table public.dsos
      add constraint dsos_mission_len_chk
      check (mission is null or char_length(mission) <= 400);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'dsos_brand_color_format_chk'
  ) then
    alter table public.dsos
      add constraint dsos_brand_color_format_chk
      check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'dsos_contact_cta_label_len_chk'
  ) then
    alter table public.dsos
      add constraint dsos_contact_cta_label_len_chk
      check (contact_cta_label is null or char_length(contact_cta_label) <= 80);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'dsos_culture_chips_count_chk'
  ) then
    alter table public.dsos
      add constraint dsos_culture_chips_count_chk
      check (cardinality(culture_chips) <= 12);
  end if;
end$$;

-- ─────────────────────────────────────────────────────────────
-- 2. dso_photos child table (3-6 photos per DSO)
-- ─────────────────────────────────────────────────────────────

create table if not exists public.dso_photos (
  id           uuid primary key default gen_random_uuid(),
  dso_id       uuid not null references public.dsos(id) on delete cascade,
  storage_url  text not null,
  caption      text,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists dso_photos_dso_sort_idx
  on public.dso_photos (dso_id, sort_order);

alter table public.dso_photos enable row level security;

-- Public read on photos belonging to an active DSO, mirroring dsos itself.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'dso_photos'
      and policyname = 'DSO photos: public read on active DSOs'
  ) then
    create policy "DSO photos: public read on active DSOs"
      on public.dso_photos for select
      using (
        exists (
          select 1 from public.dsos d
          where d.id = dso_photos.dso_id
            and d.status = 'active'
        )
      );
  end if;

  -- DSO members can read their own DSO's photos regardless of status (so
  -- pending DSOs can preview what they're building).
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'dso_photos'
      and policyname = 'DSO photos: members read own'
  ) then
    create policy "DSO photos: members read own"
      on public.dso_photos for select
      using (dso_id = public.current_dso_id());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'dso_photos'
      and policyname = 'DSO photos: admin insert'
  ) then
    create policy "DSO photos: admin insert"
      on public.dso_photos for insert
      with check (public.is_dso_admin(dso_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'dso_photos'
      and policyname = 'DSO photos: admin update'
  ) then
    create policy "DSO photos: admin update"
      on public.dso_photos for update
      using (public.is_dso_admin(dso_id))
      with check (public.is_dso_admin(dso_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'dso_photos'
      and policyname = 'DSO photos: admin delete'
  ) then
    create policy "DSO photos: admin delete"
      on public.dso_photos for delete
      using (public.is_dso_admin(dso_id));
  end if;
end$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Slug-history trigger
--
-- Whenever a DSO admin updates dsos.slug, record the OLD slug into
-- dso_slug_history so /companies/[slug] keeps 301-redirecting old
-- links forever.
--
-- SECURITY DEFINER: dso_slug_history has no INSERT policy (only public
-- SELECT). Running the trigger as the function owner bypasses RLS and
-- keeps the write contained to this trigger path.
--
-- ON CONFLICT (from_slug) DO NOTHING: from_slug is UNIQUE. If a slug is
-- rotated back to a previous value, the previous history row already
-- exists — preserve it instead of erroring out the parent UPDATE.
-- ─────────────────────────────────────────────────────────────

create or replace function public.dsos_record_slug_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.slug is distinct from OLD.slug then
    insert into public.dso_slug_history (dso_id, from_slug)
    values (OLD.id, OLD.slug)
    on conflict (from_slug) do nothing;
  end if;
  return NEW;
end;
$$;

drop trigger if exists dsos_slug_history_trg on public.dsos;
create trigger dsos_slug_history_trg
  before update of slug on public.dsos
  for each row
  execute function public.dsos_record_slug_history();

-- ─────────────────────────────────────────────────────────────
-- 4. Comments on the new columns (helps anyone reading the schema)
-- ─────────────────────────────────────────────────────────────

comment on column public.dsos.mission is
  'Short mission/positioning sentence shown above the description on /companies/[slug]. Phase 4.5.d.';
comment on column public.dsos.banner_url is
  'Full-bleed hero image for the public profile. Storage path is auth.uid()/dso-banner-*.<ext>.';
comment on column public.dsos.brand_color is
  '6-digit hex (e.g. #14233F). Tints section eyebrows on /companies/[slug] when set; falls back to heritage-deep.';
comment on column public.dsos.why_join_us is
  'JSON array of {title, body} blocks (max 6, enforced server-side). Renders as "Why join us" section on the public profile.';
comment on column public.dsos.culture_chips is
  'Selected chips from the curated CULTURE_CHIPS taxonomy. Server validates membership.';
comment on column public.dsos.contact_cta_label is
  'Optional CTA label shown on the public profile (e.g. "Talk to our recruiter").';
comment on column public.dsos.contact_cta_url is
  'mailto: or https:// URL the contact CTA links to. Validated server-side.';

comment on table  public.dso_photos is
  'Phase 4.5.d. 3-6 photos per DSO (max 6 enforced in server actions). Public read on active DSOs.';
