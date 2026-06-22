/**
 * /admin/analytics/summary.json — gated Vantage data API (build spec §7 / Phase 4).
 *
 * Founder-only JSON summary for the Cowork artifact (Cowork builds the live view
 * on top; Code's job is just this clean, gated endpoint). Same aggregate-only,
 * no-PII firewall as the dashboard.
 *
 * Gate: must be a signed-in superadmin. Unlike the page (which redirects), an
 * API returns 401/403 JSON so a fetch sees a clean status.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSuperadminEmail } from "@/lib/admin/gate";
import {
  loadVantageOverview,
  loadVantageChannels,
  loadVantageTopPages,
  loadVantageGoals,
  loadVantageLoop,
  loadVantageWeeklyCompare,
} from "@/lib/analytics/vantage-dashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!isSuperadminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const [overview, channels, topPages, goals, loop, weekly] = await Promise.all([
    loadVantageOverview(),
    loadVantageChannels(30),
    loadVantageTopPages(30, 25),
    loadVantageGoals(30),
    loadVantageLoop(),
    loadVantageWeeklyCompare(),
  ]);

  return NextResponse.json(
    {
      generated_at: new Date().toISOString(),
      window_days: 30,
      overview,
      weekly_compare: weekly,
      channels,
      top_pages: topPages,
      goals,
      closed_loop: loop,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
