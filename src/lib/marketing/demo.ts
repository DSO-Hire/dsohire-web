/**
 * The self-serve live demo: demo.dsohire.com/demo signs a visitor into the
 * shared read-only demo_viewer account (see src/app/demo/route.ts and
 * src/lib/demo/mode.ts) and lands them on a real employer dashboard with
 * Bridgeway seed data. Every write is blocked at the DB, capability, and
 * action layers, so it is safe to link from anywhere on the marketing site.
 */
export const DEMO_URL = "https://demo.dsohire.com/demo";
