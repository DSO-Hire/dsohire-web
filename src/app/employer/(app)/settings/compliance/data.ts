/**
 * Compliance hub — applicant-flow aggregate loader.
 *
 * Server-only. Called ONLY by the compliance page AFTER its eeo.view +
 * Growth+ gates pass. Applications are read through the caller's
 * RLS-scoped client with an explicit dso_id filter; EEO answers are then
 * fetched via the service role (application_eeo_responses is default-deny
 * to employers by design — this and the CSV route are the two sanctioned
 * reads) for exactly those application ids.
 *
 * Returns per-field (value, hired) pairs — NEVER names or per-applicant
 * identifiers. Rendering goes through adverseImpactTable(), which applies
 * small-cell suppression.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { EeoFieldKey } from "@/lib/eeo/options";

export interface ApplicantFlowScope {
  jobId: string | null;
  from: string | null; // YYYY-MM-DD, validated by the caller
  to: string | null;
}

export interface ApplicantFlowAggregate {
  totalApplicants: number;
  byField: Record<
    EeoFieldKey,
    Array<{ value: string | null; hired: boolean }>
  >;
}

export async function loadApplicantFlowAggregate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  dsoId: string,
  scope: ApplicantFlowScope
): Promise<ApplicantFlowAggregate> {
  let query = supabase
    .from("applications")
    .select("id, hired_at, jobs!inner(dso_id)")
    .eq("jobs.dso_id", dsoId);
  if (scope.jobId) query = query.eq("job_id", scope.jobId);
  if (scope.from) query = query.gte("created_at", `${scope.from}T00:00:00Z`);
  if (scope.to) query = query.lte("created_at", `${scope.to}T23:59:59.999Z`);

  const { data: apps } = await query;
  const rows = (apps ?? []) as Array<{ id: string; hired_at: string | null }>;
  const hiredByApp = new Map(rows.map((r) => [r.id, r.hired_at !== null]));
  const appIds = rows.map((r) => r.id);

  const eeoByApp = new Map<
    string,
    Partial<Record<EeoFieldKey, string | null>>
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

  const byField: ApplicantFlowAggregate["byField"] = {
    gender: [],
    race_ethnicity: [],
    veteran_status: [],
    disability_status: [],
  };
  for (const appId of appIds) {
    const eeo = eeoByApp.get(appId) ?? {};
    const hired = hiredByApp.get(appId) ?? false;
    for (const key of Object.keys(byField) as EeoFieldKey[]) {
      byField[key].push({ value: eeo[key] ?? null, hired });
    }
  }

  return { totalApplicants: appIds.length, byField };
}
