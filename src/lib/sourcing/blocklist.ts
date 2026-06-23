/**
 * Block-list enforcement (Sourcing CRM — Phase 0).
 *
 * `candidate_blocked_employers` lets a candidate block a specific DSO, but until
 * now it was enforced NOWHERE — a blocked DSO could still discover and email the
 * candidate. This is the shared helper every discovery + outbound surface uses
 * so the rule can't drift: Discover, Smart Picks, Mutual Interest, and outreach.
 *
 * App-layer filter by design — the candidates "discoverable read" RLS policy
 * intentionally doesn't carry the block (it's a per-(candidate,dso) relation,
 * not a property of the candidate row). RLS on candidate_blocked_employers
 * already lets a DSO read its own block rows (dso_id = current_dso_id()), so the
 * caller's own client works; the service-role client also works for system paths.
 *
 * Fail-safe: callers exclude the returned ids. If this query errored we return
 * an empty set (fail-open on *read* would be wrong, but a block-list read error
 * is rare and would otherwise hide the whole pool); callers that send outbound
 * use isBlocked(), which treats a candidate as blocked unless we can confirm
 * otherwise is NOT done here — see isBlocked() doc.
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Candidate ids that have blocked this DSO. Exclude these from any discovery
 * surface. Returns an empty set on no rows.
 */
export async function getBlockedCandidateIdsForDso(
  supabase: ServerClient,
  dsoId: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!dsoId) return out;
  const { data } = await supabase
    .from("candidate_blocked_employers")
    .select("candidate_id")
    .eq("dso_id", dsoId);
  for (const r of (data ?? []) as Array<{ candidate_id: string }>) {
    out.add(r.candidate_id);
  }
  return out;
}

/**
 * Is this specific candidate blocking this DSO? Used on the outbound path
 * (one-shot outreach / message / enroll) before contacting anyone.
 *
 * Fail-safe: on a query error we return TRUE (treat as blocked) so an outbound
 * send is never made when the block state is unknown — never contact when we
 * can't confirm the candidate hasn't blocked us.
 */
export async function isBlocked(
  supabase: ServerClient,
  dsoId: string,
  candidateId: string,
): Promise<boolean> {
  if (!dsoId || !candidateId) return true;
  const { data, error } = await supabase
    .from("candidate_blocked_employers")
    .select("candidate_id")
    .eq("dso_id", dsoId)
    .eq("candidate_id", candidateId)
    .maybeSingle();
  if (error) return true; // fail-safe: unknown → treat as blocked, never contact
  return data !== null;
}
