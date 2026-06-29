/**
 * Demo-seed module barrel. Imported by scripts/seed-demo.ts (committed reseed)
 * and the founder-gated /admin "Reset demo data" server action — both call
 * runDemoSeed, so a reset and a re-run are the same code path.
 */

export { runDemoSeed } from "./seed";
export type { SeedOptions, SeedResult } from "./seed";
export { wipeDemoSeed, cleanupLegacyDemoData } from "./wipe";
export {
  SEED_BATCH,
  DEMO_PASSWORD,
  DEMO_EMAIL_DOMAIN,
  nameSlug,
  demoAvatarPath,
  publicImageUrl,
  type Supa,
} from "./constants";
export { HEADSHOT_PERSONAS, DEMO_DSOS, HERO_SLUG } from "./data";
