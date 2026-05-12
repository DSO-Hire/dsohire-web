/**
 * DSO affiliation display helper (private-affiliation toggle, Phase 4.5.b
 * launch-blocker, locked 2026-05-08).
 *
 * Single source of truth for "what name should we display for this job/DSO
 * on this surface to this viewer?" Routes through every public/candidate
 * touchpoint so the affiliation rules stay consistent — flip a location
 * private and every surface picks it up.
 *
 * Three viewer contexts:
 *
 *   - 'employer'  — internal team (owner / admin / recruiter / HM). Always
 *                   sees the corporate DSO name. The employer IS the DSO;
 *                   internal users need the corporate truth to do their
 *                   job. Never call this with `viewer.role = 'employer'`
 *                   from a public surface.
 *
 *   - 'public'    — anonymous + unauthenticated job-board viewers,
 *                   JobPosting JSON-LD, /companies/[slug] consumers. DSO
 *                   name is shown iff `job_is_publicly_dso_affiliated`
 *                   returns true (which is "no linked location is private,
 *                   most-private inherits per Q3"). Otherwise show the
 *                   practice name (single-location) or a neutral
 *                   "Multiple locations" label (multi-location private).
 *
 *   - 'candidate' — authenticated candidate viewing their own application
 *                   surfaces (apply confirmation, candidate dashboard,
 *                   inbox thread, application detail). Layered policy:
 *                   first the public-affiliation check (a publicly-
 *                   affiliated job's DSO name is fair game); if the job is
 *                   privately affiliated, fall through to the DSO's
 *                   `affiliation_reveal_policy`:
 *                     - never           → never show DSO name
 *                     - after_hire      → show iff applications.status =
 *                                         'hired'
 *                     - per_application → show iff applications.
 *                                         affiliation_revealed = true
 *
 * The helper is async because it needs DB lookups; callers should batch
 * via `getDisplayedDsoNamesBatch` when rendering more than one job.
 *
 * Server-side only (uses createSupabaseServiceRoleClient for the helper
 * function calls — they're SECURITY DEFINER but the surrounding queries
 * benefit from RLS bypass since the viewer's RLS context isn't always
 * the right one for this lookup).
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type AffiliationViewer =
  | { role: "employer" }
  | { role: "public" }
  | { role: "candidate"; applicationId: string };

export interface DisplayedDsoName {
  /**
   * The name to show as the "employer" or "company" on this surface. This
   * is the headliner — what would normally be "at {DSO Name}" or "at
   * {Practice Name}." When isCorporate is true, this is the DSO name;
   * when false, it's the practice name (or "Multiple locations" for
   * multi-location private jobs).
   */
  name: string;
  /**
   * True if `name` is the corporate DSO name. False if it's the practice
   * name (or multi-location fallback). Surfaces that branch behavior on
   * this — e.g. "Back to all jobs at {DSO}" link only renders when true,
   * inbox peer name, JSON-LD `hiringOrganization.name`.
   */
  isCorporate: boolean;
  /**
   * The DSO's name regardless of visibility. Useful for surfaces that
   * already have a render path conditioning on isCorporate but want a
   * fallback string available — and for the employer-viewer case where
   * isCorporate is always true.
   */
  dsoName: string;
  /**
   * The single practice name, when the job has exactly one location.
   * Null for multi-location jobs (caller should render "Multiple
   * locations" or branch accordingly). Useful as a subtitle on the
   * /jobs/[id] page even when the corporate DSO is the headliner.
   */
  practiceName: string | null;
  /**
   * The image URL to show alongside the name. Mirrors the masking
   * logic — DSO logo when isCorporate=true, practice logo (single
   * location) when isCorporate=false, null otherwise. Surfaces that
   * render an avatar should swap to this; showing the DSO logo while
   * masking the DSO name is itself a leak (the logo is the brand
   * identity).
   */
  avatarUrl: string | null;
}

/**
 * Per-application affiliation context for candidate-side surfaces.
 * Resolves name + logo for every application in one service-role
 * pass. Use from /candidate/dashboard, /candidate/applications,
 * inbox queries — anywhere you need to mask the DSO identity for the
 * candidate view across many applications efficiently.
 *
 * Service-role on purpose: candidate's RLS path through job_locations
 * + dso_locations was returning empty silently (caught by Cam's stress
 * test on 2026-05-08 PM — DSO name + logo were showing through despite
 * the location toggle being private). Service-role bypasses RLS and
 * gives us the underlying truth; the caller already has authn'd the
 * candidate via their dashboard route guard, so the security boundary
 * isn't "what the candidate can read" — it's "what we choose to show
 * the candidate based on policy."
 */
export async function resolveCandidateApplicationAffiliations(
  applicationIds: string[]
): Promise<Map<string, DisplayedDsoName>> {
  const out = new Map<string, DisplayedDsoName>();
  if (applicationIds.length === 0) return out;

  const admin = createSupabaseServiceRoleClient();

  // Four separate queries instead of one deep nested embed. The
  // nested-embed version (jobs!inner(... dsos!inner(...))) was
  // returning empty silently — caught 2026-05-08 PM stress test
  // when the candidate dashboard kept falling back to "Hiring team."
  // Splitting into flat queries sidesteps every Supabase
  // relationship-name + cardinality + RLS gotcha.

  // 1. Applications — embed stage row so we get the kind in one round trip
  // (affiliation policy keys off "hired" specifically; nothing else here
  // cares about the rest of the kinds).
  const { data: appRows, error: appsErr } = await admin
    .from("applications")
    .select(
      "id, job_id, affiliation_revealed, stage:dso_pipeline_stages!stage_id(kind)"
    )
    .in("id", applicationIds);
  if (appsErr) {
    console.warn("[affiliation] applications lookup failed", appsErr);
    return out;
  }
  const apps = ((appRows ?? []) as Array<Record<string, unknown>>).map(
    (row) => {
      const rel = row.stage as
        | { kind: string }
        | Array<{ kind: string }>
        | null;
      const stageRow = Array.isArray(rel) ? rel[0] ?? null : rel;
      return {
        id: row.id as string,
        job_id: row.job_id as string,
        status: (stageRow?.kind ?? "open") as string,
        affiliation_revealed: row.affiliation_revealed as boolean,
      };
    }
  );
  if (apps.length === 0) return out;

  // 2. Jobs (just dso_id + scope per job)
  const jobIds = Array.from(new Set(apps.map((a) => a.job_id)));
  const { data: jobRows, error: jobsErr } = await admin
    .from("jobs")
    .select("id, dso_id, scope")
    .in("id", jobIds);
  if (jobsErr) {
    console.warn("[affiliation] jobs lookup failed", jobsErr);
    return out;
  }
  const jobsArr = (jobRows ?? []) as Array<{
    id: string;
    dso_id: string;
    scope: "location" | "regional" | "corporate" | null;
  }>;
  const jobMap = new Map(jobsArr.map((j) => [j.id, j]));

  // 3. DSOs (name + logo + policy)
  const dsoIds = Array.from(new Set(jobsArr.map((j) => j.dso_id)));
  const { data: dsoRows, error: dsosErr } = await admin
    .from("dsos")
    .select("id, name, logo_url, affiliation_reveal_policy")
    .in("id", dsoIds);
  if (dsosErr) {
    console.warn("[affiliation] dsos lookup failed", dsosErr);
    return out;
  }
  const dsosArr = (dsoRows ?? []) as Array<{
    id: string;
    name: string;
    logo_url: string | null;
    affiliation_reveal_policy: "never" | "after_hire" | "per_application";
  }>;
  const dsoMap = new Map(dsosArr.map((d) => [d.id, d]));

  // 4. Job-locations + their dso_locations rows. Two-step: the
  // join row (with location_id), then dso_locations by id.
  const { data: jobLocRows, error: jlErr } = await admin
    .from("job_locations")
    .select("job_id, location_id")
    .in("job_id", jobIds);
  if (jlErr) {
    console.warn("[affiliation] job_locations lookup failed", jlErr);
  }
  const jobLocs = (jobLocRows ?? []) as Array<{
    job_id: string;
    location_id: string;
  }>;
  const allLocationIds = Array.from(new Set(jobLocs.map((r) => r.location_id)));
  let locsArr: Array<{
    id: string;
    name: string;
    logo_url: string | null;
    public_dso_affiliation: boolean;
  }> = [];
  if (allLocationIds.length > 0) {
    const { data: locRows, error: locErr } = await admin
      .from("dso_locations")
      .select("id, name, logo_url, public_dso_affiliation")
      .in("id", allLocationIds);
    if (locErr) {
      console.warn("[affiliation] dso_locations lookup failed", locErr);
    }
    locsArr = (locRows ?? []) as typeof locsArr;
  }
  const locById = new Map(locsArr.map((l) => [l.id, l]));

  // Group locations by job, preserving order (first wins for fallback)
  const locsByJob = new Map<
    string,
    Array<{ id: string; name: string; logoUrl: string | null; isPublic: boolean }>
  >();
  for (const jl of jobLocs) {
    const loc = locById.get(jl.location_id);
    if (!loc) continue;
    const list = locsByJob.get(jl.job_id) ?? [];
    list.push({
      id: loc.id,
      name: loc.name,
      logoUrl: loc.logo_url,
      isPublic: loc.public_dso_affiliation,
    });
    locsByJob.set(jl.job_id, list);
  }

  // 5. Resolve each application
  for (const app of apps) {
    const job = jobMap.get(app.job_id);
    if (!job) continue;
    const dso = dsoMap.get(job.dso_id);
    if (!dso) continue;

    const dsoName = dso.name;
    const dsoLogo = dso.logo_url;
    const policy = dso.affiliation_reveal_policy;
    const locs = locsByJob.get(job.id) ?? [];

    // Corporate / regional jobs: governed by jobs.scope, not location
    // tagging. Always show DSO name + logo.
    const isScopeOverride = job.scope === "corporate" || job.scope === "regional";
    const allLocsPublic = locs.length === 0 || locs.every((l) => l.isPublic);
    const jobIsPublicAffiliated = isScopeOverride || allLocsPublic;

    const policyAllowsReveal =
      policy === "after_hire"
        ? app.status === "hired"
        : policy === "per_application"
          ? app.affiliation_revealed === true
          : false;

    const showDsoName = jobIsPublicAffiliated || policyAllowsReveal;

    // Mask fallback: prefer the FIRST PRIVATE location's name + logo.
    // Cam's 2026-05-08 PM direction — "Multiple locations" felt
    // generic and unhelpful; using the actual practice name is more
    // candidate-friendly even when the job spans multiple locations.
    // Most-private-inherits guarantees there's at least one private
    // location to point at. Fall through to the first overall location
    // (defensive) and finally to "Hiring team" only when there are
    // literally no locations on the job.
    const privateLocs = locs.filter((l) => !l.isPublic);
    const fallbackLoc = privateLocs[0] ?? locs[0] ?? null;
    const fallbackName = fallbackLoc?.name ?? "Hiring team";
    const fallbackLogo = fallbackLoc?.logoUrl ?? null;
    const singlePractice = locs.length === 1 ? locs[0]! : null;

    out.set(app.id, {
      name: showDsoName ? dsoName : fallbackName,
      isCorporate: showDsoName,
      dsoName,
      practiceName: singlePractice?.name ?? fallbackLoc?.name ?? null,
      avatarUrl: showDsoName ? dsoLogo : fallbackLogo,
    });
  }

  return out;
}

interface JobAffiliationContext {
  jobId: string;
  dsoId: string;
  dsoName: string;
  affiliationRevealPolicy: "never" | "after_hire" | "per_application";
  /** True if EVERY linked location has public_dso_affiliation = true. */
  allLocationsPublic: boolean;
  /** Job scope — corporate/regional override location-affiliation rules. */
  scope: "location" | "regional" | "corporate";
  /**
   * The single practice name when there's exactly one linked location;
   * null for multi-location jobs.
   */
  singlePracticeName: string | null;
  /**
   * For multi-location jobs: the FIRST linked location's name —
   * preferring the first private location when at least one is
   * private (per Cam 2026-05-08 PM, "Multiple locations" was too
   * generic). Used as the masked display fallback.
   */
  firstLocationName: string | null;
}

/**
 * Resolve a single job's display info for a given viewer.
 *
 * Prefer `getDisplayedDsoNamesBatch` when rendering ≥2 jobs — this
 * function does its own per-call DB round-trip and isn't optimized for
 * loops.
 */
export async function getDisplayedDsoName(params: {
  jobId: string;
  viewer: AffiliationViewer;
}): Promise<DisplayedDsoName> {
  const ctx = await fetchJobAffiliationContext(params.jobId);
  return resolveDisplayedName(ctx, params.viewer, await maybeFetchApplication(params.viewer));
}

/**
 * Batched variant — resolve display info for many jobs in two queries
 * total (jobs + locations). Used by /jobs board and any surface
 * rendering a list. Returns a Map keyed by jobId.
 */
export async function getDisplayedDsoNamesBatch(params: {
  jobIds: string[];
  viewer: AffiliationViewer;
}): Promise<Map<string, DisplayedDsoName>> {
  const out = new Map<string, DisplayedDsoName>();
  if (params.jobIds.length === 0) return out;

  const contexts = await fetchJobAffiliationContextsBatch(params.jobIds);
  const application = await maybeFetchApplication(params.viewer);

  for (const ctx of contexts) {
    out.set(ctx.jobId, resolveDisplayedName(ctx, params.viewer, application));
  }
  return out;
}

/**
 * Convenience for surfaces that already have the job + DSO + locations
 * loaded and want to skip the DB round-trip. The caller passes a
 * pre-built context; this just runs the policy logic. Use this from
 * /jobs/[id] which already loads the full job + DSO + locations bundle.
 */
export function resolveDisplayedDsoNameFromContext(params: {
  context: JobAffiliationContext;
  viewer: AffiliationViewer;
  application?: ApplicationLookup;
}): DisplayedDsoName {
  return resolveDisplayedName(params.context, params.viewer, params.application);
}

export type { JobAffiliationContext };

/* ──────────────────────────────────────────────────────────────────
 * Internal — DB fetch + policy resolution
 * ────────────────────────────────────────────────────────────────── */

interface ApplicationLookup {
  id: string;
  status: string;
  affiliationRevealed: boolean;
}

async function fetchJobAffiliationContext(
  jobId: string
): Promise<JobAffiliationContext> {
  const all = await fetchJobAffiliationContextsBatch([jobId]);
  if (all.length === 0) {
    // Defensive — return a non-affiliated context so callers degrade
    // gracefully (showing a neutral "Multiple locations" label) rather
    // than crashing. Real callers should never hit this with a valid
    // job id; if they do, the upstream lookup is broken.
    return {
      jobId,
      dsoId: "",
      dsoName: "DSO Hire employer",
      affiliationRevealPolicy: "never",
      allLocationsPublic: false,
      scope: "location",
      singlePracticeName: null,
      firstLocationName: null,
    };
  }
  return all[0]!;
}

async function fetchJobAffiliationContextsBatch(
  jobIds: string[]
): Promise<JobAffiliationContext[]> {
  const admin = createSupabaseServiceRoleClient();

  // Four flat queries instead of two with embedded inner-joins. The
  // embedded `dsos!inner(...)` and `dso_locations!inner(...)` selects
  // were silently returning empty in production (caught 2026-05-08 PM
  // when the application detail + /jobs surfaces kept rendering the
  // "Hiring team" fallback). Same fix shape as
  // resolveCandidateApplicationAffiliations — split + JS-side join.
  const { data: jobRows, error: jobsErr } = await admin
    .from("jobs")
    .select("id, dso_id, scope")
    .in("id", jobIds);
  if (jobsErr) {
    console.warn("[affiliation] jobs lookup failed", jobsErr);
    return [];
  }
  const jobsArr = (jobRows ?? []) as Array<{
    id: string;
    dso_id: string;
    scope: "location" | "regional" | "corporate" | null;
  }>;

  const dsoIds = Array.from(new Set(jobsArr.map((j) => j.dso_id)));
  let dsosArr: Array<{
    id: string;
    name: string;
    affiliation_reveal_policy: "never" | "after_hire" | "per_application";
  }> = [];
  if (dsoIds.length > 0) {
    const { data: dsoRows, error: dsosErr } = await admin
      .from("dsos")
      .select("id, name, affiliation_reveal_policy")
      .in("id", dsoIds);
    if (dsosErr) {
      console.warn("[affiliation] dsos lookup failed", dsosErr);
    }
    dsosArr = (dsoRows ?? []) as typeof dsosArr;
  }
  const dsoMap = new Map(dsosArr.map((d) => [d.id, d]));

  const { data: jlRows, error: jlErr } = await admin
    .from("job_locations")
    .select("job_id, location_id")
    .in("job_id", jobIds);
  if (jlErr) {
    console.warn("[affiliation] job_locations lookup failed", jlErr);
  }
  const jobLocs = (jlRows ?? []) as Array<{
    job_id: string;
    location_id: string;
  }>;
  const allLocationIds = Array.from(new Set(jobLocs.map((r) => r.location_id)));
  let locsArr: Array<{
    id: string;
    name: string;
    public_dso_affiliation: boolean;
  }> = [];
  if (allLocationIds.length > 0) {
    const { data: locRows, error: locErr } = await admin
      .from("dso_locations")
      .select("id, name, public_dso_affiliation")
      .in("id", allLocationIds);
    if (locErr) {
      console.warn("[affiliation] dso_locations lookup failed", locErr);
    }
    locsArr = (locRows ?? []) as typeof locsArr;
  }
  const locById = new Map(locsArr.map((l) => [l.id, l]));

  const locsByJob = new Map<
    string,
    Array<{ id: string; name: string; isPublic: boolean }>
  >();
  for (const jl of jobLocs) {
    const loc = locById.get(jl.location_id);
    if (!loc) continue;
    const arr = locsByJob.get(jl.job_id) ?? [];
    arr.push({
      id: loc.id,
      name: loc.name,
      isPublic: loc.public_dso_affiliation,
    });
    locsByJob.set(jl.job_id, arr);
  }

  return jobsArr.map<JobAffiliationContext>((j) => {
    const locs = locsByJob.get(j.id) ?? [];
    const dso = dsoMap.get(j.dso_id);
    const allLocationsPublic =
      locs.length > 0 && locs.every((l) => l.isPublic);
    const singlePracticeName = locs.length === 1 ? locs[0]!.name : null;
    const privateLocs = locs.filter((l) => !l.isPublic);
    const firstLocationName =
      privateLocs[0]?.name ?? locs[0]?.name ?? null;
    return {
      jobId: j.id,
      dsoId: j.dso_id,
      dsoName: dso?.name ?? "DSO",
      affiliationRevealPolicy: dso?.affiliation_reveal_policy ?? "never",
      allLocationsPublic,
      scope: j.scope ?? "location",
      singlePracticeName,
      firstLocationName,
    };
  });
}

async function maybeFetchApplication(
  viewer: AffiliationViewer
): Promise<ApplicationLookup | undefined> {
  if (viewer.role !== "candidate") return undefined;
  const admin = createSupabaseServiceRoleClient();
  const { data } = await admin
    .from("applications")
    .select(
      "id, affiliation_revealed, stage:dso_pipeline_stages!stage_id(kind)"
    )
    .eq("id", viewer.applicationId)
    .maybeSingle();
  if (!data) return undefined;
  const rel = (data as Record<string, unknown>).stage as
    | { kind: string }
    | Array<{ kind: string }>
    | null;
  const stageRow = Array.isArray(rel) ? rel[0] ?? null : rel;
  return {
    id: data.id as string,
    status: (stageRow?.kind ?? "open") as string,
    affiliationRevealed: data.affiliation_revealed as boolean,
  };
}

function resolveDisplayedName(
  ctx: JobAffiliationContext,
  viewer: AffiliationViewer,
  application: ApplicationLookup | undefined
): DisplayedDsoName {
  // Employer always sees the corporate name. No exceptions.
  if (viewer.role === "employer") {
    return {
      name: ctx.dsoName,
      isCorporate: true,
      dsoName: ctx.dsoName,
      practiceName: ctx.singlePracticeName,
      avatarUrl: null,
    };
  }

  // Corporate / regional jobs: governed by jobs.scope, not by location
  // tagging. Always show the DSO name to all viewer contexts since
  // there's no acquired-brand mask at the DSO HQ level.
  if (ctx.scope === "corporate" || ctx.scope === "regional") {
    return {
      name: ctx.dsoName,
      isCorporate: true,
      dsoName: ctx.dsoName,
      practiceName: ctx.singlePracticeName,
      avatarUrl: null,
    };
  }

  // Location-scope job: apply the public-affiliation rule.
  if (ctx.allLocationsPublic) {
    return {
      name: ctx.dsoName,
      isCorporate: true,
      dsoName: ctx.dsoName,
      practiceName: ctx.singlePracticeName,
      avatarUrl: null,
    };
  }

  // Job has at least one private location → not publicly affiliated.
  // Branch on viewer:
  //   - public: never see DSO name. Show practice name (single-location)
  //     or "Multiple locations" (multi-location).
  //   - candidate: layered policy from the DSO.
  if (viewer.role === "public") {
    return {
      name: ctx.singlePracticeName ?? ctx.firstLocationName ?? "Hiring team",
      isCorporate: false,
      dsoName: ctx.dsoName,
      practiceName: ctx.singlePracticeName ?? ctx.firstLocationName,
      avatarUrl: null,
    };
  }

  // viewer.role === 'candidate'
  const policyAllowsReveal = (() => {
    switch (ctx.affiliationRevealPolicy) {
      case "never":
        return false;
      case "after_hire":
        return application?.status === "hired";
      case "per_application":
        return application?.affiliationRevealed === true;
    }
  })();

  if (policyAllowsReveal) {
    return {
      name: ctx.dsoName,
      isCorporate: true,
      dsoName: ctx.dsoName,
      practiceName: ctx.singlePracticeName,
      avatarUrl: null,
    };
  }

  return {
    name: ctx.singlePracticeName ?? ctx.firstLocationName ?? "Hiring team",
    isCorporate: false,
    dsoName: ctx.dsoName,
    practiceName: ctx.singlePracticeName ?? ctx.firstLocationName,
    avatarUrl: null,
  };
}
