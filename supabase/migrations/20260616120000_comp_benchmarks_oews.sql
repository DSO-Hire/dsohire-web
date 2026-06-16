-- "Your market" comp reference data (BLS OEWS). Public, non-sensitive
-- reference figures keyed by (area, SOC, pay unit). Populated by the
-- out-of-band loader script (scripts/load-oews.mjs) from the BLS OEWS
-- bulk files — never hand-seeded with unverified numbers.
create table if not exists public.comp_benchmarks (
  id uuid primary key default gen_random_uuid(),
  area_level text not null check (area_level in ('national','state','metro')),
  area_code text not null,            -- 'US' | 2-letter state | MSA code
  area_name text not null,            -- display name
  soc_code text not null,             -- e.g. '29-1292'
  pay_unit text not null check (pay_unit in ('hourly','annual')),
  p25 numeric,
  p50 numeric,
  p75 numeric,
  vintage text not null,              -- e.g. 'May 2025'
  source text not null default 'BLS OEWS',
  updated_at timestamptz not null default now(),
  unique (area_level, area_code, soc_code, pay_unit)
);

comment on table public.comp_benchmarks is
  'BLS OEWS wage percentiles by area + SOC + pay unit. Reference data for the candidate "Your market" card. Loaded out-of-band from BLS bulk files; honest floor in app shows nothing when a cell is absent.';

create index if not exists comp_benchmarks_lookup_idx
  on public.comp_benchmarks (soc_code, area_level, area_code, pay_unit);

alter table public.comp_benchmarks enable row level security;

-- Reference data: readable by anyone (authed or anon). Writes are
-- service-role only (no write policy → blocked for normal clients).
drop policy if exists "comp_benchmarks readable by all" on public.comp_benchmarks;
create policy "comp_benchmarks readable by all"
  on public.comp_benchmarks for select
  using (true);
