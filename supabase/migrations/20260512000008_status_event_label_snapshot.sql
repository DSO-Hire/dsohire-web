-- ─────────────────────────────────────────────────────────────────────
-- 20260512000008_status_event_label_snapshot.sql
--
-- Track B follow-up — activity timeline UX.
--
-- Cam spotted that moving an application between two stages of the
-- same kind (e.g., the seeded "Interview" → a custom "Phone Screening"
-- which is also kind=interview) shows up in the activity timeline as
-- "Interview → Interview" because application_status_events only
-- snapshots the kind, not the DSO-customized label.
--
-- Fix: snapshot the label too. New columns from_stage_label /
-- to_stage_label on application_status_events. Backfill from current
-- stage rows where we can (using the kind default as a fallback when
-- the stage_id might already be different). Forward-fill in the
-- seed_application_status_event + log_application_status_change
-- triggers.
-- ─────────────────────────────────────────────────────────────────────

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. New columns (nullable — historical events have no label snapshot)
-- ═════════════════════════════════════════════════════════════════════════

alter table public.application_status_events
  add column if not exists from_stage_label text,
  add column if not exists to_stage_label   text;

-- ═════════════════════════════════════════════════════════════════════════
-- 2. Rewrite seed_application_status_event — snapshot label on insert
-- ═════════════════════════════════════════════════════════════════════════

create or replace function public.seed_application_status_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind  text;
  v_label text;
begin
  select kind, label
    into v_kind, v_label
    from public.dso_pipeline_stages
   where id = new.stage_id;
  if v_kind is null then
    raise exception
      'Application % has no resolvable stage kind for stage_id %', new.id, new.stage_id;
  end if;
  insert into public.application_status_events
    (application_id, from_stage_kind, to_stage_kind,
     from_stage_label, to_stage_label,
     actor_id, actor_type, note)
  values
    (new.id, null, v_kind, null, v_label, auth.uid(), 'candidate', null);
  return new;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Rewrite log_application_status_change — snapshot from/to labels
-- ═════════════════════════════════════════════════════════════════════════

drop trigger if exists applications_log_status_change on public.applications;

create or replace function public.log_application_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id    uuid := auth.uid();
  v_actor_type  text;
  v_dso_id      uuid;
  v_from_kind   text;
  v_to_kind     text;
  v_from_label  text;
  v_to_label    text;
begin
  if new.stage_id is distinct from old.stage_id then
    select kind, label into v_from_kind, v_from_label
      from public.dso_pipeline_stages where id = old.stage_id;
    select kind, label into v_to_kind, v_to_label
      from public.dso_pipeline_stages where id = new.stage_id;

    if v_actor_id is null then
      v_actor_type := 'system';
    else
      if exists (
        select 1
        from public.candidates c
        where c.id = new.candidate_id
          and c.auth_user_id = v_actor_id
      ) then
        v_actor_type := 'candidate';
      else
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
      (application_id, from_stage_kind, to_stage_kind,
       from_stage_label, to_stage_label,
       actor_id, actor_type, note)
    values
      (new.id, v_from_kind, v_to_kind,
       v_from_label, v_to_label,
       v_actor_id, v_actor_type, null);
  end if;
  return new;
end;
$$;

create trigger applications_log_status_change
  after update of stage_id on public.applications
  for each row execute function public.log_application_status_change();

commit;
