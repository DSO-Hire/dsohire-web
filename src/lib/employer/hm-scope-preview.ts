"use server";

/**
 * HM scope preview (Phase 4.5.a — final piece).
 *
 * Given a DSO + a candidate set of dso_locations.id values, returns the
 * jobs and applications a hiring manager scoped to those locations would
 * actually see. Mirrors the RLS that ships in production:
 *
 *   - Jobs: visible if at least one job_locations row intersects the
 *     proposed scope, OR if the job's scope is 'regional' or 'corporate'
 *     (which are DSO-wide visible by design — see migration
 *     20260506000011_phase_4_5_b_user_can_access_job_scope_aware.sql).
 *   - Applications: scoped to the visible job set.
 *
 * The caller is the inviting admin (not the future HM), so we use the
 * service-role client to bypass RLS — the logic here IS the RLS, simulated
 * for a hypothetical user. We still enforce that the caller is an
 * owner/admin in the named DSO; otherwise an unauthenticated client could
 * use this action to enumerate someone else's hiring pipeline.
 *
 * Returned counts:
 *   - activeJobs:       jobs whose status = 'active' AND visible to scope
 *   - totalJobs:        all visible jobs (active + closed + draft)
 *   - openApplications: applications on visible jobs whose status is
 *                       not in {rejected, withdrawn, hired}
 *   - locationNames:    pretty names for the requested location ids,
 *                       in the order they were passed (filtered to ones
 *                       that actually belong to this DSO)
 *
 * Used by:
 *   - src/app/employer/team/invite-form.tsx        — live preview as the
 *     admin checks/unchecks locations on the invite form.
 *   - src/app/employer/team/hm-rescope-button.tsx  — same preview inside
 *     the rescope dialog when changing scope on an existing HM.
 *   - src/app/employer/invite/[token]/page.tsx     — read-only "you'll be
 *     managing X jobs and Y candidates at: Olathe + Lawrence" copy on
 *     the HM's invite-acceptance landing.
 */

import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

export interface HmScopePreview {
  ok: boolean;
  /** Active (status='active') jobs the HM would see. */
  activeJobs: number;
  /** All visible jobs (active + closed + draft) the HM would see. */
  totalJobs: number;
  /**
   * Open applications across visible jobs — excludes terminal stages
   * (rejected, withdrawn, hired). Approximates "candidates currently in
   * the pipeline" — better demo signal than total-applications-ever.
   */
  openApplications: number;
  /**
   * The names + state codes of the requested locations, in input order.
   * Filtered to ids that actually belong to the named DSO so a malformed
   * id silently drops out.
   */
  locationNames: string[];
  /**
   * The number of regional / corporate jobs at this DSO, separately
   * counted so the UI can disclose "+ N corporate / regional jobs every
   * teammate sees" beneath the location-specific count.
   */
  regionalOrCorporateJobs: number;
  error?: string;
}

const TERMINAL_STATUSES = ["rejected", "withdrawn", "hired"] as const;

/**
 * Compute the preview for a candidate set of location ids.
 *
 * dsoId is taken from the caller's session — never a client-supplied
 * value. The caller must be owner or admin in that DSO.
 */
export async function previewHmScope(
  rawLocationIds: string[]
): Promise<HmScopePreview> {
  const empty: HmScopePreview = {
    ok: false,
    activeJobs: 0,
    totalJobs: 0,
    openApplications: 0,
    locationNames: [],
    regionalOrCorporateJobs: 0,
  };

  // 1. Auth — caller must be a logged-in DSO owner/admin
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ...empty, error: "Sign in required." };

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) return { ...empty, error: "No DSO membership." };
  if (dsoUser.role !== "owner" && dsoUser.role !== "admin") {
    return { ...empty, error: "Owner or admin only." };
  }
  const dsoId = dsoUser.dso_id as string;

  // 2. Validate the requested location ids — drop any that don't belong
  // to this DSO. Also de-dupe in case the form posted the same id twice.
  const dedupedRequested = Array.from(
    new Set((rawLocationIds ?? []).map((id) => String(id).trim()).filter(Boolean))
  );

  // Service-role client for the rest — we're computing what a future user
  // would see, not what the caller can see, so RLS isn't the right gate.
  const admin = createSupabaseServiceRoleClient();

  const { data: validLocations } = await admin
    .from("dso_locations")
    .select("id, name, state")
    .eq("dso_id", dsoId)
    .in("id", dedupedRequested.length > 0 ? dedupedRequested : ["__none__"]);

  const validLocationsById = new Map(
    ((validLocations ?? []) as Array<{
      id: string;
      name: string;
      state: string | null;
    }>).map((l) => [l.id, l])
  );

  const locationNames: string[] = [];
  for (const id of dedupedRequested) {
    const loc = validLocationsById.get(id);
    if (loc) {
      locationNames.push(loc.state ? `${loc.name} · ${loc.state}` : loc.name);
    }
  }

  const validIds = Array.from(validLocationsById.keys());

  // 3. Always-visible jobs at this DSO — regional + corporate scope.
  // These show up for every DSO member regardless of location tagging,
  // per the locked Phase 4.5.b decision.
  const { data: regionalCorporateJobs } = await admin
    .from("jobs")
    .select("id, status")
    .eq("dso_id", dsoId)
    .is("deleted_at", null)
    .in("scope", ["regional", "corporate"]);

  const regionalCorporateRows = (regionalCorporateJobs ?? []) as Array<{
    id: string;
    status: string;
  }>;
  const regionalOrCorporateJobs = regionalCorporateRows.length;

  // 4. Location-scoped jobs that intersect the proposed scope.
  // Two-step query: first the job_locations rows for the scope, then a
  // jobs lookup by id. Cheaper than a joined query at our row volume.
  let scopeMatchedJobIds: string[] = [];
  if (validIds.length > 0) {
    const { data: jobLocRows } = await admin
      .from("job_locations")
      .select("job_id")
      .in("location_id", validIds);
    scopeMatchedJobIds = Array.from(
      new Set(
        ((jobLocRows ?? []) as Array<{ job_id: string }>).map((r) => r.job_id)
      )
    );
  }

  // Pull the matched jobs to verify they're in the same DSO (defense in
  // depth — job_locations FK already enforces this) and to read status.
  let scopeMatchedJobs: Array<{ id: string; status: string; scope: string | null }> = [];
  if (scopeMatchedJobIds.length > 0) {
    const { data: jobRows } = await admin
      .from("jobs")
      .select("id, status, scope")
      .eq("dso_id", dsoId)
      .is("deleted_at", null)
      .in("id", scopeMatchedJobIds);
    scopeMatchedJobs = (jobRows ?? []) as typeof scopeMatchedJobs;
  }

  // 5. Compose the visible job set — union of regional/corporate + scope.
  // Regional/corporate jobs may also have job_locations rows that match
  // the scope; the Set dedupes.
  const visibleJobIdSet = new Set<string>();
  let activeCount = 0;

  for (const j of regionalCorporateRows) {
    if (!visibleJobIdSet.has(j.id)) {
      visibleJobIdSet.add(j.id);
      if (j.status === "active") activeCount += 1;
    }
  }
  for (const j of scopeMatchedJobs) {
    if (!visibleJobIdSet.has(j.id)) {
      visibleJobIdSet.add(j.id);
      if (j.status === "active") activeCount += 1;
    }
  }

  const totalJobs = visibleJobIdSet.size;
  const activeJobs = activeCount;

  // 6. Open applications on visible jobs.
  let openApplications = 0;
  if (visibleJobIdSet.size > 0) {
    const { count } = await admin
      .from("applications")
      .select("id", { count: "exact", head: true })
      .in("job_id", Array.from(visibleJobIdSet))
      .not("status", "in", `(${TERMINAL_STATUSES.join(",")})`);
    openApplications = count ?? 0;
  }

  return {
    ok: true,
    activeJobs,
    totalJobs,
    openApplications,
    locationNames,
    regionalOrCorporateJobs,
  };
}
