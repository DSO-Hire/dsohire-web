/**
 * Streamed dashboard panels — perf pass #91, P0-A.
 *
 * Each export is an async server component the page wraps in <Suspense>.
 * The shell (greeting + KPI strip + funnel) paints first; these stream in
 * as their own data resolves — a slow panel never holds the page hostage.
 * Loaders live in ./data.ts and are per-request memoized (React cache()),
 * so a panel that shares data with the shell or a sibling awaits the same
 * in-flight promise instead of re-querying.
 *
 * All rendering + masking logic is ported verbatim from the pre-#91
 * page.tsx — same components, same props, pixel-identical once loaded.
 */

import { KIND_DEFAULT_LABELS } from "@/lib/applications/stages";
import { candidateDisplayName } from "@/lib/applications/candidate-display";
import { buildNextBestActions } from "@/lib/dashboard/next-best-actions";
import { NextBestActions } from "./next-best-actions";
import { LivePulse } from "./live-pulse";
import { InterestedInYou } from "@/components/dashboard/interested-in-you";
import { TodaysTopFits } from "@/components/dashboard/todays-top-fits";
import { CredentialsExpiring } from "@/components/dashboard/credentials-expiring";
import {
  JobHealth,
} from "@/components/dashboard/job-health";
import { LocationPulse } from "@/components/dashboard/location-pulse";
import {
  getCredentials,
  getInterested,
  getJobHealthRows,
  getLocationPulseRows,
  getNowMs,
  getPipeline,
  getPulseData,
  getTopFits,
  STALE_STAGE_DAYS,
  STUCK_SLA_DAYS,
} from "./data";

/**
 * BOH Lane 2a — the ranked attention queue. Unifies the stuck/stale
 * signals (from the pipeline batch) with the day's best fit + inbound
 * interest. Anonymity rule applied HERE (mask before the pure lib ever
 * sees a name): same `anonymized` flag Today's Top Fits renders with.
 */
export async function NextBestActionsSection() {
  const [pipeline, todaysTopFits, interestedCandidates] = await Promise.all([
    getPipeline(),
    getTopFits(),
    getInterested(),
  ]);

  const bestFit = todaysTopFits[0] ?? null;
  const nbaItems = buildNextBestActions({
    stuck: pipeline.stuckCandidates,
    stuckTotal: pipeline.stuckTotalCount,
    slaDays: STUCK_SLA_DAYS,
    stale: pipeline.staleCandidates,
    staleTotal: pipeline.staleTotalCount,
    staleDays: STALE_STAGE_DAYS,
    topFit: bestFit
      ? {
          name: bestFit.anonymized
            ? "An anonymous candidate"
            : (bestFit.full_name ?? "A candidate"),
          jobTitle: bestFit.best_job_title,
          score: bestFit.fit.score,
          interested: bestFit.interested,
          candidateId: bestFit.candidate_id,
        }
      : null,
    interestedCount: interestedCandidates.length,
  });

  return <NextBestActions items={nbaItems} />;
}

/**
 * BOH Lane 2d — seed the live pulse from the same recent-applications
 * data the old Recent Activity section rendered. Names are masked HERE
 * via candidateDisplayName before anything reaches the client; the
 * lookup maps let realtime events resolve friendly copy without ever
 * fetching names client-side.
 */
export async function LivePulseSection() {
  const { recentApps, recentJobMap, recentCandMap } = await getPulseData();
  const nowMs = getNowMs();

  const pulseCandidateNames: Record<string, string> = {};
  for (const [id, cand] of recentCandMap) {
    pulseCandidateNames[id] = candidateDisplayName({
      fullName: cand.full_name,
      candidateId: id,
    });
  }
  const pulseJobTitles: Record<string, string> = {};
  for (const [id, job] of recentJobMap) {
    pulseJobTitles[id] = job.title;
  }
  const pulseSeed = recentApps.slice(0, 7).map((app) => {
    const name = pulseCandidateNames[app.candidate_id] ?? "A candidate";
    const job = recentJobMap.get(app.job_id);
    const stageLabel = KIND_DEFAULT_LABELS[app.kind] ?? app.kind;
    return {
      id: `seed-${app.id}`,
      kind: "app" as const,
      text: `${name} applied — ${job?.title ?? "a role"}${app.kind !== "open" ? ` · now in ${stageLabel}` : ""}`,
      ago: relativeDate(app.created_at, nowMs),
      href: `/employer/applications/${app.id}`,
    };
  });

  return (
    <LivePulse
      initialEvents={pulseSeed}
      jobTitles={pulseJobTitles}
      candidateNames={pulseCandidateNames}
    />
  );
}

/** v3 Phase D — inbound interest (candidates who saved your jobs).
 *  Renders nothing when nobody's saved a job yet. */
export async function InterestedInYouSection() {
  const interestedCandidates = await getInterested();
  return <InterestedInYou candidates={interestedCandidates} />;
}

/** v3 Phase C — Today's top fits (cross-job PracticeFit roll-up).
 *  Renders nothing when there are no scored fits yet. */
export async function TodaysTopFitsSection() {
  const todaysTopFits = await getTopFits();
  return <TodaysTopFits fits={todaysTopFits} />;
}

/** #9c — credential expiry roll-up (hired/active). Renders nothing when
 *  nothing is expired or expiring soon. */
export async function CredentialsExpiringSection() {
  const expiringCredentials = await getCredentials();
  return <CredentialsExpiring items={expiringCredentials} />;
}

/** BOH Lane 2e — per-opening health band (velocity spark + funnel +
 *  freshness), busiest first. */
export async function JobHealthSection() {
  const jobHealthRows = await getJobHealthRows();
  return <JobHealth rows={jobHealthRows} viewAllHref="/employer/pipeline" />;
}

/** Ranked location list (replaced the density-map blob, Day 32). */
export async function LocationPulseSection() {
  const miniMapLocations = await getLocationPulseRows();
  return <LocationPulse locations={miniMapLocations} href="/employer/locations" />;
}

/**
 * Format an ISO date as a casual relative time
 * ("2h ago", "yesterday", "Mar 12"). Used by the pulse seed.
 *
 * Takes `nowMs` as a parameter rather than calling `Date.now()` so the
 * caller can pass the request-snapshot timestamp (getNowMs). Keeps "now"
 * stable across the page render.
 */
function relativeDate(iso: string, nowMs: number): string {
  const ms = nowMs - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
