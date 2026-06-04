/**
 * PracticeFit proof loop (v3.2 Phase E).
 *
 * The credibility instrument: does the PracticeFit score actually track real
 * hiring outcomes? For a DSO's applications that have a cached fit score, we
 * group by fit bucket and measure how far each group advanced — using the
 * stage-change HISTORY (application_status_events), so a candidate who
 * interviewed and was later rejected still counts as "advanced." Current stage
 * alone would understate it.
 *
 * Honest by construction:
 *   • Only applications with a fit score count (the "scored" denominator).
 *   • `enough_data` gates the UI — below the threshold we show "building," not
 *     a noisy rate. Pre-launch there is no data; the card renders empty-safe.
 *   • This is DESCRIPTIVE proof, not a trained predictor. A real predictive
 *     model waits until enough outcomes accrue (tracked as a follow-up).
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FitBucket } from "@/lib/practice-fit/types";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Minimum scored applications before we show rates instead of "building." */
const MIN_DATA = 10;
const APP_CAP = 2000;

/** Stage kinds that count as "advanced past initial review." */
const ADVANCED_KINDS = new Set(["interview", "offer", "hired"]);

const BUCKET_ORDER: FitBucket[] = [
  "excellent",
  "strong",
  "solid",
  "light",
  "low",
];

export interface FitProofBucket {
  bucket: FitBucket;
  total: number;
  advanced: number;
  hired: number;
  advance_rate: number; // 0-1
  hire_rate: number; // 0-1
}

export interface FitOutcomeProof {
  buckets: FitProofBucket[]; // only buckets with total > 0, excellent→low
  total_scored: number;
  enough_data: boolean;
  /** Combined advance rate for excellent+strong vs light+low — the headline. */
  strong_advance_rate: number | null;
  weak_advance_rate: number | null;
}

const EMPTY: FitOutcomeProof = {
  buckets: [],
  total_scored: 0,
  enough_data: false,
  strong_advance_rate: null,
  weak_advance_rate: null,
};

export async function getFitOutcomeProof(
  supabase: SupabaseClient,
  dsoId: string
): Promise<FitOutcomeProof> {
  if (!dsoId) return EMPTY;

  // 1. The DSO's jobs (scope handle — mirrors hub-metrics; avoids embed-filter
  //    pitfalls).
  const { data: jobRows } = await supabase
    .from("jobs")
    .select("id")
    .eq("dso_id", dsoId)
    .is("deleted_at", null);
  const jobIds = ((jobRows ?? []) as Array<{ id: string }>).map((j) => j.id);
  if (jobIds.length === 0) return EMPTY;

  // 2. Applications on those jobs (current stage kind + ids).
  const { data: appRowsRaw } = await supabase
    .from("applications")
    .select(
      "id, candidate_id, job_id, stage:dso_pipeline_stages!stage_id(kind)"
    )
    .in("job_id", jobIds)
    .order("created_at", { ascending: false })
    .limit(APP_CAP);
  const apps = (
    (appRowsRaw ?? []) as unknown as Array<{
      id: string;
      candidate_id: string;
      job_id: string;
      stage: { kind: string } | Array<{ kind: string }> | null;
    }>
  ).map((r) => {
    const stage = Array.isArray(r.stage) ? r.stage[0] : r.stage;
    return {
      id: r.id,
      candidate_id: r.candidate_id,
      job_id: r.job_id,
      current_kind: stage?.kind ?? "open",
    };
  });
  if (apps.length === 0) return EMPTY;

  // 3. Stage-change history → which kinds each application EVER reached.
  const appIds = apps.map((a) => a.id);
  const reachedByApp = new Map<string, Set<string>>();
  for (const a of apps) reachedByApp.set(a.id, new Set([a.current_kind]));
  // Chunk the IN list to keep URLs sane.
  for (let i = 0; i < appIds.length; i += 300) {
    const chunk = appIds.slice(i, i + 300);
    const { data: evRows } = await supabase
      .from("application_status_events")
      .select("application_id, to_stage_kind")
      .in("application_id", chunk);
    for (const ev of (evRows ?? []) as Array<{
      application_id: string;
      to_stage_kind: string;
    }>) {
      reachedByApp.get(ev.application_id)?.add(ev.to_stage_kind);
    }
  }

  // 4. Cached fit bucket per (candidate, job). Over-fetch by the two id sets,
  //    then match exact pairs in memory.
  const candIds = Array.from(new Set(apps.map((a) => a.candidate_id)));
  const fitByPair = new Map<string, FitBucket>();
  for (let i = 0; i < candIds.length; i += 300) {
    const chunk = candIds.slice(i, i + 300);
    const { data: fitRows } = await supabase
      .from("practice_fit_scores")
      .select("candidate_id, job_id, bucket")
      .in("candidate_id", chunk)
      .in("job_id", jobIds);
    for (const f of (fitRows ?? []) as Array<{
      candidate_id: string;
      job_id: string;
      bucket: string;
    }>) {
      fitByPair.set(`${f.candidate_id}|${f.job_id}`, f.bucket as FitBucket);
    }
  }

  // 5. Reduce to the pure (bucket, reached-kinds) rows the aggregator needs.
  const scored: ScoredOutcome[] = [];
  for (const a of apps) {
    const bucket = fitByPair.get(`${a.candidate_id}|${a.job_id}`);
    if (!bucket) continue; // unscored pair — excluded from the proof denominator
    scored.push({
      bucket,
      reached: Array.from(reachedByApp.get(a.id) ?? new Set<string>()),
    });
  }
  return computeProof(scored);
}

/* ──────────────────────────────────────────────────────────────
 * Pure aggregator — separated from the DB so it's unit-testable. Takes the
 * scored applications (their fit bucket + the stage kinds they ever reached)
 * and produces the proof shape.
 * ─────────────────────────────────────────────────────────── */

export interface ScoredOutcome {
  bucket: FitBucket;
  /** Every stage kind this application reached (current + history). */
  reached: string[];
}

export function computeProof(scored: ScoredOutcome[]): FitOutcomeProof {
  const agg = new Map<FitBucket, { total: number; advanced: number; hired: number }>();
  for (const s of scored) {
    const advanced = s.reached.some((k) => ADVANCED_KINDS.has(k));
    const hired = s.reached.includes("hired");
    const cur = agg.get(s.bucket) ?? { total: 0, advanced: 0, hired: 0 };
    cur.total += 1;
    if (advanced) cur.advanced += 1;
    if (hired) cur.hired += 1;
    agg.set(s.bucket, cur);
  }

  const buckets: FitProofBucket[] = [];
  let totalScored = 0;
  for (const b of BUCKET_ORDER) {
    const v = agg.get(b);
    if (!v || v.total === 0) continue;
    totalScored += v.total;
    buckets.push({
      bucket: b,
      total: v.total,
      advanced: v.advanced,
      hired: v.hired,
      advance_rate: v.advanced / v.total,
      hire_rate: v.hired / v.total,
    });
  }

  const sum = (keys: FitBucket[]) =>
    keys.reduce(
      (acc, k) => {
        const v = agg.get(k);
        if (v) {
          acc.total += v.total;
          acc.advanced += v.advanced;
        }
        return acc;
      },
      { total: 0, advanced: 0 }
    );
  const strong = sum(["excellent", "strong"]);
  const weak = sum(["light", "low"]);

  return {
    buckets,
    total_scored: totalScored,
    enough_data: totalScored >= MIN_DATA,
    strong_advance_rate: strong.total > 0 ? strong.advanced / strong.total : null,
    weak_advance_rate: weak.total > 0 ? weak.advanced / weak.total : null,
  };
}
