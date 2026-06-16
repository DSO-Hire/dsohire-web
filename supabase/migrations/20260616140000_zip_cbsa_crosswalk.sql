-- ZIP → CBSA (metro) crosswalk for metro-level "Your market" resolution.
-- Dominant CBSA per ZIP (HUD USPS ZIP-CBSA, highest residential ratio).
-- Reference data; loaded out-of-band (CSV import). Rural ZIPs (no CBSA)
-- are simply absent → resolver falls back to state.
create table if not exists public.zip_cbsa (
  zip text primary key,
  cbsa text not null
);
comment on table public.zip_cbsa is
  'ZIP → dominant CBSA (metro) crosswalk from HUD USPS ZIP-CBSA. Powers metro-level Your market. Rural ZIPs absent by design.';
alter table public.zip_cbsa enable row level security;
drop policy if exists "zip_cbsa readable by all" on public.zip_cbsa;
create policy "zip_cbsa readable by all" on public.zip_cbsa for select using (true);
