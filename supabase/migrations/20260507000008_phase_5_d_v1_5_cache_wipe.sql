-- ─────────────────────────────────────────────────────────────────────────
-- 20260507000008_phase_5_d_v1_5_cache_wipe.sql
--
-- Phase 5D v1.5 — practice_fit_scores cache wipe.
--
-- v1.3 added two new fields to the per-dimension shape inside the
-- `dimensions` jsonb column:
--   • detail_employer  — third-person voice for the employer audience
--   • cta_inline       — flag that makes the candidate-side row render
--                        an inline mini-editor instead of a link-out CTA
--
-- v1.3 didn't include a cache wipe because the input_hash formula is
-- unchanged — but v1.3 readers still expected the new fields, and old
-- cached rows don't have them. Symptoms in production:
--   • Employer side reads candidate-voice copy ("You haven't set...")
--     because detail_employer is undefined and the renderer falls through
--   • Candidate-side excluded dims keep showing the link-out "Set
--     preference" button instead of the inline editor (cta_inline is
--     undefined → falsy → link path)
--
-- Fix: clear the cache. Recompute happens lazily on next read of any
-- candidate × job pair via getPracticeFit / getPracticeFitForJob, with
-- the v1.3 dim shape.
--
-- Same pattern as v1.1's cache wipe (20260507000007). Cheap — the
-- compute is structured math, no AI cost. Narrative regeneration on
-- expand is also cheap (~$0.002 per pair).
-- ─────────────────────────────────────────────────────────────────────────

begin;

delete from public.practice_fit_scores;

commit;
