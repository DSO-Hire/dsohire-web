-- Extend ai_usage_events.feature to allow the rejection_reason feature.
-- Future AI features extend this enum the same way.
alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_feature_check;

alter table public.ai_usage_events
  add constraint ai_usage_events_feature_check
  check (feature in ('jd_generator', 'rejection_reason'));
