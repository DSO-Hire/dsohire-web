-- N14 AI interview note-taker — allow the new ai_usage_events feature key.
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
    'practice_fit_narrative',
    'analytics_narrative',
    'scorecard_notetaker'
  ));
