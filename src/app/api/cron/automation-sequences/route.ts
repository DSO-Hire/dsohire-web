/**
 * /api/cron/automation-sequences — N16 v2 drip-sequence sender.
 *
 * Each pass sends the next due step for every active enrollment, honoring the
 * automatic exit conditions (candidate replied, stage moved, offer sent). See
 * lib/sequences/process.ts for the logic.
 *
 * Auth: Bearer ${CRON_SECRET} (same as the other crons). Driven hourly from
 * GitHub Actions (.github/workflows/automation-sequences.yml) because Vercel
 * Hobby rejects sub-daily vercel.json crons. Service-role inside the
 * processor (no per-user context in a cron).
 */

import { NextResponse } from "next/server";
import { processDueSequences } from "@/lib/sequences/process";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const report = await processDueSequences();
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "sequence cron failed";
    console.warn("[sequences] cron failed", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
