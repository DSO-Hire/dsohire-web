/**
 * /api/cron/google-jobs-sync: daily backstop for the Google Indexing API.
 *
 * The real-time path is scheduleJobIndexingSync() in the job server actions
 * and the hourly job-lifecycle cron. This sweep catches anything those
 * missed (a failed call, a cold instance, the lifecycle per-run cap):
 *
 *   1. EXPIRY: jobs whose expires_at fell in the last 48h. If Google's
 *      metadata still shows the URL as live, send URL_DELETED.
 *   2. ACTIVATION: public jobs posted in the last 24h. If Google has no
 *      update at or after posted_at, send URL_UPDATED.
 *
 * Google's metadata endpoint (read quota) is what tells us whether a URL was
 * already notified, so a job handled in real time costs no publish quota
 * here. At most 100 publishes per run (daily publish quota is 200).
 *
 * Safety: a no-op unless isGoogleIndexingEnabled() (key set, launched, not
 * demo, VERCEL_ENV production), so the same cron on the demo project does
 * nothing. Vercel cron auth: `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Schedule (vercel.json): 10:30 UTC daily.
 */

import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isGoogleIndexingEnabled } from "@/lib/seo/google-indexing";
import {
  JOB_INDEXING_SELECT,
  isJobIndexable,
  notifyForJobRow,
  type JobIndexingRow,
} from "@/lib/seo/job-indexing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PUBLISHES_PER_RUN = 100;
const ROWS_PER_SWEEP = 100;
const EXPIRY_LOOKBACK_MS = 48 * 60 * 60 * 1000;
const ACTIVATION_LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** Stop starting new work this long into the run (maxDuration is 60s). */
const TIME_BUDGET_MS = 50_000;

type Row = JobIndexingRow & { posted_at: string | null };

export async function GET(request: Request) {
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isGoogleIndexingEnabled()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "google indexing not enabled for this deployment",
    });
  }

  const started = Date.now();
  const now = new Date(started);
  const admin = createSupabaseServiceRoleClient();
  const select = `${JOB_INDEXING_SELECT}, posted_at`;
  const errors: string[] = [];

  const { data: expiredData, error: expiredErr } = await admin
    .from("jobs")
    .select(select)
    .not("expires_at", "is", null)
    .gte("expires_at", new Date(started - EXPIRY_LOOKBACK_MS).toISOString())
    .lte("expires_at", now.toISOString())
    .order("expires_at", { ascending: false })
    .limit(ROWS_PER_SWEEP);
  if (expiredErr) errors.push(`expired query: ${expiredErr.message}`);

  const { data: activeData, error: activeErr } = await admin
    .from("jobs")
    .select(select)
    .eq("status", "active")
    .is("deleted_at", null)
    .gte("posted_at", new Date(started - ACTIVATION_LOOKBACK_MS).toISOString())
    .order("posted_at", { ascending: false })
    .limit(ROWS_PER_SWEEP);
  if (activeErr) errors.push(`activation query: ${activeErr.message}`);

  // Expired rows that are somehow still indexable (e.g. expiry pushed back
  // after the query window) are left to the activation sweep.
  const expiredRows = ((expiredData ?? []) as unknown as Row[]).filter(
    (r) => !isJobIndexable(r, now),
  );
  const activeRows = ((activeData ?? []) as unknown as Row[]).filter((r) =>
    isJobIndexable(r, now),
  );

  let deleted = 0;
  let updated = 0;
  let checked = 0;
  let stoppedEarly = false;

  const budgetLeft = () =>
    deleted + updated < MAX_PUBLISHES_PER_RUN && Date.now() - started < TIME_BUDGET_MS;

  for (const row of expiredRows) {
    if (!budgetLeft()) {
      stoppedEarly = true;
      break;
    }
    checked += 1;
    // No wasLive: the metadata probe decides, so never-submitted jobs cost
    // no publish quota.
    const sent = await notifyForJobRow(row.id, row);
    if (sent === "URL_DELETED") deleted += 1;
  }

  for (const row of activeRows) {
    if (!budgetLeft()) {
      stoppedEarly = true;
      break;
    }
    checked += 1;
    const sent = await notifyForJobRow(row.id, row, { liveSince: row.posted_at });
    if (sent === "URL_UPDATED") updated += 1;
  }

  const report = {
    ok: errors.length === 0,
    expiredCandidates: expiredRows.length,
    activationCandidates: activeRows.length,
    checked,
    urlDeletedSent: deleted,
    urlUpdatedSent: updated,
    stoppedEarly,
    errors,
  };
  if (errors.length > 0) console.error("[cron/google-jobs-sync] query errors", errors);
  console.log("[cron/google-jobs-sync]", JSON.stringify(report));
  return NextResponse.json(report, { status: errors.length > 0 ? 500 : 200 });
}
