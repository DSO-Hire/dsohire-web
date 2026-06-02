-- ─────────────────────────────────────────────────────────────────────
-- 20260602160000_automation_rules.sql
--
-- N13 — Automation Rules Engine ("if X then Y"), Phase 1 (foundation +
-- parity). Introduces a general trigger → conditions → actions model so
-- the hardcoded candidate.stage_changed dispatch (inbox system message +
-- email, fired inline from moveApplicationStage + the bulk moveOne loop)
-- becomes the FIRST seeded rule. Behavior is identical on day one: every
-- existing DSO is backfilled with an enabled `is_system` default rule
-- whose two actions reproduce today's two dispatches 1:1, and new DSOs
-- get it via an AFTER INSERT trigger (mirrors the pipeline-stage seeder
-- in 20260512000002).
--
-- Tier posture: the schema is uniform across tiers and the seeded default
-- rule runs for EVERYONE (so no DSO loses today's stage emails). Custom-
-- rule CREATION is gated to Scale+ in the server action layer (Phase 2) —
-- NOT in the schema. RLS here is the role gate only (owner/admin write).
--
-- Design doc: Business Plan & Strategy/N13_Automation_Rules_Engine_Design_2026-06-02.md
-- Forks locked by Cam (Day 25): event-triggers-first, Scale+ gate w/
-- universal default rule, auto-move-stage HELD for a later phase (the
-- 'move_stage' action_kind is reserved in the CHECK but not yet wired or
-- exposed), full 3-dropdown builder.
-- ─────────────────────────────────────────────────────────────────────

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. automation_rules — one trigger + flat AND-conditions per rule
-- ═════════════════════════════════════════════════════════════════════════

create table public.automation_rules (
  id            uuid primary key default gen_random_uuid(),
  dso_id        uuid not null references public.dsos(id) on delete cascade,
  name          text not null,
  trigger_kind  text not null,
  -- Flat AND-joined array of {field, op, value}. '[]' = always-true.
  conditions    jsonb not null default '[]'::jsonb,
  -- Ships disabled for custom rules; the seeded system default ships ON.
  is_enabled    boolean not null default false,
  -- The seeded default rule. Editable + disable-able, but not deletable
  -- (enforced in the server action, not the schema).
  is_system     boolean not null default false,
  sort_order    int not null default 0,
  created_by    uuid references public.dso_users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Trigger taxonomy. Includes future kinds (offer.*, time-based idle /
  -- no_response) up front so lighting them up needs no schema migration —
  -- only the seeded default uses application.stage_changed in Phase 1.
  constraint automation_rules_trigger_check check (trigger_kind in (
    'application.received',
    'application.stage_changed',
    'application.message_received',
    'application.withdrawn',
    'interview.booked',
    'interview.cancelled',
    'offer.sent',
    'offer.accepted',
    'offer.declined',
    'application.idle_in_stage',
    'application.no_response'
  ))
);

-- Primary read pattern: engine loads enabled rules for (dso, trigger) in order.
create index automation_rules_dso_trigger_idx
  on public.automation_rules (dso_id, trigger_kind, is_enabled, sort_order);

-- At most one system default per (dso, trigger).
create unique index automation_rules_system_default_idx
  on public.automation_rules (dso_id, trigger_kind)
  where is_system = true;

create trigger automation_rules_set_updated_at
  before update on public.automation_rules
  for each row execute function public.set_updated_at();


-- ═════════════════════════════════════════════════════════════════════════
-- 2. automation_rule_actions — ordered actions per rule
--
-- action_kind taxonomy. Phase 1 wires only the two candidate-facing
-- primitives that reproduce today's dispatch:
--   • inbox_system_message — drops the "moved from X to Y" system row
--   • email_candidate       — fires the candidate.stage_changed email
-- The rest are reserved for Phase 2/3. 'move_stage' is the HELD foot-gun
-- action (Cam, Day 25) — reserved here but intentionally NOT runnable yet.
-- config shape by kind:
--   email_candidate      {"template_kind": "<predefined-or-custom kind>"}
--   inbox_system_message {}
--   notify_teammate      {"target": "hiring_manager"|"assignee"|"<dso_user_id>"}
--   assign               {"target": "hiring_manager"|"<dso_user_id>"}
--   add_tag              {"tag": "<label>"}
--   move_stage           {"target_stage_id": "<uuid>"}   (HELD — not wired)
--   start_sequence       {"sequence_id": "<uuid>"}       (N16 hook — not wired)
-- ═════════════════════════════════════════════════════════════════════════

create table public.automation_rule_actions (
  id          uuid primary key default gen_random_uuid(),
  rule_id     uuid not null references public.automation_rules(id) on delete cascade,
  action_kind text not null,
  config      jsonb not null default '{}'::jsonb,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  constraint automation_rule_actions_kind_check check (action_kind in (
    'email_candidate',
    'inbox_system_message',
    'notify_teammate',
    'assign',
    'add_tag',
    'move_stage',
    'start_sequence'
  ))
);

create index automation_rule_actions_rule_idx
  on public.automation_rule_actions (rule_id, sort_order);


-- ═════════════════════════════════════════════════════════════════════════
-- 3. automation_rule_runs — idempotency ledger + activity feed
--
-- The unique (rule_id, application_id, trigger_event) constraint is the
-- loop/dup guard: the engine claims a run row (insert-on-conflict-do-
-- nothing) BEFORE executing actions. For event triggers the call site
-- passes a per-event trigger_event key (unique per move) so each real
-- move fires; for time triggers (Phase 3) the key is a deterministic
-- window bucket so re-runs of the cron dedup. Doubles as the "this rule
-- fired N times" history surfaced in the UI.
-- ═════════════════════════════════════════════════════════════════════════

create table public.automation_rule_runs (
  id             uuid primary key default gen_random_uuid(),
  rule_id        uuid not null references public.automation_rules(id) on delete cascade,
  dso_id         uuid not null references public.dsos(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  trigger_event  text not null,
  status         text not null,
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  constraint automation_rule_runs_status_check check (status in (
    'fired',
    'skipped_condition',
    'skipped_disabled',
    'error'
  )),
  unique (rule_id, application_id, trigger_event)
);

create index automation_rule_runs_rule_idx
  on public.automation_rule_runs (rule_id, created_at desc);
create index automation_rule_runs_dso_idx
  on public.automation_rule_runs (dso_id, created_at desc);


-- ═════════════════════════════════════════════════════════════════════════
-- 4. RLS — DSO read; owner/admin write. Runs are read-only to clients
--    (engine writes via the service-role client from after()).
-- ═════════════════════════════════════════════════════════════════════════

alter table public.automation_rules        enable row level security;
alter table public.automation_rule_actions enable row level security;
alter table public.automation_rule_runs    enable row level security;

create policy "automation_rules: dso read"
  on public.automation_rules for select
  to authenticated
  using (dso_id = public.current_dso_id());

create policy "automation_rules: admin write"
  on public.automation_rules for all
  to authenticated
  using (
    dso_id = public.current_dso_id()
    and public.current_dso_user_role() in ('owner', 'admin')
  )
  with check (
    dso_id = public.current_dso_id()
    and public.current_dso_user_role() in ('owner', 'admin')
  );

create policy "automation_rule_actions: dso read"
  on public.automation_rule_actions for select
  to authenticated
  using (
    exists (
      select 1 from public.automation_rules r
      where r.id = rule_id and r.dso_id = public.current_dso_id()
    )
  );

create policy "automation_rule_actions: admin write"
  on public.automation_rule_actions for all
  to authenticated
  using (
    exists (
      select 1 from public.automation_rules r
      where r.id = rule_id
        and r.dso_id = public.current_dso_id()
        and public.current_dso_user_role() in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.automation_rules r
      where r.id = rule_id
        and r.dso_id = public.current_dso_id()
        and public.current_dso_user_role() in ('owner', 'admin')
    )
  );

create policy "automation_rule_runs: dso read"
  on public.automation_rule_runs for select
  to authenticated
  using (dso_id = public.current_dso_id());

grant select, insert, update, delete on public.automation_rules        to authenticated;
grant select, insert, update, delete on public.automation_rule_actions to authenticated;
grant select                          on public.automation_rule_runs    to authenticated;


-- ═════════════════════════════════════════════════════════════════════════
-- 5. Seed helper — creates the system default stage-change rule for a DSO
--    (reproduces today's two dispatches). Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

create or replace function public.seed_dso_default_automation_rules(p_dso_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule_id uuid;
begin
  -- Already seeded? Bail (keeps the backfill loop + insert trigger idempotent).
  if exists (
    select 1 from public.automation_rules
    where dso_id = p_dso_id
      and trigger_kind = 'application.stage_changed'
      and is_system = true
  ) then
    return;
  end if;

  insert into public.automation_rules
    (dso_id, name, trigger_kind, conditions, is_enabled, is_system, sort_order)
  values
    (p_dso_id, 'Notify candidate on stage change',
     'application.stage_changed', '[]'::jsonb, true, true, 0)
  returning id into v_rule_id;

  insert into public.automation_rule_actions
    (rule_id, action_kind, config, sort_order)
  values
    (v_rule_id, 'inbox_system_message', '{}'::jsonb, 0),
    (v_rule_id, 'email_candidate',
     jsonb_build_object('template_kind', 'candidate.stage_changed'), 1);
end;
$$;

grant execute on function public.seed_dso_default_automation_rules(uuid) to authenticated;


-- ═════════════════════════════════════════════════════════════════════════
-- 6. Auto-seed when a new DSO is inserted (mirrors dsos_seed_pipeline_stages)
-- ═════════════════════════════════════════════════════════════════════════

create or replace function public.on_dso_insert_seed_automation_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_dso_default_automation_rules(new.id);
  return new;
end;
$$;

drop trigger if exists dsos_seed_automation_rules on public.dsos;
create trigger dsos_seed_automation_rules
  after insert on public.dsos
  for each row execute function public.on_dso_insert_seed_automation_rules();


-- ═════════════════════════════════════════════════════════════════════════
-- 7. Backfill existing DSOs with the system default rule
-- ═════════════════════════════════════════════════════════════════════════

do $$
declare
  d record;
begin
  for d in select id from public.dsos loop
    perform public.seed_dso_default_automation_rules(d.id);
  end loop;
end
$$;

commit;

-- ─────────────────────────────────────────────────────────────────────
-- Post-apply: hand-patch src/lib/supabase/database.types.ts to add Row/
-- Insert/Update for automation_rules, automation_rule_actions, and
-- automation_rule_runs. Engine + call-site swap ship in the same push.
-- ─────────────────────────────────────────────────────────────────────
