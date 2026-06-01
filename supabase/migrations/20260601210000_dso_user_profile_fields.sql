-- Teammate self-profile fields (2026-06-01).
-- Lets a DSO team member maintain their own identity card: a human job
-- title (distinct from the system permission role), pronouns, and a short
-- "About" bio. name (first_name/last_name/full_name), phone, and avatar_url
-- already exist on dso_users.
--
-- These are self-editable by the row owner. No new RLS policy needed:
-- dso_users already has a self-update policy ("DSO users: update self",
-- keyed on auth_user_id = auth.uid()); these columns ride that existing
-- grant. The profile save action writes ONLY these columns + name/phone/
-- avatar_url — never role or dso_id.

alter table public.dso_users
  add column if not exists title text,
  add column if not exists pronouns text,
  add column if not exists bio text;

comment on column public.dso_users.title is
  'Human job title shown to coworkers (e.g. "Director of Talent Acquisition"). Distinct from role (system permission level). Self-editable.';
comment on column public.dso_users.pronouns is
  'Optional pronouns shown on the teammate identity card. Self-editable.';
comment on column public.dso_users.bio is
  'Short "About" blurb so colleagues at other locations know who this person is. Self-editable.';
