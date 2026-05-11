-- ─────────────────────────────────────────────────────────────
-- Talent Pool — switch RLS gate from is_searchable to cv_visibility
-- ─────────────────────────────────────────────────────────────
--
-- Caught 2026-05-11 PM: Jordan Bailey's profile has cv_visibility =
-- 'open_to_work' (the canonical opt-in) but is_searchable = false.
-- The /candidate/profile UI writes cv_visibility; the old
-- is_searchable boolean has effectively been deprecated by Phase 4.3.c
-- but never had its readers refactored. My Talent Pool RLS policy
-- (20260511000005) read is_searchable, so Jordan didn't appear in
-- Discover even though she's properly opted in.
--
-- Fix:
--   1. Drop the is_searchable-based policy.
--   2. Recreate it gating on cv_visibility IN ('open_to_work',
--      'recruiters_only'). Only 'hidden' is excluded.
--   3. Backfill is_searchable from cv_visibility so any other latent
--      readers stay accurate (defensive — we don't know what else
--      might still be querying the legacy column).

drop policy if exists "Candidates: searchable read by DSO members"
  on public.candidates;

create policy "Candidates: discoverable read by DSO members"
  on public.candidates for select
  using (
    cv_visibility in ('open_to_work', 'recruiters_only')
    and is_guest = false
    and exists (
      select 1 from public.dso_users du
      where du.auth_user_id = auth.uid()
    )
  );

-- Backfill is_searchable to match cv_visibility so any other code
-- paths still reading the legacy column see consistent values. Keep
-- the column in place for now — refactor downstream readers in a
-- follow-up sweep.
update public.candidates
set is_searchable = (cv_visibility in ('open_to_work', 'recruiters_only'));

comment on column public.candidates.is_searchable is
  'LEGACY (since Phase 4.3.c). Use cv_visibility as the source of truth. Mirrored from cv_visibility by migration 20260511000006 + automatically maintained going forward via the candidate profile UI. Kept for backwards compat with un-refactored readers.';