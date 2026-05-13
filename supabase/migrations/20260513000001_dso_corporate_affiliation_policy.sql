-- ═════════════════════════════════════════════════════════════════════════
-- 20260513000001 — DSO corporate-affiliation policy
-- ═════════════════════════════════════════════════════════════════════════
--
-- 5G.a addendum (Cam direction 2026-05-13). Adds an orthogonal policy to
-- the existing affiliation_reveal_policy: how to resolve the corporate
-- name on jobs that have no anchor location (typically scope='corporate'
-- postings — a CFO or DSO HQ role with no specific practice attached).
--
-- The original 5G.a JD-generator fix walked the DSO's entire location
-- set and exposed the DSO name only if ALL locations were public-
-- affiliated. That's the "strict" default — matches the legal-shield
-- posture (err on the side of less risk). Some DSOs may legitimately
-- want corporate-name exposure on corporate-level postings even when
-- they have privately-affiliated locations in their portfolio (e.g.
-- Heartland publicly hires a CFO under the Heartland brand even though
-- many acquired practices keep their original names).
--
-- Policy values:
--   • 'strict' (DEFAULT) — corporate-scope job postings mask the DSO
--     name to a generic ("the company") whenever ANY DSO location is
--     privately affiliated. Most-private-inherits, extended to the
--     0-location / corporate-scope case.
--   • 'permissive' — corporate-scope job postings expose the DSO name
--     as long as at least one location is publicly affiliated. The DSO
--     has explicitly opted into using its corporate name on corporate
--     postings. Recruiter override; doesn't affect per-job affiliation
--     where a location is selected.
--
-- DOES NOT affect:
--   • affiliation_reveal_policy — that controls candidate-facing
--     surfaces (inbox, dashboard) for HIRED candidates at private
--     locations. Orthogonal to this policy.
--   • Per-location `public_dso_affiliation` — still the canonical
--     per-practice setting for jobs WITH locations.
--   • Per-job affiliation for scope='location' or 'regional' jobs with
--     ≥1 location — those follow the existing most-private-inherits rule
--     unchanged.

alter table public.dsos
  add column if not exists corporate_affiliation_policy text
    not null default 'strict';

alter table public.dsos
  drop constraint if exists dsos_corporate_affiliation_policy_check;

alter table public.dsos
  add constraint dsos_corporate_affiliation_policy_check
  check (corporate_affiliation_policy in ('strict', 'permissive'));

comment on column public.dsos.corporate_affiliation_policy is
  '5G.a addendum (2026-05-13). For corporate-scope jobs with no anchor location: strict masks the DSO name when any location is privately affiliated; permissive exposes it when at least one location is publicly affiliated. Default strict per legal-shield posture.';
