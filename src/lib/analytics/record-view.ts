"use server";

/**
 * View-event recorder for /jobs/[id] (Phase 5C / E6.1, shipped 2026-05-11).
 *
 * Called from the public job detail page server component. Insert is
 * fire-and-forget; failures are swallowed (a missed view-event must
 * never affect page render). The service-role client is used because
 * anon clients can't insert into `job_view_events` — RLS only opens
 * SELECT to DSO members of the job's DSO.
 *
 * Dedup strategy (Vantage §3a, 2026-06-22 — now COOKIELESS):
 *   - `session_id` is the anonymous daily visitor hash (the same cookieless
 *     identity the /p/e beacon uses — see request-visitor.ts), NOT a cookie.
 *     This removes the old `dsohire-view-session` cookie so the "we do not use
 *     cookies for analytics" privacy claim is literally true. The hash resets
 *     daily, so `COUNT(DISTINCT session_id)` over a day = unique daily viewers
 *     (the cookieless tradeoff: a multi-day window sums daily uniques rather
 *     than tracking a stable browser — acceptable, and the privacy-correct
 *     behavior). If no salt is available the view still records with a null
 *     session_id — dedup is best-effort, never a blocker.
 *   - Self-views (DSO member viewing their own job, candidate viewing
 *     a job they own) are still recorded but flagged via the
 *     `is_authenticated` bit so dashboards can filter them out of
 *     "candidate funnel" counts. We do NOT filter at insert time —
 *     keeps the spine clean for future analyses that may want them.
 *
 * Source attribution: lifted from the incoming search params on the
 * page route, threaded through here. If absent, we extract a `referer
 * host` from the Referer header and stash it for later (e.g., google
 * → 'organic search', t.co → 'twitter'). Mapping referer → source is
 * a Day-2 task; for now we just record the host and let the dashboard
 * group at read time.
 */

import { headers } from "next/headers";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getRequestVisitorId } from "./request-visitor";

export interface RecordJobViewInput {
  jobId: string;
  /** ?source=X URL param when present. */
  sourceParam: string | null;
  /** auth.users.id if the visitor is signed in. */
  authenticatedUserId: string | null;
}

export async function recordJobView(input: RecordJobViewInput): Promise<void> {
  try {
    const hdrs = await headers();

    // Cookieless dedup key: the anonymous daily visitor hash (no cookie).
    const visitorId = await getRequestVisitorId();
    const sessionId = visitorId == null ? null : visitorId.toString();

    // Parse referer host (don't store full URL — privacy + size).
    const referer = hdrs.get("referer") ?? "";
    let refererHost: string | null = null;
    if (referer) {
      try {
        refererHost = new URL(referer).host;
      } catch {
        refererHost = null;
      }
    }

    const admin = createSupabaseServiceRoleClient();
    await admin.from("job_view_events").insert({
      job_id: input.jobId,
      session_id: sessionId,
      source: input.sourceParam,
      referer_host: refererHost,
      is_authenticated: Boolean(input.authenticatedUserId),
    });

    // Also +1 the legacy jobs.views counter so historical readers
    // (/employer/jobs list — sort, top-performer card, row counts)
    // stay accurate. SQL function added in migration
    // 20260511000004_job_view_increment_fn.sql does this atomically.
    await admin.rpc("increment_job_view_count", { p_job_id: input.jobId });
  } catch (err) {
    // Fail silent — analytics must never break the page.
    console.warn("[record-view] insert failed", err);
  }
}

/**
 * Apply-form START recorder (Analytics Phase 1). Fired when a candidate
 * reaches an apply page — the denominator for application completion rate
 * (submitted applications ÷ starts). Same service-role + cookieless visitor
 * hash as recordJobView; fail-silent so it never blocks the apply page.
 */
export async function recordApplicationStart(jobId: string): Promise<void> {
  try {
    const visitorId = await getRequestVisitorId();
    const admin = createSupabaseServiceRoleClient();
    await admin.from("application_starts").insert({
      job_id: jobId,
      session_id: visitorId == null ? null : visitorId.toString(),
    });
  } catch (err) {
    console.warn("[record-start] insert failed", err);
  }
}
