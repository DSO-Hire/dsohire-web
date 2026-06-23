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
