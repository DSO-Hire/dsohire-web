/**
 * GET /embed/companies/[slug] — frameable careers iframe (Job Distribution
 * Phase 3). Returns minimal, app-chrome-free HTML a DSO can drop into an
 * <iframe> on their own site. Theme via query: ?accent=&theme=light|dark&limit=.
 *
 * Framing: this is the ONLY route that opts into cross-origin framing —
 * Content-Security-Policy: frame-ancestors * is set HERE only. The rest of the
 * app is unaffected. (No X-Frame-Options is set so it doesn't override CSP.)
 *
 * Launch safety: jobs come from getPublicJobsForDistribution({ dsoSlug }) →
 * empty list pre-launch and for demo/seed/unknown slugs; the page then renders
 * the "No open roles right now" state. Never seed data. /embed/* is gate-exempt
 * in proxy.ts; the empty content is the gate.
 */

import { getPublicJobsForDistribution } from "@/lib/distribution/public-jobs";
import { renderEmbedHtml } from "@/lib/distribution/embed-html";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const url = new URL(req.url);
  const jobs = await getPublicJobsForDistribution({ dsoSlug: slug });

  const html = renderEmbedHtml(jobs, {
    slug,
    accent: url.searchParams.get("accent"),
    theme: url.searchParams.get("theme"),
    limit: url.searchParams.get("limit"),
    source: `careers-embed:${slug}`,
  });

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Relax framing for THIS route only.
      "Content-Security-Policy": "frame-ancestors *",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=120",
    },
  });
}
