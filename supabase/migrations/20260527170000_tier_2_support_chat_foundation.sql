-- Tier 2 in-app support foundation (Day 21 2026-05-27).
-- See /Business Plan & Strategy/InApp_Support_Tier_2_Spec_2026-05-27.md.
--
-- Three tables:
--   1. support_chat_messages — one row per message in a Claude-powered
--      support conversation. Linked to support_requests (the existing
--      Tier 1 row becomes the conversation root).
--   2. claude_usage_log — every Anthropic API call logs cost + tokens
--      for rate limiting + per-DSO/global kill switches.
--   3. support_response_cache — dedupe-by-question cache so the second
--      person asking "how do I post a job?" costs $0.
--
-- All tables service-role-write-only at the RLS layer — chat endpoint
-- runs server-side and bypasses RLS for inserts.

create type support_chat_role as enum ('user', 'assistant', 'system', 'tool');

create table public.support_chat_messages (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references public.support_requests(id) on delete cascade,
  role            support_chat_role not null,
  content         text,
  tool_name       text,
  tool_input      jsonb,
  tool_output     jsonb,
  model           text,
  input_tokens    integer,
  output_tokens   integer,
  cached_input_tokens integer default 0,
  cache_hit       boolean default false,
  escalated       boolean default false,
  confidence      numeric(3, 2),
  created_at      timestamptz not null default now()
);

create index support_chat_messages_request_idx
  on public.support_chat_messages (request_id, created_at);

alter table public.support_chat_messages enable row level security;

create policy "support_chat_messages: author reads own"
  on public.support_chat_messages for select
  using (
    request_id in (
      select id from public.support_requests where auth_user_id = auth.uid()
    )
  );

create policy "support_chat_messages: DSO members read DSO's"
  on public.support_chat_messages for select
  using (
    request_id in (
      select id from public.support_requests
      where dso_id = public.current_dso_id()
    )
  );

comment on table public.support_chat_messages is
  'One row per message in a Tier 2 Claude-powered support conversation. Linked to support_requests (the existing Tier 1 row becomes the conversation root). See InApp_Support_Tier_2_Spec_2026-05-27.md.';

-- ───────────────────────────────────────────────────────────

create table public.claude_usage_log (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid not null references auth.users(id) on delete cascade,
  dso_id          uuid references public.dsos(id) on delete cascade,
  surface         text not null,
  model           text not null,
  input_tokens    integer not null default 0,
  output_tokens   integer not null default 0,
  cached_input_tokens integer not null default 0,
  cost_cents      numeric(10, 4) not null default 0,
  request_id      uuid references public.support_requests(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index claude_usage_log_user_day_idx
  on public.claude_usage_log (auth_user_id, created_at desc);
create index claude_usage_log_dso_day_idx
  on public.claude_usage_log (dso_id, created_at desc);
create index claude_usage_log_global_day_idx
  on public.claude_usage_log (created_at desc);

alter table public.claude_usage_log enable row level security;

create policy "claude_usage_log: DSO members read DSO's"
  on public.claude_usage_log for select
  using (dso_id is not null and dso_id = public.current_dso_id());

comment on table public.claude_usage_log is
  'Per-Claude-call cost + token log. Drives per-user/DSO/global rate limits and kill switches. Locked caps + kill-switch thresholds in spec doc.';

-- ───────────────────────────────────────────────────────────

create table public.support_response_cache (
  id              uuid primary key default gen_random_uuid(),
  cache_key       text not null unique,
  question        text not null,
  response        text not null,
  hit_count       integer not null default 1,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now()
);

create index support_response_cache_expires_idx
  on public.support_response_cache (expires_at);

alter table public.support_response_cache enable row level security;

comment on table public.support_response_cache is
  'Dedupe-by-question cache for Tier 2 Claude responses. Key = SHA-256 hash of (normalized question + relevant state slice + help_content version). Expected 30-50% hit rate after first weeks. Closed RLS — server-side use only.';
