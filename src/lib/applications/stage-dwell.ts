/**
 * Stage-dwell norms (Lane 5 — Kanban 2.0, Model 04 column health).
 *
 * "How long does a candidate USUALLY sit in each stage at this DSO?"
 * — median completed dwell per stage kind over the trailing 90 days,
 * computed from application_status_events. Server-side only.
 *
 * Mechanics: a dwell is the gap between two consecutive status events
 * on the same application — entering stage S and then leaving it (the
 * next event, whatever it is). Only COMPLETED dwells count; cards still
 * sitting in a stage are the "current median" the column computes
 * client-side, and the whole point is comparing those two numbers.
 *
 * Honesty rules:
 *   • A kind needs ≥ MIN_SAMPLES completed dwells to earn a norm —
 *     otherwise it gets none and the column renders neutral. No norms
 *     invented from thin history.
 *   • RLS scopes the events read to the caller's DSO (and to the jobs
 *     they can access — confidential-job filtering inherits), so norms
 *     reflect exactly the pipeline the viewer is allowed to see.
 *   • Newest-first + row cap: Supabase clamps responses (~1000 rows
 *     default); ordering desc means a truncated read loses the OLDEST
 *     events first, so the window degrades gracefully toward "recent
 *     norms" rather than skewing.
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const WINDOW_DAYS = 90;
const MIN_SAMPLES = 3;

/** stage kind → median completed dwell in days (one decimal). Kinds
 * without enough history are simply absent. */
export type StageDwellNorms = Record<string, number>;

export async function getStageDwellNorms(
  supabase: SupabaseClient
): Promise<StageDwellNorms> {
  const windowStart = new Date(
    Date.now() - WINDOW_DAYS * 86_400_000
  ).toISOString();

  const { data, error } = await supabase
    .from("application_status_events")
    .select("application_id, to_stage_kind, created_at")
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) {
    console.error("[stage-dwell] events query", error);
    return {};
  }

  const rows = ((data ?? []) as Array<{
    application_id: string;
    to_stage_kind: string;
    created_at: string;
  }>).reverse(); // chronological

  // Group chronologically per application, then pair consecutive events.
  const byApp = new Map<string, Array<{ kind: string; at: number }>>();
  for (const r of rows) {
    const list = byApp.get(r.application_id) ?? [];
    list.push({ kind: r.to_stage_kind, at: Date.parse(r.created_at) });
    byApp.set(r.application_id, list);
  }

  const samples = new Map<string, number[]>();
  for (const events of byApp.values()) {
    for (let i = 0; i < events.length - 1; i++) {
      const dwellDays = (events[i + 1].at - events[i].at) / 86_400_000;
      if (dwellDays < 0) continue; // defensive — ordering anomaly
      const list = samples.get(events[i].kind) ?? [];
      list.push(dwellDays);
      samples.set(events[i].kind, list);
    }
  }

  const norms: StageDwellNorms = {};
  for (const [kind, list] of samples) {
    if (list.length < MIN_SAMPLES) continue;
    list.sort((a, b) => a - b);
    const median = list[Math.floor(list.length / 2)];
    norms[kind] = Math.round(median * 10) / 10;
  }
  return norms;
}
