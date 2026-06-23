/**
 * GET /feeds/companies/[slug]/jobs.xml — per-DSO syndication feed
 * (Job Distribution Phase 2, optional).
 *
 * Same Indeed source-file format as the global feed, scoped to one DSO so a
 * group can submit just their own roles. The ?source= channel is
 * indeed:[slug] for per-DSO attribution.
 *
 * Launch safety: getPublicJobsForDistribution({ dsoSlug }) returns [] pre-launch
 * and for demo/seed or unknown DSOs, so an unrecognized or demo slug yields a
 * valid empty feed — never seed data. Gate-exempt in proxy.ts.
 */

import { getPublicJobsForDistribution } from "@/lib/distribution/public-jobs";
import { buildIndeedFeedXml } from "@/lib/distribution/indeed-feed";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const jobs = await getPublicJobsForDistribution({ dsoSlug: slug });
  const xml = buildIndeedFeedXml(jobs, {
    source: `indeed:${slug}`,
    buildDate: new Date().toUTCString(),
  });

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=300",
    },
  });
}
