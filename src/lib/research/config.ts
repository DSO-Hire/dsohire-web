/**
 * DSO Hire Research: draft gate.
 *
 * While RESEARCH_PUBLISHED is false, every /research page emits
 * `robots: noindex, nofollow` (canonical tags still render). Flip it to
 * true and the pages fall back to the site-wide robots policy in
 * src/app/layout.tsx (which itself follows the launch gate), so the
 * research section becomes indexable with this one-line change.
 *
 * TODO when flipping RESEARCH_PUBLISHED to true, also add links in:
 *   1. src/app/sitemap.ts: "/research" plus each RESEARCH_REPORTS slug
 *      (use report.dateModified as lastModified).
 *   2. src/app/llms.txt/route.ts: a "Research" entry per report.
 *   3. src/components/marketing/site-shell.tsx: footer link to /research
 *      (nav is optional).
 *   4. src/app/guides/[slug]/page.tsx INTERNAL_LINK_LABELS, if guides
 *      should cross-link to reports.
 *   5. Ping IndexNow for the new URLs (src/lib/seo/indexnow.ts).
 *   6. The named, sourced comparison pages also ride this gate (they call
 *      researchRobots()): /vs/dentalpost, /vs/cloud-dentistry, and
 *      /vs/dental-hiring-software. On approval add them to sitemap.ts and
 *      llms.txt, and decide on cross-links from /vs/job-boards,
 *      /vs/staffing-agencies, /pricing, and the footer. Re-check every
 *      competitor price against its source first (facts dated 2026-10-19).
 */

import type { Metadata } from "next";

export const RESEARCH_PUBLISHED = true; // published 2026-10-19, Cam approved

/**
 * Robots metadata for a research page. Draft: explicit noindex/nofollow.
 * Published: undefined, so the root layout's env-driven policy applies.
 */
export function researchRobots(
  published: boolean = RESEARCH_PUBLISHED,
): Metadata["robots"] {
  if (published) return undefined;
  return {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  };
}
