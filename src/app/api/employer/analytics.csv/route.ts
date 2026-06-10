/**
 * GET /api/employer/analytics.csv (Analytics Phase 4).
 *
 * Per-practice analytics rollup as CSV — the portfolio table, exportable for
 * board decks / spreadsheets. One row per location with open roles, 30-day
 * applications, quarter hires, and average time-to-fill.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions/capabilities";
import { getDsoCrossLocationStats } from "@/lib/analytics/metrics";
import { toCsv, csvFilename } from "@/lib/analytics/csv";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role, permission_overrides")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) {
    return NextResponse.json({ error: "no dso" }, { status: 403 });
  }

  // #83 Phase 2 — aggregate metrics export rides analytics.view (no PII).
  if (
    !can(
      dsoUser.role as string,
      (dsoUser as Record<string, unknown>).permission_overrides,
      "analytics.view"
    )
  ) {
    return NextResponse.json(
      { error: "You don't have permission to view analytics." },
      { status: 403 }
    );
  }

  const rows = await getDsoCrossLocationStats(
    supabase,
    dsoUser.dso_id as string
  );

  const csvRows = rows.map((r) => ({
    practice: r.name,
    city: r.city ?? "",
    state: r.state ?? "",
    open_roles: r.open_roles,
    applications_30d: r.apps_30d,
    hires_quarter: r.hires_quarter,
    avg_time_to_fill_days:
      r.avg_time_to_fill_days != null
        ? Math.round(r.avg_time_to_fill_days)
        : "",
  }));

  const csv = toCsv(csvRows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename("dso-analytics-by-practice")}"`,
      "Cache-Control": "no-store",
    },
  });
}
