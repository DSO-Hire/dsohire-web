-- Support requests inbox (Tier 1 of in-app support feature).
-- Day 21 2026-05-27. Backs the SupportDrawer contact form.
--
-- Tier 1 = smart contact form: user submits a message, server gathers
-- DSO + tier + recent activity + page URL, sends a structured email
-- to support@dsohire.com AND writes this row. Tier 2 will add Claude
-- AI first-line response inline; Tier 3 will add action-taking.
--
-- RLS scope:
--   * dso_users members: read own DSO's requests (so a teammate can
--     see if someone else already opened a ticket about the same thing)
--   * candidate users: read only their own
--   * service-role: write + status mutations (the action uses service
--     role for the insert because we want a coherent audit trail
--     regardless of which user fires the form)

create type support_request_status as enum (
  'new',
  'in_progress',
  'resolved',
  'closed'
);

create table public.support_requests (
  id              uuid primary key default gen_random_uuid(),
  -- DSO context. NULL for candidate-side requests; populated for
  -- employer-side requests via the DSO membership lookup at submit time.
  dso_id          uuid references public.dsos(id) on delete set null,
  -- Author's auth.users.id. Always set.
  auth_user_id    uuid not null references auth.users(id) on delete set null,
  -- The user's DSO membership row id at submit time (NULL for candidates
  -- and mid-invite states). Useful for joining to dso_users for role.
  dso_user_id     uuid references public.dso_users(id) on delete set null,
  -- What the user wrote. Required; capped at 5000 chars.
  body            text not null,
  -- The page they were on when they hit help. Useful for context routing.
  page_url        text,
  -- Optional human-friendly page title (collected from document.title).
  page_title      text,
  -- Snapshot of the user's tier at submit time so historical context
  -- survives plan changes.
  tier_snapshot   text,
  -- Triage state.
  status          support_request_status not null default 'new',
  -- Resolution metadata.
  resolved_at     timestamptz,
  resolved_by     uuid references auth.users(id) on delete set null,
  resolution_notes text,
  -- Standard timestamps.
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint support_requests_body_len_chk check (char_length(body) between 1 and 5000)
);

create index support_requests_dso_idx on public.support_requests (dso_id);
create index support_requests_user_idx on public.support_requests (auth_user_id);
create index support_requests_status_idx on public.support_requests (status)
  where status in ('new', 'in_progress');
create index support_requests_created_idx on public.support_requests (created_at desc);

drop trigger if exists support_requests_set_updated_at on public.support_requests;
create trigger support_requests_set_updated_at
  before update on public.support_requests
  for each row execute function public.set_updated_at();

alter table public.support_requests enable row level security;

create policy "support_requests: author reads own"
  on public.support_requests for select
  using (auth_user_id = auth.uid());

create policy "support_requests: DSO members read DSO's"
  on public.support_requests for select
  using (dso_id is not null and dso_id = public.current_dso_id());

create policy "support_requests: anyone signed in inserts own"
  on public.support_requests for insert
  with check (auth_user_id = auth.uid());

comment on table public.support_requests is
  'In-app support inbox. Tier 1 = smart contact form context-gathered on submit; Tier 2 (Claude-AI first-line) and Tier 3 (action-taking + proactive nudges + Slack Connect) build on this same row.';
comment on column public.support_requests.page_url is
  'Page the user was on when they opened the support drawer. Drives suggested-article matching + later Claude tool-context selection.';
comment on column public.support_requests.tier_snapshot is
  'subscription.tier at submit time. Captured so historical tickets survive plan changes.';
