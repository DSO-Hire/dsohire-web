/**
 * GET /api/employer/eeo-applicant-flow.csv — OFCCP applicant-flow + EEO
 * export (Compliance hub spec, 2026-07-09).
 *
 * THE one sanctioned surface where individual voluntary self-ID responses
 * (application_eeo_responses) reach an employer — a compliance-authorized
 * user downloading their DSO's own applicant-flow data for AAP /
 * adverse-impact analysis. Everything about this route is about keeping
 * that narrow:
 *
 *   • eeo.view capability enforced server-side (owner by preset; admin
 *     only via explicit grant; recruiter/hiring_manager can NEVER hold it
 *     — ADMIN_ONLY floor in capabilities.ts). 403 otherwise.
 *   • Growth+ tier enforced (mirrors the Compliance hub's page gate).
 *   • Applications are read through the CALLER'S RLS-scoped client with
 *     an explicit dso_id filter — cross-DSO leakage is impossible even if
 *     a query param lies. EEO rows are then fetched via service role
 *     (the table is default-deny to employers by design) for exactly
 *     those application ids.
 *   • Every download writes an immutable audit_events row (who, scope,
 *     row count). The audit row carries NO EEO data.
 *   • "decline" answers export as "Declined"; unanswered as "Not
 *     provided" — voluntariness stays legible (spec §1).
 *
 * Query params: ?job=<uuid|all> &from=YYYY-MM-DD &to=YYYY-MM-DD
 * Structural pattern mirrors applications.csv/route.ts.
 */

import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { can } from "@/lib/permissions/capabilities";
import { getActiveSubscription } from "@/lib/billing/subscription";
import { toCsv, csvFilename } from "@/lib/analytics/csv";
import { dispositionLabel } from "@/lib/applications/disposition-reasons";
import { recordAuditEvent } from "@/lib/audit/record";
import { EEO_FIELDS } from "@/lib/eeo/options";
import { eeoExportLabel } from "@/lib/eeo/export";

export const dynamic = "force-dynamic";

/** Tiers with access to the Compliance hub (same set as the page gate). */
const COMPLIANCE_TIERS = new Set(["growth", "scale", "enterprise"]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role, permission_overrides, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) {
    return NextResponse.json({ error: "no dso" }, { status: 403 });
  }
  const dsoId = dsoUser.dso_id as string;

  // §1 — the firewall gate. Never recruiters/hiring managers (the
  // capability floor in capabilities.ts makes that non-overridable).
  if (
    !can(
      dsoUser.role as string,
      (dsoUser as Record<string, unknown>).permission_overrides,
      "eeo.view"
    )
  ) {
    return NextResponse.json(
      {
        error:
          "EEO exports require compliance access (owner, or an explicit EEO grant).",
      },
      { status: 403 }
    );
  }

  // Growth+ tier gate — mirrors the Compliance hub page.
  const sub = await getActiveSubscription(supabase, dsoId);
  if (!sub || !COMPLIANCE_TIERS.has(sub.tier)) {
    return NextResponse.json(
      { error: "The Compliance hub is a Growth+ feature." },
      { status: 403 }
    );
  }

  // Scope params (all optional; bogus values are dropped, not errored).
  const url = new URL(request.url);
  const jobParam = url.searchParams.get("job");
  const jobId = jobParam && UUID_RE.test(jobParam) ? jobParam : null;
  const fromParam = url.searchParams.get("from");
  const from = fromParam && DATE_RE.test(fromParam) ? fromParam : null;
  const toParam = url.searchParams.get("to");
  const to = toParam && DATE_RE.test(toParam) ? toParam : null;

  // Applications via the caller's RLS-scoped client + explicit DSO filter.
  let query = supabase
    .from("applications")
    .select(
      "id, candidate_id, source, created_at, hired_at, withdrawn_at, candidates!inner(full_name), jobs!inner(id, title, role_category, dso_id), stage:dso_pipeline_stages(label)"
    )
    .eq("jobs.dso_id", dsoId)
    .order("created_at", { ascending: true });
  if (jobId) query = query.eq("job_id", jobId);
  if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

  const { data: apps, error: appsErr } = await query;
  if (appsErr) {
    console.error("[eeo-export] applications query failed", appsErr);
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }

  // PostgREST may return to-one embeds as an object OR a one-element
  // array depending on relationship detection — normalize both shapes
  // (feedback_postgrest_one_to_one_embed_shape).
  const one = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  const rows = (apps ?? []) as unknown as Array<{
    id: string;
    candidate_id: string;
    source: string | null;
    created_at: string;
    hired_at: string | null;
    withdrawn_at: string | null;
    candidates:
      | { full_name: string | null }
      | Array<{ full_name: string | null }>;
    jobs:
      | { id: string; title: string; role_category: string }
      | Array<{ id: string; title: string; role_category: string }>;
    stage: { label: string } | Array<{ label: string }> | null;
  }>;
  const appIds = rows.map((r) => r.id);

  // Latest structured disposition code per application (same pattern as
  // applications.csv).
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

  // Location state per job (first linked location's state).
  const jobIds = Array.from(
    new Set(rows.map((r) => one(r.jobs)?.id).filter(Boolean))
  );
  const stateByJob = new Map<string, string>();
  if (jobIds.length > 0) {
    const { data: locRows } = await supabase
      .from("job_locations")
      .select("job_id, location:dso_locations(state)")
      .in("job_id", jobIds as string[]);
    for (const row of (locRows ?? []) as unknown as Array<{
      job_id: string;
      location: { state: string | null } | null;
    }>) {
      if (row.location?.state && !stateByJob.has(row.job_id)) {
        stateByJob.set(row.job_id, row.location.state);
      }
    }
  }

  // EEO responses — SERVICE ROLE, only after the gates above passed, only
  // for application ids already proven to belong to this DSO. The table
  // is default-deny to employers by design; this is the sanctioned read.
  const eeoByApp = new Map<
    string,
    {
      gender: string | null;
      race_ethnicity: string | null;
      veteran_status: string | null;
      disability_status: string | null;
    }
  >();
  if (appIds.length > 0) {
    const admin = createSupabaseServiceRoleClient();
    const { data: eeoRows } = await admin
      .from("application_eeo_responses")
      .select(
        "application_id, gender, race_ethnicity, veteran_status, disability_status"
      )
      .in("application_id", appIds);
    for (const r of (eeoRows ?? []) as Array<{
      application_id: string;
      gender: string | null;
      race_ethnicity: string | null;
      veteran_status: string | null;
      disability_status: string | null;
    }>) {
      eeoByApp.set(r.application_id, r);
    }
  }

  const csvRows = rows.map((r) => {
    const job = one(r.jobs);
    const stage = one(r.stage);
    const eeo = eeoByApp.get(r.id) ?? null;
    const finalStatus = r.hired_at
      ? "Hired"
      : r.withdrawn_at
        ? "Withdrawn"
        : (stage?.label ?? "");
    return {
      application_id: r.id,
      applicant_ref: r.candidate_id,
      applicant_name: one(r.candidates)?.full_name ?? "",
      job_id: job?.id ?? "",
      job_title: job?.title ?? "",
      job_group: job?.role_category ?? "",
      location_state: stateByJob.get(job?.id ?? "") ?? "",
      application_date: r.created_at,
      final_status: finalStatus,
      disposition: dispositionLabel(dispoByApp.get(r.id) ?? null),
      hired: r.hired_at ? "Yes" : "No",
      hired_date: r.hired_at ?? "",
      source: r.source ?? "",
      // Voluntary self-ID — "Declined" preserved, unanswered = "Not provided".
      ...Object.fromEntries(
        EEO_FIELDS.map((f) => [
          f.key,
          eeoExportLabel(f.key, eeo?.[f.key] ?? null),
        ])
      ),
    };
  });

  // §1 — immutable audit row per export. Scope + count only; NO EEO data.
  await recordAuditEvent({
    dsoId,
    actorUserId: user.id,
    eventKind: "compliance.eeo_export",
    targetTable: jobId ? "jobs" : null,
    targetId: jobId,
    summary: `EEO applicant-flow export — ${csvRows.length} row${
      csvRows.length === 1 ? "" : "s"
    } (${jobId ? "one job" : "all jobs"}${from ? `, from ${from}` : ""}${
      to ? `, to ${to}` : ""
    })`,
    metadata: {
      job_id: jobId,
      date_from: from,
      date_to: to,
      row_count: csvRows.length,
    },
  });

  const csv = toCsv(csvRows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename("eeo-applicant-flow")}"`,
      "Cache-Control": "no-store",
    },
  });
}
