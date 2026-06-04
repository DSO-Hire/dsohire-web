-- PracticeFit v3 Phase B.1 — the EMPLOYER mirror of the candidate assessment's
-- work-style / culture signals, at the practice (DSO) level. These let the
-- scoring engine compare what a candidate wants (from their assessment) against
-- what a practice offers. All nullable + no defaults: a practice that hasn't
-- filled its profile simply leaves these dimensions UNSCORED (excluded from the
-- denominator, never a penalty) — same "missing data drops from the
-- denominator" rule the rest of the engine follows.
--
-- Vocab deliberately mirrors the candidate columns so the engine can compare
-- directly:
--   practice_pace        ↔ candidates.work_pace        (high_volume|steady|thorough)
--   autonomy_level       ↔ candidates.autonomy_pref    (autonomy|balance|structure)
--   mentorship_offered   ↔ candidates.mentorship_pref  (strong|occasional|independent)
--   practice_feel        ↔ candidates.practice_feel    (private|midsize|large)
--   ce_support (1-5)     ↔ candidates.ce_growth_importance (desire vs provision)
--   work_life_balance    ↔ candidates.work_life_priority   (desire vs provision)
-- (practice_feel also derives from location_count when left blank, so it can
--  score even before a practice fills the profile.)

alter table public.dsos
  add column if not exists practice_pace text,
  add column if not exists autonomy_level text,
  add column if not exists mentorship_offered text,
  add column if not exists practice_feel text,
  add column if not exists ce_support smallint,
  add column if not exists work_life_balance smallint,
  add column if not exists practice_profile_completed_at timestamptz;
