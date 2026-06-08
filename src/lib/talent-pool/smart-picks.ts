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
import {
  anonymousDisplayLabel,
  getDsoAppliedCandidateIds,
} from "@/lib/candidate/anonymity";

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
  /**
   * True when the candidate is in anonymous-but-discoverable mode and hasn't
   * applied to one of this DSO's jobs — name/photo are masked. The rule is
   * `anonymous_mode && !appliedToThisDso` (see lib/candidate/anonymity). This
   * was a leak before v3 Phase C: Smart Picks rendered the real name on the
   * job page; the dashboard "Today's 3" would have amplified it.
   */
  anonymized: boolean;
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
      "id, full_name, headline, current_title, years_experience, avatar_url, anonymous_mode, desired_roles, current_location_city, current_location_state"
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
      anonymous_mode: boolean | null;
      desired_roles: string[] | null;
      current_location_city: string | null;
      current_location_state: string | null;
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

  // 4b. Anonymity gate — which of the scored candidates have applied to one
  // of this DSO's jobs? Those are de-masked; the rest in anonymous_mode stay
  // masked (name + photo hidden) on this discovery surface.
  const appliedToDso = await getDsoAppliedCandidateIds(
    supabase,
    dsoId,
    Array.from(fitsByCandidate.keys())
  );

  // 5. Build + sort picks.
  const picks: SmartPick[] = [];
  for (const cand of candidates) {
    const fit = fitsByCandidate.get(cand.id);
    if (!fit) continue;
    const masked =
      Boolean(cand.anonymous_mode) && !appliedToDso.has(cand.id);
    picks.push({
      candidate_id: cand.id,
      full_name: masked
        ? anonymousDisplayLabel({
            current_title: cand.current_title,
            desired_roles: cand.desired_roles,
            current_location_city: cand.current_location_city,
            current_location_state: cand.current_location_state,
          })
        : cand.full_name,
      headline: masked ? null : cand.headline,
      current_title: masked ? null : cand.current_title,
      years_experience: cand.years_experience,
      avatar_url: masked ? null : cand.avatar_url,
      fit,
      in_pool: poolByCandidate.has(cand.id),
      pool_entry_id: poolByCandidate.get(cand.id) ?? null,
      anonymized: masked,
    });
  }
  picks.sort((a, b) => b.fit.score - a.fit.score);
  return picks.slice(0, limit);
}

/* ──────────────────────────────────────────────────────────────
 * "Today's top fits" — the cross-job dashboard roll-up (v3 Phase C).
 *
 * The per-job version (getSmartPicks) is rendered on each job page. This
 * aggregates across all of a DSO's open jobs and returns the single best fit
 * per candidate (deduped to their strongest-matched role), so the employer
 * dashboard can show "your N best-fit candidates today" at a glance. It reuses
 * getSmartPicks per job, so the anonymity masking + eligibility rules are
 * inherited — no separate privacy path to keep in sync.
 * ─────────────────────────────────────────────────────────── */

const JOB_SCAN_CAP = 12;

export interface TodaysTopFit extends SmartPick {
  /** The DSO job this candidate fits best (their highest score across roles). */
  best_job_id: string;
  best_job_title: string;
  /** v3 Phase D — true if this candidate has also SAVED one of the DSO's jobs
   *  (mutual interest: you rank them high AND they've raised a hand). */
  interested: boolean;
}

export async function getTodaysTopFits(
  supabase: SupabaseClient,
  dsoId: string,
  limit = 3
): Promise<TodaysTopFit[]> {
  if (!dsoId) return [];

  // The DSO's most recently posted open jobs (bounded for per-render cost).
  const { data: jobRows } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("dso_id", dsoId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(JOB_SCAN_CAP);
  const jobs = (jobRows ?? []) as Array<{ id: string; title: string | null }>;
  if (jobs.length === 0) return [];

  // Score each job's pool, then keep each candidate's single best match.
  // #107 perf (Day 28) — score all jobs CONCURRENTLY (was a sequential await
  // per job, up to JOB_SCAN_CAP). Promise.all preserves input order, and the
  // merge below only replaces on a strictly-higher score, so tie-breaking and
  // final results are identical to the serial version — just faster.
  const bestByCandidate = new Map<string, TodaysTopFit>();
  const perJob = await Promise.all(
    jobs.map(async (job) => ({
      job,
      picks: await getSmartPicks(supabase, job.id, dsoId, 5),
    }))
  );
  for (const { job, picks } of perJob) {
    for (const p of picks) {
      const prior = bestByCandidate.get(p.candidate_id);
      if (!prior || p.fit.score > prior.fit.score) {
        bestByCandidate.set(p.candidate_id, {
          ...p,
          best_job_id: job.id,
          best_job_title: job.title ?? "Open role",
          interested: false, // set below
        });
      }
    }
  }

  const top = Array.from(bestByCandidate.values())
    .sort((a, b) => b.fit.score - a.fit.score)
    .slice(0, limit);
  if (top.length === 0) return top;

  // v3 Phase D — flag the ones who've also saved a job here (mutual interest).
  const { data: saveRows } = await supabase
    .from("saved_jobs")
    .select("candidate_id")
    .in("job_id", jobs.map((j) => j.id))
    .in(
      "candidate_id",
      top.map((t) => t.candidate_id)
    );
  const interestedSet = new Set<string>(
    ((saveRows ?? []) as Array<{ candidate_id: string }>).map((s) => s.candidate_id)
  );
  for (const t of top) t.interested = interestedSet.has(t.candidate_id);
  return top;
}
