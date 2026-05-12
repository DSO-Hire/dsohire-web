/**
 * /candidate/applications — Phase 4.4 7-tab IA + per-row card.
 *
 * Tabs (locked from scope §4.4):
 *   All / Active / Interview / Offer / Closed / Saved / Hidden
 *
 * Per-row card (locked):
 *   • Status pill (or "In review" when hide_stages_from_candidate=true)
 *   • Practice Fit chip placeholder (Phase 5D)
 *   • Title · Employer
 *   • Scope chip (location count for now; jobs.scope enum lands later)
 *   • "Applied {date}" + "Updated {ago}"
 *   • Unread message badge
 *
 * Withdraw flow + self-update status overflow menu are deferred to a
 * dedicated Phase 4.4 sub-pass (the application_status enum already
 * supports `withdrawn` so the schema's ready when the action ships).
 *
 * Hidden tab is a v1 stub — needs an `applications.hidden_at` column +
 * a hide action; ships with the withdraw + self-update build.
 */

import Link from "next/link";
import {
  ChevronRight,
  Briefcase,
  MessageCircle,
  Bookmark,
  MapPin,
  Sparkles,
} from "lucide-react";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { PracticeFitChip } from "@/components/practice-fit/practice-fit-chip";
import {
  PracticeFitPlaceholder,
  classifyPlaceholderReason,
  type PlaceholderReason,
} from "@/components/practice-fit/placeholder";
import { getPracticeFit } from "@/lib/practice-fit/get-or-compute";
import {
  resolveCandidateApplicationAffiliations,
  getDisplayedDsoNamesBatch,
} from "@/lib/dso/affiliation-display";
import type { FitResult } from "@/lib/practice-fit/types";
import { StatusProgress } from "@/components/dashboard/status-progress";
import {
  KIND_DEFAULT_LABELS,
  CANDIDATE_KIND_LABELS,
  type StageKind,
} from "@/lib/applications/stages";
import { RowActionsMenu } from "./row-actions-menu";
import type { SelfReportedStatus } from "./row-actions-data";
import { ListSort } from "@/components/ui/list-sort";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "My Applications" };

type TabKey =
  | "all"
  | "active"
  | "interview"
  | "offer"
  | "closed"
  | "saved"
  | "hidden";

const TAB_ORDER: ReadonlyArray<TabKey> = [
  "all",
  "active",
  "interview",
  "offer",
  "closed",
  "saved",
  "hidden",
];

const TAB_LABELS: Record<TabKey, string> = {
  all: "All",
  active: "Active",
  interview: "Interview",
  offer: "Offer",
  closed: "Closed",
  saved: "Saved",
  hidden: "Hidden",
};

interface PageProps {
  searchParams: Promise<{ tab?: string | string[]; sort?: string }>;
}

const APPS_SORT_OPTIONS = [
  { value: "newest", label: "Most recently applied" },
  { value: "oldest", label: "Oldest first" },
  { value: "updated", label: "Recently updated" },
  { value: "alpha", label: "Employer (A→Z)" },
] as const;
type AppsSortKey = (typeof APPS_SORT_OPTIONS)[number]["value"];

export default async function CandidateApplicationsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const rawTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const activeTab: TabKey =
    rawTab && (TAB_ORDER as ReadonlyArray<string>).includes(rawTab)
      ? (rawTab as TabKey)
      : "all";
  const sortKey: AppsSortKey =
    (APPS_SORT_OPTIONS.find((s) => s.value === params.sort)?.value as
      | AppsSortKey
      | undefined) ?? "newest";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, desired_roles")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) return null;
  const candidateId = candidate.id as string;
  // Practice Fit placeholder reason resolution (focused pass on the
  // candidate side). The candidate sees their own data, so we CAN
  // disambiguate why fit is unavailable — unlike the employer side
  // where RLS forces a generic banner. Per get-or-compute.ts, consent
  // doesn't gate the candidate's own view, so we only need
  // desired_roles + the job's role_category to decide between
  // "role_mismatch" and generic "unavailable".
  const candidateDesiredRoles =
    ((candidate as Record<string, unknown>).desired_roles as string[] | null) ??
    [];

  // Candidate-side RLS on dso_pipeline_stages is DSO-only; resolve the
  // kind + label via service-role after the RLS-scoped applications
  // read. The candidate is already authenticated and limited by RLS to
  // their own application rows.
  const { data: rawApps, error: appsErr } = await supabase
    .from("applications")
    .select(
      "id, job_id, stage_id, created_at, updated_at, hidden_at, self_reported_status, affiliation_revealed"
    )
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false });
  if (appsErr) {
    console.warn("[candidate apps] applications fetch failed", appsErr);
  }

  type AppRow = {
    id: string;
    job_id: string;
    stage_id: string;
    kind: StageKind;
    /** DSO-customized label for the current stage; falls back to kind default. */
    stageLabel: string;
    /** Owning DSO id — used to pull the per-DSO stage list for the StatusProgress strip. */
    dsoId: string | null;
    created_at: string;
    updated_at: string;
    hidden_at: string | null;
    self_reported_status: SelfReportedStatus | null;
    affiliation_revealed: boolean;
  };
  const rawAppsList = (rawApps ?? []) as Array<Record<string, unknown>>;
  const stageIdsToLookup = Array.from(
    new Set(rawAppsList.map((r) => r.stage_id as string).filter(Boolean))
  );
  type StageLookupRow = {
    id: string;
    kind: StageKind;
    label: string;
    dsoId: string;
  };
  const stageLookup = new Map<string, StageLookupRow>();
  if (stageIdsToLookup.length > 0) {
    const admin = createSupabaseServiceRoleClient();
    const { data: stageRows } = await admin
      .from("dso_pipeline_stages")
      .select("id, kind, label, dso_id")
      .in("id", stageIdsToLookup);
    for (const r of (stageRows ?? []) as Array<{
      id: string;
      kind: string;
      label: string;
      dso_id: string;
    }>) {
      stageLookup.set(r.id, {
        id: r.id,
        kind: r.kind as StageKind,
        label: r.label,
        dsoId: r.dso_id,
      });
    }
  }
  const apps: AppRow[] = rawAppsList.map((row) => {
    const stage = stageLookup.get(row.stage_id as string);
    const kind = (stage?.kind ?? "open") as StageKind;
    return {
      id: row.id as string,
      job_id: row.job_id as string,
      stage_id: row.stage_id as string,
      kind,
      // Candidate-side surfaces canonical funnel labels, NOT the DSO's
      // customized label. Privacy + cross-DSO consistency.
      // (memory: feedback A/B/C decision 2026-05-12 PM, option A locked)
      stageLabel: CANDIDATE_KIND_LABELS[kind] ?? KIND_DEFAULT_LABELS[kind],
      dsoId: stage?.dsoId ?? null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      hidden_at: row.hidden_at as string | null,
      self_reported_status: row.self_reported_status as SelfReportedStatus | null,
      affiliation_revealed: row.affiliation_revealed as boolean,
    };
  });

  // Job + DSO + location lookups (used by every tab except Saved which
  // has its own join).
  const jobIds = apps.map((a) => a.job_id);
  const { data: rawJobs } = jobIds.length
    ? await supabase
        .from("jobs")
        .select(
          "id, title, dso_id, role_category, employment_type, hide_stages_from_candidate"
        )
        .in("id", jobIds)
    : { data: [] };
  type JobRow = {
    id: string;
    title: string;
    dso_id: string;
    role_category: string;
    employment_type: string;
    hide_stages_from_candidate?: boolean | null;
  };
  const jobs = (rawJobs ?? []) as JobRow[];
  const jobMap = new Map(jobs.map((j) => [j.id, j]));

  const dsoIds = Array.from(new Set(jobs.map((j) => j.dso_id)));
  const { data: rawDsos } = dsoIds.length
    ? await supabase
        .from("dsos")
        .select("id, name, affiliation_reveal_policy")
        .in("id", dsoIds)
    : { data: [] };
  type DsoRow = {
    id: string;
    name: string;
    affiliation_reveal_policy: "never" | "after_hire" | "per_application";
  };
  const dsos = (rawDsos ?? []) as DsoRow[];
  const dsoMap = new Map(dsos.map((d) => [d.id, d]));

  // Job-locations count per job → drives the scope chip.
  // Supabase types `dso_locations` as an array on the join row even when
  // the FK is one-to-one, so we accept that shape and flatten in the
  // consumer instead of force-casting.
  const { data: rawJobLocs } = jobIds.length
    ? await supabase
        .from("job_locations")
        .select("job_id, dso_locations:dso_locations(name, city, state)")
        .in("job_id", jobIds)
    : { data: [] };
  type JobLocRow = {
    job_id: string;
    dso_locations: Array<{
      name: string;
      city: string | null;
      state: string | null;
    }> | null;
  };
  const locsByJob = new Map<string, JobLocRow[]>();
  for (const row of (rawJobLocs ?? []) as unknown as JobLocRow[]) {
    const list = locsByJob.get(row.job_id) ?? [];
    list.push(row);
    locsByJob.set(row.job_id, list);
  }

  // Affiliation display per application (Phase 4.5.b launch-blocker).
  // Service-role resolver — RLS path through job_locations was
  // returning empty silently and leaking the DSO name. The helper
  // returns name + logo + isCorporate per app in one pass.
  const affiliationByAppId = await resolveCandidateApplicationAffiliations(
    apps.map((a) => a.id)
  );
  const displayedNameByAppId = new Map<string, string>();
  for (const a of apps) {
    displayedNameByAppId.set(
      a.id,
      affiliationByAppId.get(a.id)?.name ?? "Hiring team"
    );
  }

  // Unread message counts (existing behavior — surfaces "they replied").
  const appIds = apps.map((a) => a.id);
  const { data: rawUnread } = appIds.length
    ? await supabase
        .from("application_message_unread_counts")
        .select("application_id, sender_role, unread_count")
        .in("application_id", appIds)
        .eq("sender_role", "employer")
    : { data: [] };
  type UnreadRow = {
    application_id: string;
    sender_role: string;
    unread_count: number;
  };
  const unread = (rawUnread ?? []) as UnreadRow[];
  const unreadByAppId = new Map(unread.map((u) => [u.application_id, u.unread_count]));

  // ── Tab counts ──────────────────────────────────────────────────────
  // All / Active / Interview / Offer / Closed counts EXCLUDE hidden
  // applications; Hidden tab counts ONLY hidden ones. Saved is its own
  // pool from saved_jobs.
  const visible = apps.filter((a) => !a.hidden_at);
  const hidden = apps.filter((a) => Boolean(a.hidden_at));

  const isClosed = (k: StageKind) =>
    k === "hired" || k === "rejected" || k === "withdrawn";
  const isInterview = (k: StageKind) => k === "interview";
  const isOffer = (k: StageKind) => k === "offer";
  const isActiveEarly = (k: StageKind) => k === "open" || k === "screen";

  const counts: Record<TabKey, number> = {
    all: visible.length,
    active: visible.filter((a) => isActiveEarly(a.kind)).length,
    interview: visible.filter((a) => isInterview(a.kind)).length,
    offer: visible.filter((a) => isOffer(a.kind)).length,
    closed: visible.filter((a) => isClosed(a.kind)).length,
    saved: 0, // filled below
    hidden: hidden.length,
  };

  // Saved-jobs count — always queried for the badge.
  const { count: savedCount } = await supabase
    .from("saved_jobs")
    .select("*", { count: "exact", head: true })
    .eq("candidate_id", candidateId);
  counts.saved = savedCount ?? 0;

  // ── Filter the apps by tab ──────────────────────────────────────────
  let filteredApps: AppRow[] = visible;
  if (activeTab === "active") {
    filteredApps = visible.filter((a) => isActiveEarly(a.kind));
  } else if (activeTab === "interview") {
    filteredApps = visible.filter((a) => isInterview(a.kind));
  } else if (activeTab === "offer") {
    filteredApps = visible.filter((a) => isOffer(a.kind));
  } else if (activeTab === "closed") {
    filteredApps = visible.filter((a) => isClosed(a.kind));
  } else if (activeTab === "hidden") {
    filteredApps = hidden;
  } else if (activeTab === "saved") {
    filteredApps = []; // saved tab renders its own content below
  }

  // ── Sort the filtered list ──────────────────────────────────────────
  if (sortKey !== "newest") {
    const sorted = [...filteredApps];
    if (sortKey === "oldest") {
      sorted.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    } else if (sortKey === "updated") {
      sorted.sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    } else if (sortKey === "alpha") {
      sorted.sort((a, b) => {
        const nameA = (
          displayedNameByAppId.get(a.id) ?? ""
        ).toLowerCase();
        const nameB = (
          displayedNameByAppId.get(b.id) ?? ""
        ).toLowerCase();
        return nameA.localeCompare(nameB);
      });
    }
    filteredApps = sorted;
  }

  // ── Practice Fit per filtered application ──────────────────────────
  // Compute fits ONLY for the currently-rendered tab, in parallel.
  // Skipped on the Saved tab (it has its own data path below). Each
  // call hits the cache; v1.1 role filter may return null, in which
  // case we fall back to the placeholder chip.
  const fitsByAppId = new Map<string, FitResult | null>();
  // Reason-rich placeholder support (Phase 5D, focused pass on the
  // candidate side). When fit is unavailable for a row, we classify why
  // using the candidate's OWN data (which the candidate is allowed to
  // see in full): role-mismatch vs generic-unavailable. Only the
  // candidate's own surface gets to disambiguate — the employer side
  // keeps the privacy-preserving generic banner because RLS would leak
  // candidate existence otherwise.
  const fitReasonByAppId = new Map<string, PlaceholderReason>();
  if (activeTab !== "saved" && filteredApps.length > 0) {
    const fits = await Promise.all(
      filteredApps.map((a) => getPracticeFit(candidateId, a.job_id))
    );
    filteredApps.forEach((a, i) => {
      fitsByAppId.set(a.id, fits[i]);
      if (!fits[i]) {
        const jobRow = jobMap.get(a.job_id);
        fitReasonByAppId.set(
          a.id,
          classifyPlaceholderReason(
            candidateDesiredRoles,
            jobRow?.role_category
          )
        );
      }
    });
  }

  // ── Saved-jobs payload (only fetched when on the Saved tab) ─────────
  type SavedJobRow = {
    id: string;
    saved_at: string;
    job: {
      id: string;
      title: string;
      status: string;
      role_category: string;
      employment_type: string;
      dso_id: string;
      dsos: { name: string } | null;
    } | null;
  };
  let savedJobs: SavedJobRow[] = [];
  // Practice Fit per saved job — parallel compute, cached after first
  // visit. v1.4 closes the parallel gap with /candidate/applications
  // (the active-apps tab); both tabs now show the same chip pattern.
  const fitsBySavedJobId = new Map<string, FitResult | null>();
  // Reason map for the saved tab — same browse-style policy as
  // /candidate/jobs: only `role_mismatch` reaches the UI; generic
  // "unavailable" reasons are not surfaced because they'd create pill
  // clutter on rows the candidate is just browsing.
  const fitReasonBySavedJobId = new Map<string, PlaceholderReason>();
  if (activeTab === "saved") {
    const { data: rawSaved } = await supabase
      .from("saved_jobs")
      .select(
        "id, saved_at, job:jobs(id, title, status, role_category, employment_type, dso_id, dsos:dsos(name))"
      )
      .eq("candidate_id", candidateId)
      .order("saved_at", { ascending: false });
    savedJobs = (rawSaved ?? []) as unknown as SavedJobRow[];

    const savedJobIds = savedJobs
      .map((r) => r.job?.id)
      .filter((id): id is string => Boolean(id));
    if (savedJobIds.length > 0) {
      const fits = await Promise.all(
        savedJobIds.map((jobId) => getPracticeFit(candidateId, jobId))
      );
      savedJobIds.forEach((jobId, i) => {
        fitsBySavedJobId.set(jobId, fits[i]);
        if (!fits[i]) {
          const savedJob = savedJobs.find((s) => s.job?.id === jobId)?.job;
          fitReasonBySavedJobId.set(
            jobId,
            classifyPlaceholderReason(
              candidateDesiredRoles,
              savedJob?.role_category
            )
          );
        }
      });
    }
  }

  // Affiliation display for saved jobs (Phase 4.5.b launch-blocker).
  // The candidate hasn't applied yet — no application context — so
  // this falls under the "public viewer" rule of the helper.
  // Service-role-backed batch resolver, same family as the apps-side
  // resolver. RLS-bypass per the bug we fixed in the live-apps path.
  const savedDisplayedByJobId = new Map<string, string>();
  if (savedJobs.length > 0) {
    const savedJobIds = savedJobs
      .map((r) => r.job?.id)
      .filter((id): id is string => Boolean(id));
    if (savedJobIds.length > 0) {
      const publicResolved = await getDisplayedDsoNamesBatch({
        jobIds: savedJobIds,
        viewer: { role: "public" },
      });
      for (const r of savedJobs) {
        if (!r.job) continue;
        const resolved = publicResolved.get(r.job.id);
        savedDisplayedByJobId.set(
          r.job.id,
          resolved?.name ?? r.job.dsos?.name ?? "Employer"
        );
      }
    }
  }

  return (
    <CandidateShell active="applications">
      <header className="mb-6">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          My Applications
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink">
          {countLabelForTab(activeTab, counts)}
        </h1>
      </header>

      <TabBar activeTab={activeTab} counts={counts} />

      {/* Sort selector — hidden on Saved tab (saved jobs sort by
          saved_at desc, no user-facing knob today). */}
      {activeTab !== "saved" && filteredApps.length > 1 && (
        <div className="mt-4 flex items-center gap-3">
          <ListSort
            basePath="/candidate/applications"
            options={APPS_SORT_OPTIONS}
            activeValue={sortKey}
            defaultValue="newest"
          />
        </div>
      )}

      <div className="mt-6">
        {activeTab === "saved" ? (
          <SavedJobsList
            rows={savedJobs}
            fitsByJobId={fitsBySavedJobId}
            fitReasonByJobId={fitReasonBySavedJobId}
            displayedNameByJobId={savedDisplayedByJobId}
          />
        ) : filteredApps.length === 0 ? (
          <EmptyState tab={activeTab} totalApps={apps.length} />
        ) : (
          <ApplicationsList
            apps={filteredApps}
            jobMap={jobMap}
            dsoMap={dsoMap}
            locsByJob={locsByJob}
            unreadByAppId={unreadByAppId}
            fitsByAppId={fitsByAppId}
            fitReasonByAppId={fitReasonByAppId}
            displayedNameByAppId={displayedNameByAppId}
          />
        )}
      </div>
    </CandidateShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Tab bar
// ─────────────────────────────────────────────────────────────────────

function TabBar({
  activeTab,
  counts,
}: {
  activeTab: TabKey;
  counts: Record<TabKey, number>;
}) {
  return (
    <nav
      aria-label="Application views"
      className="-mx-4 overflow-x-auto border-b border-[var(--rule)] sm:mx-0"
    >
      <ul className="flex min-w-max gap-1 px-4 sm:px-0">
        {TAB_ORDER.map((tab) => {
          const isActive = tab === activeTab;
          return (
            <li key={tab}>
              <Link
                href={tab === "all" ? "/candidate/applications" : `/candidate/applications?tab=${tab}`}
                className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition ${
                  isActive
                    ? "border-[#4D7A60] text-[#14233F]"
                    : "border-transparent text-slate-600 hover:border-slate-300 hover:text-[#14233F]"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                {TAB_LABELS[tab]}
                {counts[tab] > 0 && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      isActive
                        ? "bg-[#4D7A60]/15 text-[#14233F]"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {counts[tab]}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Applications list
// ─────────────────────────────────────────────────────────────────────

function ApplicationsList({
  apps,
  jobMap,
  dsoMap,
  locsByJob,
  unreadByAppId,
  fitsByAppId,
  fitReasonByAppId,
  displayedNameByAppId,
}: {
  apps: Array<{
    id: string;
    job_id: string;
    stage_id: string;
    kind: StageKind;
    stageLabel: string;
    created_at: string;
    updated_at: string;
    hidden_at: string | null;
    self_reported_status: SelfReportedStatus | null;
  }>;
  jobMap: Map<
    string,
    {
      id: string;
      title: string;
      dso_id: string;
      hide_stages_from_candidate?: boolean | null;
    }
  >;
  dsoMap: Map<string, { name: string }>;
  locsByJob: Map<
    string,
    Array<{
      dso_locations: Array<{
        name: string;
        city: string | null;
        state: string | null;
      }> | null;
    }>
  >;
  unreadByAppId: Map<string, number>;
  fitsByAppId: Map<string, FitResult | null>;
  /**
   * Per-application reason for the Practice Fit placeholder when fit is
   * null. Used to pick precise tooltip + label copy on the candidate
   * side. Defaults to "unavailable" when no entry is present.
   */
  fitReasonByAppId: Map<string, PlaceholderReason>;
  /**
   * Per-application displayed employer name resolved by the parent
   * (Phase 4.5.b launch-blocker). Masks the DSO name when the job is
   * privately affiliated and the policy + reveal-state don't allow
   * disclosure.
   */
  displayedNameByAppId: Map<string, string>;
}) {
  return (
    <ul className="space-y-3">
      {apps.map((app) => {
        const job = jobMap.get(app.job_id);
        const dso = job ? dsoMap.get(job.dso_id) : null;
        const unreadCount = unreadByAppId.get(app.id) ?? 0;
        const locs = job ? locsByJob.get(job.id) ?? [] : [];
        return (
          <li key={app.id} className="relative">
            <Link
              href={`/candidate/applications/${app.id}`}
              className="block rounded-md border border-[var(--rule)] bg-white p-5 transition hover:border-heritage-deep/40 hover:bg-cream/40"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  {/* Top line — status pill + self-reported chip + Practice Fit + unread */}
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <StatusPill
                      kind={app.kind}
                      label={app.stageLabel}
                      hideStages={job?.hide_stages_from_candidate ?? false}
                    />
                    {app.self_reported_status && (
                      <SelfReportedChip status={app.self_reported_status} />
                    )}
                    {(() => {
                      const fit = fitsByAppId.get(app.id);
                      // Render the live chip when we have a score; the
                      // placeholder is the fallback for: role-filtered
                      // pairs (computePracticeFit returned null) or
                      // compute-not-yet-run on a fresh row. The reason
                      // map disambiguates which copy to show.
                      return fit ? (
                        <PracticeFitChip fit={fit} size="sm" />
                      ) : (
                        <PracticeFitPlaceholder
                          reason={fitReasonByAppId.get(app.id) ?? "unavailable"}
                        />
                      );
                    })()}
                    {unreadCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-heritage/15 px-2 py-0.5 text-[11px] font-bold text-heritage-deep">
                        <MessageCircle className="size-3" />
                        {unreadCount} new
                      </span>
                    )}
                  </div>

                  {/* Title + employer */}
                  <p className="text-[15px] font-bold text-ink">
                    {job?.title ?? "Job removed"}
                  </p>
                  <p className="text-[13px] text-slate-body">
                    {displayedNameByAppId.get(app.id) ??
                      dso?.name ??
                      "Unknown employer"}
                  </p>

                  {/* Meta line — scope chip + dates */}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-slate-meta">
                    <ScopeChip locs={locs} />
                    <span>·</span>
                    <span>Applied {formatDate(app.created_at)}</span>
                    {app.updated_at !== app.created_at && (
                      <>
                        <span>·</span>
                        <span>Updated {timeAgo(new Date(app.updated_at))}</span>
                      </>
                    )}
                  </div>

                  {/* Status progress strip — preserved from v1 */}
                  <div className="mt-3 pr-10">
                    <StatusProgress
                      status={app.kind}
                      hideStages={job?.hide_stages_from_candidate ?? false}
                    />
                  </div>
                </div>
              </div>
            </Link>
            {/* Overflow menu — absolutely positioned. Sits in the top-right
                where the chevron used to live; the menu now serves both as
                the "open me" affordance + the row-action surface. */}
            <div className="absolute right-3 top-3">
              <RowActionsMenu
                applicationId={app.id}
                currentStatus={app.kind}
                isHidden={Boolean(app.hidden_at)}
                currentSelfReported={app.self_reported_status}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Saved-jobs list (rendered when tab=saved)
// ─────────────────────────────────────────────────────────────────────

function SavedJobsList({
  rows,
  fitsByJobId,
  fitReasonByJobId,
  displayedNameByJobId,
}: {
  rows: Array<{
    id: string;
    saved_at: string;
    job: {
      id: string;
      title: string;
      status: string;
      role_category: string;
      employment_type: string;
      dsos: { name: string } | null;
    } | null;
  }>;
  fitsByJobId: Map<string, FitResult | null>;
  /**
   * Per-job placeholder reason when fit is null. Only `role_mismatch`
   * actually reaches the UI on this surface — generic "unavailable"
   * stays hidden to avoid pill clutter.
   */
  fitReasonByJobId: Map<string, PlaceholderReason>;
  /**
   * Per-job displayed employer name resolved by the parent — masks
   * the DSO name when the job is privately affiliated (Phase 4.5.b).
   */
  displayedNameByJobId: Map<string, string>;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-[var(--rule)] bg-white p-12 text-center max-w-[680px]">
        <Bookmark className="mx-auto mb-4 size-8 text-slate-meta" strokeWidth={1.5} />
        <p className="mb-2 text-[15px] text-ink">
          You haven&apos;t saved any jobs yet.
        </p>
        <p className="mb-6 text-[14px] text-slate-body">
          Click <strong>Save</strong> on any job page to bookmark it for later.
        </p>
        <Link
          href="/candidate/jobs"
          className="inline-flex items-center gap-2 px-6 py-3 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
        >
          Browse jobs
        </Link>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        if (!row.job) return null;
        return (
          <li key={row.id}>
            <Link
              href={`/jobs/${row.job.id}`}
              className="block rounded-md border border-[var(--rule)] bg-white p-5 transition hover:border-heritage-deep/40 hover:bg-cream/40"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#4D7A60]/10 px-2 py-0.5 text-xs font-medium text-[#4D7A60]">
                      <Bookmark className="size-3" />
                      Saved
                    </span>
                    {row.job.status !== "active" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                        {row.job.status}
                      </span>
                    )}
                    {(() => {
                      const fit = fitsByJobId.get(row.job.id);
                      const reason = fitReasonByJobId.get(row.job.id);
                      if (fit) return <PracticeFitChip fit={fit} size="sm" />;
                      if (reason === "role_mismatch") {
                        return (
                          <PracticeFitPlaceholder reason="role_mismatch" />
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <p className="text-[15px] font-bold text-ink">{row.job.title}</p>
                  <p className="text-[13px] text-slate-body">
                    {displayedNameByJobId.get(row.job.id) ??
                      row.job.dsos?.name ??
                      "Employer"}
                  </p>
                  <p className="mt-2 text-[12px] text-slate-meta">
                    Saved {timeAgo(new Date(row.saved_at))}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-slate-meta mt-1" />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────

function EmptyState({
  tab,
  totalApps,
}: {
  tab: TabKey;
  totalApps: number;
}) {
  if (tab === "all" && totalApps === 0) {
    return (
      <div className="rounded-md border border-[var(--rule)] bg-white p-12 text-center max-w-[680px]">
        <Briefcase className="mx-auto mb-4 size-8 text-slate-meta" strokeWidth={1.5} />
        <p className="mb-2 text-[15px] text-ink">
          You haven&apos;t applied to any jobs yet.
        </p>
        <p className="mb-6 text-[14px] text-slate-body">
          Browse open roles at verified dental support organizations.
        </p>
        <Link
          href="/jobs"
          className="inline-flex items-center gap-2 px-6 py-3 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
        >
          Browse Jobs
        </Link>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-[var(--rule)] bg-white p-10 text-center max-w-[680px]">
      <p className="text-[14px] text-slate-body">
        Nothing in <strong>{TAB_LABELS[tab]}</strong> right now.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Status pill
// ─────────────────────────────────────────────────────────────────────

function StatusPill({
  kind,
  label,
  hideStages,
}: {
  kind: StageKind;
  /** DSO-customized stage label (resolved upstream). */
  label: string;
  hideStages: boolean;
}) {
  const renderLabel =
    hideStages && !["hired", "rejected", "withdrawn"].includes(kind)
      ? "In review"
      : label;

  const tone = TONE_BY_KIND[kind];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}
    >
      {renderLabel}
    </span>
  );
}

const TONE_BY_KIND: Record<StageKind, string> = {
  open: "bg-blue-50 text-blue-700",
  screen: "bg-cyan-50 text-cyan-700",
  interview: "bg-amber-50 text-amber-800",
  offer: "bg-emerald-50 text-emerald-800",
  hired: "bg-[#4D7A60] text-[#F7F4ED]",
  rejected: "bg-red-50 text-red-700",
  withdrawn: "bg-slate-100 text-slate-600",
};

// ─────────────────────────────────────────────────────────────────────
// Self-reported status chip
// ─────────────────────────────────────────────────────────────────────

function SelfReportedChip({ status }: { status: SelfReportedStatus }) {
  const labels: Record<SelfReportedStatus, string> = {
    interviewing: "I'm interviewing",
    offer_received: "I have an offer",
    hired: "I was hired",
    no_longer_interested: "Not interested",
  };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-[#4D7A60]/10 px-2 py-0.5 text-[11px] font-medium text-[#14233F]"
      title="Your self-reported status — employer doesn't see this label."
    >
      <Sparkles className="size-3 text-[#4D7A60]" />
      {labels[status]}
    </span>
  );
}

// PracticeFitPlaceholder, PlaceholderReason, and classifyPlaceholderReason
// were extracted to @/components/practice-fit/placeholder for reuse on
// /candidate/jobs + future surfaces.

// ─────────────────────────────────────────────────────────────────────
// Scope chip
// ─────────────────────────────────────────────────────────────────────

function ScopeChip({
  locs,
}: {
  locs: Array<{
    dso_locations: Array<{
      name: string;
      city: string | null;
      state: string | null;
    }> | null;
  }>;
}) {
  // Each row's dso_locations is itself an array (Supabase one-to-many
  // shape on the join row). Flatten across rows.
  const real = locs.flatMap((l) => l.dso_locations ?? []);
  if (real.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-slate-meta">
        <MapPin className="size-3.5" />
        Location not set
      </span>
    );
  }
  if (real.length === 1) {
    const loc = real[0]!;
    const city = [loc.city, loc.state].filter(Boolean).join(", ");
    return (
      <span className="inline-flex items-center gap-1">
        <MapPin className="size-3.5 text-slate-meta" />
        {city || loc.name}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <MapPin className="size-3.5 text-slate-meta" />
      {real.length} locations
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function countLabelForTab(tab: TabKey, counts: Record<TabKey, number>): string {
  const n = counts[tab];
  const label = TAB_LABELS[tab];
  if (tab === "all") {
    if (n === 0) return "No applications yet.";
    if (n === 1) return "1 application";
    return `${n} applications`;
  }
  if (tab === "saved") {
    if (n === 0) return "No saved jobs.";
    if (n === 1) return "1 saved job";
    return `${n} saved jobs`;
  }
  if (n === 0) return `No ${label.toLowerCase()} applications.`;
  if (n === 1) return `1 ${label.toLowerCase()} application`;
  return `${n} ${label.toLowerCase()} applications`;
}

function formatDate(s: string): string {
  return new Date(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return date.toLocaleDateString();
}
