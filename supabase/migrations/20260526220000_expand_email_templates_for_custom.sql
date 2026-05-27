-- Expand email_templates to support arbitrary user-defined template kinds.
--
-- Cam direction 2026-05-26 ("D — maximum sandbox, but Solo doesn't get the
-- kitchen sink"). Per-DSO admins on Growth+ tiers can author unlimited
-- email template kinds beyond the 3 system-predefined; Solo unlocks the
-- 3 predefined templates (currently fully blocked at the editor).
--
-- Schema changes:
--   1. kind: enum → text (preserves existing values; opens to arbitrary
--      user-defined kinds. System kinds remain string-equal to the
--      manifest's EmailTemplateKind values).
--   2. name text — display label for the template (required for custom;
--      derived from the manifest label for predefined).
--   3. description text — optional admin-facing description.
--   4. is_custom boolean — distinguishes user-defined (true) from
--      system-predefined (false). Drives editor surface + dispatch lookup.
--   5. is_archived boolean — soft delete for custom templates so we can
--      preserve email_log foreign-key history without exposing them in UI.
--
-- The email_template_kind enum type is intentionally NOT dropped here —
-- it's still imported in code paths that haven't been refactored yet.
-- A follow-up cleanup migration drops it after the code stops referencing.
--
-- RLS is unchanged: per-DSO members read; owner/admin write. The existing
-- policies on email_templates already cover the new columns.

-- Convert kind from enum to text (USING cast preserves existing values).
alter table public.email_templates
  alter column kind type text using kind::text;

-- Add the new metadata columns. NOT NULL booleans default to false.
alter table public.email_templates
  add column if not exists name text,
  add column if not exists description text,
  add column if not exists is_custom boolean not null default false,
  add column if not exists is_archived boolean not null default false;

-- Lookup index for the dispatcher: most queries are
-- "find live template for this dso + this kind".
create index if not exists email_templates_dso_kind_active_idx
  on public.email_templates (dso_id, kind)
  where is_archived = false;

-- Composite constraint: a DSO can only have ONE active (non-archived)
-- template per kind. Editing in place updates that row; archiving allows
-- another template to take over the kind without losing history.
create unique index if not exists email_templates_dso_kind_unique_active
  on public.email_templates (dso_id, kind)
  where is_archived = false;

comment on column public.email_templates.is_custom is
  'True for user-defined arbitrary template kinds. False for system-predefined kinds (matches manifest EmailTemplateKind values).';
comment on column public.email_templates.name is
  'Display label. Required for is_custom=true rows. For system templates, populated from manifest TEMPLATE_META[kind].label on insert.';
