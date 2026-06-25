-- Consent-based candidate privacy (Option 3): private by default.
--
-- A new candidate previously defaulted to cv_visibility='recruiters_only' and
-- showed in the employer Talent Pool with their real name without ever making
-- a deliberate choice. We move to private-by-default: candidates are 'hidden'
-- and become discoverable only when they explicitly choose (via the first-run
-- visibility step at /candidate/welcome/visibility, or settings/privacy).
-- Employers then see names only for candidates who opted in.
--
-- Defense in depth lives at the app layer (Discover / Smart Picks / mutual-
-- interest also exclude privacy_choices_reviewed_at IS NULL) and at RLS (the
-- "discoverable read by DSO members" policy already requires cv_visibility IN
-- (open_to_work, recruiters_only)); this migration just makes the *default*
-- honest so an un-chosen candidate is never silently discoverable.

-- 1) New candidates are private until they choose.
alter table public.candidates
  alter column cv_visibility set default 'hidden';

-- 2) Honest backfill: anyone who never made a deliberate privacy choice
--    (privacy_choices_reviewed_at is null) becomes private. They re-opt-in via
--    the first-run step. Candidates who DID review keep their chosen value.
update public.candidates
   set cv_visibility = 'hidden'
 where privacy_choices_reviewed_at is null
   and cv_visibility <> 'hidden';
