/**
 * Analytics Hub metrics (Phase 0, 2026-06-01).
 *
 * The deeper metric layer behind the new /employer/analytics hub. Sits
 * alongside the Phase 5C metrics.ts (per-job + DSO funnel) and adds the
 * KPIs the hub leads with: time-to-fill AND time-to-hire, offer-acceptance,
 * interview conversion, requisition aging, pipeline coverage, and source
 * performance (apps → hires).
 *
 * Design notes:
 *   - Follows the FLAT-QUERY pattern established in getDsoCrossLocationStats:
 *     resolve the DSO's job IDs first, then fetch child rows by `.in(job_id)`
 *     / `.in(application_id)`, rather than nested `!inner` embeds that can
 *     silently no-op under RLS (see feedback_supabase_inner_returns_array +
 *     the "prefer flat queries over nested embeds" rule).
 *   - One shared fetch (`getAnalyticsOverview`) computes the whole bundle so
 *     the hub overview makes a single pass; focused per-tab functions can be
 *     layered later in Phase 1 without re-deriving the base data.
 *   - Window math is UTC. Medians are reported alongside means because
 *     small dental samples are skewed by one slow req.
 *   - Terminal stage kinds (hired/rejected/withdrawn) vs active pipeline
 *     kinds (open/screen/interview/offer) drive coverage + funnel logic.
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { declineReasonLabel } from "@/lib/offers/decline-reasons";
import type { FunnelStageRow } from "./metrics";

const FUNNEL_ORDER = ["open", "screen", "interview", "offer", "hired"] as const;
const FUNNEL_LABEL: Record<(typeof FUNNEL_ORDER)[number], string> = {
  open: "Applied",
  screen: "Screening",
  interview: "Interview",
  offer: "Offered",
  hired: "Hired",
};

/** Reached-stage funnel from a set of applications (current stage kind). */
function computeFunnel(apps: Array<{ kind: string | null }>): FunnelStageRow[] {
  const current: Record<string, number> = {
    open: 0,
    screen: 0,
    interview: 0,
    offer: 0,
    hired: 0,
    rejected: 0,
    withdrawn: 0,
  };
  for (const a of apps) {
    if (a.kind && a.kind in current) current[a.kind] += 1;
  }
  const reached: Record<string, number> = {
    open: 0,
    screen: 0,
    interview: 0,
    offer: 0,
    hired: 0,
  };
  let later = 0;
  for (let i = FUNNEL_ORDER.length - 1; i >= 0; i--) {
    const s = FUNNEL_ORDER[i];
    const here = current[s] ?? 0;
    reached[s] = here + later;
    later += here;
  }
  reached.open += current.rejected + current.withdrawn;
  return FUNNEL_ORDER.map((s, i) => {
    const count = reached[s];
    const prev = i === 0 ? count : reached[FUNNEL_ORDER[i - 1]];
    const conversion = i === 0 ? 1 : prev > 0 ? count / prev : 0;
    return {
      stage: s,
      label: FUNNEL_LABEL[s],
      count,
      conversion_from_prev: conversion,
    };
  });
}

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const ACTIVE_KINDS = ["open", "screen", "interview", "offer"] as const;
const TERMINAL_KINDS = ["hired", "rejected", "withdrawn"] as const;

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/* ───────────────────────── Result types ───────────────────────── */

export interface OfferMetrics {
  sent: number;
  accepted: number;
  declined: number;
  pending: number;
  /** accepted / sent (canonical offer-acceptance rate); null when none sent. */
  acceptance_rate: number | null;
  /** avg days from offer sent → candidate response. */
  avg_days_to_response: number | null;
  /** Top decline reasons (free-text `reason`, grouped), desc. */
  decline_reasons: Array<{ reason: string; count: number }>;
}

export interface InterviewMetrics {
  proposals: number;
  booked: number;
  /** booked / proposals — candidate self-schedule conversion; null when none. */
  booking_rate: number | null;
  cancelled: number;
}

export interface ReqAgingMetrics {
  open_reqs: number;
  /** Age buckets of currently-open reqs by days since posted. */
  buckets: { d0_30: number; d31_60: number; d61_90: number; d90_plus: number };
  oldest_days: number | null;
  avg_age_days: number | null;
}

export interface PipelineCoverage {
  active_candidates: number;
  open_reqs: number;
  /** active_candidates / open_reqs; null when no open reqs. */
  ratio: number | null;
}

export interface TimeToHireFill {
  hires: number;
  /** posted_at → hired_at (planning metric). */
  time_to_fill_median_days: number | null;
  time_to_fill_avg_days: number | null;
  /** application.created_at → hired_at (execution metric). */
  time_to_hire_median_days: number | null;
  time_to_hire_avg_days: number | null;
}

export interface SourceRow {
  source: string;
  applications: number;
  hires: number;
  /** applications / hires — lower = more efficient channel; null when 0 hires. */
  apps_per_hire: number | null;
  /** hires / applications. */
  hire_rate: number | null;
}

export interface Trends {
  /** Applications submitted per day over the window (oldest → newest). */
  applications: number[];
  /** Hires per day over the window (oldest → newest). */
  hires: number[];
}

export interface TopOfFunnel {
  /** apply-form start events (denominator). */
  starts: number;
  /** submitted applications (numerator). */
  submitted: number;
  /** submitted / starts, capped at 1; null when no starts recorded. */
  completion_rate: number | null;
}

export interface TimeToFirstResponse {
  /** application.created_at → first employer message (median). */
  median_days: number | null;
  avg_days: number | null;
  /** how many windowed apps have received a first response. */
  responded: number;
  total: number;
}

export interface AnalyticsOverview {
  window_days: number;
  applications: number;
  hires: number;
  offers: OfferMetrics;
  interviews: InterviewMetrics;
  req_aging: ReqAgingMetrics;
  pipeline_coverage: PipelineCoverage;
  time_to_hire_fill: TimeToHireFill;
  time_to_first_response: TimeToFirstResponse;
  top_of_funnel: TopOfFunnel;
  trends: Trends;
  /** Reached-stage funnel, scoped to the same job/location set as the bundle. */
  funnel: FunnelStageRow[];
  sources: SourceRow[];
}

/** Bucket ISO timestamps into per-day counts over the last `windowDays`. */
function bucketDaily(timestamps: string[], windowDays: number): number[] {
  const buckets = Array.from({ length: windowDays }, () => 0);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (const ts of timestamps) {
    const d = new Date(ts);
    d.setUTCHours(0, 0, 0, 0);
    const daysAgo = Math.floor((today.getTime() - d.getTime()) / 86400000);
    const idx = windowDays - 1 - daysAgo;
    if (idx >= 0 && idx < windowDays) buckets[idx] += 1;
  }
  return buckets;
}

/* ───────────────────────── Internal fetch shapes ───────────────────────── */

interface AppRow {
  id: string;
  job_id: string;
  created_at: string;
  hired_at: string | null;
  first_response_at: string | null;
  source: string | null;
  kind: string | null;
}

interface JobMeta {
  status: string;
  deleted_at: string | null;
  posted_at: string | null;
  created_at: string;
}

function stageKind(
  rel: { kind: string } | Array<{ kind: string }> | null
): string | null {
  const row = Array.isArray(rel) ? rel[0] ?? null : rel;
  return row?.kind ?? null;
}

/* ───────────────────────── The bundle ───────────────────────── */

/**
 * One-pass overview for the analytics hub. Optionally scope to a subset of
 * locations (Phase 2 passes locationIds; omit for the whole DSO).
 */
export async function getAnalyticsOverview(
  supabase: SupabaseClient,
  dsoId: string,
  opts: { windowDays?: number; locationIds?: string[] } = {}
): Promise<AnalyticsOverview> {
  const windowDays = opts.windowDays ?? 90;
  const windowStartMs = new Date(daysAgoIso(windowDays)).getTime();
  const nowMs = Date.now();

  // 1. Jobs for the DSO.
  const { data: jobRows } = await supabase
    .from("jobs")
    .select("id, status, deleted_at, posted_at, created_at")
    .eq("dso_id", dsoId);
  const jobMap = new Map<string, JobMeta>();
  for (const j of (jobRows ?? []) as Array<
    { id: string } & JobMeta
  >) {
    jobMap.set(j.id, {
      status: j.status,
      deleted_at: j.deleted_at,
      posted_at: j.posted_at,
      created_at: j.created_at,
    });
  }

  // Optional location scoping → restrict the job set.
  let scopedJobIds = [...jobMap.keys()];
  if (opts.locationIds && opts.locationIds.length > 0) {
    const { data: jl } = await supabase
      .from("job_locations")
      .select("job_id, location_id")
      .in("location_id", opts.locationIds);
    const allowed = new Set(
      ((jl ?? []) as Array<{ job_id: string }>).map((r) => r.job_id)
    );
    scopedJobIds = scopedJobIds.filter((id) => allowed.has(id));
  }

  const emptyOverview: AnalyticsOverview = {
    window_days: windowDays,
    applications: 0,
    hires: 0,
    offers: {
      sent: 0,
      accepted: 0,
      declined: 0,
      pending: 0,
      acceptance_rate: null,
      avg_days_to_response: null,
      decline_reasons: [],
    },
    interviews: { proposals: 0, booked: 0, booking_rate: null, cancelled: 0 },
    req_aging: {
      open_reqs: 0,
      buckets: { d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 },
      oldest_days: null,
      avg_age_days: null,
    },
    pipeline_coverage: { active_candidates: 0, open_reqs: 0, ratio: null },
    time_to_hire_fill: {
      hires: 0,
      time_to_fill_median_days: null,
      time_to_fill_avg_days: null,
      time_to_hire_median_days: null,
      time_to_hire_avg_days: null,
    },
    time_to_first_response: {
      median_days: null,
      avg_days: null,
      responded: 0,
      total: 0,
    },
    top_of_funnel: { starts: 0, submitted: 0, completion_rate: null },
    trends: {
      applications: Array.from({ length: windowDays }, () => 0),
      hires: Array.from({ length: windowDays }, () => 0),
    },
    funnel: computeFunnel([]),
    sources: [],
  };
  if (scopedJobIds.length === 0) return emptyOverview;

  // 2. All applications for the scoped jobs (current stage kind + timestamps).
  const { data: appRowsRaw } = await supabase
    .from("applications")
    .select(
      "id, job_id, created_at, hired_at, first_response_at, source, stage:dso_pipeline_stages!stage_id(kind)"
    )
    .in("job_id", scopedJobIds);
  const apps: AppRow[] = (
    (appRowsRaw ?? []) as unknown as Array<{
      id: string;
      job_id: string;
      created_at: string;
      hired_at: string | null;
      first_response_at: string | null;
      source: string | null;
      stage: { kind: string } | Array<{ kind: string }> | null;
    }>
  ).map((r) => ({
    id: r.id,
    job_id: r.job_id,
    created_at: r.created_at,
    hired_at: r.hired_at,
    first_response_at: r.first_response_at,
    source: r.source,
    kind: stageKind(r.stage),
  }));
  const appById = new Map(apps.map((a) => [a.id, a]));
  const appIds = apps.map((a) => a.id);

  // ── Req aging + pipeline coverage (point-in-time, not windowed) ──
  const openReqs: string[] = [];
  for (const [id, meta] of jobMap.entries()) {
    if (!scopedJobIds.includes(id)) continue;
    if (meta.status === "active" && meta.deleted_at === null) openReqs.push(id);
  }
  const ageDays: number[] = [];
  const buckets = { d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
  for (const id of openReqs) {
    const meta = jobMap.get(id)!;
    const anchor = meta.posted_at ?? meta.created_at;
    const age = (nowMs - new Date(anchor).getTime()) / 86400000;
    if (age < 0) continue;
    ageDays.push(age);
    if (age <= 30) buckets.d0_30 += 1;
    else if (age <= 60) buckets.d31_60 += 1;
    else if (age <= 90) buckets.d61_90 += 1;
    else buckets.d90_plus += 1;
  }
  const activeCandidates = apps.filter(
    (a) => a.kind != null && (ACTIVE_KINDS as readonly string[]).includes(a.kind)
  ).length;

  // ── Window-scoped application + hire metrics ──
  const windowedApps = apps.filter(
    (a) => new Date(a.created_at).getTime() >= windowStartMs
  );
  const hiresInWindow = apps.filter(
    (a) =>
      a.kind === "hired" &&
      a.hired_at != null &&
      new Date(a.hired_at).getTime() >= windowStartMs
  );

  // Time-to-fill (posted→hired) + time-to-hire (applied→hired).
  const ttfDays: number[] = [];
  const tthDays: number[] = [];
  for (const h of hiresInWindow) {
    if (!h.hired_at) continue;
    const hiredMs = new Date(h.hired_at).getTime();
    const posted = jobMap.get(h.job_id)?.posted_at;
    if (posted) {
      const d = (hiredMs - new Date(posted).getTime()) / 86400000;
      if (d >= 0) ttfDays.push(d);
    }
    const d2 = (hiredMs - new Date(h.created_at).getTime()) / 86400000;
    if (d2 >= 0) tthDays.push(d2);
  }

  // Time-to-first-response (created_at → first employer message).
  const frDays: number[] = [];
  for (const a of windowedApps) {
    if (!a.first_response_at) continue;
    const d =
      (new Date(a.first_response_at).getTime() -
        new Date(a.created_at).getTime()) /
      86400000;
    if (d >= 0) frDays.push(d);
  }

  // Source performance (window-scoped apps; hires attributed by source).
  const sourceAgg = new Map<string, { apps: number; hires: number }>();
  for (const a of windowedApps) {
    const src = a.source ?? "Direct / unknown";
    const s = sourceAgg.get(src) ?? { apps: 0, hires: 0 };
    s.apps += 1;
    sourceAgg.set(src, s);
  }
  for (const h of hiresInWindow) {
    const src = h.source ?? "Direct / unknown";
    const s = sourceAgg.get(src) ?? { apps: 0, hires: 0 };
    s.hires += 1;
    sourceAgg.set(src, s);
  }
  const sources: SourceRow[] = [...sourceAgg.entries()]
    .map(([source, v]) => ({
      source,
      applications: v.apps,
      hires: v.hires,
      apps_per_hire: v.hires > 0 ? v.apps / v.hires : null,
      hire_rate: v.apps > 0 ? v.hires / v.apps : null,
    }))
    .sort((a, b) => b.applications - a.applications);

  // ── Offers (window-scoped by sent_at), filtered to our application set ──
  const offers: OfferMetrics = {
    sent: 0,
    accepted: 0,
    declined: 0,
    pending: 0,
    acceptance_rate: null,
    avg_days_to_response: null,
    decline_reasons: [],
  };
  if (appIds.length > 0) {
    const { data: sendRows } = await supabase
      .from("application_offer_sends")
      .select("id, application_id, sent_at")
      .in("application_id", appIds)
      .gte("sent_at", daysAgoIso(windowDays));
    const sends = (sendRows ?? []) as Array<{
      id: string;
      application_id: string;
      sent_at: string;
    }>;
    offers.sent = sends.length;
    if (sends.length > 0) {
      const sendIds = sends.map((s) => s.id);
      const sentAtById = new Map(sends.map((s) => [s.id, s.sent_at]));
      const { data: respRows } = await supabase
        .from("application_offer_responses")
        .select("offer_send_id, response, reason, decline_reason_code, responded_at")
        .in("offer_send_id", sendIds);
      const resp = (respRows ?? []) as Array<{
        offer_send_id: string;
        response: string;
        reason: string | null;
        decline_reason_code: string | null;
        responded_at: string;
      }>;
      const respDays: number[] = [];
      const declineReasons = new Map<string, number>();
      const respondedSendIds = new Set<string>();
      for (const r of resp) {
        respondedSendIds.add(r.offer_send_id);
        const isAccept = r.response === "accepted" || r.response === "accept";
        if (isAccept) offers.accepted += 1;
        else {
          offers.declined += 1;
          // Prefer the structured code's label; fall back to free-text.
          const reason =
            declineReasonLabel(r.decline_reason_code) ??
            ((r.reason ?? "").trim() || "Not specified");
          declineReasons.set(reason, (declineReasons.get(reason) ?? 0) + 1);
        }
        const sentAt = sentAtById.get(r.offer_send_id);
        if (sentAt) {
          const d =
            (new Date(r.responded_at).getTime() - new Date(sentAt).getTime()) /
            86400000;
          if (d >= 0) respDays.push(d);
        }
      }
      offers.pending = sends.filter((s) => !respondedSendIds.has(s.id)).length;
      offers.acceptance_rate = offers.sent > 0 ? offers.accepted / offers.sent : null;
      offers.avg_days_to_response = mean(respDays);
      offers.decline_reasons = [...declineReasons.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count);
    }
  }

  // ── Interviews (window-scoped by proposal created_at) ──
  const interviews: InterviewMetrics = {
    proposals: 0,
    booked: 0,
    booking_rate: null,
    cancelled: 0,
  };
  if (appIds.length > 0) {
    const { data: propRows } = await supabase
      .from("interview_proposals")
      .select("id, application_id, status, created_at")
      .in("application_id", appIds)
      .gte("created_at", daysAgoIso(windowDays));
    const props = (propRows ?? []) as Array<{
      id: string;
      status: string;
      created_at: string;
    }>;
    interviews.proposals = props.length;
    interviews.cancelled = props.filter((p) => p.status === "cancelled").length;
    if (props.length > 0) {
      const propIds = props.map((p) => p.id);
      const { count: bookedCount } = await supabase
        .from("interview_bookings")
        .select("id", { count: "exact", head: true })
        .in("proposal_id", propIds);
      interviews.booked = bookedCount ?? 0;
      interviews.booking_rate =
        interviews.proposals > 0
          ? interviews.booked / interviews.proposals
          : null;
    }
  }

  // ── Top-of-funnel: apply-form starts → completion rate ──
  const { count: startsCount } = await supabase
    .from("application_starts")
    .select("id", { count: "exact", head: true })
    .in("job_id", scopedJobIds)
    .gte("started_at", daysAgoIso(windowDays));
  const starts = startsCount ?? 0;
  const submitted = windowedApps.length;
  const completionRate =
    starts > 0 ? Math.min(1, submitted / starts) : null;

  // Mutate appById reference to satisfy lint (used for potential drill-down).
  void appById;

  return {
    window_days: windowDays,
    applications: windowedApps.length,
    hires: hiresInWindow.length,
    offers,
    interviews,
    req_aging: {
      open_reqs: openReqs.length,
      buckets,
      oldest_days: ageDays.length > 0 ? Math.max(...ageDays) : null,
      avg_age_days: mean(ageDays),
    },
    pipeline_coverage: {
      active_candidates: activeCandidates,
      open_reqs: openReqs.length,
      ratio: openReqs.length > 0 ? activeCandidates / openReqs.length : null,
    },
    time_to_hire_fill: {
      hires: hiresInWindow.length,
      time_to_fill_median_days: median(ttfDays),
      time_to_fill_avg_days: mean(ttfDays),
      time_to_hire_median_days: median(tthDays),
      time_to_hire_avg_days: mean(tthDays),
    },
    time_to_first_response: {
      median_days: median(frDays),
      avg_days: mean(frDays),
      responded: frDays.length,
      total: windowedApps.length,
    },
    top_of_funnel: {
      starts,
      submitted,
      completion_rate: completionRate,
    },
    trends: {
      applications: bucketDaily(
        windowedApps.map((a) => a.created_at),
        windowDays
      ),
      hires: bucketDaily(
        hiresInWindow
          .filter((h) => h.hired_at)
          .map((h) => h.hired_at as string),
        windowDays
      ),
    },
    funnel: computeFunnel(apps),
    sources,
  };
}

export { TERMINAL_KINDS, ACTIVE_KINDS };
