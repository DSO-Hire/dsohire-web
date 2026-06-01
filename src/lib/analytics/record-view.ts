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
 * Dedup strategy:
 *   - `session_id` is a long-lived cookie that we read on the server.
 *     If absent, we mint one and the response sets the cookie via the
 *     `next/headers` cookies API. The view event is still recorded
 *     either way; aggregation queries can `COUNT(DISTINCT session_id)`
 *     for unique-visitor counts.
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

import { cookies, headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const SESSION_COOKIE_NAME = "dsohire-view-session";
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export interface RecordJobViewInput {
  jobId: string;
  /** ?source=X URL param when present. */
  sourceParam: string | null;
  /** auth.users.id if the visitor is signed in. */
  authenticatedUserId: string | null;
}

export async function recordJobView(input: RecordJobViewInput): Promise<void> {
  try {
    const cookieStore = await cookies();
    const hdrs = await headers();

    let sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
    if (!sessionId) {
      sessionId = randomUUID();
      // Best-effort cookie set. Some response paths (RSC, edge runtime)
      // may not allow cookie writes; we ignore the failure and the
      // visitor gets a fresh session id on next visit. View event
      // still records — dedup is best-effort, not exact.
      try {
        cookieStore.set({
          name: SESSION_COOKIE_NAME,
          value: sessionId,
          maxAge: SESSION_COOKIE_MAX_AGE,
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        });
      } catch {
        // RSC contexts can't set cookies; OK to skip.
      }
    }

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
 * (submitted applications ÷ starts). Same service-role + session-cookie
 * pattern as recordJobView; fail-silent so it never blocks the apply page.
 */
export async function recordApplicationStart(jobId: string): Promise<void> {
  try {
    const cookieStore = await cookies();
    let sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
    if (!sessionId) {
      sessionId = randomUUID();
      try {
        cookieStore.set({
          name: SESSION_COOKIE_NAME,
          value: sessionId,
          maxAge: SESSION_COOKIE_MAX_AGE,
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        });
      } catch {
        // RSC contexts can't set cookies; OK to skip.
      }
    }
    const admin = createSupabaseServiceRoleClient();
    await admin
      .from("application_starts")
      .insert({ job_id: jobId, session_id: sessionId });
  } catch (err) {
    console.warn("[record-start] insert failed", err);
  }
}
