-- ============================================================
-- Fix: applications-side trigger functions need SECURITY DEFINER.
-- ============================================================
-- 20260501000003_applications_schema.sql defined three trigger functions
-- that mutate other tables (application_status_events, jobs):
--   - seed_application_status_event   (AFTER INSERT on applications)
--   - log_application_status_change   (AFTER UPDATE OF status on applications)
--   - bump_job_applications_count     (AFTER INSERT/DELETE on applications)
--
-- The comment in that migration claims "all writes happen through triggers,
-- which run as SECURITY DEFINER (or postgres role) and bypass RLS." None of
-- the functions were actually marked SECURITY DEFINER, so they ran as the
-- invoking user — and RLS blocked their internal writes:
--
--   * application_status_events has no INSERT policy → seed trigger threw
--     `42501: new row violates row-level security policy` on every candidate
--     application, blocking the apply flow entirely (verified live).
--   * jobs has no INSERT/UPDATE policy that lets a candidate write → bump
--     trigger silently affected 0 rows, so applications_count never moved.
--   * log_application_status_change had the same pattern as seed and would
--     fail the moment a DSO updated an application status.
--
-- Fix: rebuild each function with SECURITY DEFINER + an explicit
-- `set search_path = public`. Behavior otherwise unchanged. Triggers don't
-- need to be re-attached because CREATE OR REPLACE FUNCTION preserves the
-- existing trigger bindings.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Seed initial 'new' status event after an application is created.
-- ─────────────────────────────────────────────────────────────

create or replace function public.seed_application_status_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.application_status_events
    (application_id, from_status, to_status, actor_id, actor_type, note)
  values
    (new.id, null, new.status, auth.uid(), 'candidate', null);
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Log status transitions when applications.status changes.
-- ─────────────────────────────────────────────────────────────

create or replace function public.log_application_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_type text;
begin
  if new.status is distinct from old.status then
    v_actor_type := case
      when new.status = 'withdrawn' then 'candidate'
      else 'employer'
    end;

    insert into public.application_status_events
      (application_id, from_status, to_status, actor_id, actor_type, note)
    values
      (new.id, old.status, new.status, auth.uid(), v_actor_type, null);
  end if;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Keep jobs.applications_count in sync.
-- ─────────────────────────────────────────────────────────────

create or replace function public.bump_job_applications_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.jobs set applications_count = applications_count + 1
      where id = new.job_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.jobs set applications_count = greatest(applications_count - 1, 0)
      where id = old.job_id;
    return old;
  end if;
  return null;
end;
$$;
