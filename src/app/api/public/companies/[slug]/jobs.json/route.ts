/**
 * GET /api/public/companies/[slug]/jobs.json — public, CORS-enabled, read-only
 * jobs API for one DSO (Job Distribution Phase 3). Powers the embeddable
 * careers widget (embed/widget.js) and is callable cross-origin from a DSO's
 * own site.
 *
 * Launch safety: data comes from getPublicJobsForDistribution({ dsoSlug }),
 * which returns [] until distribution is live and for any demo/seed or unknown
 * slug. Pre-launch this returns { jobs: [], count: 0 } — never seed data.
 * (/api/* is already gate-exempt in proxy.ts; the empty content is the gate.)
 */

import { NextResponse } from "next/server";
import {
  getPublicJobsForDistribution,
  publicJobToJson,
} from "@/lib/distribution/public-jobs";

export const dynamic = "force-dynamic";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const jobs = await getPublicJobsForDistribution({ dsoSlug: slug });
  const source = `careers-embed:${slug}`;

  return NextResponse.json(
    {
      slug,
      count: jobs.length,
      jobs: jobs.map((job) => publicJobToJson(job, source)),
    },
    {
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=120",
      },
    },
  );
}
