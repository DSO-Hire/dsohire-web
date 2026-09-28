/**
 * The self-serve live demo: demo.dsohire.com/demo signs a visitor into the
 * shared read-only demo_viewer account (see src/app/demo/route.ts and
 * src/lib/demo/mode.ts) and lands them on a real employer dashboard with
 * Bridgeway seed data. Every write is blocked at the DB, capability, and
 * action layers, so it is safe to link from anywhere on the marketing site.
 *
 * The demo runs on its own deployment + database, so anything it learns
 * about a visitor (a ?for= open, a lead from a blocked action) is reported
 * to PROD at PROD_ORIGIN, where marketing_leads / demo_visits live and
 * /admin/leads reads them.
 */
export const DEMO_URL = "https://demo.dsohire.com/demo";
export const DEMO_ORIGIN = "https://demo.dsohire.com";

/** Where the demo deployment sends leads + visit events. */
export const PROD_ORIGIN = process.env.NEXT_PUBLIC_PROD_ORIGIN || "https://dsohire.com";

/** Cookie the /demo route sets so the app can personalize ("Prepared for …"). */
export const DEMO_FOR_COOKIE = "dh_demo_for";

/**
 * Clean a ?for= label for display ("Prepared for Bridgeway Dental").
 * Letters, digits, spaces and a few name characters; collapses whitespace;
 * max 60. Returns null when nothing usable is left.
 */
export function sanitizeForLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/[+_]/g, " ")
    .replace(/[^\p{L}\p{N} &'.,-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

/** Stable dedupe key for a label ("Bridgeway Dental" == "bridgeway-dental"). */
export function forKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
