/**
 * Launch / distribution gating — the FIRST line of defense for every public
 * distribution surface (syndication feed, public jobs JSON API, embeddable
 * widget + iframe, distribution sitemap entries).
 *
 * Why this exists: the coming-soon proxy gate (src/proxy.ts) exempts `/api/*`
 * and other machine endpoints, and our feed/embed routes must also be
 * machine-reachable (Indeed's crawler can't carry the preview cookie). So the
 * proxy gate does NOT protect distribution data — the content layer must
 * gate itself. Anything that emits real jobs to the outside world calls
 * `isDistributionLive()` and serves an empty result when it returns false.
 *
 * Two independent flags must BOTH be on for distribution to go live:
 *
 *   1. PREVIEW_GATE_DISABLED === "true"  → the site itself has launched
 *      (same flag the proxy uses to drop the coming-soon gate).
 *   2. DISTRIBUTION_LIVE === "true"      → distribution has been explicitly
 *      switched on (default OFF). This stays dark even after the general
 *      launch until the seed/test data scrub is done and we deliberately flip
 *      it — see the go-live checklist.
 *
 * Defense in depth: even if both flags were flipped prematurely, the
 * DSO-level `is_demo` filter in public.list_distribution_jobs() still keeps
 * all current (seed/test) data out. These flags are the outer gate; is_demo
 * is the inner one.
 */

/**
 * True while the site is still behind the pre-launch coming-soon gate.
 * Mirrors the check in src/proxy.ts so the two never disagree.
 */
export function isPreLaunchMode(): boolean {
  return process.env.PREVIEW_GATE_DISABLED !== "true";
}

/**
 * True only when external job distribution should serve real data: the site
 * has launched AND distribution has been explicitly enabled. Defaults to
 * false (dark) in every environment until both flags are set.
 */
export function isDistributionLive(): boolean {
  return !isPreLaunchMode() && process.env.DISTRIBUTION_LIVE === "true";
}

/**
 * True on the demo deployment (demo.dsohire.com — separate Vercel project,
 * separate Supabase project, seeded demo data). The demo site sets
 * PREVIEW_GATE_DISABLED=true so prospects can browse without a cookie, but
 * it must NEVER be indexed or unfurl as the real product: robots.ts and the
 * layout noindex both stay locked when this flag is set.
 *
 * Set DEMO_SITE=true ONLY on the demo Vercel project. Never on prod.
 */
export function isDemoSite(): boolean {
  return process.env.DEMO_SITE === "true";
}

/**
 * True when search engines and social crawlers should be allowed in:
 * the site has launched AND this is not the demo deployment. Single source
 * of truth for robots.ts and the site-wide metadata robots block, so the
 * two can never disagree.
 */
export function isIndexingAllowed(): boolean {
  return !isPreLaunchMode() && !isDemoSite();
}
