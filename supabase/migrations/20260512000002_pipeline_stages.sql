-- ─────────────────────────────────────────────────────────────────────
-- 20260512000002_pipeline_stages.sql
--
-- Track B — Configurable Pipeline Stages (Path B, per-DSO custom stages).
--
-- Replaces the hardcoded `application_status` Postgres enum with a
-- per-DSO `dso_pipeline_stages` table that DSOs can rename, reorder,
-- recolor, hide, and (on Growth+) extend with custom stages. The
-- migration is the heaviest part of the track because applications +
-- application_status_events both reference the old enum and have
-- triggers + RLS policies wired to specific stage names.
--
-- Tier-gating posture: every DSO gets seeded with the 7 canonical
-- stages (open → screen → interview → offer → hired → rejected →
-- withdrawn). Schema is uniform. Only the Settings UI surface checks
-- the caller's tier — Starter sees the seed as read-only with an
-- upgrade CTA, Growth+ gets full CRUD. The 12-stage cap is also
-- enforced at the UI + server-action level, not in the schema.
--
-- Reference: project_tuesday_2026_05_12_build_plan.md + scoping
-- decisions confirmed by Cam 2026-05-12.
-- ─────────────────────────────────────────────────────────────────────
-- Postgres-enum-two-transaction rule: we are DROPPING (not extending)
-- the application_status enum, and dropping a no-longer-referenced
-- enum type is safe in a single transaction. The new `kind` column on
-- dso_pipeline_stages uses a CHECK constraint (not an enum) so future
-- additions (e.g., adding 'references' as a system kind) land cleanly
-- in one transaction per feedback_postgres_enum_two_transactions.md.
-- ─────────────────────────────────────────────────────────────────────

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. dso_pipeline_stages — per-DSO stage configuration
--
-- `kind` is the system-level category. It stays bounded so all the
-- system logic that needs to ask "is this terminal?" / "is this past
-- offer?" / "is this withdrawn?" keeps working without each consumer
-- caring about custom labels.
--
-- `label` is the DSO-visible display name. DSOs can rename "Interview"
-- to "Phone Screen" or anything else.
--
-- `slug` is a stable lower-case identifier scoped per DSO. Used for
-- linking / deep-links / external integrations later. Computed from
-- label on insert/update (the app layer handles slugification).
--
-- `is_default` is true on the seven seeded canonical rows. New
-- applications auto-fill stage_id to the (dso, kind='open',
-- is_default=true) row. A DSO can promote a custom open-kind stage to
-- default if they want auto-assignment to land there instead.
--
-- `is_hidden` collapses the stage on the kanban but preserves any
-- applications currently in it (data integrity over UX). A hidden
-- stage doesn't appear in the kanban or the stage-selector dropdown.
--
-- `color_class` is a Tailwind color palette name (slate, amber, blue,
-- emerald, heritage, rose, sky, violet, etc.). Resolved at render
-- time to bg-{color}-50 / ring-{color}-200 / text-{color}-700
-- triplets by the client.
-- ═════════════════════════════════════════════════════════════════════════

create table public.dso_pipeline_stages (
  id            uuid primary key default gen_random_uuid(),
  dso_id        uuid not null references public.dsos(id) on delete cascade,
  kind          text not null,
  label         text not null,
  slug          text not null,
  sort_order    int  not null default 0,
  is_hidden     boolean not null default false,
  is_default    boolean not null default false,
  color_class   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint dso_pipeline_stages_kind_check check (kind in (
    'open',
    'screen',
    'interview',
    'offer',
    'hired',
    'rejected',
    'withdrawn'
  ))
);

-- One default stage per (dso_id, kind) — the auto-assign target.
create unique index dso_pipeline_stages_default_idx
  on public.dso_pipeline_stages (dso_id, kind)
  where is_default = true;

-- Slugs are unique within a DSO.
create unique index dso_pipeline_stages_slug_idx
  on public.dso_pipeline_stages (dso_id, slug);

-- Primary read pattern: kanban renders stages for one DSO in sort order.
create index dso_pipeline_stages_dso_order_idx
  on public.dso_pipeline_stages (dso_id, sort_order, kind);

create trigger dso_pipeline_stages_set_updated_at
  before update on public.dso_pipeline_stages
  for each row execute function public.set_updated_at();

alter table public.dso_pipeline_stages enable row level security;

-- DSO members read their DSO's stages.
create policy "Pipeline stages: DSO read"
  on public.dso_pipeline_stages for select
  to authenticated
  using (dso_id = public.current_dso_id());

-- DSO admins/owners can mutate stages. Recruiters cannot (settings-level
-- mutation belongs to the admin tier of seats). Tier gating is layered
-- on top in the server action — this RLS is just the role gate.
create policy "Pipeline stages: DSO admin write"
  on public.dso_pipeline_stages for all
  to authenticated
  using (
    dso_id = public.current_dso_id()
    and public.current_dso_user_role() in ('owner', 'admin')
  )
  with check (
    dso_id = public.current_dso_id()
    and public.current_dso_user_role() in ('owner', 'admin')
  );

grant select, insert, update, delete on public.dso_pipeline_stages to authenticated;


-- ═════════════════════════════════════════════════════════════════════════
-- 2. Seed helper — creates the canonical 7 stages for a given DSO
-- ═════════════════════════════════════════════════════════════════════════

create or replace function public.seed_dso_default_pipeline_stages(p_dso_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.dso_pipeline_stages
    (dso_id, kind, label, slug, sort_order, is_default, color_class)
  values
    (p_dso_id, 'open',       'New',         'new',          0,  true, 'slate'),
    (p_dso_id, 'screen',     'Screening',   'screening',    10, true, 'amber'),
    (p_dso_id, 'interview',  'Interview',   'interview',    20, true, 'blue'),
    (p_dso_id, 'offer',      'Offer',       'offer',        30, true, 'emerald'),
    (p_dso_id, 'hired',      'Hired',       'hired',        40, true, 'heritage'),
    (p_dso_id, 'rejected',   'Rejected',    'rejected',     50, true, 'rose'),
    (p_dso_id, 'withdrawn',  'Withdrawn',   'withdrawn',    60, true, 'slate')
  on conflict do nothing;
end;
$$;

grant execute on function public.seed_dso_default_pipeline_stages(uuid) to authenticated;


-- ═════════════════════════════════════════════════════════════════════════
-- 3. Auto-seed stages when a new DSO is inserted
-- ═════════════════════════════════════════════════════════════════════════

create or replace function public.on_dso_insert_seed_stages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_dso_default_pipeline_stages(new.id);
  return new;
end;
$$;

drop trigger if exists dsos_seed_pipeline_stages on public.dsos;
create trigger dsos_seed_pipeline_stages
  after insert on public.dsos
  for each row execute function public.on_dso_insert_seed_stages();


-- ═════════════════════════════════════════════════════════════════════════
-- 4. Backfill existing DSOs with the canonical 7 stages
-- ═════════════════════════════════════════════════════════════════════════

do $$
declare
  d record;
begin
  for d in select id from public.dsos loop
    perform public.seed_dso_default_pipeline_stages(d.id);
  end loop;
end
$$;


-- ═════════════════════════════════════════════════════════════════════════
-- 5. applications.stage_id — add, backfill, lock NOT NULL + FK
-- ═════════════════════════════════════════════════════════════════════════

alter table public.applications
  add column if not exists stage_id uuid;

-- Backfill from old status. Each existing application gets pointed at
-- the DSO's default seeded stage whose `kind` matches the old enum
-- value. Uses comma-list FROM (not explicit JOIN) because PostgreSQL
-- can't reference the UPDATE target table inside a JOIN's ON clause;
-- moving the kind match into WHERE makes `a.status` visible.
update public.applications a
   set stage_id = s.id
  from public.jobs j,
       public.dso_pipeline_stages s
 where j.id = a.job_id
   and s.dso_id = j.dso_id
   and s.is_default = true
   and s.kind = case a.status::text
                  when 'new'           then 'open'
                  when 'reviewed'      then 'screen'
                  when 'interviewing'  then 'interview'
                  when 'offered'       then 'offer'
                  when 'hired'         then 'hired'
                  when 'rejected'      then 'rejected'
                  when 'withdrawn'     then 'withdrawn'
                end
   and a.stage_id is null;

-- Safety: every application must have a stage now. If any are still
-- null at this point, the backfill missed something (most likely a
-- job with no DSO, which would be a data integrity bug worth knowing
-- about). Raise rather than silently inserting NULLs.
do $$
declare
  v_orphans int;
begin
  select count(*) into v_orphans from public.applications where stage_id is null;
  if v_orphans > 0 then
    raise exception
      'Backfill missed % applications — investigate before locking stage_id NOT NULL',
      v_orphans;
  end if;
end
$$;

alter table public.applications
  alter column stage_id set not null;

alter table public.applications
  drop constraint if exists applications_stage_id_fkey;
alter table public.applications
  add  constraint applications_stage_id_fkey
  foreign key (stage_id) references public.dso_pipeline_stages(id) on delete restrict;

create index if not exists applications_stage_id_idx
  on public.applications (stage_id);


-- ═════════════════════════════════════════════════════════════════════════
-- 6. application_status_events — swap enum cols for kind text snapshots
--
-- Events are historical. We snapshot the KIND at the time (not the
-- stage_id), because:
--   (a) DSOs can hide stages → an old event would point at a hidden
--       row, which is fine, but more importantly
--   (b) Stage rows live and die with their DSO, and the kind enum
--       gives us stable category semantics for analytics that don't
--       care about per-DSO labels.
-- ═════════════════════════════════════════════════════════════════════════

alter table public.application_status_events
  add column if not exists from_stage_kind text,
  add column if not exists to_stage_kind   text;

update public.application_status_events
   set from_stage_kind = case from_status::text
                           when 'new'           then 'open'
                           when 'reviewed'      then 'screen'
                           when 'interviewing'  then 'interview'
                           when 'offered'       then 'offer'
                           when 'hired'         then 'hired'
                           when 'rejected'      then 'rejected'
                           when 'withdrawn'     then 'withdrawn'
                         end,
       to_stage_kind   = case to_status::text
                           when 'new'           then 'open'
                           when 'reviewed'      then 'screen'
                           when 'interviewing'  then 'interview'
                           when 'offered'       then 'offer'
                           when 'hired'         then 'hired'
                           when 'rejected'      then 'rejected'
                           when 'withdrawn'     then 'withdrawn'
                         end
 where to_stage_kind is null;

alter table public.application_status_events
  drop column if exists from_status,
  drop column if exists to_status;

alter table public.application_status_events
  alter column to_stage_kind set not null;

alter table public.application_status_events
  drop constraint if exists application_status_events_from_kind_check;
alter table public.application_status_events
  add  constraint application_status_events_from_kind_check
  check (from_stage_kind is null or from_stage_kind in (
    'open','screen','interview','offer','hired','rejected','withdrawn'
  ));

alter table public.application_status_events
  drop constraint if exists application_status_events_to_kind_check;
alter table public.application_status_events
  add  constraint application_status_events_to_kind_check
  check (to_stage_kind in (
    'open','screen','interview','offer','hired','rejected','withdrawn'
  ));


-- ═════════════════════════════════════════════════════════════════════════
-- 7. BEFORE INSERT trigger: auto-fill stage_id when not supplied
--
-- The candidate apply flow inserts applications without specifying a
-- stage — they shouldn't know about stages. This trigger picks the
-- DSO's default 'open' stage for the job's DSO.
-- ═════════════════════════════════════════════════════════════════════════

create or replace function public.fill_default_application_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_default_stage uuid;
  v_dso_id        uuid;
begin
  if new.stage_id is not null then
    return new;
  end if;
  select j.dso_id into v_dso_id from public.jobs j where j.id = new.job_id;
  if v_dso_id is null then
    raise exception
      'Job % has no DSO; cannot resolve default pipeline stage', new.job_id;
  end if;
  select id into v_default_stage
    from public.dso_pipeline_stages
   where dso_id = v_dso_id
     and kind = 'open'
     and is_default = true
   limit 1;
  if v_default_stage is null then
    raise exception
      'DSO % is missing a default open-kind pipeline stage', v_dso_id;
  end if;
  new.stage_id := v_default_stage;
  return new;
end;
$$;

drop trigger if exists applications_fill_default_stage on public.applications;
create trigger applications_fill_default_stage
  before insert on public.applications
  for each row execute function public.fill_default_application_stage();


-- ═════════════════════════════════════════════════════════════════════════
-- 8. seed_application_status_event — rewrite to use stage_id + kind
-- ═════════════════════════════════════════════════════════════════════════

create or replace function public.seed_application_status_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
begin
  select kind into v_kind
    from public.dso_pipeline_stages
   where id = new.stage_id;
  if v_kind is null then
    raise exception
      'Application % has no resolvable stage kind for stage_id %', new.id, new.stage_id;
  end if;
  insert into public.application_status_events
    (application_id, from_stage_kind, to_stage_kind, actor_id, actor_type, note)
  values
    (new.id, null, v_kind, auth.uid(), 'candidate', null);
  return new;
end;
$$;
-- (trigger applications_seed_status_event already exists and points at
-- this function — CREATE OR REPLACE preserves the binding.)


-- ═════════════════════════════════════════════════════════════════════════
-- 9. log_application_status_change — rewrite to fire on stage_id changes
--
-- Preserves the rich actor-type lookup from 20260504000005 (auth.uid()
-- → candidate vs dso_user → fallback system). Logs from/to kinds.
-- ═════════════════════════════════════════════════════════════════════════

drop trigger if exists applications_log_status_change on public.applications;

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
  v_from_kind  text;
  v_to_kind    text;
begin
  if new.stage_id is distinct from old.stage_id then
    select kind into v_from_kind from public.dso_pipeline_stages where id = old.stage_id;
    select kind into v_to_kind   from public.dso_pipeline_stages where id = new.stage_id;

    if v_actor_id is null then
      v_actor_type := 'system';
    else
      -- Path 1: caller is the candidate on this application
      if exists (
        select 1
        from public.candidates c
        where c.id = new.candidate_id
          and c.auth_user_id = v_actor_id
      ) then
        v_actor_type := 'candidate';
      else
        -- Path 2: caller is a DSO member on the job's DSO
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
      (application_id, from_stage_kind, to_stage_kind, actor_id, actor_type, note)
    values
      (new.id, v_from_kind, v_to_kind, v_actor_id, v_actor_type, null);
  end if;
  return new;
end;
$$;

create trigger applications_log_status_change
  after update of stage_id on public.applications
  for each row execute function public.log_application_status_change();


-- ═════════════════════════════════════════════════════════════════════════
-- 10. bump_application_stage_entered_at — rewrite to fire on stage_id
-- ═════════════════════════════════════════════════════════════════════════

drop trigger if exists applications_bump_stage_entered_at on public.applications;

create or replace function public.bump_application_stage_entered_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage_id is distinct from old.stage_id then
    new.stage_entered_at := now();
  end if;
  return new;
end;
$$;

create trigger applications_bump_stage_entered_at
  before update of stage_id on public.applications
  for each row execute function public.bump_application_stage_entered_at();


-- ═════════════════════════════════════════════════════════════════════════
-- 11. RLS "Applications: candidate withdraw" — replace status='withdrawn'
--     check with a lookup on the linked stage's kind.
-- ═════════════════════════════════════════════════════════════════════════

drop policy if exists "Applications: candidate withdraw" on public.applications;
create policy "Applications: candidate withdraw"
  on public.applications for update
  using (
    exists (
      select 1 from public.candidates c
      where c.id = candidate_id and c.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.candidates c
      where c.id = candidate_id and c.auth_user_id = auth.uid()
    )
    and exists (
      select 1 from public.dso_pipeline_stages s
      where s.id = stage_id and s.kind = 'withdrawn'
    )
  );


-- ═════════════════════════════════════════════════════════════════════════
-- 12. Drop applications.status column + the application_status enum
--
-- Safe in this transaction because every reference (column, trigger,
-- policy, function) has been migrated above.
-- ═════════════════════════════════════════════════════════════════════════

alter table public.applications
  drop column if exists status;

drop type if exists public.application_status;

commit;

-- ─────────────────────────────────────────────────────────────────────
-- End of pipeline-stages migration. Apply via Supabase SQL Editor —
-- single transaction.
--
-- Post-apply: hand-patch src/lib/supabase/database.types.ts so the
-- Database type loses `application_status` from Enums and
-- applications/application_status_events Row/Insert/Update reflect:
--   • applications.status              drop
--   • applications.stage_id            string
--   • application_status_events.from_status   drop
--   • application_status_events.to_status     drop
--   • application_status_events.from_stage_kind  string | null
--   • application_status_events.to_stage_kind    string
--   • new table: dso_pipeline_stages Row/Insert/Update
--
-- Consumer rewrite (18 files) ships in the same push as this migration.
-- ─────────────────────────────────────────────────────────────────────
