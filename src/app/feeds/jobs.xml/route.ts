/**
 * GET /feeds/jobs.xml — global syndication feed (Job Distribution Phase 2).
 *
 * Indeed source-file XML of every distributable job across all real DSOs. This
 * is the single URL you submit once to Indeed (and LinkedIn Limited Listings);
 * they re-crawl it on a schedule.
 *
 * Launch safety: the job set comes from getPublicJobsForDistribution(), which
 * returns [] until distribution is explicitly live AND excludes demo/seed DSOs.
 * Pre-launch this serves a valid but EMPTY <source> document — never seed data.
 * The route is gate-exempt in proxy.ts (a machine endpoint, like /api/*), so
 * the empty-content self-gate here is what protects it.
 */

import { getPublicJobsForDistribution } from "@/lib/distribution/public-jobs";
import { buildIndeedFeedXml } from "@/lib/distribution/indeed-feed";

export const dynamic = "force-dynamic";

export async function GET() {
  const jobs = await getPublicJobsForDistribution();
  const xml = buildIndeedFeedXml(jobs, {
    source: "indeed",
    buildDate: new Date().toUTCString(),
  });

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Edge-cache for 15 min; aggregators poll infrequently.
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=300",
    },
  });
}
