/**
 * Sourcing funnel metrics (Sourcing CRM — Phase 4).
 *
 * sourced → contacted → responded → converted, plus response rate and average
 * time-to-response. Computed from the pipeline stages (dso_talent_pool_entries)
 * + the prospect activity timeline (dso_prospect_activities). Counts reconcile
 * to a manual SQL group-by on those tables.
 *
 * No candidate identity is read here — purely aggregate counts.
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface SourcingFunnel {
  sourced: number;
  contacted: number;
  responded: number;
  nurturing: number;
  converted: number;
  archived: number;
  total: number;
  /** replied candidates / contacted candidates, 0..1. */
  responseRate: number;
  /** Average hours from first outreach to first reply, or null if none. */
  avgResponseHours: number | null;
}

const EMPTY: SourcingFunnel = {
  sourced: 0,
  contacted: 0,
  responded: 0,
  nurturing: 0,
  converted: 0,
  archived: 0,
  total: 0,
  responseRate: 0,
  avgResponseHours: null,
};

export async function getSourcingFunnel(
  supabase: ServerClient,
  dsoId: string,
): Promise<SourcingFunnel> {
  if (!dsoId) return EMPTY;

  // Stage counts (stored pipeline_stage — matches a manual group-by).
  const { data: stageRows } = await supabase
    .from("dso_talent_pool_entries")
    .select("pipeline_stage")
    .eq("dso_id", dsoId);
  const counts: Record<string, number> = {};
  for (const r of (stageRows ?? []) as Array<{ pipeline_stage: string | null }>) {
    const s = r.pipeline_stage ?? "sourced";
    counts[s] = (counts[s] ?? 0) + 1;
  }

  // Response metrics from the activity timeline.
  const { data: actRows } = await supabase
    .from("dso_prospect_activities")
    .select("candidate_id, kind, created_at")
    .eq("dso_id", dsoId)
    .in("kind", ["outreach_sent", "replied"])
    .order("created_at", { ascending: true });

  const firstOutreach = new Map<string, number>();
  const firstReply = new Map<string, number>();
  for (const a of (actRows ?? []) as Array<{
    candidate_id: string;
    kind: string;
    created_at: string;
  }>) {
    const t = new Date(a.created_at).getTime();
    if (a.kind === "outreach_sent" && !firstOutreach.has(a.candidate_id)) {
      firstOutreach.set(a.candidate_id, t);
    } else if (a.kind === "replied" && !firstReply.has(a.candidate_id)) {
      firstReply.set(a.candidate_id, t);
    }
  }

  const contactedCandidates = firstOutreach.size;
  let repliedCandidates = 0;
  let totalResponseMs = 0;
  let responseSamples = 0;
  for (const [cid, replyT] of firstReply) {
    repliedCandidates += 1;
    const outT = firstOutreach.get(cid);
    if (outT != null && replyT >= outT) {
      totalResponseMs += replyT - outT;
      responseSamples += 1;
    }
  }

  const total = (stageRows ?? []).length;
  return {
    sourced: counts.sourced ?? 0,
    contacted: counts.contacted ?? 0,
    responded: counts.responded ?? 0,
    nurturing: counts.nurturing ?? 0,
    converted: counts.converted ?? 0,
    archived: counts.archived ?? 0,
    total,
    responseRate:
      contactedCandidates > 0 ? repliedCandidates / contactedCandidates : 0,
    avgResponseHours:
      responseSamples > 0
        ? totalResponseMs / responseSamples / 3_600_000
        : null,
  };
}
