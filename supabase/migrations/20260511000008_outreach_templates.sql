-- ─────────────────────────────────────────────────────────────
-- Outreach template library (E7.11, Phase 5D Day 2)
-- ─────────────────────────────────────────────────────────────
--
-- Per-DSO saved templates for sourcing outreach. Each template
-- has a name + subject + body with merge-field tokens resolved at
-- send time. Tracks usage so the modal can sort by "most-used."
--
-- Supported merge fields (resolved server-side in the send action):
--   {{candidate.first_name}}   — first token of candidates.full_name
--   {{candidate.full_name}}    — candidates.full_name
--   {{sender.first_name}}      — first token of dso_users.full_name
--   {{sender.name}}            — dso_users.full_name
--   {{dso.name}}               — dsos.name

create table public.dso_outreach_templates (
  id            uuid primary key default gen_random_uuid(),
  dso_id        uuid not null references public.dsos(id) on delete cascade,
  name          text not null,
  subject       text not null,
  body          text not null,
  created_by    uuid references public.dso_users(id) on delete set null,
  last_used_at  timestamptz,
  usage_count   int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index dso_outreach_templates_dso_idx
  on public.dso_outreach_templates (dso_id, last_used_at desc nulls last, name);

create trigger dso_outreach_templates_set_updated_at
  before update on public.dso_outreach_templates
  for each row execute function public.set_updated_at();

alter table public.dso_outreach_templates enable row level security;

create policy "Outreach templates: members read own DSO"
  on public.dso_outreach_templates for select
  using (dso_id = public.current_dso_id());

create policy "Outreach templates: recruiter write"
  on public.dso_outreach_templates for all
  using (
    dso_id = public.current_dso_id()
    and public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
  )
  with check (
    dso_id = public.current_dso_id()
    and public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
  );

comment on table public.dso_outreach_templates is
  'E7.11 (Phase 5D Day 2, shipped 2026-05-11). Per-DSO saved sourcing templates. Merge fields resolved server-side at send time. usage_count + last_used_at drive the "most used first" ordering in the outreach modal picker.';