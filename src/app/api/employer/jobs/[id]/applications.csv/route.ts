/**
 * GET /api/employer/jobs/[id]/applications.csv (Phase 5C / E6.11).
 *
 * Streams a CSV of every application for a single job. RLS gates the
 * read — the calling user must be a DSO member of the job's DSO, or
 * the response is an empty list. Fields:
 *   id, candidate_name, candidate_email, status, source, applied_at,
 *   hired_at, days_in_pipeline, cover_letter.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { capabilityBlockError } from "@/lib/permissions/guard";
import { toCsv, csvFilename } from "@/lib/analytics/csv";
import { dispositionLabel } from "@/lib/applications/disposition-reasons";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await context.params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Confirm the user belongs to the job's DSO (defense-in-depth — RLS
  // would also block, but cleaner error message here).
  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, dso_id, posted_at")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // #83 Phase 2 — candidate PII export needs candidates.export.
  const exportBlock = await capabilityBlockError(supabase, "candidates.export", {
    dsoId: job.dso_id as string,
  });
  if (exportBlock) {
    return NextResponse.json({ error: exportBlock }, { status: 403 });
  }

  // `status` (the old enum column) was removed when configurable pipeline
  // stages shipped — derive the export's status from the application's
  // current pipeline stage label, with a `withdrawn_at` override.
  const { data: apps } = await supabase
    .from("applications")
    .select(
      "id, source, created_at, hired_at, withdrawn_at, cover_letter, candidates!inner(full_name, phone, email), stage:dso_pipeline_stages(label)"
    )
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  // !inner returns the joined row as an array — see
  // feedback_supabase_inner_returns_array. The to-one `stage` embed comes
  // back as an object, but type defensively (feedback_postgrest_one_to_one_embed_shape).
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
    stage: { label: string } | Array<{ label: string }> | null;
  }>;

  // Get auth email for each candidate (candidates.email is the guest
  // email; auth-linked candidates have null email + email on auth.users).
  // We skip the auth lookup here — DSO members get whatever's in
  // candidates.email (for guests) and the candidate full_name for
  // authed candidates. Surfacing the auth email per row requires a
  // service-role lookup; defer to v2.

  // #8 — latest structured disposition code per application (rejected/withdrawn).
  const appIds = rows.map((r) => r.id);
  const dispoByApp = new Map<string, string>();
  if (appIds.length > 0) {
    const { data: evRows } = await supabase
      .from("application_status_events")
      .select("application_id, disposition_code, created_at")
      .in("application_id", appIds)
      .not("disposition_code", "is", null)
      .order("created_at", { ascending: false });
    for (const e of (evRows ?? []) as Array<{
      application_id: string;
      disposition_code: string | null;
    }>) {
      if (e.disposition_code && !dispoByApp.has(e.application_id)) {
        dispoByApp.set(e.application_id, e.disposition_code);
      }
    }
  }

  const csvRows = rows.map((r) => {
    const cand = r.candidates?.[0];
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
      candidate_name: cand?.full_name ?? "",
      candidate_email: cand?.email ?? "",
      candidate_phone: cand?.phone ?? "",
      status,
      disposition: dispositionLabel(dispoByApp.get(r.id) ?? null),
      source: r.source ?? "",
      applied_at: r.created_at,
      hired_at: r.hired_at ?? "",
      days_in_pipeline: daysInPipeline,
      cover_letter: r.cover_letter ?? "",
    };
  });

  const csv = toCsv(csvRows);
  const filename = csvFilename(
    `applications-${(job.title as string).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`
  );

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
