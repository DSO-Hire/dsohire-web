-- Collect candidate ZIP (postal) code. Unlocks metro-level "Your market"
-- comp (ZIP→CBSA) + sharper location matching. Optional, low-friction.
alter table public.candidates add column if not exists current_location_zip text;
comment on column public.candidates.current_location_zip is
  '5-digit US ZIP for metro-level comp + location matching. Optional.';
