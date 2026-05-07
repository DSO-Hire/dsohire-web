-- ─────────────────────────────────────────────────────────────────────────
-- 20260507000005_phase_5_d_practice_fit.sql
--
-- Phase 5D — Practice Fit (proprietary AI-derived match score).
-- Locked direction: Cam picked Option A 2026-05-05 — proprietary,
-- no DISC licensing. v0 ships structured-feature scoring (zero AI cost,
-- fully explainable); a later sub-phase layers semantic AI on top.
--
-- Table caches the 0-100 score + bucket + per-dimension breakdown so
-- repeat reads (kanban refresh, candidate revisits a job) don't
-- recompute every time. The compute function recomputes when
-- `input_hash` differs from the candidate or job's current state, OR
-- when computed_at is older than 7 days (catches the case where a
-- factor we don't yet hash changes).
--
-- RLS:
--   • Candidate: SELECT their own (always — it's their own data).
--   • DSO members: SELECT for jobs in their DSO ONLY when the
--     candidate has practice_fit_consent != 'off'. Wrapped in a
--     SECURITY DEFINER helper to avoid recursion through candidates RLS.
--   • INSERT/UPDATE: service-role only — the compute function uses
--     createSupabaseServiceRoleClient(). No user-facing INSERT path.
-- ─────────────────────────────────────────────────────────────────────────

begin;

create table public.practice_fit_scores (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid not null references public.candidates(id) on delete cascade,
  job_id        uuid not null references public.jobs(id) on delete cascade,
  -- 0-100 overall score; bucket is the user-facing label.
  score         int  not null check (score >= 0 and score <= 100),
  bucket        text not null check (
    bucket in ('excellent','strong','solid','light','low')
  ),
  -- Per-dimension breakdown:
  --   { role: { weight, raw, contribution, label, detail }, ... }
  dimensions    jsonb not null default '{}'::jsonb,
  -- Top 3 dimension keys ordered by contribution desc — drives the
  -- "Why this match" expander without re-sorting on the client.
  top_factors   text[] not null default '{}'::text[],
  -- SHA-256 of the canonical input snapshot. Recompute when this differs.
  input_hash    text not null,
  computed_at   timestamptz not null default now(),
  unique (candidate_id, job_id)
);

create index practice_fit_scores_candidate_idx
  on public.practice_fit_scores (candidate_id);

-- (job_id, score desc) — powers the future "top fits per job" Talent
-- Pool browse without an expensive sort.
create index practice_fit_scores_job_score_idx
  on public.practice_fit_scores (job_id, score desc);

alter table public.practice_fit_scores enable row level security;


-- ═════════════════════════════════════════════════════════════════════════
-- 1. Candidate self-read
-- ═════════════════════════════════════════════════════════════════════════

create policy "Candidates read own fit scores"
  on public.practice_fit_scores for select
  to authenticated
  using (
    candidate_id in (
      select id from public.candidates where auth_user_id = auth.uid()
    )
  );


-- ═════════════════════════════════════════════════════════════════════════
-- 2. DSO members read scores for their jobs (consent-gated)
--
-- Wrapped in a SECURITY DEFINER helper to mirror the established
-- pattern from 20260506000009 — avoids recursion through any future
-- candidates RLS policy that joins back to scores or applications.
-- ═════════════════════════════════════════════════════════════════════════

create or replace function public.dso_can_read_fit_score(
  p_candidate_id uuid,
  p_job_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.jobs j
    join public.dso_users du on du.dso_id = j.dso_id
    join public.candidates c on c.id = p_candidate_id
    where j.id = p_job_id
      and du.auth_user_id = auth.uid()
      and c.practice_fit_consent <> 'off'
  );
$$;

grant execute on function public.dso_can_read_fit_score(uuid, uuid) to authenticated;

create policy "DSO members read fit scores for their jobs"
  on public.practice_fit_scores for select
  to authenticated
  using (public.dso_can_read_fit_score(candidate_id, job_id));


-- No INSERT/UPDATE/DELETE policies — service-role bypasses RLS for
-- the compute path. Users never write directly.

grant select on public.practice_fit_scores to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────
-- After applying:
--   • src/lib/practice-fit/compute.ts owns the scoring math.
--   • src/lib/practice-fit/get-or-compute.ts is the cache-aware getter
--     used by every UI surface. It uses the service-role client to
--     upsert when the cache misses.
--   • Consent enforcement is BOTH at the RLS layer AND in the UI render
--     gate — RLS is the source of truth; UI checks save a round trip
--     when consent is 'off'.
-- ─────────────────────────────────────────────────────────────────────
