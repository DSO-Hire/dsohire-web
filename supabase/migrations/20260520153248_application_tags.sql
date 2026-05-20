-- E3.22 — Candidate tags. Team-level colored labels per application; chips
-- render on the kanban card + application detail page. Follows the
-- application_comments RLS pattern (membership via applications -> jobs ->
-- dso_users). Tags are shared across the DSO team (any member can add/remove).
create table public.application_tags (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  color text not null default 'slate'
    check (color in ('slate','green','blue','amber','rose','purple')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (application_id, label)
);

create index application_tags_application_id_idx
  on public.application_tags (application_id);

alter table public.application_tags enable row level security;

create policy "DSO members can read tags on their applications"
  on public.application_tags for select
  using (
    exists (
      select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
      join public.dso_users du on du.dso_id = j.dso_id
      where a.id = application_tags.application_id
        and du.auth_user_id = auth.uid()
    )
  );

create policy "DSO members can add tags on their applications"
  on public.application_tags for insert
  with check (
    (created_by = auth.uid() or created_by is null)
    and exists (
      select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
      join public.dso_users du on du.dso_id = j.dso_id
      where a.id = application_tags.application_id
        and du.auth_user_id = auth.uid()
    )
  );

create policy "DSO members can remove tags on their applications"
  on public.application_tags for delete
  using (
    exists (
      select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
      join public.dso_users du on du.dso_id = j.dso_id
      where a.id = application_tags.application_id
        and du.auth_user_id = auth.uid()
    )
  );
