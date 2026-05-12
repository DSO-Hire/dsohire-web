-- ─────────────────────────────────────────────────────────────────────
-- 20260512000006_fix_applications_set_hired_at.sql
--
-- Hotfix for Track B aftermath.
--
-- The applications_set_hired_at trigger from 20260511000003 references
-- NEW.status / OLD.status. Track B's migration (20260512000002) dropped
-- applications.status as part of the Path B refactor but missed
-- rewriting this trigger. Result: every UPDATE on applications
-- (including kanban stage_id changes) now errors with:
--   record "new" has no field "status"
--
-- Fix: rewrite the trigger to fire on UPDATE OF stage_id and resolve
-- the new stage's kind via dso_pipeline_stages. The condition becomes
-- "did the application transition INTO a hired-kind stage?" — semantic
-- match for the original intent.
-- ─────────────────────────────────────────────────────────────────────

begin;

drop trigger if exists applications_set_hired_at_trigger on public.applications;

create or replace function public.applications_set_hired_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_kind text;
  v_old_kind text;
begin
  if new.stage_id is distinct from old.stage_id then
    select kind into v_new_kind
      from public.dso_pipeline_stages where id = new.stage_id;
    select kind into v_old_kind
      from public.dso_pipeline_stages where id = old.stage_id;
    if v_new_kind = 'hired'
       and (v_old_kind is null or v_old_kind <> 'hired')
       and new.hired_at is null then
      new.hired_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger applications_set_hired_at_trigger
  before update of stage_id on public.applications
  for each row execute function public.applications_set_hired_at();

commit;
