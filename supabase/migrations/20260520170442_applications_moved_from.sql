-- E3.21 — move/copy candidate between jobs (same DSO). Adds a lineage link
-- from a cloned application back to the one it was moved/copied from. ON DELETE
-- SET NULL so deleting the source doesn't cascade-delete the clone.
alter table public.applications
  add column moved_from_application_id uuid
    references public.applications(id) on delete set null;

create index applications_moved_from_idx
  on public.applications (moved_from_application_id);
