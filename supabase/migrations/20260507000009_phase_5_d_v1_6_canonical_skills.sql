-- ─────────────────────────────────────────────────────────────────────────
-- 20260507000009_phase_5_d_v1_6_canonical_skills.sql
--
-- Phase 5D v1.6 — canonical SKILLS + BENEFITS vocabulary on both sides
-- of the job board.
--
-- v1.6 in code:
--   • Job wizard + edit-sections now use ChipArrayInput for skills +
--     benefits, drawing from canonical lists in canonical-lists.ts
--     (getAllDentalSkills() + BENEFITS).
--   • Resume parser canonicalizes free-text skills via canonicalizeSkill()
--     before storing on the candidate row, so candidate-side skills
--     enter the canonical vocabulary on import.
--
-- Cache invalidation: existing practice_fit_scores rows were computed
-- against the old free-text job skills, which rarely matched canonical
-- candidate skills. Wiping forces a recompute on next read with the
-- new shared vocabulary, so the skills dimension actually scores
-- meaningfully.
--
-- Same pattern as v1.5's cache wipe (20260507000008). Cheap — pure
-- structured math; narrative regen on first expand is also cheap.
-- ─────────────────────────────────────────────────────────────────────────

begin;

delete from public.practice_fit_scores;

commit;
