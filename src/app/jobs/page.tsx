/**
 * /jobs — public job board.
 *
 * Powered by the search_jobs_public Postgres function (security definer, so
 * RLS doesn't add per-row checks on every search). Filters: query text,
 * state, employment type, role category, posted-within-days.
 *
 * Two view modes via the `view` searchParam:
 *   - default → list of job cards
 *   - "map"   → JobsMap (privacy-preserving radius circles)
 *
 * Filters apply to BOTH views. The map shows a deduped list of locations
 * with their geocoded lat/lng, and groups the matching jobs at each one.
 */

import Link from "next/link";
import { ArrowRight, MapPin, Search, List, Map as MapIcon } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import { JobsMap, type JobsMapLocation } from "@/components/jobs-map";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JobsStateFilter } from "./jobs-state-filter";
import { normalizeStateInput } from "@/lib/us-states";
import { ListSort } from "@/components/ui/list-sort";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Browse Dental Jobs",
  description:
    "Browse jobs at verified dental support organizations. Hygienist, associate dentist, office manager, and specialist roles posted by multi-location DSOs.",
};

const ROLE_LABELS: Record<string, string> = {
  dentist: "Dentist",
  dental_hygienist: "Hygienist",
  dental_assistant: "Dental Assistant",
  front_office: "Front Office",
  office_manager: "Office Manager",
  regional_manager: "Regional Manager",
  specialist: "Specialist",
  other: "Other",
};

// Display order for the /jobs Role filter dropdown — most-common roles first,
// "Other" intentionally omitted (DSOs posting "other" doesn't map to a useful
// candidate filter; those jobs still surface via keyword search).
const ROLE_FILTER_ORDER: ReadonlyArray<keyof typeof ROLE_LABELS> = [
  "dentist",
  "specialist",
  "dental_hygienist",
  "dental_assistant",
  "front_office",
  "office_manager",
  "regional_manager",
];

const EMP_LABELS: Record<string, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  contract: "Contract",
  prn: "PRN",
  locum: "Locum",
};

// Sort options for the public /jobs board. RPC returns by relevance/recency
// already, but candidates skim differently — give them control.
const JOBS_SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "pay", label: "Highest pay" },
  { value: "title", label: "Title (A→Z)" },
] as const;
type JobsSortKey = (typeof JOBS_SORT_OPTIONS)[number]["value"];

interface PageProps {
  searchParams: Promise<{
    q?: string;
    state?: string;
    employment?: string;
    category?: string;
    view?: string;
    sort?: string;
    /** C1.10 — "Posted within": 24h | 7d | 14d | 30d. Anything else is ignored. */
    posted?: string;
  }>;
}

/** Map URL chip values to integer days for the RPC's posted_within_days arg. */
const POSTED_FILTER_OPTIONS = [
  { value: "24h", label: "Last 24h", days: 1 },
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "14d", label: "Last 14 days", days: 14 },
  { value: "30d", label: "Last 30 days", days: 30 },
] as const;
type PostedFilterValue = (typeof POSTED_FILTER_OPTIONS)[number]["value"];

export default async function PublicJobsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  const sortKey: JobsSortKey =
    (JOBS_SORT_OPTIONS.find((o) => o.value === sp.sort)?.value as
      | JobsSortKey
      | undefined) ?? "newest";

  // C1.10 — resolve the posted-within chip into the integer days the
  // RPC accepts. Anything unrecognized falls through to null (no filter).
  const postedFilterValue: PostedFilterValue | null =
    (POSTED_FILTER_OPTIONS.find((o) => o.value === sp.posted)?.value as
      | PostedFilterValue
      | undefined) ?? null;
  const postedWithinDays =
    POSTED_FILTER_OPTIONS.find((o) => o.value === postedFilterValue)?.days ??
    null;

  const { data: rawJobs } = await supabase.rpc("search_jobs_public", {
    query_text: sp.q || null,
    state_filter: sp.state || null,
    employment_filter: sp.employment || null,
    category_filter: sp.category || null,
    posted_within_days: postedWithinDays,
  });

  // Apply candidate-side sort. RPC returns a relevance-blended order; for
  // anything other than the default we re-sort the slice in memory. Always
  // bound to the top 60 first so the comparator runs over a small set.
  const jobs = sortJobsList(
    ((rawJobs ?? []) as JobRow[]).slice(0, 60),
    sortKey
  );

  // Pull DSO names + locations for the cards in one batch
  const dsoIds = Array.from(new Set(jobs.map((j) => j.dso_id)));
  const jobIds = jobs.map((j) => j.id);

  const [{ data: dsos }, { data: jobLocationRows }] = await Promise.all([
    dsoIds.length > 0
      ? supabase.from("dsos").select("id, name, slug").in("id", dsoIds)
      : Promise.resolve({ data: [] }),
    jobIds.length > 0
      ? supabase
          .from("job_locations")
          .select(
            "job_id, location:dso_locations(id, name, city, state, latitude, longitude, public_dso_affiliation)"
          )
          .in("job_id", jobIds)
      : Promise.resolve({ data: [] }),
  ]);

  const dsoMap = new Map(
    ((dsos ?? []) as Array<{ id: string; name: string; slug: string }>).map(
      (d) => [d.id, d]
    )
  );

  // Build the per-job location list (used by the list-view cards)
  const locationMap = new Map<
    string,
    Array<{ city: string | null; state: string | null }>
  >();
  // And the deduped locations list (used by the map view)
  const dedupedLocations = new Map<string, JobsMapLocation>();

  // For affiliation display: track each job's set of linked locations
  // along with their public_dso_affiliation flags. Used below to
  // compute the displayed employer name per job (most-private inherits
  // per Q3 + practice-name fallback for single-location private jobs).
  const jobAffiliationLocations = new Map<
    string,
    Array<{ name: string; isPublic: boolean }>
  >();

  for (const row of (jobLocationRows ?? []) as unknown as Array<{
    job_id: string;
    location: {
      id: string;
      name: string;
      city: string | null;
      state: string | null;
      latitude: number | null;
      longitude: number | null;
      public_dso_affiliation: boolean;
    } | null;
  }>) {
    if (!row.location) continue;

    // Affiliation lookup: every linked location, regardless of geocoded
    // status (used for the most-private-inherits check).
    const affList = jobAffiliationLocations.get(row.job_id) ?? [];
    affList.push({
      name: row.location.name,
      isPublic: row.location.public_dso_affiliation,
    });
    jobAffiliationLocations.set(row.job_id, affList);

    // List-view: just city/state
    const cityList = locationMap.get(row.job_id) ?? [];
    cityList.push({ city: row.location.city, state: row.location.state });
    locationMap.set(row.job_id, cityList);

    // Map-view: only locations with geocoded coords
    if (row.location.latitude !== null && row.location.longitude !== null) {
      const job = jobs.find((j) => j.id === row.job_id);
      if (!job) continue;
      const dso = dsoMap.get(job.dso_id);
      const existing = dedupedLocations.get(row.location.id);
      if (existing) {
        existing.jobs.push({
          id: job.id,
          title: job.title,
          employment_type: job.employment_type,
          role_category: job.role_category,
          dso_id: job.dso_id,
          dso_name: dso?.name ?? "DSO",
        });
      } else {
        dedupedLocations.set(row.location.id, {
          id: row.location.id,
          name: row.location.name,
          city: row.location.city,
          state: row.location.state,
          latitude: row.location.latitude,
          longitude: row.location.longitude,
          jobs: [
            {
              id: job.id,
              title: job.title,
              employment_type: job.employment_type,
              role_category: job.role_category,
              dso_id: job.dso_id,
              dso_name: dso?.name ?? "DSO",
            },
          ],
        });
      }
    }
  }

  const mapLocations = Array.from(dedupedLocations.values());
  const showMap = sp.view === "map";
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? null;

  // Resolve each job's displayed employer name for the public viewer
  // (Phase 4.5.b launch-blocker). Same rule as the SQL helper:
  //   - Every linked location public → DSO name
  //   - Any linked location private → practice name (single-loc) or
  //     "Multiple locations" (multi-loc)
  // Note: this list view doesn't have job.scope loaded, so corporate /
  // regional jobs are handled via their location set being empty (no
  // private location to flip the inherit). Corporate jobs that DO get
  // listed here will fall through to the all-public path since they
  // have no job_locations rows; that matches the helper SQL behavior.
  const displayedEmployerNameByJob = new Map<string, string>();
  for (const job of jobs) {
    const dso = dsoMap.get(job.dso_id);
    const fallbackDsoName = dso?.name ?? "DSO";
    const affLocs = jobAffiliationLocations.get(job.id) ?? [];
    const allPublic = affLocs.length === 0 || affLocs.every((l) => l.isPublic);
    if (allPublic) {
      displayedEmployerNameByJob.set(job.id, fallbackDsoName);
    } else {
      // At least one private location → mask. Single-loc → practice
      // name; multi-loc → neutral "Multiple locations" since showing
      // one practice name out of N would mislead candidates.
      const displayed =
        affLocs.length === 1 ? affLocs[0]!.name : "Multiple locations";
      displayedEmployerNameByJob.set(job.id, displayed);
    }
  }

  // Map view's per-pin job tooltip should also follow the affiliation
  // rule. Patch the pre-built dedupedLocations entries — replace the
  // raw DSO name with the displayed name we just computed.
  for (const loc of mapLocations) {
    for (const j of loc.jobs) {
      const displayed = displayedEmployerNameByJob.get(j.id);
      if (displayed) j.dso_name = displayed;
    }
  }

  // Already-applied set (Cam 2026-05-08 PM) — when a candidate is
  // signed in, mark cards for jobs they've already submitted to so
  // they don't redundantly apply. Anonymous viewers get no badge.
  const appliedJobIds = new Set<string>();
  {
    const {
      data: { user: viewer },
    } = await supabase.auth.getUser();
    if (viewer && jobs.length > 0) {
      const { data: cand } = await supabase
        .from("candidates")
        .select("id")
        .eq("auth_user_id", viewer.id)
        .maybeSingle();
      if (cand) {
        const candidateId = (cand as { id: string }).id;
        const { data: appliedRows } = await supabase
          .from("applications")
          .select("job_id")
          .eq("candidate_id", candidateId)
          .in("job_id", jobIds);
        for (const r of (appliedRows ?? []) as Array<{ job_id: string }>) {
          appliedJobIds.add(r.job_id);
        }
      }
    }
  }

  // Preserve current filters when toggling view modes
  const filterParams: Array<[string, string]> = [];
  if (sp.q) filterParams.push(["q", sp.q]);
  if (sp.state) filterParams.push(["state", sp.state]);
  if (sp.employment) filterParams.push(["employment", sp.employment]);
  if (sp.category) filterParams.push(["category", sp.category]);
  if (postedFilterValue) filterParams.push(["posted", postedFilterValue]);

  /** Build an href that toggles the posted filter chip on or off. */
  const buildPostedHref = (value: PostedFilterValue | null): string => {
    const params: Array<[string, string]> = [];
    if (sp.q) params.push(["q", sp.q]);
    if (sp.state) params.push(["state", sp.state]);
    if (sp.employment) params.push(["employment", sp.employment]);
    if (sp.category) params.push(["category", sp.category]);
    if (showMap) params.push(["view", "map"]);
    if (sortKey !== "newest") params.push(["sort", sortKey]);
    if (value) params.push(["posted", value]);
    return buildHref("/jobs", params);
  };
  // Sort travels with the list view but is meaningless on the map (which
  // groups by location), so we deliberately drop it from mapViewHref.
  const listViewParams =
    sortKey === "newest"
      ? filterParams
      : [...filterParams, ["sort", sortKey] as [string, string]];
  const listViewHref = buildHref("/jobs", listViewParams);
  const mapViewHref = buildHref("/jobs", [...filterParams, ["view", "map"]]);

  return (
    <SiteShell>
      <section className="pt-[140px] pb-12 px-6 sm:px-14 max-w-[1240px] mx-auto">
        <div className="flex items-center gap-3.5 mb-6">
          <span className="block w-7 h-px bg-heritage" />
          <span className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep">
            Open Roles at Verified DSOs
          </span>
        </div>
        <h1 className="text-4xl sm:text-7xl font-extrabold tracking-[-2px] leading-[1.02] text-ink mb-5 max-w-[820px]">
          Find your next role at a real dental group.
        </h1>
        <p className="text-base sm:text-lg text-slate-body leading-relaxed max-w-[640px]">
          Every job on DSO Hire is posted by a verified dental support
          organization — not a recruiter, not a staffing agency, not a solo
          practice with one location.{" "}
          <Link
            href="/companies"
            className="text-heritage hover:text-heritage-deep underline underline-offset-2 font-semibold"
          >
            Browse DSOs →
          </Link>
        </p>

        {/* Search bar */}
        <form
          method="get"
          className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto] gap-px bg-[var(--rule)] border border-[var(--rule)] bg-white"
          style={{ boxShadow: "0 10px 30px -16px rgba(7,15,28,0.14)" }}
        >
          {showMap && <input type="hidden" name="view" value="map" />}
          {/* C1.10 — posted filter is chip-based (below the form). Hidden
              input here keeps the selection alive when the user re-submits
              keyword/role/state/employment via the search bar. */}
          {postedFilterValue && (
            <input type="hidden" name="posted" value={postedFilterValue} />
          )}
          <SearchField
            label="Keyword"
            name="q"
            placeholder="e.g. implants, Spanish-speaking, weekends"
            defaultValue={sp.q}
          />
          <SearchField
            label="Role"
            name="category"
            select
            options={[
              { value: "", label: "Any role" },
              ...ROLE_FILTER_ORDER.map((v) => ({
                value: v,
                label: ROLE_LABELS[v],
              })),
            ]}
            defaultValue={sp.category}
          />
          <div className="px-7 py-5 border-r border-[var(--rule)]">
            <div className="text-[9px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1.5">
              State
            </div>
            <JobsStateFilter
              defaultValue={normalizeStateInput(sp.state)}
            />
          </div>
          <SearchField
            label="Employment"
            name="employment"
            select
            options={[
              { value: "", label: "Any" },
              ...Object.entries(EMP_LABELS).map(([v, l]) => ({
                value: v,
                label: l,
              })),
            ]}
            defaultValue={sp.employment}
            noBorderRight
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 px-9 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors min-h-[80px]"
          >
            <Search className="h-4 w-4" />
            Search
          </button>
        </form>

        {/* C1.10 — Date posted chip filter. Click a chip to apply,
            click the same chip again (or "All") to clear. Persists
            through all other filter submissions via the hidden input
            above. */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-meta mr-2">
            Posted
          </span>
          <Link
            href={buildPostedHref(null)}
            className={
              "px-3 py-1.5 text-[12px] font-semibold border transition-colors " +
              (postedFilterValue === null
                ? "bg-heritage-deep text-ivory border-heritage-deep"
                : "bg-white text-ink border-[var(--rule-strong)] hover:border-heritage")
            }
          >
            All
          </Link>
          {POSTED_FILTER_OPTIONS.map((opt) => {
            const isActive = postedFilterValue === opt.value;
            return (
              <Link
                key={opt.value}
                href={buildPostedHref(isActive ? null : opt.value)}
                className={
                  "px-3 py-1.5 text-[12px] font-semibold border transition-colors " +
                  (isActive
                    ? "bg-heritage-deep text-ivory border-heritage-deep"
                    : "bg-white text-ink border-[var(--rule-strong)] hover:border-heritage")
                }
              >
                {opt.label}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Results */}
      <section className="px-6 sm:px-14 pb-24 max-w-[1240px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-meta">
            {jobs.length === 0
              ? "No jobs found"
              : jobs.length === 1
                ? "1 open role"
                : `${jobs.length} open roles`}
            {showMap && mapLocations.length > 0 && (
              <span className="ml-2 text-slate-body normal-case tracking-normal font-normal">
                · across {mapLocations.length}{" "}
                {mapLocations.length === 1 ? "location" : "locations"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {!showMap && jobs.length > 1 && (
              <ListSort
                basePath="/jobs"
                options={JOBS_SORT_OPTIONS}
                activeValue={sortKey}
                defaultValue="newest"
              />
            )}

            {/* List/Map toggle */}
            <div className="inline-flex border border-[var(--rule-strong)]">
              <Link
                href={listViewHref}
              className={`inline-flex items-center gap-2 px-4 py-2 text-[10px] font-bold tracking-[1.5px] uppercase transition-colors ${
                showMap
                  ? "bg-cream text-slate-body hover:text-ink"
                  : "bg-ink text-ivory"
              }`}
              aria-current={showMap ? undefined : "page"}
            >
              <List className="h-3.5 w-3.5" />
              List
            </Link>
            <Link
              href={mapViewHref}
              className={`inline-flex items-center gap-2 px-4 py-2 text-[10px] font-bold tracking-[1.5px] uppercase transition-colors border-l border-[var(--rule-strong)] ${
                showMap
                  ? "bg-ink text-ivory"
                  : "bg-cream text-slate-body hover:text-ink"
              }`}
              aria-current={showMap ? "page" : undefined}
            >
              <MapIcon className="h-3.5 w-3.5" />
              Map
            </Link>
          </div>
          </div>
        </div>

        {/* MAP VIEW */}
        {showMap ? (
          <JobsMap locations={mapLocations} mapboxToken={mapboxToken} />
        ) : /* LIST VIEW */ jobs.length === 0 ? (
          <div className="border border-[var(--rule)] bg-cream p-12 text-center max-w-[640px] mx-auto">
            <p className="text-[15px] text-ink leading-relaxed mb-4">
              We don&apos;t have any jobs matching that search yet. The platform
              is in early launch — verified DSOs are onboarding through summer 2026.
            </p>
            <p className="text-[14px] text-slate-body leading-relaxed">
              Check back soon, or{" "}
              <Link
                href="/candidate/sign-up"
                className="text-heritage underline underline-offset-2 hover:text-heritage-deep font-semibold"
              >
                create a free candidate account
              </Link>{" "}
              so you&apos;re ready to apply the moment the right role opens.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-[var(--rule)] border border-[var(--rule)]">
            {jobs.map((job) => {
              const locs = locationMap.get(job.id) ?? [];
              const displayed =
                displayedEmployerNameByJob.get(job.id) ?? "DSO";
              return (
                <JobCard
                  key={job.id}
                  job={job}
                  dsoName={displayed}
                  locations={locs}
                  applied={appliedJobIds.has(job.id)}
                />
              );
            })}
          </div>
        )}
      </section>
    </SiteShell>
  );
}

interface JobRow {
  id: string;
  dso_id: string;
  title: string;
  slug: string;
  employment_type: string;
  role_category: string;
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_period: string | null;
  compensation_visible: boolean;
  posted_at: string | null;
}

function JobCard({
  job,
  dsoName,
  locations,
  applied,
}: {
  job: JobRow;
  dsoName: string;
  locations: Array<{ city: string | null; state: string | null }>;
  /** True when the signed-in candidate already applied to this job. */
  applied: boolean;
}) {
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="group block bg-white p-7 hover:bg-cream motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-14px_rgba(7,15,28,0.18)] flex flex-col"
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
          {ROLE_LABELS[job.role_category] ?? job.role_category} ·{" "}
          {EMP_LABELS[job.employment_type] ?? job.employment_type}
        </div>
        {applied && (
          <span className="inline-flex items-center px-2 py-0.5 bg-heritage text-ivory text-[10px] font-bold tracking-[1.2px] uppercase">
            Applied
          </span>
        )}
      </div>
      <div className="text-lg font-extrabold tracking-[-0.4px] text-ink mb-1 leading-tight">
        {job.title}
      </div>
      <div className="text-[14px] text-slate-body mb-4">
        {dsoName}
        {locations.length > 0 && (
          <>
            {" · "}
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3 inline" />
              {formatLocations(locations)}
            </span>
          </>
        )}
      </div>

      <div className="mt-auto pt-4 border-t border-[var(--rule)] flex justify-between items-end">
        <div>
          {job.compensation_visible && job.compensation_min !== null && (
            <div className="text-[14px] font-extrabold text-ink leading-none">
              {formatCompensation(job)}
            </div>
          )}
          {job.compensation_visible && job.compensation_period && (
            <div className="text-[9px] tracking-[1.2px] uppercase text-slate-meta mt-1.5 font-semibold">
              {compensationPeriodLabel(job.compensation_period)}
            </div>
          )}
        </div>
        <div className="w-7 h-7 border border-[var(--rule-strong)] flex items-center justify-center text-heritage-light group-hover:bg-ink group-hover:text-heritage group-hover:border-ink transition-colors">
          <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </Link>
  );
}

function buildHref(base: string, params: Array<[string, string]>): string {
  if (params.length === 0) return base;
  const search = new URLSearchParams(params).toString();
  return `${base}?${search}`;
}

/**
 * Sort the public jobs list by candidate-selectable key.
 *
 * "newest" mirrors the RPC's default ordering (no-op fallback by posted_at
 * desc with null-safe tie-break). "pay" prefers compensation_max desc but
 * skips jobs with hidden comp by sorting them after visible ones — both
 * groups stay internally newest-first so the UX still reads as
 * recency-aware. "title" is straightforward locale-sensitive A→Z.
 */
function sortJobsList(rows: JobRow[], sortKey: JobsSortKey): JobRow[] {
  const sorted = [...rows];
  if (sortKey === "newest") {
    sorted.sort((a, b) => {
      const ta = a.posted_at ? new Date(a.posted_at).getTime() : 0;
      const tb = b.posted_at ? new Date(b.posted_at).getTime() : 0;
      return tb - ta;
    });
  } else if (sortKey === "oldest") {
    sorted.sort((a, b) => {
      const ta = a.posted_at ? new Date(a.posted_at).getTime() : Infinity;
      const tb = b.posted_at ? new Date(b.posted_at).getTime() : Infinity;
      return ta - tb;
    });
  } else if (sortKey === "pay") {
    // Effective comp signal: max if present, else min. Hidden comp goes
    // to the bottom of the list (still recency-sorted within the group).
    const payOf = (j: JobRow): number => {
      if (!j.compensation_visible) return -1;
      return j.compensation_max ?? j.compensation_min ?? 0;
    };
    sorted.sort((a, b) => {
      const pa = payOf(a);
      const pb = payOf(b);
      if (pb !== pa) return pb - pa;
      const ta = a.posted_at ? new Date(a.posted_at).getTime() : 0;
      const tb = b.posted_at ? new Date(b.posted_at).getTime() : 0;
      return tb - ta;
    });
  } else if (sortKey === "title") {
    sorted.sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
    );
  }
  return sorted;
}

function formatLocations(
  locs: Array<{ city: string | null; state: string | null }>
): string {
  if (locs.length === 0) return "";
  if (locs.length === 1) {
    return [locs[0].city, locs[0].state].filter(Boolean).join(", ");
  }
  const states = Array.from(new Set(locs.map((l) => l.state).filter(Boolean)));
  if (states.length === 1) return `${locs.length} locations · ${states[0]}`;
  return `${locs.length} locations`;
}

function formatCompensation(job: JobRow): string {
  if (job.compensation_min === null) return "";
  const fmt = new Intl.NumberFormat("en-US");
  if (job.compensation_max === null) return `$${fmt.format(job.compensation_min)}`;
  if (job.compensation_period === "annual") {
    const minK = Math.round(job.compensation_min / 1000);
    const maxK = Math.round(job.compensation_max / 1000);
    return `$${minK}K–$${maxK}K`;
  }
  return `$${fmt.format(job.compensation_min)}–$${fmt.format(job.compensation_max)}`;
}

function compensationPeriodLabel(p: string): string {
  return { hourly: "Per hour", daily: "Per day", annual: "Annual" }[p] ?? p;
}

function SearchField({
  label,
  name,
  placeholder,
  defaultValue,
  maxLength,
  uppercase,
  select,
  options,
  noBorderRight,
}: {
  label: string;
  name: string;
  placeholder?: string;
  defaultValue?: string;
  maxLength?: number;
  uppercase?: boolean;
  select?: boolean;
  options?: Array<{ value: string; label: string }>;
  noBorderRight?: boolean;
}) {
  return (
    <div
      className={`px-7 py-5 ${
        noBorderRight ? "" : "border-r border-[var(--rule)]"
      }`}
    >
      <div className="text-[9px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1.5">
        {label}
      </div>
      {select && options ? (
        <select
          name={name}
          defaultValue={defaultValue ?? ""}
          className="w-full bg-transparent text-[14px] text-ink outline-none focus:outline-none"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          name={name}
          placeholder={placeholder}
          defaultValue={defaultValue}
          maxLength={maxLength}
          className={`w-full bg-transparent text-[14px] text-ink placeholder:text-slate-meta outline-none focus:outline-none ${
            uppercase ? "uppercase" : ""
          }`}
        />
      )}
    </div>
  );
}
