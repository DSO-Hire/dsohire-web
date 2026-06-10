/**
 * GET /api/employer/applications.csv (Phase 5C / E6.11).
 *
 * DSO-wide CSV export — every application across every job in the
 * caller's DSO. Used by the "Export CSV" button on /employer/reports.
 * Fields mirror the per-job CSV but include the job title for
 * cross-job spreadsheets.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions/capabilities";
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

  // #83 Phase 2 — candidate PII export needs candidates.export
  // (owner/admin preset; grant-only for recruiters).
  if (
    !can(
      dsoUser.role as string,
      (dsoUser as Record<string, unknown>).permission_overrides,
      "candidates.export"
    )
  ) {
    return NextResponse.json(
      { error: "You don't have permission to export candidate data." },
      { status: 403 }
    );
  }

  // `status` (the old enum column) was removed when configurable pipeline
  // stages shipped — derive the export's status from the application's
  // current pipeline stage label, with a `withdrawn_at` override.
  const { data: apps } = await supabase
    .from("applications")
    .select(
      "id, source, created_at, hired_at, withdrawn_at, cover_letter, candidates!inner(full_name, phone, email), jobs!inner(id, title, dso_id), stage:dso_pipeline_stages(label)"
    )
    .eq("jobs.dso_id", dsoUser.dso_id as string)
    .order("created_at", { ascending: false });

  // The to-one `stage` embed comes back as an object, but type defensively
  // (feedback_postgrest_one_to_one_embed_shape).
  const rows = (apps ?? []) as unknown as Array<{
    id: string;
    source: string | null;
    created_at: string;
    hired_at: string | null;
    withdrawn_at: string | null;
    cover_letter: string | null;
    candidates: Array<{
      full_name: string | null;
      phone: string | null;
      email: string | null;
    }>;
    jobs: Array<{ id: string; title: string }>;
    stage: { label: string } | Array<{ label: string }> | null;
  }>;

  const csvRows = rows.map((r) => {
    const cand = r.candidates?.[0];
    const job = r.jobs?.[0];
    const stage = Array.isArray(r.stage) ? r.stage[0] : r.stage;
    const status = r.withdrawn_at ? "Withdrawn" : (stage?.label ?? "");
    const appliedAt = new Date(r.created_at);
    const endAt = r.hired_at ? new Date(r.hired_at) : new Date();
    const daysInPipeline = Math.max(
      0,
      Math.floor(
        (endAt.getTime() - appliedAt.getTime()) / (1000 * 60 * 60 * 24)
      )
    );
    return {
      application_id: r.id,
      job_id: job?.id ?? "",
      job_title: job?.title ?? "",
      candidate_name: cand?.full_name ?? "",
      candidate_email: cand?.email ?? "",
      candidate_phone: cand?.phone ?? "",
      status,
      source: r.source ?? "",
      applied_at: r.created_at,
      hired_at: r.hired_at ?? "",
      days_in_pipeline: daysInPipeline,
    };
  });

  const csv = toCsv(csvRows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename("dso-applications")}"`,
      "Cache-Control": "no-store",
    },
  });
}
