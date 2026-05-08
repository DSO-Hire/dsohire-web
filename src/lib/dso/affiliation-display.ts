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
    };
  }
  return all[0]!;
}

async function fetchJobAffiliationContextsBatch(
  jobIds: string[]
): Promise<JobAffiliationContext[]> {
  const admin = createSupabaseServiceRoleClient();

  // Two parallel queries: (1) jobs joined to dsos for the policy, (2)
  // job_locations joined to dso_locations for the affiliation/practice
  // names. Keeps the query plans simple at our row volume.
  const [jobsRes, jobLocsRes] = await Promise.all([
    admin
      .from("jobs")
      .select(
        "id, dso_id, scope, dsos!inner(id, name, affiliation_reveal_policy)"
      )
      .in("id", jobIds),
    admin
      .from("job_locations")
      .select(
        "job_id, dso_locations!inner(id, name, public_dso_affiliation)"
      )
      .in("job_id", jobIds),
  ]);

  type JobRow = {
    id: string;
    dso_id: string;
    scope: "location" | "regional" | "corporate" | null;
    dsos: {
      id: string;
      name: string;
      affiliation_reveal_policy: "never" | "after_hire" | "per_application";
    };
  };
  type JobLocRow = {
    job_id: string;
    dso_locations: {
      id: string;
      name: string;
      public_dso_affiliation: boolean;
    };
  };

  const jobs = (jobsRes.data ?? []) as JobRow[];
  const jobLocs = (jobLocsRes.data ?? []) as JobLocRow[];

  const locsByJob = new Map<
    string,
    Array<{ id: string; name: string; isPublic: boolean }>
  >();
  for (const row of jobLocs) {
    const arr = locsByJob.get(row.job_id) ?? [];
    arr.push({
      id: row.dso_locations.id,
      name: row.dso_locations.name,
      isPublic: row.dso_locations.public_dso_affiliation,
    });
    locsByJob.set(row.job_id, arr);
  }

  return jobs.map<JobAffiliationContext>((j) => {
    const locs = locsByJob.get(j.id) ?? [];
    const allLocationsPublic =
      locs.length > 0 && locs.every((l) => l.isPublic);
    const singlePracticeName = locs.length === 1 ? locs[0]!.name : null;
    return {
      jobId: j.id,
      dsoId: j.dso_id,
      dsoName: j.dsos.name,
      affiliationRevealPolicy: j.dsos.affiliation_reveal_policy,
      allLocationsPublic,
      scope: j.scope ?? "location",
      singlePracticeName,
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
    .select("id, status, affiliation_revealed")
    .eq("id", viewer.applicationId)
    .maybeSingle();
  if (!data) return undefined;
  return {
    id: data.id as string,
    status: data.status as string,
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
    };
  }

  // Location-scope job: apply the public-affiliation rule.
  if (ctx.allLocationsPublic) {
    return {
      name: ctx.dsoName,
      isCorporate: true,
      dsoName: ctx.dsoName,
      practiceName: ctx.singlePracticeName,
    };
  }

  // Job has at least one private location → not publicly affiliated.
  // Branch on viewer:
  //   - public: never see DSO name. Show practice name (single-location)
  //     or "Multiple locations" (multi-location).
  //   - candidate: layered policy from the DSO.
  if (viewer.role === "public") {
    return {
      name: ctx.singlePracticeName ?? "Multiple locations",
      isCorporate: false,
      dsoName: ctx.dsoName,
      practiceName: ctx.singlePracticeName,
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
    };
  }

  return {
    name: ctx.singlePracticeName ?? "Multiple locations",
    isCorporate: false,
    dsoName: ctx.dsoName,
    practiceName: ctx.singlePracticeName,
  };
}
