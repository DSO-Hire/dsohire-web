/**
 * /employer/applications — cross-job application inbox.
 *
 * Lists all applications across the DSO's jobs with filters by job + status.
 * Click into any row to see candidate detail + transition status.
 */

import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import { redirect } from "next/navigation";
import { EmployerShell } from "@/components/employer/employer-shell";
import { Avatar } from "@/components/ui/avatar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  STAGE_LABELS,
  KANBAN_STAGES,
  CLOSED_STAGES,
  type ApplicationStatus,
} from "@/lib/applications/stages";
import { candidateDisplayName } from "@/lib/applications/candidate-display";
import { getPracticeFit } from "@/lib/practice-fit/get-or-compute";
import { PracticeFitChip } from "@/components/practice-fit/practice-fit-chip";
import type { FitResult } from "@/lib/practice-fit/types";
import { getActiveLocationId } from "@/lib/employer/active-location";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Applications" };

// Status order for the inbox is the canonical pipeline + closed stages, in
// order. Labels come from the shared STAGE_LABELS (Day 7 reconciliation —
// the inbox now uses the same "Screening" / "Interview" copy as the kanban).
const STATUS_ORDER: ApplicationStatus[] = [
  ...KANBAN_STAGES,
  ...CLOSED_STAGES,
];

interface PageProps {
  searchParams: Promise<{
    job?: string;
    status?: string;
    /**
     * Practice Fit sort + filter (Phase 5D v1.2).
     * sort: "fit" → desc by fit score; absent → default (created_at desc)
     * min_fit: "solid" | "strong" | "excellent" → filter rows by bucket floor
     */
    sort?: string;
    min_fit?: string;
  }>;
}

export default async function ApplicationsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  // Auth check + DSO context (shell does this too, but we need dso_id here)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");

  // Multi-location filter (Phase 4.6.d) — when an active location is
  // set, restrict the jobs (and therefore applications) to that
  // location only. Uses the same cookie-backed primitive that
  // /employer/jobs uses, so the rail-level switcher controls every
  // surface consistently.
  const activeLocationId = await getActiveLocationId();
  let locationFilteredJobIds: string[] | null = null;
  if (activeLocationId) {
    const { data: jobLocRows } = await supabase
      .from("job_locations")
      .select("job_id")
      .eq("location_id", activeLocationId);
    locationFilteredJobIds = ((jobLocRows ?? []) as Array<{ job_id: string }>).map(
      (r) => r.job_id
    );
  }

  // Pull all jobs for this DSO (for the filter dropdown + name lookup)
  let jobsQuery = supabase
    .from("jobs")
    .select("id, title, status")
    .eq("dso_id", dsoUser.dso_id as string)
    .is("deleted_at", null);
  if (locationFilteredJobIds !== null) {
    jobsQuery = jobsQuery.in(
      "id",
      locationFilteredJobIds.length > 0 ? locationFilteredJobIds : ["__none__"]
    );
  }
  const { data: rawJobs } = await jobsQuery.order("posted_at", {
    ascending: false,
    nullsFirst: false,
  });

  type JobRow = { id: string; title: string; status: string };
  const jobs = (rawJobs ?? []) as JobRow[];
  const jobMap = new Map(jobs.map((j) => [j.id, j]));
  const dsoJobIds = jobs.map((j) => j.id);

  // Query applications scoped to this DSO's jobs
  let appQuery = supabase
    .from("applications")
    .select(
      "id, job_id, candidate_id, status, cover_letter, created_at, updated_at"
    )
    .in("job_id", dsoJobIds.length > 0 ? dsoJobIds : ["__none__"])
    .order("created_at", { ascending: false });

  if (sp.job) appQuery = appQuery.eq("job_id", sp.job);
  if (sp.status) appQuery = appQuery.eq("status", sp.status);

  const { data: rawApps } = await appQuery;

  type AppRow = {
    id: string;
    job_id: string;
    candidate_id: string;
    status: string;
    cover_letter: string | null;
    created_at: string;
    updated_at: string;
  };
  let apps = (rawApps ?? []) as AppRow[];

  // Pull candidate info in one batch (incl. avatar_url for the row avatar
  // primitive added Cam-feedback 2026-05-06 PM).
  const candidateIds = Array.from(new Set(apps.map((a) => a.candidate_id)));
  const { data: rawCands } = candidateIds.length
    ? await supabase
        .from("candidates")
        .select(
          "id, full_name, current_title, headline, years_experience, avatar_url"
        )
        .in("id", candidateIds)
    : { data: [] };

  type CandRow = {
    id: string;
    full_name: string | null;
    current_title: string | null;
    headline: string | null;
    years_experience: number | null;
    avatar_url: string | null;
  };
  const cands = (rawCands ?? []) as CandRow[];
  const candMap = new Map(cands.map((c) => [c.id, c]));

  // Per-job location label map (Cam feedback 2026-05-06 PM): the inbox
  // needs a practice tag on each row so two applications to identically-
  // titled jobs are visually distinct. Same `buildLocationLabel` shape as
  // the dashboard leaderboard (Phase 4.7.c).
  const jobIdsWithApps = Array.from(new Set(apps.map((a) => a.job_id)));
  const { data: rawJobLocs } = jobIdsWithApps.length
    ? await supabase
        .from("job_locations")
        .select("job_id, dso_locations:dso_locations(id, name, city)")
        .in("job_id", jobIdsWithApps)
    : { data: [] };
  type JobLocRow = {
    job_id: string;
    dso_locations:
      | Array<{ id: string; name: string | null; city: string | null }>
      | { id: string; name: string | null; city: string | null }
      | null;
  };
  const jobLocMap = new Map<
    string,
    Array<{ city: string | null; name: string | null }>
  >();
  for (const row of (rawJobLocs ?? []) as unknown as JobLocRow[]) {
    const loc = Array.isArray(row.dso_locations)
      ? row.dso_locations[0] ?? null
      : row.dso_locations;
    if (!loc) continue;
    const arr = jobLocMap.get(row.job_id) ?? [];
    arr.push({ city: loc.city ?? null, name: loc.name ?? null });
    jobLocMap.set(row.job_id, arr);
  }
  const buildLocationLabel = (
    locs: Array<{ city: string | null; name: string | null }>
  ): string | null => {
    if (locs.length === 0) return null;
    // Prefer practice name (e.g. "67 Dental") over city — DSOs cluster
    // multiple practices in the same city, so city alone doesn't
    // disambiguate. Falls back to city when name is missing.
    const primary = locs[0].name?.trim() || locs[0].city?.trim() || "Location";
    if (locs.length === 1) return primary;
    if (locs.length <= 3) return `${primary} +${locs.length - 1}`;
    return `${locs.length} locations`;
  };

  // Status counts for the tab strip
  const statusCounts: Record<string, number> = {};
  for (const a of apps) {
    statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1;
  }

  // Practice Fit (Phase 5D) — cross-job list, so we fetch per (candidate,
  // job) in parallel. Cached on subsequent renders, so this is fast on
  // re-visit. Map keyed by application_id for quick lookup at render time.
  const fitByAppId = new Map<string, FitResult>();
  if (apps.length > 0) {
    const results = await Promise.all(
      apps.map((a) => getPracticeFit(a.candidate_id, a.job_id))
    );
    apps.forEach((a, i) => {
      const r = results[i];
      if (r) fitByAppId.set(a.id, r);
    });
  }

  // ── Min-fit filter + Practice Fit sort (Phase 5D v1.2) ──────────────
  // Bucket floors map to score thresholds via the locked v1.1 cutoffs
  // (75/60/45/30 — see src/lib/practice-fit/buckets.ts). Apps with no
  // fit (role-filtered or consent-off) are kept when min_fit is unset
  // and dropped when min_fit is active — applying a fit floor to a
  // pair without a score doesn't have a sensible answer; better to
  // hide it than to either accept or reject silently.
  const MIN_FIT_FLOOR: Record<string, number> = {
    solid: 45,
    strong: 60,
    excellent: 75,
  };
  if (sp.min_fit && MIN_FIT_FLOOR[sp.min_fit] !== undefined) {
    const floor = MIN_FIT_FLOOR[sp.min_fit];
    apps = apps.filter((a) => {
      const fit = fitByAppId.get(a.id);
      return fit !== undefined && fit.score >= floor;
    });
  }
  if (sp.sort === "fit") {
    apps = [...apps].sort((a, b) => {
      const sa = fitByAppId.get(a.id)?.score ?? -1;
      const sb = fitByAppId.get(b.id)?.score ?? -1;
      if (sa !== sb) return sb - sa;
      // Stable tiebreaker: original created_at desc — matches the
      // default ordering when fits tie or both are missing.
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  return (
    <EmployerShell active="applications">
      <header className="mb-8">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          Application Inbox
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink">
          Applications
        </h1>
        <p className="mt-3 text-[14px] text-slate-body leading-relaxed max-w-[640px]">
          Every application sent to your jobs. Click into a row to review the
          candidate, read their cover letter, and update status.
        </p>
      </header>

      {/* Filters */}
      <div className="mb-7 flex flex-wrap items-center gap-3">
        <form method="get" className="flex flex-wrap gap-3 items-end">
          <FilterSelect
            label="Job"
            name="job"
            value={sp.job ?? ""}
            options={[
              { value: "", label: "All jobs" },
              ...jobs.map((j) => ({ value: j.id, label: j.title })),
            ]}
          />
          <FilterSelect
            label="Status"
            name="status"
            value={sp.status ?? ""}
            options={[
              { value: "", label: "All statuses" },
              ...STATUS_ORDER.map((s) => ({ value: s, label: STAGE_LABELS[s] })),
            ]}
          />
          <FilterSelect
            label="Min fit"
            name="min_fit"
            value={sp.min_fit ?? ""}
            options={[
              { value: "", label: "Any fit" },
              { value: "solid", label: "Solid (45+)" },
              { value: "strong", label: "Strong (60+)" },
              { value: "excellent", label: "Excellent (75+)" },
            ]}
          />
          <FilterSelect
            label="Sort"
            name="sort"
            value={sp.sort ?? ""}
            options={[
              { value: "", label: "Newest first" },
              { value: "fit", label: "Best fit first" },
            ]}
          />
          <button
            type="submit"
            className="px-5 py-2.5 bg-ink text-ivory text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors"
          >
            Apply
          </button>
          {(sp.job || sp.status || sp.min_fit || sp.sort) && (
            <Link
              href="/employer/applications"
              className="px-5 py-2.5 border border-[var(--rule-strong)] text-ink text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-cream transition-colors"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* Status summary chips */}
      <div className="mb-7 flex flex-wrap gap-2">
        {STATUS_ORDER.filter((s) => statusCounts[s]).map((s) => (
          <Link
            key={s}
            href={
              sp.status === s
                ? "/employer/applications"
                : `/employer/applications?status=${s}`
            }
            className={`text-[10px] font-bold tracking-[1.5px] uppercase px-3 py-1.5 transition-colors ${
              sp.status === s
                ? "bg-ink text-ivory"
                : "bg-cream text-ink hover:bg-[var(--rule)]"
            }`}
          >
            {STAGE_LABELS[s]} · {statusCounts[s]}
          </Link>
        ))}
      </div>

      {/* List */}
      {apps.length === 0 ? (
        <div className="border border-[var(--rule)] bg-white p-12 text-center max-w-[680px]">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
            No applications yet
          </div>
          <p className="text-[15px] text-ink leading-relaxed mb-2">
            {sp.job || sp.status
              ? "Nothing matches your current filters."
              : "Once candidates start applying to your jobs, they'll show up here."}
          </p>
          <p className="text-[14px] text-slate-body leading-relaxed">
            <Link
              href="/employer/jobs"
              className="text-heritage underline underline-offset-2 hover:text-heritage-deep font-semibold"
            >
              Make sure your jobs are active
            </Link>{" "}
            and visible on the public job board.
          </p>
        </div>
      ) : (
        <div className="border border-[var(--rule)] bg-white">
          {apps.map((app) => {
            const job = jobMap.get(app.job_id);
            const cand = candMap.get(app.candidate_id);
            // Inbox can't afford a per-row auth.users lookup, so we fall
            // through to the candidate-id-prefix fallback when full_name is
            // missing. The detail page passes `email` to use the richer
            // email-username fallback there.
            const displayName = candidateDisplayName({
              fullName: cand?.full_name,
              candidateId: app.candidate_id,
            });
            const locationLabel = buildLocationLabel(
              jobLocMap.get(app.job_id) ?? []
            );
            return (
              <div
                key={app.id}
                className="relative p-5 border-b border-[var(--rule)] last:border-0 hover:bg-cream transition-colors"
              >
                {/* Outer overlay link covers the full row for the primary
                    action (open application detail). The content wrapper is
                    pointer-events-none so clicks fall through to the overlay,
                    and the job-title link inside re-enables pointer events
                    via `pointer-events-auto` so it still routes to the
                    kanban. */}
                <Link
                  href={`/employer/applications/${app.id}`}
                  aria-label={`Open application from ${displayName}`}
                  className="absolute inset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-inset"
                />
                <div className="relative pointer-events-none flex items-start gap-4">
                  <Avatar
                    name={cand?.full_name ?? displayName}
                    imageUrl={cand?.avatar_url ?? null}
                    size="lg"
                    className="flex-shrink-0 mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                      <div className="text-[15px] font-bold text-ink truncate">
                        {displayName}
                      </div>
                      <span
                        className={`text-[9px] font-bold tracking-[1.5px] uppercase px-2.5 py-1 ${statusBadgeClass(app.status)}`}
                      >
                        {STAGE_LABELS[app.status as ApplicationStatus] ?? app.status}
                      </span>
                      {fitByAppId.get(app.id) && (
                        <PracticeFitChip
                          fit={fitByAppId.get(app.id) ?? null}
                          size="sm"
                        />
                      )}
                    </div>
                    <div className="text-[14px] text-slate-body mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>Applied to</span>
                      {job ? (
                        <Link
                          href={`/employer/jobs/${job.id}`}
                          className="pointer-events-auto relative z-10 font-semibold text-ink underline-offset-2 hover:text-heritage-deep hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage rounded-sm"
                          title="Open this job's pipeline"
                        >
                          {job.title}
                        </Link>
                      ) : (
                        <span className="font-semibold text-ink">Unknown job</span>
                      )}
                      {locationLabel && (
                        <span
                          className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-heritage/20 bg-heritage/[0.07] px-2 py-0.5 text-[10px] font-bold tracking-[0.5px] text-heritage-deep"
                          title={`Practice: ${locationLabel}`}
                        >
                          <MapPin className="h-2.5 w-2.5" strokeWidth={2.5} />
                          {locationLabel}
                        </span>
                      )}
                    </div>
                    <div className="text-[13px] text-slate-meta">
                      {[cand?.current_title, cand?.headline]
                        .filter(Boolean)
                        .join(" · ") || "Profile minimal"}
                      {cand?.years_experience !== null &&
                        cand?.years_experience !== undefined && (
                          <> · {cand.years_experience} yr exp</>
                        )}
                      {" · "}Applied {new Date(app.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-meta flex-shrink-0 mt-2" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </EmployerShell>
  );
}

function FilterSelect({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <div className="text-[9px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1.5">
        {label}
      </div>
      <select
        name={name}
        defaultValue={value}
        className="px-3 py-2.5 bg-white border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "new":
      return "bg-cream text-ink";
    case "reviewed":
      return "bg-blue-50 text-blue-900";
    case "interviewing":
      return "bg-heritage/10 text-heritage-deep";
    case "offered":
    case "hired":
      return "bg-emerald-50 text-emerald-900";
    case "rejected":
    case "withdrawn":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-cream text-ink";
  }
}
