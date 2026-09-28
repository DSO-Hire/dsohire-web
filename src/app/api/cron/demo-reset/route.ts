/**
 * /api/cron/demo-reset: nightly reseed of the live demo (demo.dsohire.com).
 *
 * The demo banner promises "data resets nightly", and the seed builds every
 * date relative to `now`, but nothing ran it: by September the demo showed
 * candidates "waiting 83 days" and "0 apps this week", which is exactly what
 * a prospect sees after clicking "See it live". This runs the same
 * runDemoSeed() as the founder-only /admin "Reset demo data" button.
 *
 * Safety:
 *   - Hard 404 unless isDemoDeployment() (DEMO_MODE=1 exists only on the
 *     dsohire-demo Vercel project). The same vercel.json cron also fires on
 *     prod, where this route does nothing.
 *   - cleanupLegacy: false, so only seed_batch='demo_v1' rows are touched
 *     (wipeDemoSeed asserts the scope).
 *   - Vercel cron auth: `Authorization: Bearer ${CRON_SECRET}`; the demo
 *     project needs CRON_SECRET set for the job to authorize.
 *
 * Schedule (vercel.json): 08:00 UTC = 3am US Central, low-traffic.
 */

import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isDemoDeployment } from "@/lib/demo/mode";
import { runDemoSeed } from "@/lib/demo-seed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isDemoDeployment()) {
    return new NextResponse(null, { status: 404 });
  }
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ error: "Missing NEXT_PUBLIC_SUPABASE_URL" }, { status: 500 });
  }

  try {
    const result = await runDemoSeed(createSupabaseServiceRoleClient(), {
      supabaseUrl,
      cleanupLegacy: false,
    });
    return NextResponse.json({ ok: true, counts: result.counts });
  } catch (e) {
    console.error("[cron/demo-reset] failed", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
