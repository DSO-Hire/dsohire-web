-- Analytics Phase 3 — dental wage benchmark reference table (2026-06-01).
--
-- Public, dated reference data (BLS OEWS May 2025, released 2026-05-15) powering
-- the "your pay vs. market" bullet charts. Dated + sourced rows so refreshing
-- to a new OEWS vintage is an insert, never a code change. Read-only to the app;
-- seeded here. NOT DSO-specific → readable by all.

create table if not exists public.wage_benchmarks (
  id            uuid primary key default gen_random_uuid(),
  role_category text not null,          -- dentist | dental_hygienist | dental_assistant
  scope         text not null check (scope in ('national', 'state')),
  state         text,                   -- USPS code for scope='state', null for national
  median_hourly numeric,
  median_annual numeric,
  mean_hourly   numeric,
  mean_annual   numeric,
  source        text not null,          -- e.g. 'bls_oews'
  vintage       text not null,          -- e.g. 'May 2025'
  created_at    timestamptz not null default now()
);

create unique index if not exists wage_benchmarks_key
  on public.wage_benchmarks (role_category, scope, coalesce(state, ''));

alter table public.wage_benchmarks enable row level security;

create policy "Wage benchmarks: readable by all"
  on public.wage_benchmarks for select
  using (true);

-- ── National (BLS OEWS May 2025) ──
insert into public.wage_benchmarks
  (role_category, scope, state, median_hourly, median_annual, mean_hourly, mean_annual, source, vintage)
values
  ('dentist',          'national', null, 82.19, 170950, 91.99, 191350, 'bls_oews', 'May 2025'),
  ('dental_hygienist', 'national', null, 47.16,  98100, 47.59,  98990, 'bls_oews', 'May 2025'),
  ('dental_assistant', 'national', null, 23.11,  48070, 24.13,  50200, 'bls_oews', 'May 2025')
on conflict do nothing;

-- ── State median hourly (BLS OEWS May 2025) — hygienist + assistant ──
insert into public.wage_benchmarks
  (role_category, scope, state, median_hourly, source, vintage)
values
  ('dental_hygienist', 'state', 'CA', 60.06, 'bls_oews', 'May 2025'),
  ('dental_hygienist', 'state', 'TX', 47.71, 'bls_oews', 'May 2025'),
  ('dental_hygienist', 'state', 'FL', 44.22, 'bls_oews', 'May 2025'),
  ('dental_hygienist', 'state', 'NY', 51.03, 'bls_oews', 'May 2025'),
  ('dental_hygienist', 'state', 'IL', 46.48, 'bls_oews', 'May 2025'),
  ('dental_hygienist', 'state', 'PA', 38.76, 'bls_oews', 'May 2025'),
  ('dental_hygienist', 'state', 'OH', 42.78, 'bls_oews', 'May 2025'),
  ('dental_hygienist', 'state', 'GA', 45.91, 'bls_oews', 'May 2025'),
  ('dental_hygienist', 'state', 'NC', 47.04, 'bls_oews', 'May 2025'),
  ('dental_hygienist', 'state', 'AZ', 48.56, 'bls_oews', 'May 2025'),
  ('dental_hygienist', 'state', 'MO', 44.59, 'bls_oews', 'May 2025'),
  ('dental_hygienist', 'state', 'WA', 63.06, 'bls_oews', 'May 2025'),
  ('dental_hygienist', 'state', 'CO', 52.68, 'bls_oews', 'May 2025'),
  ('dental_assistant', 'state', 'CA', 24.09, 'bls_oews', 'May 2025'),
  ('dental_assistant', 'state', 'TX', 21.84, 'bls_oews', 'May 2025'),
  ('dental_assistant', 'state', 'FL', 22.89, 'bls_oews', 'May 2025'),
  ('dental_assistant', 'state', 'NY', 23.13, 'bls_oews', 'May 2025'),
  ('dental_assistant', 'state', 'IL', 23.37, 'bls_oews', 'May 2025'),
  ('dental_assistant', 'state', 'PA', 23.05, 'bls_oews', 'May 2025'),
  ('dental_assistant', 'state', 'OH', 23.06, 'bls_oews', 'May 2025'),
  ('dental_assistant', 'state', 'GA', 22.52, 'bls_oews', 'May 2025'),
  ('dental_assistant', 'state', 'NC', 24.22, 'bls_oews', 'May 2025'),
  ('dental_assistant', 'state', 'AZ', 23.56, 'bls_oews', 'May 2025'),
  ('dental_assistant', 'state', 'MO', 22.10, 'bls_oews', 'May 2025'),
  ('dental_assistant', 'state', 'WA', 27.93, 'bls_oews', 'May 2025'),
  ('dental_assistant', 'state', 'CO', 23.24, 'bls_oews', 'May 2025')
on conflict do nothing;

comment on table public.wage_benchmarks is
  'Analytics Phase 3 (2026-06-01). Dated, sourced dental wage benchmarks (BLS OEWS May 2025) for the "your pay vs market" feature. Read-only reference data; refresh = new dated insert.';
