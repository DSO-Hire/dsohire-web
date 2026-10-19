/**
 * /api/cron/indexnow: daily IndexNow ping with every URL in the sitemap.
 *
 * Re-submitting unchanged URLs is harmless (IndexNow dedupes), and a daily
 * run means new job/company pages and fresh deploys get picked up by Bing and
 * the rest of the IndexNow network within a day, with no deploy hook needed.
 *
 * Safety:
 *   - submitIndexNow() itself no-ops unless indexing is allowed (launched,
 *     not the demo deployment) and VERCEL_ENV === "production". So the same
 *     vercel.json cron firing on the demo project does nothing.
 *   - Vercel cron auth: `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Schedule (vercel.json): 10:00 UTC daily.
 */

import { NextResponse } from "next/server";
import sitemap from "@/app/sitemap";
import { submitIndexNow } from "@/lib/seo/indexnow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const entries = await sitemap();
    const result = await submitIndexNow(entries.map((e) => e.url));
    if (!result.ok && !result.skipped) {
      console.error("[cron/indexnow] submit failed", result.error);
      return NextResponse.json(result, { status: 502 });
    }
    return NextResponse.json({ ...result, sitemapUrls: entries.length });
  } catch (e) {
    console.error("[cron/indexnow] failed", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
