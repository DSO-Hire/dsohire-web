/**
 * Demo Mode — read-only demo_viewer sessions (Demo Mode spec 2026-07-16,
 * built 2026-07-17).
 *
 * A demo visitor browses the REAL employer app on demo.dsohire.com with
 * live Bridgeway seed data; every mutation is blocked and answered with a
 * friendly message. Enforcement is defense in depth:
 *
 *   1. DB: restrictive RLS policies deny INSERT/UPDATE/DELETE to any JWT
 *      whose app_metadata carries demo_viewer=true (migration
 *      20260717*demo_viewer_read_only). Kills every session-client write
 *      even if app code has a bug.
 *   2. Capabilities: the seeded viewer's dso_users row revokes every
 *      capability via permission_overrides, so capability-guarded
 *      service-role actions block through the existing permission model.
 *   3. App: capabilityBlockError/memberBlockError return the demo message
 *      first, and service-role actions OUTSIDE the capability model call
 *      demoWriteBlockError() explicitly.
 *
 * STRUCTURAL PROD-SAFETY: demo mode can only engage when BOTH are true —
 * the DEMO_MODE env flag (set exclusively on the dsohire-demo Vercel
 * project, never dsohire-web) AND the signed-in user's app_metadata has
 * demo_viewer=true (only the seeded demo.viewer account, which exists
 * only in the demo Supabase project). Neither condition is derivable at
 * runtime in prod; there is no cookie/header/query path into demo mode.
 */

import type { User } from "@supabase/supabase-js";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Friendly block copy. One consistent sentence everywhere. */
export const DEMO_BLOCK_MESSAGE =
  "You're in demo mode, so actions that change data are disabled. Everything else is the real product.";

/**
 * True only on the demo deployment. Server-side flag; set DEMO_MODE=1 in
 * the dsohire-demo Vercel project (all environments) and nowhere else.
 */
export function isDemoDeployment(): boolean {
  return process.env.DEMO_MODE === "1";
}

/** Does this auth user carry the demo-viewer mark? (app_metadata is set
 * by the seed via the GoTrue admin API; users cannot self-assign it.) */
export function isDemoViewerUser(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.app_metadata?.demo_viewer === true;
}

/**
 * One-call guard for server actions: resolves the current user and
 * returns DEMO_BLOCK_MESSAGE when a demo viewer is attempting a write on
 * the demo deployment, else null. Mirrors capabilityBlockError's
 * "string error or null" contract so call sites read identically:
 *
 *   const demoBlock = await demoWriteBlockError(supabase);
 *   if (demoBlock) return { ok: false, error: demoBlock };
 */
export async function demoWriteBlockError(
  supabase: SupabaseClient
): Promise<string | null> {
  if (!isDemoDeployment()) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isDemoViewerUser(user) ? DEMO_BLOCK_MESSAGE : null;
}
