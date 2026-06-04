/**
 * Candidate anonymous-but-discoverable mode (2026-06-04).
 *
 * A candidate can stay searchable/fit-rankable while hiding their name + photo
 * from employers who DISCOVER them (Talent Pool browse, candidate detail reached
 * from browse). Identity reveals once they apply to one of that DSO's jobs — at
 * that point they've chosen to reveal, and the application surfaces show the real
 * name as usual. So the rule everywhere is:
 *
 *     masked = candidate.anonymous_mode && !appliedToThisDso
 *
 * These helpers are the single source of truth for the masked label + the
 * "applied to this DSO" check, so every discovery surface stays consistent.
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface AnonymizableCandidate {
  current_title?: string | null;
  desired_roles?: string[] | null;
  current_location_city?: string | null;
  current_location_state?: string | null;
}

/**
 * The generic display name shown in place of a masked candidate's real name,
 * e.g. "Dental Office Manager in Denver". Falls back gracefully when role or
 * location is missing ("Dental professional in KS" / "Dental professional").
 */
export function anonymousDisplayLabel(c: AnonymizableCandidate): string {
  const role =
    (c.current_title && c.current_title.trim()) ||
    (c.desired_roles && c.desired_roles.find((r) => r && r.trim())) ||
    "Dental professional";
  const place =
    (c.current_location_city && c.current_location_city.trim()) ||
    (c.current_location_state && c.current_location_state.trim()) ||
    null;
  return place ? `${role} in ${place}` : role;
}

/**
 * Of the given candidate ids, which have applied to one of this DSO's jobs?
 * Those candidates are de-masked (they chose to reveal by applying). Two flat
 * queries (DSO jobs → applications) under the caller's RLS context.
 */
export async function getDsoAppliedCandidateIds(
  supabase: ServerClient,
  dsoId: string,
  candidateIds: string[]
): Promise<Set<string>> {
  const out = new Set<string>();
  if (candidateIds.length === 0) return out;

  const { data: jobRows } = await supabase
    .from("jobs")
    .select("id")
    .eq("dso_id", dsoId);
  const jobIds = ((jobRows ?? []) as Array<{ id: string }>).map((j) => j.id);
  if (jobIds.length === 0) return out;

  const { data: appRows } = await supabase
    .from("applications")
    .select("candidate_id")
    .in("job_id", jobIds)
    .in("candidate_id", candidateIds);
  for (const r of (appRows ?? []) as Array<{ candidate_id: string }>) {
    out.add(r.candidate_id);
  }
  return out;
}
