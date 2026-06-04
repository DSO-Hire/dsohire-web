/**
 * "Roles that fit you" — candidate-side ranked job feed (Phase B.1).
 *
 * The inverse of Smart Picks: for a signed-in candidate, score recent open
 * jobs against THEIR PracticeFit and return the top matches. Because the
 * role-adjacency gate returns null for unrelated roles, those jobs drop out
 * entirely — which is exactly the relevance fix (an office manager never
 * sees dentist/corporate roles in their feed).
 *
 * Scale: we score the most recent `POOL_CAP` open jobs. Everything is cached
 * by (candidate_id, job_id) via get-or-compute, so repeat dashboard loads are
 * cheap. A batched candidate-loaded-once scorer is a later optimization.
 *
 * Privacy: candidate-facing, so the DSO name is ALWAYS masked through
 * getDisplayedDsoNamesBatch (never raw dsos.name) — the anonymity guarantee.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDisplayedDsoNamesBatch } from "@/lib/dso/affiliation-display";
import { getPracticeFit } from "./get-or-compute";
import type { FitResult } from "./types";

const POOL_CAP = 30;

export interface RoleThatFits {
  job_id: string;
  title: string;
  /** Masked display name (practice name when affiliation is private). */
  dso_name: string | null;
  locations: Array<{ city: string | null; state: string | null }>;
  fit: FitResult;
}

export async function getTopFitJobsForCandidate(
  candidateId: string,
  limit = 4
): Promise<RoleThatFits[]> {
  if (!candidateId) return [];
  const supabase = await createSupabaseServerClient();

  // Recent open jobs across all DSOs. Public read on `jobs` covers this;
  // RLS hides internal-only postings.
  const { data: rawJobs } = await supabase
    .from("jobs")
    .select("id, title, dso_id")
    .eq("status", "active")
    .is("deleted_at", null)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(POOL_CAP);
  const jobs = ((rawJobs ?? []) as Array<{
    id: string;
    title: string;
    dso_id: string;
  }>);
  if (jobs.length === 0) return [];

  // Drop jobs the candidate already applied to — the feed is for discovery.
  const jobIds = jobs.map((j) => j.id);
  const { data: appliedRows } = await supabase
    .from("applications")
    .select("job_id")
    .eq("candidate_id", candidateId)
    .in("job_id", jobIds);
  const applied = new Set(
    ((appliedRows ?? []) as Array<{ job_id: string }>).map((r) => r.job_id)
  );
  const pool = jobs.filter((j) => !applied.has(j.id));
  if (pool.length === 0) return [];

  // Score each (cached). null = role-filtered → excluded from the feed.
  const scored = await Promise.all(
    pool.map(async (j) => {
      const fit = await getPracticeFit(candidateId, j.id);
      return fit ? { job: j, fit } : null;
    })
  );
  const ranked = scored
    .filter((x): x is { job: (typeof pool)[number]; fit: FitResult } =>
      x !== null
    )
    .sort((a, b) => b.fit.score - a.fit.score)
    .slice(0, limit);
  if (ranked.length === 0) return [];

  // Enrich the top matches: masked DSO name + locations.
  const topIds = ranked.map((r) => r.job.id);
  const displayed = await getDisplayedDsoNamesBatch({
    jobIds: topIds,
    viewer: { role: "public" },
  });

  const locByJob = new Map<
    string,
    Array<{ city: string | null; state: string | null }>
  >();
  const { data: locs } = await supabase
    .from("job_locations")
    .select("job_id, location:dso_locations(city, state)")
    .in("job_id", topIds);
  for (const row of (locs ?? []) as unknown as Array<{
    job_id: string;
    location: { city: string | null; state: string | null } | null;
  }>) {
    if (!row.location) continue;
    const list = locByJob.get(row.job_id) ?? [];
    list.push(row.location);
    locByJob.set(row.job_id, list);
  }

  return ranked.map((r) => ({
    job_id: r.job.id,
    title: r.job.title,
    dso_name: displayed.get(r.job.id)?.name ?? null,
    locations: locByJob.get(r.job.id) ?? [],
    fit: r.fit,
  }));
}
