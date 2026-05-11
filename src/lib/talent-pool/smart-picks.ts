/**
 * Smart Picks — AI-driven candidate recommendations for a specific job
 * (E7.9 / Phase 5D Day 2, shipped 2026-05-11).
 *
 * For each /employer/jobs/[id] page, pull the opted-in talent-pool
 * candidates that this DSO is allowed to see, score each against the
 * job via the existing Practice Fit infrastructure, and return the
 * top N by score.
 *
 * Scale model: at small candidate counts (< 200 opted-in) we score
 * everyone. Above that, take the 200 most-recently-active candidates
 * (updated_at desc) to keep the per-page-render cost bounded. A
 * background-job cache is a Phase 6+ optimization once volume warrants
 * it.
 *
 * Cross-references: getPracticeFitForJob handles cache reads + stale
 * recompute. Smart Picks doesn't need its own cache — every result is
 * already cached via practice_fit_scores.
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPracticeFitForJob } from "@/lib/practice-fit/get-or-compute";
import type { FitResult } from "@/lib/practice-fit/types";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const CANDIDATE_POOL_CAP = 200;

export interface SmartPick {
  candidate_id: string;
  full_name: string | null;
  headline: string | null;
  current_title: string | null;
  years_experience: number | null;
  avatar_url: string | null;
  fit: FitResult;
  /** True if this DSO has already saved the candidate to its pool. */
  in_pool: boolean;
  pool_entry_id: string | null;
}

/**
 * Returns up to `limit` candidates ranked by Practice Fit score for the
 * given job. Excludes:
 *   - candidates already in a non-terminal stage on this job
 *     (they're "applicants" — show in the kanban, not Smart Picks)
 *   - candidates with cv_visibility = 'hidden'
 *   - guests, soft-deleted
 *
 * Returns empty array when:
 *   - job not found / RLS denies
 *   - no opted-in candidates exist
 *   - none of the scored candidates have a Practice Fit result
 *     (role mismatch is common — Practice Fit v1.1 returns null
 *     when the candidate's desired roles don't include the job role)
 */
export async function getSmartPicks(
  supabase: SupabaseClient,
  jobId: string,
  dsoId: string,
  limit = 5
): Promise<SmartPick[]> {
  // 1. Existing applicants on this job — exclude.
  const { data: existingApps } = await supabase
    .from("applications")
    .select("candidate_id")
    .eq("job_id", jobId);
  const excludedCandidateIds = new Set<string>(
    ((existingApps ?? []) as Array<{ candidate_id: string }>).map(
      (a) => a.candidate_id
    )
  );

  // 2. Opted-in candidates, capped, most-recently-active first.
  let q = supabase
    .from("candidates")
    .select(
      "id, full_name, headline, current_title, years_experience, avatar_url"
    )
    .in("cv_visibility", ["open_to_work", "recruiters_only"])
    .eq("is_guest", false)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(CANDIDATE_POOL_CAP);
  // Exclude existing applicants in-query when there are few enough IDs;
  // PostgREST's `not.in` accepts up to ~2K comma-separated values, but
  // we cap to 100 to avoid URL length issues. Past that, filter in-memory.
  const excludeArr = Array.from(excludedCandidateIds);
  if (excludeArr.length > 0 && excludeArr.length <= 100) {
    q = q.not("id", "in", `(${excludeArr.join(",")})`);
  }
  const { data: candRows } = await q;
  const candidates =
    ((candRows ?? []) as Array<{
      id: string;
      full_name: string | null;
      headline: string | null;
      current_title: string | null;
      years_experience: number | null;
      avatar_url: string | null;
    }>).filter((c) => !excludedCandidateIds.has(c.id));
  if (candidates.length === 0) return [];

  // 3. Score them all via the existing bulk getter (cache-aware).
  const candidateIds = candidates.map((c) => c.id);
  const fitsByCandidate = await getPracticeFitForJob(jobId, candidateIds);
  if (fitsByCandidate.size === 0) return [];

  // 4. Existing pool entries to mark which picks are already saved.
  const { data: poolEntries } = await supabase
    .from("dso_talent_pool_entries")
    .select("id, candidate_id")
    .eq("dso_id", dsoId)
    .in(
      "candidate_id",
      Array.from(fitsByCandidate.keys())
    );
  const poolByCandidate = new Map<string, string>();
  for (const e of (poolEntries ?? []) as Array<{
    id: string;
    candidate_id: string;
  }>) {
    poolByCandidate.set(e.candidate_id, e.id);
  }

  // 5. Build + sort picks.
  const picks: SmartPick[] = [];
  for (const cand of candidates) {
    const fit = fitsByCandidate.get(cand.id);
    if (!fit) continue;
    picks.push({
      candidate_id: cand.id,
      full_name: cand.full_name,
      headline: cand.headline,
      current_title: cand.current_title,
      years_experience: cand.years_experience,
      avatar_url: cand.avatar_url,
      fit,
      in_pool: poolByCandidate.has(cand.id),
      pool_entry_id: poolByCandidate.get(cand.id) ?? null,
    });
  }
  picks.sort((a, b) => b.fit.score - a.fit.score);
  return picks.slice(0, limit);
}
