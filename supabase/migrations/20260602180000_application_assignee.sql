-- N13 assign action — add an "assigned teammate" to applications.
-- A DSO member (or the automation engine) can assign an application to a
-- teammate. on delete set null so removing a teammate doesn't orphan rows.
-- RLS: the existing "Applications: DSO update" policy already gates UPDATE
-- to owner/admin/recruiter on the job's DSO, so manual assignment via the
-- user session is covered without a new policy; the engine uses service role.

alter table public.applications
  add column if not exists assigned_to_dso_user_id uuid
  references public.dso_users(id) on delete set null;

create index if not exists applications_assigned_to_idx
  on public.applications (assigned_to_dso_user_id)
  where assigned_to_dso_user_id is not null;
