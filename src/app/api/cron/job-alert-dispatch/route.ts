/**
 * /api/cron/job-alert-dispatch — saved-search job alerts (comp-filter +
 * save-search spec, 2026-07-09). This is the dispatcher the saved-searches
 * schema (20260506000005) deferred — it's what makes the /jobs
 * "Save this search · get alerts" CTA a real promise.
 *
 * Schedule: daily 13:15 UTC via GitHub Actions
 * (.github/workflows/job-alert-dispatch.yml) — GH Actions rather than
 * vercel.json because the Hobby tier caps cron entries; same pattern as
 * practice-fit-digest / interview-reminders.
 *
 * Cadence semantics (candidate_saved_searches.frequency):
 *   • 'instant' + 'daily' — evaluated every (daily) run. True instant
 *     dispatch needs a posted-job trigger; until then instant = daily.
 *   • 'weekly' — evaluated on Monday runs only.
 *   • 'off'    — never evaluated.
 *
 * Correctness seam: matching runs through the SAME search_jobs_public RPC
 * the /jobs page calls (comp floor included), plus the same client-side
 * surface/function scope filter (jobMatchesSurfaceFilters). An alert can
 * never match a different job set than the /jobs filter shows.
 *
 * "New" = posted_at after coalesce(last_dispatched_at, search.created_at).
 * last_dispatched_at only advances on an actual send, so a no-match run
 * never swallows jobs, and a job is never alerted twice for one search.
 *
 * Privacy: DSO names masked via getDisplayedDsoNamesBatch (viewer "public")
 * — candidate-facing mail never carries a privacy-flagged corporate name.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}. Reject anything without it.
 *
 * Safe-testing query params (all optional):
 *   • ?dryRun=1                — evaluate + report, send NOTHING, update NOTHING.
 *   • ?onlyEmail=you@gmail.com — restrict real sends to a single recipient.
 *   • ?limit=N                 — cap saved searches processed this run.
 */

import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { unsubscribePageUrlForEvent } from "@/lib/notifications/unsubscribe";
import { getDisplayedDsoNamesBatch } from "@/lib/dso/affiliation-display";
import {
  sanitizeSavedSearchFilters,
  savedSearchFiltersToRpcArgs,
  savedSearchFiltersToJobsUrl,
  jobMatchesSurfaceFilters,
  effectiveAnnualMax,
  type SavedSearchFilters,
} from "@/lib/jobs/saved-search-filters";
import {
  JobAlertMatch,
  type JobAlertMatchJob,
} from "@/emails/candidate/JobAlertMatch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

/** Max jobs listed in one alert email (total match count still stated). */
const EMAIL_JOB_CAP = 10;
/** Safety cap on saved searches per run (overridable via ?limit). */
const DEFAULT_SEARCH_CAP = 500;

interface AlertRunReport {
  dry_run: boolean;
  searches_evaluated: number;
  searches_matched: number;
  emails_sent: number;
  skipped_no_new: number;
  skipped_no_email: number;
  skipped_suppressed: number;
  emails_failed: number;
  errors: string[];
}

interface SavedSearchRow {
  id: string;
  candidate_id: string;
  name: string;
  filter_state: SavedSearchFilters | null;
  frequency: "instant" | "daily" | "weekly" | "off";
  last_dispatched_at: string | null;
  created_at: string;
}

interface JobRpcRow {
  id: string;
  title: string;
  posted_at: string | null;
  scope: string | null;
  corporate_function: string | null;
  est_annual_min: number | null;
  est_annual_max: number | null;
  compensation_visible: boolean;
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_period: string | null;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const onlyEmail = url.searchParams.get("onlyEmail");
  const limitParam = Number(url.searchParams.get("limit"));
  const searchCap =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.floor(limitParam)
      : DEFAULT_SEARCH_CAP;

  const admin = createSupabaseServiceRoleClient();
  const report: AlertRunReport = {
    dry_run: dryRun,
    searches_evaluated: 0,
    searches_matched: 0,
    emails_sent: 0,
    skipped_no_new: 0,
    skipped_no_email: 0,
    skipped_suppressed: 0,
    emails_failed: 0,
    errors: [],
  };

  // Weekly searches only run on Mondays (UTC — matches the GH cron clock).
  const isMonday = new Date().getUTCDay() === 1;
  const cadences = isMonday
    ? ["instant", "daily", "weekly"]
    : ["instant", "daily"];

  const { data: searchRows, error: searchErr } = await admin
    .from("candidate_saved_searches")
    .select(
      "id, candidate_id, name, filter_state, frequency, last_dispatched_at, created_at"
    )
    .in("frequency", cadences);
  if (searchErr) {
    return NextResponse.json(
      { error: "saved-search query failed", detail: searchErr.message },
      { status: 500 }
    );
  }
  const searches = (searchRows ?? []) as SavedSearchRow[];
  if (searches.length === 0) return NextResponse.json(report);

  // Batch-load the owning candidates (skip soft-deleted / auth-less rows).
  const candidateIds = Array.from(new Set(searches.map((s) => s.candidate_id)));
  const { data: candRows } = await admin
    .from("candidates")
    .select("id, auth_user_id, email, first_name, full_name")
    .in("id", candidateIds)
    .is("deleted_at", null)
    .not("auth_user_id", "is", null);
  const candidateById = new Map(
    ((candRows ?? []) as Array<{
      id: string;
      auth_user_id: string;
      email: string | null;
      first_name: string | null;
      full_name: string | null;
    }>).map((c) => [c.id, c])
  );

  let processed = 0;
  for (const search of searches) {
    if (processed >= searchCap) break;

    const candidate = candidateById.get(search.candidate_id);
    if (!candidate) continue; // deleted / auth-less — dispatcher never alerts them

    const email = candidate.email?.trim() || null;
    if (onlyEmail && email !== onlyEmail) continue;

    processed += 1;
    report.searches_evaluated += 1;

    if (!email) {
      report.skipped_no_email += 1;
      continue;
    }

    try {
      const filters = sanitizeSavedSearchFilters(search.filter_state ?? {});

      // Same RPC as /jobs — comp floor and all other predicates included.
      const { data: rpcRows, error: rpcErr } = await admin.rpc(
        "search_jobs_public",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        savedSearchFiltersToRpcArgs(filters) as any
      );
      if (rpcErr) {
        report.errors.push(`rpc search=${search.id}: ${rpcErr.message}`);
        continue;
      }

      // New since the last alert (or since the search was created).
      const lowerBound = new Date(
        search.last_dispatched_at ?? search.created_at
      ).getTime();
      const fresh = ((rpcRows ?? []) as JobRpcRow[])
        .filter((j) => jobMatchesSurfaceFilters(j, filters))
        .filter(
          (j) => j.posted_at && new Date(j.posted_at).getTime() > lowerBound
        )
        .sort(
          (a, b) =>
            new Date(b.posted_at!).getTime() - new Date(a.posted_at!).getTime()
        );

      if (fresh.length === 0) {
        report.skipped_no_new += 1;
        continue;
      }
      report.searches_matched += 1;

      if (dryRun) {
        report.emails_sent += 1; // would-send count in dry runs
        continue;
      }

      const listed = fresh.slice(0, EMAIL_JOB_CAP);
      const listedIds = listed.map((j) => j.id);

      // Masked employer names + first location per job (privacy boundary).
      const [displayed, { data: locRows }] = await Promise.all([
        getDisplayedDsoNamesBatch({
          jobIds: listedIds,
          viewer: { role: "public" },
        }),
        admin
          .from("job_locations")
          .select("job_id, location:dso_locations(city, state)")
          .in("job_id", listedIds),
      ]);
      const firstLocByJob = new Map<string, string>();
      for (const row of (locRows ?? []) as unknown as Array<{
        job_id: string;
        location: { city: string | null; state: string | null } | null;
      }>) {
        if (!row.location || firstLocByJob.has(row.job_id)) continue;
        const label = [row.location.city, row.location.state]
          .filter(Boolean)
          .join(", ");
        if (label) firstLocByJob.set(row.job_id, label);
      }

      const jobsForEmail: JobAlertMatchJob[] = listed.map((j) => ({
        title: j.title,
        dso_name: displayed.get(j.id)?.name ?? null,
        location_label: firstLocByJob.get(j.id) ?? null,
        comp_label: compLabel(j),
        url: `${SITE_URL}/jobs/${j.id}`,
      }));

      const firstName =
        candidate.first_name?.trim() ||
        candidate.full_name?.trim().split(/\s+/)[0] ||
        "there";

      const unsubscribeUrl =
        unsubscribePageUrlForEvent(candidate.auth_user_id, "job_alert.match") ??
        undefined;

      const result = await dispatchNotification({
        userId: candidate.auth_user_id,
        eventKind: "job_alert.match",
        email: {
          to: email,
          subject: `${fresh.length} new job${
            fresh.length === 1 ? "" : "s"
          } match “${search.name}” · DSO Hire`,
          react: JobAlertMatch({
            recipientFirstName: firstName,
            searchName: search.name,
            jobs: jobsForEmail,
            searchUrl: savedSearchFiltersToJobsUrl(filters, SITE_URL),
            manageUrl: `${SITE_URL}/candidate/settings/credentials`,
            unsubscribeUrl,
          }),
        },
        relatedCandidateId: candidate.id,
      });

      if (result.status === "sent") {
        report.emails_sent += 1;
        // Advance the watermark ONLY on an actual send — a failed send
        // retries the same window next run instead of dropping jobs.
        const { error: updErr } = await admin
          .from("candidate_saved_searches")
          .update({ last_dispatched_at: new Date().toISOString() })
          .eq("id", search.id);
        if (updErr) {
          report.errors.push(
            `watermark search=${search.id}: ${updErr.message}`
          );
        }
      } else if (result.status.startsWith("suppressed")) {
        report.skipped_suppressed += 1;
      } else {
        report.emails_failed += 1;
        report.errors.push(
          `dispatch search=${search.id}: ${result.reason ?? result.status}`
        );
      }
    } catch (err) {
      report.emails_failed += 1;
      report.errors.push(
        `search=${search.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return NextResponse.json(report);
}

/**
 * "$150K–$180K est." annual comp line for the alert email. est_annual atoms
 * win; else the visible published range annualized via effectiveAnnualMax
 * (same fallback the min_comp filter matches on, so a comp-floored alert
 * never lists a job without a comp line).
 */
function compLabel(j: JobRpcRow): string | null {
  const k = (n: number) => `$${Math.round(n / 1000)}K`;
  if (j.est_annual_max !== null) {
    if (j.est_annual_min !== null && j.est_annual_min !== j.est_annual_max) {
      return `${k(j.est_annual_min)}–${k(j.est_annual_max)} est.`;
    }
    return `${k(j.est_annual_max)} est.`;
  }
  const max = effectiveAnnualMax(j);
  if (max === null) return null;
  const min =
    j.compensation_min !== null
      ? effectiveAnnualMax({ ...j, compensation_max: j.compensation_min })
      : null;
  if (min !== null && min !== max) return `${k(min)}–${k(max)} est.`;
  return `${k(max)} est.`;
}
