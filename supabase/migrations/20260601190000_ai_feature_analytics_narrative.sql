-- Analytics Phase 4 (2026-06-01) — allow the 'analytics_narrative' AI feature
-- (the "what changed and why" summary on the analytics hub) so its usage rows
-- pass the ai_usage_events feature CHECK. Additive value only.

alter table public.ai_usage_events drop constraint if exists ai_usage_events_feature_check;
alter table public.ai_usage_events add constraint ai_usage_events_feature_check
  check (feature = any (array[
    'jd_generator','rejection_reason','resume_parse','profile_headline',
    'profile_summary','practice_fit_narrative','analytics_narrative'
  ]::text[]));
