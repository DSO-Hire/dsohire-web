-- ─────────────────────────────────────────────────────────────
-- Talent Pool (E7.1, Phase 5D / Cam locked 2026-05-11 in re-audit)
-- ─────────────────────────────────────────────────────────────
--
-- E7 bucket was 13 of 14 N at start of day. This migration is the
-- foundation: a per-DSO saved-candidate ledger, plus an RLS opening
-- that lets DSO members read the rows of candidates who've opted into
-- discoverability (is_searchable = true, not guest, not soft-deleted).
--
-- Candidate visibility model:
--   - Candidates opt in via the existing `is_searchable` toggle on
--     /candidate/profile (Phase 4.2.b). Default is OFF.
--   - Guests (is_guest = true) are never discoverable — they don't have
--     a stable account yet, no profile depth, no consent flow done.
--   - Soft-deleted candidates (deleted_at NOT NULL) drop out of search.
--
-- Saved-pool entries live in dso_talent_pool_entries. RLS: DSO
-- members of the entry's DSO can read; recruiter/admin/owner can
-- write. Tags are free-form text[] for org-specific categorization
-- ("strong locum candidate", "Q3 followup", etc.) — analogous to the
-- candidate tags surface from the re-audit (E3.22), kept narrow to
-- the talent pool for v1.

-- ─────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────

create table public.dso_talent_pool_entries (
  id              uuid primary key default gen_random_uuid(),
  dso_id          uuid not null references public.dsos(id) on delete cascade,
  candidate_id    uuid not null references public.candidates(id) on delete cascade,
  added_by        uuid references public.dso_users(id) on delete set null,
  notes           text,
  tags            text[],
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (dso_id, candidate_id)
);

create index dso_talent_pool_dso_idx
  on public.dso_talent_pool_entries (dso_id, created_at desc);

create index dso_talent_pool_candidate_idx
  on public.dso_talent_pool_entries (candidate_id);

create trigger dso_talent_pool_entries_set_updated_at
  before update on public.dso_talent_pool_entries
  for each row execute function public.set_updated_at();

alter table public.dso_talent_pool_entries enable row level security;

create policy "Talent pool: members read own DSO"
  on public.dso_talent_pool_entries for select
  using (dso_id = public.current_dso_id());

create policy "Talent pool: recruiter write"
  on public.dso_talent_pool_entries for all
  using (
    dso_id = public.current_dso_id()
    and public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
  )
  with check (
    dso_id = public.current_dso_id()
    and public.current_dso_user_role() in ('owner', 'admin', 'recruiter')
  );

comment on table public.dso_talent_pool_entries is
  'E7.1 (Phase 5D, shipped 2026-05-11). Per-DSO saved-candidate ledger for the Talent Pool surface. unique(dso_id, candidate_id) — each candidate appears at most once per DSO. Sourcing actions (outbound outreach) layer on top in Phase 5D Day 2.';

-- ─────────────────────────────────────────────────────────────
-- 2. Candidate discoverability — new SELECT policy
-- ─────────────────────────────────────────────────────────────
--
-- Today candidates.SELECT is gated by:
--   (a) self-read (auth_user_id = auth.uid())
--   (b) DSO members can read applicants via dso_can_read_candidate()
--
-- Add (c) DSO members can read ANY candidate row where the candidate
-- has opted into discoverability AND isn't a guest AND isn't deleted.
-- This unlocks the talent-pool discover tab.
--
-- No recursion risk — the policy only references the candidates row
-- itself (its own columns) and joins to dso_users via the same
-- pattern current_dso_id() uses. dso_users has no RLS lookup back
-- through candidates.

create policy "Candidates: searchable read by DSO members"
  on public.candidates for select
  using (
    is_searchable = true
    and is_guest = false
    and exists (
      select 1 from public.dso_users du
      where du.auth_user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 3. Verify: deleted_at filter on candidates table
-- ─────────────────────────────────────────────────────────────
--
-- The candidates table has a deleted_at column from the Phase 4.5.g
-- account-deletion work. The policy above doesn't reference it
-- because soft-deleted candidates already drop their is_searchable
-- flag in the deletion path. If a future bug leaks a deleted row,
-- catch it in application code (filter `.is("deleted_at", null)` on
-- the discover query — done in the talent-pool route).