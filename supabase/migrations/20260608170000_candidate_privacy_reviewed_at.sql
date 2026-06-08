-- #92 (Day 28, 2026-06-08) — explicit "the candidate reviewed their
-- privacy/matching choices" signal.
--
-- Problem: the candidate onboarding checklist pre-completed the "Set your
-- profile visibility" and "Choose your PracticeFit matching setting" steps
-- the instant the account existed, because their `done` was inferred from
-- cv_visibility / practice_fit_consent — which both carry a DEFAULT. A
-- default existing is NOT the user having decided, and for visibility that's
-- privacy-adjacent (we implied a discoverability choice they never saw).
--
-- Fix: stamp this column when the candidate actually SAVES the privacy
-- settings page; the onboarding steps key off it. The default still applies
-- silently underneath — we just stop pre-checking the box. Nullable +
-- additive, so existing rows are unaffected (they read as "not yet reviewed").

alter table public.candidates
  add column if not exists privacy_choices_reviewed_at timestamptz;

comment on column public.candidates.privacy_choices_reviewed_at is
  'When the candidate explicitly saved their privacy/matching settings. Onboarding keys the visibility + PracticeFit-matching steps off this so a default never pre-checks them (#92, Day 28).';
