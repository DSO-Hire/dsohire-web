-- PracticeFit v3.1 (2026-06-05) — patient-population practice mirror.
--
-- The employer side of the candidate assessment's "which patients do you most
-- enjoy caring for?" signal. The candidate stores patient_population_pref
-- (candidates, shipped in 20260605120000); this is the practice's mirror —
-- the populations it serves. The scoring engine leaves the patient_population
-- dimension UNSCORED until BOTH sides have data (never a penalty), exactly
-- like the Phase B.1 culture dims. Additive, nullable/defaulted; no scoring
-- math changes for existing data.

alter table public.dsos
  add column if not exists patient_populations text[] not null default '{}'::text[];
