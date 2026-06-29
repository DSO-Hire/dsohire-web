/**
 * Demo-seed shared constants.
 *
 * The current Supabase project (viapivvlhjqvjhoflxmp) is being turned into the
 * gated DEMO environment. Everything the seed creates is stamped with
 * SEED_BATCH so the idempotent reseed (scripts/seed-demo.ts) and the
 * founder-gated /admin "Reset demo data" button can wipe-and-reseed ONLY the
 * demo-owned rows — never anything real. See
 * supabase/migrations/20260629120000_demo_seed_batch.sql.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** The marker stamped on every demo-owned dsos/candidates row. */
export const SEED_BATCH = "demo_v1";

/** Stamped into analytics.events.props and auth user_metadata too. */
export const SEED_BATCH_KEY = "seed_batch";

/**
 * Shared demo-grade password for every seeded login. Not "password" (per
 * spec) but clearly a demo passphrase, fine for a gated pre-launch site.
 */
export const DEMO_PASSWORD = "DsoHireDemo!2026";

/**
 * All seeded auth users use this email domain so they're trivially
 * identifiable and never collide with a real signup.
 */
export const DEMO_EMAIL_DOMAIN = "demo.dsohire.com";

/** Untyped service-role client (the repo's clients carry no Database generic). */
export type Supa = SupabaseClient;

/** Public URL for an object in the public `public-images` bucket. */
export function publicImageUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/public-images/${path}`;
}

/** Deterministic storage path for a candidate's demo headshot. */
export function demoAvatarPath(candidateSlug: string): string {
  return `demo/headshots/${candidateSlug}.png`;
}

/** Slug from a person's name — shared by the candidate planner and the headshot
 *  uploader so avatar storage paths line up with candidate rows. */
export function nameSlug(first: string, last: string): string {
  return `${first}-${last}`.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
}

/** Deterministic storage path for a DSO's demo logo (SVG). */
export function demoLogoPath(dsoSlug: string): string {
  return `demo/logos/${dsoSlug}.svg`;
}

/**
 * Throwing insert helper. The Supabase clients are untyped, so we cast rows to
 * the generic insert shape and surface any PostgREST error loudly — a silent
 * partial seed is worse than a hard stop.
 */
export async function insertRows(
  supa: Supa,
  table: string,
  rows: Record<string, unknown>[],
  label?: string
): Promise<void> {
  if (rows.length === 0) return;
  // chunk to keep payloads sane on the big tables (analytics events etc.)
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supa.from(table).insert(slice as never);
    if (error) {
      throw new Error(
        `[demo-seed] insert into ${label ?? table} failed (${slice.length} rows, offset ${i}): ${error.message}`
      );
    }
  }
}

/** A simple deterministic PRNG (mulberry32) so reseeds are byte-identical. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick a deterministic element from `arr` using rng. */
export function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** ISO timestamp `days` ago from `now` (optionally minus extra hours). */
export function daysAgo(now: Date, days: number, hours = 0): string {
  const d = new Date(now.getTime() - days * 86400000 - hours * 3600000);
  return d.toISOString();
}

/** YYYY-MM-DD `days` from now (negative = past). For date columns. */
export function dateOffset(now: Date, days: number): string {
  const d = new Date(now.getTime() + days * 86400000);
  return d.toISOString().slice(0, 10);
}
