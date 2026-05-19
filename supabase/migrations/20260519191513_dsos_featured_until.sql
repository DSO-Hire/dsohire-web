-- ============================================================
-- Add featured_until timestamp to dsos for the /companies spotlight slot.
-- ============================================================
-- Sets up the directory "Featured DSO" spotlight + serves as the
-- foundation for the Spotlight Credits revenue lever (memory:
-- project_spotlight_credits_feature_brainstorm.md, design fully locked,
-- build gated on trigger conditions).
--
-- A DSO is featured when featured_until is in the future. Past-dated
-- values are treated as not-featured so credits can expire naturally
-- without a separate cleanup job.
-- ============================================================

alter table public.dsos
  add column if not exists featured_until timestamptz;

comment on column public.dsos.featured_until is
  'When set + in the future, the DSO renders in the /companies spotlight slot. Powers the Spotlight Credits feature (deferred per memory).';

-- Partial index on featured_until IS NOT NULL — keeps the index small
-- (only featured DSOs are indexed). The "in future" check happens at
-- query time; can't be in the index predicate because now() is volatile.
create index if not exists dsos_featured_until_idx
  on public.dsos (featured_until)
  where featured_until is not null;
