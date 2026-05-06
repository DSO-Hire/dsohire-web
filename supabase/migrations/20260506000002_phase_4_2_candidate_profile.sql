-- ─────────────────────────────────────────────────────────────────────────
-- 20260506000002_phase_4_2_candidate_profile.sql
--
-- Phase 4.2.a of the Parity Sprint (LOCKED 2026-05-06).
-- Canonical scope: Competitive Research/Parity_Sprint_Scope_2026-05-06.md §7.3
--
-- This migration covers the candidate-table column additions for the
-- Phase 4.2 candidate profile rebuild. The four structured profile
-- tables (candidate_work_history / education / licenses / certifications)
-- + parsed_resume_json + last_parsed_at all shipped in the 4.1 foundation
-- migration; this one finishes the candidate row itself.
--
-- Adds (all nullable / safely-defaulted so existing rows survive):
--   • pronouns                       text   — display field
--   • current_location_city/state    text   — structured replacement for
--                                              the freeform location string
--                                              the apply wizard currently
--                                              parses out of typed input
--   • years_experience_dental        int    — dental-specific years (the
--                                              existing `years_experience`
--                                              stays as legacy; 4.2.b form
--                                              will migrate writes to the
--                                              new column and we drop the
--                                              old one in a later cleanup)
--   • cv_visibility                  enum   — Open to Work / Recruiters
--                                              Only (default) / Hidden;
--                                              powers Phase 4.3.d Privacy
--                                              & Visibility tab + future
--                                              Talent Pool browse
--   • desired_specialty              text[] — multi-select chip in 4.2.b
--   • pms_systems                    text[] — Dentrix / Eaglesoft / etc.
--   • skills                         text[] — chip-multiselect
--   • languages                      text[] — ISO English names
--   • temp_or_perm                   text   — CHECK-constrained enum
--   • schedule_preferences           jsonb  — { mon:bool, ..., weekends:bool }
--   • min_salary                     numeric
--   • salary_unit                    text   — hourly / yearly / per_visit
--
-- Plus a new ENUM type:
--   • candidate_visibility = 'hidden' | 'recruiters_only' | 'open_to_work'
--
-- Intentionally NOT in this migration:
--   • photo_url column — `candidates.avatar_url` already exists + is
--     populated by Phase 4.1.a's image-upload primitive. Adding photo_url
--     would create a confusing duplicate. The 4.2.b form keeps writing
--     avatar_url; we treat that as the canonical name.
--   • current_employer_blocked_auto — already shipped on
--     candidate_work_history per Phase 4.1; the candidate row reads from
--     that table rather than caching here.
--   • Drop of the existing `years_experience` column — kept until 4.2.b
--     migrates writes to years_experience_dental; clean up in a follow-up.
--   • Drop of the existing freeform desired_roles handling — the column
--     is already text[]; the issue Cam flagged is at the form layer (UI
--     joins/splits with comma). Fixed in 4.2.b combobox/chip refactor,
--     no schema change required.
--
-- Postgres-enum-two-transaction rule check: this migration uses CREATE
-- TYPE (not ALTER TYPE ADD VALUE), and the new type is referenced as a
-- column type, not as a literal value in a function body or RLS policy.
-- That pattern works in a single transaction because the type and the
-- column referencing it are both committed together.
-- ─────────────────────────────────────────────────────────────────────────

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. New enum: candidate_visibility
--
-- Three-state user-facing visibility (locked in scope §4.3.d):
--   • hidden          — no one can find this candidate via search /
--                       Talent Pool browse. They can still apply to jobs;
--                       application surfaces the candidate to the employer
--                       even when hidden (Q2 redaction applies pre-apply).
--   • recruiters_only — DEFAULT. Authenticated DSO members can find them
--                       in Talent Pool when 4.5 ships, but no public
--                       indexing. Most privacy-positive default that
--                       still allows the marketplace to function.
--   • open_to_work    — explicit signal to prioritize them in Talent
--                       Pool ranking + show an "Open to Work" chip on
--                       their profile.
-- ═════════════════════════════════════════════════════════════════════════

create type candidate_visibility as enum (
  'hidden',
  'recruiters_only',
  'open_to_work'
);


-- ═════════════════════════════════════════════════════════════════════════
-- 2. Column additions on candidates
--
-- All `add column if not exists` so the migration is rerunnable.
-- Defaults are chosen so existing rows stay valid + future writes don't
-- need to populate every field.
-- ═════════════════════════════════════════════════════════════════════════

alter table public.candidates
  add column if not exists pronouns               text,
  add column if not exists current_location_city  text,
  add column if not exists current_location_state text,
  add column if not exists years_experience_dental int,
  add column if not exists cv_visibility          candidate_visibility
    not null default 'recruiters_only',
  add column if not exists desired_specialty      text[] not null default '{}'::text[],
  add column if not exists pms_systems            text[] not null default '{}'::text[],
  add column if not exists skills                 text[] not null default '{}'::text[],
  add column if not exists languages              text[] not null default '{}'::text[],
  add column if not exists temp_or_perm           text,
  add column if not exists schedule_preferences   jsonb  not null default '{}'::jsonb,
  add column if not exists min_salary             numeric,
  add column if not exists salary_unit            text;


-- ═════════════════════════════════════════════════════════════════════════
-- 3. CHECK constraints on temp_or_perm + salary_unit
--
-- These are app-level enums but stored as text so the parser can surface
-- unknowns without a schema migration. CHECK constraints catch anything
-- the form can't legitimately produce. Added as separate ALTERs so they
-- can be dropped + re-added cleanly when the controlled lists evolve.
-- ═════════════════════════════════════════════════════════════════════════

alter table public.candidates
  drop constraint if exists candidates_temp_or_perm_check;
alter table public.candidates
  add constraint candidates_temp_or_perm_check
  check (
    temp_or_perm is null
    or temp_or_perm in ('temp', 'perm', 'either')
  );

alter table public.candidates
  drop constraint if exists candidates_salary_unit_check;
alter table public.candidates
  add constraint candidates_salary_unit_check
  check (
    salary_unit is null
    or salary_unit in ('hourly', 'yearly', 'per_visit', 'per_day')
  );


-- ═════════════════════════════════════════════════════════════════════════
-- 4. Index on cv_visibility for Talent Pool browse (Phase 4.5)
--
-- Partial index excluding 'hidden' rows so the future Talent Pool query
-- doesn't have to filter them out at runtime. 'hidden' candidates only
-- surface via direct application linkage, never via browse.
-- ═════════════════════════════════════════════════════════════════════════

create index if not exists candidates_cv_visibility_idx
  on public.candidates (cv_visibility)
  where cv_visibility <> 'hidden';


-- ═════════════════════════════════════════════════════════════════════════
-- 5. Index on (current_location_state, current_location_city) for the
-- city/state-faceted Talent Pool browse + future state SEO landing pages
-- (`/dentist-jobs-in-texas` etc., Phase 5F Tier 2).
-- ═════════════════════════════════════════════════════════════════════════

create index if not exists candidates_location_idx
  on public.candidates (current_location_state, current_location_city)
  where current_location_state is not null;

commit;

-- ─────────────────────────────────────────────────────────────────────
-- End of Phase 4.2.a migration. Apply via Supabase SQL Editor or
-- `supabase db push`. After applying, run the type regen path
-- (currently manual) to update src/types/database.types.ts.
--
-- Phase 4.2.b builds the section-by-section profile editor that writes
-- to these columns + the existing structured-profile tables.
-- ─────────────────────────────────────────────────────────────────────
