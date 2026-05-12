-- ─────────────────────────────────────────────────────────────────────
-- 20260512000007_fix_candidate_withdraw_rls.sql
--
-- Hotfix for Track B aftermath (third one of the afternoon).
--
-- The "Applications: candidate withdraw" RLS policy from
-- 20260512000002_pipeline_stages.sql has a fatal scope bug:
--
--   create policy "Applications: candidate withdraw"
--     on public.applications for update
--     using (...candidate-match...)
--     with check (
--       ...candidate-match...
--       and exists (
--         select 1 from public.dso_pipeline_stages s
--         where s.id = stage_id and s.kind = 'withdrawn'  -- ← broken
--       )
--     );
--
-- The EXISTS subquery runs under the candidate's RLS context.
-- `dso_pipeline_stages` has a DSO-only SELECT policy:
--
--   using (dso_id = public.current_dso_id())
--
-- Candidates aren't DSO members → can't see those rows → subquery
-- returns nothing → WITH CHECK fails → update denied. The candidate
-- withdraw flow is completely broken until this lands.
--
-- Fix: route the kind lookup through a SECURITY DEFINER helper
-- function that bypasses RLS for the specific "is this stage a
-- withdrawn-kind stage?" check. The helper is narrowly scoped to a
-- single boolean — no broader privilege leak.
-- ─────────────────────────────────────────────────────────────────────

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. SECURITY DEFINER helper
-- ═════════════════════════════════════════════════════════════════════════

create or replace function public.is_kind_stage(
  p_stage_id uuid,
  p_kind     text
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.dso_pipeline_stages
     where id = p_stage_id and kind = p_kind
  );
$$;

grant execute on function public.is_kind_stage(uuid, text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 2. Recreate the candidate withdraw policy using the helper
-- ═════════════════════════════════════════════════════════════════════════

drop policy if exists "Applications: candidate withdraw" on public.applications;

create policy "Applications: candidate withdraw"
  on public.applications for update
  using (
    exists (
      select 1 from public.candidates c
      where c.id = candidate_id and c.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.candidates c
      where c.id = candidate_id and c.auth_user_id = auth.uid()
    )
    and public.is_kind_stage(stage_id, 'withdrawn')
  );

commit;
