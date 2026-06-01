-- "Works out of" location context for a teammate's identity card
-- (2026-06-01). Lets a team member say where they're based so colleagues
-- at other locations understand their footprint:
--   • corporate — central/HQ staff, DSO-wide
--   • practice  — based at a single office (base_location_id)
--   • regional  — covers a territory of multiple sites (coverage_area, free text)
--
-- This is identity context, distinct from a hiring manager's permission
-- scope (dso_user_locations), which controls what they can access. A
-- recruiter can be "based at" the corporate office while still working
-- DSO-wide; an HM can be "based at" a practice they're also scoped to.
--
-- Self-editable via the existing "DSO users: update self" RLS policy.

alter table public.dso_users
  add column if not exists work_base text
    check (work_base in ('corporate', 'practice', 'regional')),
  add column if not exists base_location_id uuid
    references public.dso_locations(id) on delete set null,
  add column if not exists coverage_area text;

comment on column public.dso_users.work_base is
  'Where this teammate is based: corporate | practice | regional. Identity context, not permission scope. Self-editable.';
comment on column public.dso_users.base_location_id is
  'When work_base = practice: the dso_locations row they are based at. Null otherwise.';
comment on column public.dso_users.coverage_area is
  'When work_base = regional: free-text territory description (e.g. "Kansas City Metro — 6 offices"). Null otherwise.';

create index if not exists idx_dso_users_base_location
  on public.dso_users(base_location_id)
  where base_location_id is not null;
