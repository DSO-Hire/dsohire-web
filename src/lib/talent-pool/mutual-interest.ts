/**
 * Mutual interest — inbound candidate interest for an employer (v3 Phase D).
 *
 * The other half of discovery: not "who fits this job" (Smart Picks) but "who
 * has shown interest in US." A candidate signals interest by SAVING one of the
 * DSO's jobs (saved_jobs). We surface those candidates with their PracticeFit
 * shown — but NEVER gated on it. Cam's rule: "hate for the right candidate to
 * have a low score, be interested, and we just don't flag it." A low or even
 * unscored fit still appears; the score is context, not a filter.
 *
 * `mutual` = the DSO has ALSO saved this candidate to its talent pool — both
 * sides raised a hand. Those sort first.
 *
 * Privacy: a candidate who merely SAVED a job has not applied, so an
 * anonymous-but-discoverable candidate stays masked here (saving isn't
 * revealing). Masking flows through the same shared helpers every discovery
 * surface uses — see feedback_discovery_surfaces_must_mask_anonymous.
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPracticeFitForJob } from "@/lib/practice-fit/get-or-compute";
import type { FitResult } from "@/lib/practice-fit/types";
import {
  anonymousDisplayLabel,
  getDsoAppliedCandidateIds,
} from "@/lib/candidate/anonymity";
import { getBlockedCandidateIdsForDso } from "@/lib/sourcing/blocklist";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const SAVER_CAP = 100;

export interface InterestedCandidate {
  candidate_id: string;
  full_name: string | null;
  headline: string | null;
  current_title: string | null;
  years_experience: number | null;
  avatar_url: string | null;
  anonymized: boolean;
  /** Most recent job-save timestamp (their latest signal of interest). */
  saved_at: string;
  /** The job they most recently saved (deep-link target). */
  saved_job_id: string;
  saved_job_title: string;
  /** Best PracticeFit across the jobs they saved. Null = role mismatch /
   *  not scorable — shown as "—", NEVER used to filter them out. */
  fit: FitResult | null;
  /** True when this DSO has also saved the candidate — both sides interested. */
  mutual: boolean;
}

export async function getInterestedCandidates(
  supabase: SupabaseClient,
  dsoId: string,
  limit = 6
): Promise<InterestedCandidate[]> {
  if (!dsoId) return [];

  // 1. This DSO's active jobs.
  const { data: jobRows } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("dso_id", dsoId)
    .eq("status", "active")
    .is("deleted_at", null);
  const jobs = (jobRows ?? []) as Array<{ id: string; title: string | null }>;
  if (jobs.length === 0) return [];
  const jobTitleById = new Map(jobs.map((j) => [j.id, j.title ?? "Open role"]));
  const jobIds = jobs.map((j) => j.id);

  // 2. Saves against those jobs (most recent first, bounded).
  const { data: saveRows } = await supabase
    .from("saved_jobs")
    .select("candidate_id, job_id, saved_at")
    .in("job_id", jobIds)
    .order("saved_at", { ascending: false })
    .limit(SAVER_CAP);
  const saves = (saveRows ?? []) as Array<{
    candidate_id: string;
    job_id: string;
    saved_at: string;
  }>;
  if (saves.length === 0) return [];

  // 3. Exclude existing applicants — they're already in the pipeline, where
  //    their interest is fully expressed. This teaser is for the not-yet-applied.
  const { data: appRows } = await supabase
    .from("applications")
    .select("candidate_id")
    .in("job_id", jobIds);
  const applicants = new Set<string>(
    ((appRows ?? []) as Array<{ candidate_id: string }>).map((a) => a.candidate_id)
  );

  // Block-list (Phase 0): candidates who blocked this DSO are excluded. Merged
  // into the skip set so the per-candidate collapse below drops them too.
  for (const id of await getBlockedCandidateIdsForDso(supabase, dsoId)) {
    applicants.add(id);
  }

  // 4. Collapse to one entry per candidate: their most-recent save + the set of
  //    jobs they saved (for best-fit scoring).
  interface Agg {
    saved_at: string;
    saved_job_id: string;
    savedJobIds: Set<string>;
  }
  const byCandidate = new Map<string, Agg>();
  for (const s of saves) {
    if (applicants.has(s.candidate_id)) continue;
    const prior = byCandidate.get(s.candidate_id);
    if (!prior) {
      byCandidate.set(s.candidate_id, {
        saved_at: s.saved_at,
        saved_job_id: s.job_id,
        savedJobIds: new Set([s.job_id]),
      });
    } else {
      prior.savedJobIds.add(s.job_id);
      // saves are saved_at-desc, so the first seen is already the most recent.
    }
  }
  if (byCandidate.size === 0) return [];
  const candidateIds = Array.from(byCandidate.keys());

  // 5. Load eligible, non-hidden candidates (+ anonymity fields).
  const { data: candRows } = await supabase
    .from("candidates")
    .select(
      "id, full_name, headline, current_title, years_experience, avatar_url, anonymous_mode, desired_roles, current_location_city, current_location_state"
    )
    .in("id", candidateIds)
    .in("cv_visibility", ["open_to_work", "recruiters_only"])
    .eq("is_guest", false)
    .is("deleted_at", null);
  const candidates = (candRows ?? []) as Array<{
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
  }>;
  if (candidates.length === 0) return [];
  const eligible = new Set(candidates.map((c) => c.id));

  // 6. Best PracticeFit per candidate across the jobs they saved. Group by job
  //    so each job is scored once for all its savers (cache-aware getter).
  const saversByJob = new Map<string, string[]>();
  for (const [cid, agg] of byCandidate) {
    if (!eligible.has(cid)) continue;
    for (const jid of agg.savedJobIds) {
      const arr = saversByJob.get(jid) ?? [];
      arr.push(cid);
      saversByJob.set(jid, arr);
    }
  }
  const bestFit = new Map<string, FitResult>();
  for (const [jid, cids] of saversByJob) {
    const fits = await getPracticeFitForJob(jid, cids);
    for (const [cid, fit] of fits) {
      const prior = bestFit.get(cid);
      if (!prior || fit.score > prior.score) bestFit.set(cid, fit);
    }
  }

  // 7. Mutual = the DSO already saved this candidate. + anonymity reveal set.
  const { data: poolRows } = await supabase
    .from("dso_talent_pool_entries")
    .select("candidate_id")
    .eq("dso_id", dsoId)
    .in("candidate_id", candidateIds);
  const poolSet = new Set<string>(
    ((poolRows ?? []) as Array<{ candidate_id: string }>).map((p) => p.candidate_id)
  );
  const appliedToDso = await getDsoAppliedCandidateIds(
    supabase,
    dsoId,
    candidateIds
  );

  // 8. Build, mask, sort (mutual first, then most-recent interest).
  const out: InterestedCandidate[] = [];
  for (const c of candidates) {
    const agg = byCandidate.get(c.id);
    if (!agg) continue;
    const masked = Boolean(c.anonymous_mode) && !appliedToDso.has(c.id);
    out.push({
      candidate_id: c.id,
      full_name: masked
        ? anonymousDisplayLabel({
            current_title: c.current_title,
            desired_roles: c.desired_roles,
            current_location_city: c.current_location_city,
            current_location_state: c.current_location_state,
          })
        : c.full_name,
      headline: masked ? null : c.headline,
      current_title: masked ? null : c.current_title,
      years_experience: c.years_experience,
      avatar_url: masked ? null : c.avatar_url,
      anonymized: masked,
      saved_at: agg.saved_at,
      saved_job_id: agg.saved_job_id,
      saved_job_title: jobTitleById.get(agg.saved_job_id) ?? "Open role",
      fit: bestFit.get(c.id) ?? null,
      mutual: poolSet.has(c.id),
    });
  }
  out.sort((a, b) => {
    if (a.mutual !== b.mutual) return a.mutual ? -1 : 1;
    return a.saved_at < b.saved_at ? 1 : a.saved_at > b.saved_at ? -1 : 0;
  });
  return out.slice(0, limit);
}
