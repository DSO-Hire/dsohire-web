/**
 * Server-side pay-transparency publish guard.
 *
 * The client UI adapts (requires a range, force-shows pay, prompts benefits),
 * but the client can never be trusted — every publish path runs through this
 * guard. Two entry points:
 *   • guardNewJobPublish     — for createJob, given the parsed form payload.
 *   • guardExistingJobPublish — for setJobStatus / scheduled publish, loads
 *                               the persisted job + its locations.
 *
 * Both return an error STRING to block publish, or null to allow. The
 * employer can self-certify an exemption (exemptAck) — we never assert
 * coverage ourselves (conduit, not verifier). See pay-transparency.ts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateJobPosting,
  describeBlockingError,
  type PostingLocation,
  type PayTransparencyInput,
} from "./pay-transparency";

/** Look up the state for each dso_locations id. */
async function statesForLocationIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  locationIds: string[]
): Promise<PostingLocation[]> {
  if (locationIds.length === 0) return [];
  const { data } = await supabase
    .from("dso_locations")
    .select("state, city")
    .in("id", locationIds);
  return ((data ?? []) as Array<{ state: string | null; city: string | null }>).map(
    (r) => ({ state: r.state, city: r.city })
  );
}

export interface NewJobPublishParams {
  locationIds: string[];
  workMode?: string | null;
  remoteStates?: string[];
  compType: string;
  compMin: number | null;
  compMax: number | null;
  compVisible: boolean;
  hasBenefits: boolean;
  exemptAck: boolean;
}

/**
 * Guard for createJob. Only call when the job is actually going live
 * (status === "active"); a draft can be saved non-compliant.
 */
export async function guardNewJobPublish(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  params: NewJobPublishParams
): Promise<string | null> {
  if (params.exemptAck) return null;
  const locations = await statesForLocationIds(supabase, params.locationIds);
  const input: PayTransparencyInput = {
    locations,
    workMode: params.workMode ?? null,
    remoteStates: params.remoteStates ?? [],
    compType: params.compType,
    compMin: params.compMin,
    compMax: params.compMax,
    compVisible: params.compVisible,
    hasBenefits: params.hasBenefits,
  };
  return describeBlockingError(evaluateJobPosting(input));
}

/**
 * Guard for setJobStatus → active (and scheduled publish). Loads the
 * persisted job + its attached locations.
 */
export async function guardExistingJobPublish(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  jobId: string,
  exemptAck: boolean
): Promise<string | null> {
  if (exemptAck) return null;

  const { data: job } = await supabase
    .from("jobs")
    .select(
      "compensation_type, compensation_min, compensation_max, compensation_visible, benefits, work_mode, remote_state_restrictions"
    )
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return null; // nothing to validate against; let the update proceed

  const j = job as {
    compensation_type: string;
    compensation_min: number | null;
    compensation_max: number | null;
    compensation_visible: boolean;
    benefits: string[] | null;
    work_mode: string | null;
    remote_state_restrictions: string[] | null;
  };

  const { data: locRows } = await supabase
    .from("job_locations")
    .select("location_id")
    .eq("job_id", jobId);
  const locationIds = ((locRows ?? []) as Array<{ location_id: string }>).map(
    (r) => r.location_id
  );
  const locations = await statesForLocationIds(supabase, locationIds);

  const input: PayTransparencyInput = {
    locations,
    workMode: j.work_mode,
    remoteStates: j.remote_state_restrictions ?? [],
    compType: j.compensation_type,
    compMin: j.compensation_min,
    compMax: j.compensation_max,
    compVisible: j.compensation_visible,
    hasBenefits: (j.benefits ?? []).length > 0,
  };
  return describeBlockingError(evaluateJobPosting(input));
}

export interface UpdatedComp {
  compType: string;
  compMin: number | null;
  compMax: number | null;
  compVisible: boolean;
  hasBenefits: boolean;
}

/**
 * Guard for the sectioned comp edit (updateJobDetailsSection / updateJob on a
 * live posting). Evaluates the NEW comp values the editor just submitted
 * against the job's persisted locality + status. Only blocks when the job is
 * already live ("active") — a draft can still be saved non-compliant. Loads
 * locations + work_mode + remote restrictions from the DB.
 */
export async function guardJobUpdatePublish(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  jobId: string,
  next: UpdatedComp,
  exemptAck: boolean
): Promise<string | null> {
  if (exemptAck) return null;

  const { data: job } = await supabase
    .from("jobs")
    .select("status, work_mode, remote_state_restrictions")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return null;

  const j = job as {
    status: string;
    work_mode: string | null;
    remote_state_restrictions: string[] | null;
  };
  // Only enforce on live postings; drafts may be saved non-compliant.
  if (j.status !== "active") return null;

  const { data: locRows } = await supabase
    .from("job_locations")
    .select("location_id")
    .eq("job_id", jobId);
  const locationIds = ((locRows ?? []) as Array<{ location_id: string }>).map(
    (r) => r.location_id
  );
  const locations = await statesForLocationIds(supabase, locationIds);

  const input: PayTransparencyInput = {
    locations,
    workMode: j.work_mode,
    remoteStates: j.remote_state_restrictions ?? [],
    compType: next.compType,
    compMin: next.compMin,
    compMax: next.compMax,
    compVisible: next.compVisible,
    hasBenefits: next.hasBenefits,
  };
  return describeBlockingError(evaluateJobPosting(input));
}
