-- ─────────────────────────────────────────────────────────────────────────
-- 20260507000006_phase_5_d_v1_narrative.sql
--
-- Phase 5D v1 — AI narrative layer on top of Practice Fit v0 scores.
--
-- v0 ships the 0-100 score + 6-dimension breakdown + WhyThisMatch
-- expander. v1 adds a warm 2-3 sentence Haiku-generated narrative,
-- audience-framed:
--   • narrative_employer  — "Sarah's KS license + pediatric specialty
--                            match this Topeka role; her preferred
--                            comp range overlaps yours."
--   • narrative_candidate — "Your KS license + pediatric specialty
--                            line up with this Topeka role; the
--                            comp range covers what you said you needed."
--
-- Both are generated in a single Haiku call (one input prompt, two
-- output fields) so we pay for input tokens once. Cached on the row
-- next to the score; regenerates when the structured score changes
-- (input_hash drift) OR when narrative_input_hash drifts independently
-- (e.g. dimension labels change but score doesn't).
--
-- bucket='low' rows skip narrative entirely — a warm narrative on a
-- 32% match reads as apologetic and the dimension breakdown is more
-- useful at that bucket.
--
-- Lazy generation: narrative is only computed when WhyThisMatch is
-- first opened. The action that calls Haiku writes through to these
-- columns; subsequent reads from the same {candidate, job} pair hit
-- the cache.
--
-- RLS unchanged — existing SELECT policies (candidate own, DSO members
-- with consent) cover all columns. Service-role writes through the
-- generator action.
-- ─────────────────────────────────────────────────────────────────────────

begin;

alter table public.practice_fit_scores
  add column narrative_employer       text,
  add column narrative_candidate      text,
  -- SHA-256 hex of the narrative-input snapshot. Independent from
  -- input_hash because the narrative prompt also depends on names,
  -- locations, and dimension labels — not just the dimension scores.
  add column narrative_input_hash     text,
  add column narrative_generated_at   timestamptz;

-- Extend the ai_usage_events.feature CHECK constraint so logAiUsage()
-- can record practice_fit_narrative spend. Pattern matches every
-- previous feature add (drop + recreate the check; it's a TEXT column
-- with a check constraint, not a Postgres enum).
alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_feature_check;

alter table public.ai_usage_events
  add constraint ai_usage_events_feature_check
  check (feature in (
    'jd_generator',
    'rejection_reason',
    'resume_parse',
    'profile_headline',
    'profile_summary',
    'practice_fit_narrative'    -- 5D v1
  ));

commit;
