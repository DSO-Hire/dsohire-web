-- ============================================================
-- Fix: log_application_status_change derives actor_type from the
-- destination status, which lies on the bulk-archive path.
-- ============================================================
-- The trigger installed in 20260501000005_fix_application_triggers.sql sets
-- actor_type='candidate' whenever the destination status is 'withdrawn'. That
-- was correct when withdraw was strictly candidate-side, but bulk-archive
-- (Phase 5A Day 6) now sends recruiters down the same status transition. The
-- audit row ends up labeled 'candidate' even though a recruiter ran the
-- archive — a real bug in the audit trail.
--
-- Fix: derive actor_type from auth.uid() instead of from the destination
-- status. Lookup order (first hit wins):
--   1. auth.uid() matches a candidates row whose auth_user_id corresponds to
--      the application's candidate_id → 'candidate'
--   2. auth.uid() matches a dso_users row associated with the job's DSO
--      (the application is on a job whose dso_id matches the user's
--      dso_users.dso_id) → 'employer'
--   3. otherwise → 'system' (covers cron jobs, service-role mutations, and
--      any future automation paths)
--
-- The CHECK constraint on application_status_events.actor_type already allows
-- {'candidate', 'employer', 'system'}; no schema change needed.
-- ============================================================

create or replace function public.log_application_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id   uuid := auth.uid();
  v_actor_type text;
  v_dso_id     uuid;
begin
  if new.status is distinct from old.status then
    if v_actor_id is null then
      v_actor_type := 'system';
    else
      -- Path 1: is the caller the candidate on this application?
      if exists (
        select 1
        from public.candidates c
        where c.id = new.candidate_id
          and c.auth_user_id = v_actor_id
      ) then
        v_actor_type := 'candidate';
      else
        -- Path 2: is the caller a DSO member on the job's DSO?
        select j.dso_id into v_dso_id
        from public.jobs j
        where j.id = new.job_id;

        if v_dso_id is not null and exists (
          select 1
          from public.dso_users du
          where du.dso_id = v_dso_id
            and du.auth_user_id = v_actor_id
        ) then
          v_actor_type := 'employer';
        else
          v_actor_type := 'system';
        end if;
      end if;
    end if;

    insert into public.application_status_events
      (application_id, from_status, to_status, actor_id, actor_type, note)
    values
      (new.id, old.status, new.status, v_actor_id, v_actor_type, null);
  end if;
  return new;
end;
$$;
