-- Logs every LLM-driven feature invocation with cost + token accounting.
-- Future AI features (rejection-reason suggester, candidate matching, etc.)
-- write into the same table — just bump the feature enum.
create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  dso_id uuid not null references public.dsos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  feature text not null check (feature in ('jd_generator')),
  model text not null,
  input_tokens int not null check (input_tokens >= 0),
  output_tokens int not null check (output_tokens >= 0),
  cost_usd_estimate numeric(10,6) not null check (cost_usd_estimate >= 0),
  request_metadata jsonb not null default '{}'::jsonb,
  succeeded boolean not null default true,
  error_message text,
  created_at timestamptz not null default now()
);

-- Composite descending index on (dso_id, feature, created_at desc) covers
-- both per-DSO usage feeds and month-to-date roll-ups (range scan on
-- created_at >= start_of_month). Avoiding a date_trunc functional index
-- because it is not IMMUTABLE for timestamptz.
create index ai_usage_events_dso_feature_idx
  on public.ai_usage_events (dso_id, feature, created_at desc);

alter table public.ai_usage_events enable row level security;

create policy "DSO members read their DSO's AI usage"
  on public.ai_usage_events for select using (
    exists (
      select 1
      from public.dso_users du
      where du.dso_id = ai_usage_events.dso_id
        and du.auth_user_id = auth.uid()
    )
  );

-- INSERT happens via service-role client only (server actions). No public insert policy.
