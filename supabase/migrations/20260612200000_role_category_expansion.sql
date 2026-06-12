-- #77 — practice-level role expansion (Day 33, 2026-06-12).
-- Taxonomy locked in DSOFit_Spec_2026-06-09.md:
--   clinical: dental therapist, sterilization tech, dental lab tech
--   admin:    treatment / financial / scheduling coordinators,
--             practice administrator
-- "Associate Dentist" → "Dentist" is a LABEL change only — the stored
-- enum value 'dentist' already says the right thing.
--
-- ALTER TYPE ... ADD VALUE per the proven #71 pattern: additive only,
-- in its own migration, values not referenced in this same migration.
-- Existing values untouched (no table rewrite, no downtime).

alter type role_category add value if not exists 'dental_therapist';
alter type role_category add value if not exists 'sterilization_tech';
alter type role_category add value if not exists 'lab_tech';
alter type role_category add value if not exists 'treatment_coordinator';
alter type role_category add value if not exists 'financial_coordinator';
alter type role_category add value if not exists 'scheduling_coordinator';
alter type role_category add value if not exists 'practice_administrator';
