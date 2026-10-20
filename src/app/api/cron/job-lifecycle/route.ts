/**
 * /api/cron/job-lifecycle — scheduled publish + auto-expire (E1.18).
 *
 * Schedule (vercel.json): hourly, top of the hour.
 *
 * Two batch transitions, both wizard-agnostic (they act on whatever the
 * jobs table holds, so standard + corporate jobs are covered identically):
 *
 *   1. PROMOTE — draft jobs with scheduled_publish_at <= now() flip to
 *      'active' and get posted_at stamped. Until promotion they stay
 *      private drafts (the public job search filters status='active'),
 *      so a post-dated job is invisible until its publish time.
 *
 *   2. EXPIRE — active jobs with expires_at <= now() flip to 'expired',
 *      which removes them from the public search. Recruiters can still
 *      see / re-activate them from the employer jobs list.
 *
 * Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}`. Reject
 * anything without it. Service-role client so the batch UPDATEs bypass
 * RLS (there is no per-user context in a cron).
 *
 * Idempotent: each pass only matches rows still in the source status, so
 * re-running is a no-op once the transitions have landed.
 *
 * Search engines: promoted + expired job ids are handed to
 * scheduleJobIndexingSync (Google Indexing API + IndexNow), capped per run.
 */

import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { scheduleJobIndexingSync } from "@/lib/seo/job-indexing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Headroom for the after() search-engine pings below.
export const maxDuration = 60;

/** Per-run ceiling on search-engine syncs (Google quota is 200/day). */
const MAX_INDEXING_SYNCS_PER_RUN = 100;

interface LifecycleReport {
  published: number;
  expired: number;
  published_ids: string[];
  expired_ids: string[];
  errors: string[];
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseServiceRoleClient();
  const nowIso = new Date().toISOString();
  const report: LifecycleReport = {
    published: 0,
    expired: 0,
    published_ids: [],
    expired_ids: [],
    errors: [],
  };

  // 1. Promote scheduled drafts whose publish time has arrived.
  {
    const { data, error } = await admin
      .from("jobs")
      .update({ status: "active", posted_at: nowIso })
      .eq("status", "draft")
      .not("scheduled_publish_at", "is", null)
      .lte("scheduled_publish_at", nowIso)
      .is("deleted_at", null)
      .select("id");
    if (error) {
      report.errors.push(`promote: ${error.message}`);
    } else {
      const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
      report.published = ids.length;
      report.published_ids = ids;
    }
  }

  // 2. Expire active jobs past their expiration.
  {
    const { data, error } = await admin
      .from("jobs")
      .update({ status: "expired" })
      .eq("status", "active")
      .not("expires_at", "is", null)
      .lte("expires_at", nowIso)
      .is("deleted_at", null)
      .select("id");
    if (error) {
      report.errors.push(`expire: ${error.message}`);
    } else {
      const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
      report.expired = ids.length;
      report.expired_ids = ids;
    }
  }

  // Google for Jobs + IndexNow: newly promoted jobs go in (URL_UPDATED when
  // public), expired jobs come out (URL_DELETED when Google had them). Each
  // sync re-reads the row and runs in after(), so this response is not
  // delayed. Anything over the cap is picked up by /api/cron/google-jobs-sync.
  const toSync = [...report.published_ids, ...report.expired_ids].slice(
    0,
    MAX_INDEXING_SYNCS_PER_RUN
  );
  for (const id of toSync) scheduleJobIndexingSync(id);

  return NextResponse.json(report);
}
