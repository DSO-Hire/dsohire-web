/**
 * /employer/talent-pool — proactive sourcing surface
 * (E7.1–E7.7 / Phase 5D, shipped 2026-05-11).
 *
 * Two tabs:
 *   - Discover: search opt-in candidates across the platform with
 *     filters for role, state, license state, years experience,
 *     availability.
 *   - Saved: candidates this DSO has saved to the pool, with notes,
 *     tags, and quick-remove.
 *
 * Visibility: only candidates with `is_searchable = true` AND
 * `is_guest = false` AND `deleted_at IS NULL` appear in Discover.
 * Enforced by RLS + a defensive `.is("deleted_at", null)` in the
 * server query.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, Bookmark, Search, KanbanSquare } from "lucide-react";
import type { Metadata } from "next";
import { HelpDisclosure } from "@/components/help/help-disclosure";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DiscoverFilters } from "./discover-filters";
import { CandidateResultCard } from "./candidate-result-card";
import { SavedEntryCard } from "./saved-entry-card";
import { getPracticeFit } from "@/lib/practice-fit/get-or-compute";
import type { FitBucket } from "@/lib/practice-fit/types";
import {
  anonymousDisplayLabel,
  getDsoAppliedCandidateIds,
} from "@/lib/candidate/anonymity";
import { getBlockedCandidateIdsForDso } from "@/lib/sourcing/blocklist";
import { getProspectPipeline, type ProspectCard } from "@/lib/sourcing/pipeline";
import { PipelineBoard } from "./pipeline-board";

export const metadata: Metadata = { title: "Talent Pool" };
export const dynamic = "force-dynamic";

const ROLE_FILTERS = [
  { value: "", label: "Any role" },
  { value: "dentist", label: "Dentist" },
  { value: "dental_hygienist", label: "Dental Hygienist" },
  { value: "dental_assistant", label: "Dental Assistant" },
  { value: "office_manager", label: "Office Manager" },
  { value: "front_office", label: "Front Office" },
  { value: "regional_manager", label: "Regional Manager" },
  { value: "specialist", label: "Specialist" },
] as const;

interface PageProps {
  searchParams?: Promise<{
    tab?: string;
    q?: string;
    role?: string;
    state?: string;
    license?: string;
    min_years?: string;
    pms?: string;
    cert?: string;
    /**
     * Polish item (2026-05-12): when set to a job id, the discover
     * results compute PracticeFit against that job + sort by score
     * descending. Each card shows a fit chip.
     */
    fit_job?: string;
  }>;
}

export default async function TalentPoolPage({ searchParams }: PageProps) {
  const sp = searchParams ? await searchParams : {};
  const tab =
    sp.tab === "saved"
      ? "saved"
      : sp.tab === "pipeline"
        ? "pipeline"
        : "discover";

  const supabase = await createSupabaseServerClient();
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

  // Saved tab — pool entries for this DSO, joined to candidate fields.
  let savedEntries: Array<{
    entry_id: string;
    candidate_id: string;
    full_name: string | null;
    headline: string | null;
    current_title: string | null;
    years_experience: number | null;
    avatar_url: string | null;
    notes: string | null;
    tags: string[] | null;
    created_at: string;
  }> = [];
  if (tab === "saved") {
    const { data: entries } = await supabase
      .from("dso_talent_pool_entries")
      .select(
        "id, candidate_id, notes, tags, created_at, candidates(full_name, headline, current_title, years_experience, avatar_url, anonymous_mode, desired_roles, current_location_city, current_location_state)"
      )
      .eq("dso_id", dsoUser.dso_id as string)
      .order("created_at", { ascending: false });
    const savedRows = (entries ?? []) as unknown as Array<{
      id: string;
      candidate_id: string;
      notes: string | null;
      tags: string[] | null;
      created_at: string;
      candidates: Array<{
        full_name: string | null;
        headline: string | null;
        current_title: string | null;
        years_experience: number | null;
        avatar_url: string | null;
        anonymous_mode: boolean | null;
        desired_roles: string[] | null;
        current_location_city: string | null;
        current_location_state: string | null;
      }>;
    }>;
    // Reveal candidates who've applied to one of our jobs (anonymity rule).
    const savedApplied = await getDsoAppliedCandidateIds(
      supabase,
      dsoUser.dso_id as string,
      savedRows.map((e) => e.candidate_id)
    );
    savedEntries = savedRows.map((e) => {
      const c = e.candidates?.[0];
      const masked =
        Boolean(c?.anonymous_mode) && !savedApplied.has(e.candidate_id);
      return {
        entry_id: e.id,
        candidate_id: e.candidate_id,
        full_name: masked
          ? anonymousDisplayLabel(c ?? {})
          : c?.full_name ?? null,
        headline: c?.headline ?? null,
        current_title: c?.current_title ?? null,
        years_experience: c?.years_experience ?? null,
        avatar_url: masked ? null : c?.avatar_url ?? null,
        notes: e.notes,
        tags: e.tags,
        created_at: e.created_at,
      };
    });
  }

  // Pipeline tab — masking-aware prospect cards grouped by stage.
  let pipelineCards: ProspectCard[] = [];
  if (tab === "pipeline") {
    pipelineCards = await getProspectPipeline(supabase, dsoUser.dso_id as string);
  }

  // Discover tab — search candidates with is_searchable = true.
  let discoverResults: Array<{
    id: string;
    full_name: string | null;
    headline: string | null;
    current_title: string | null;
    years_experience: number | null;
    avatar_url: string | null;
    license_states: string[] | null;
    current_location_city: string | null;
    current_location_state: string | null;
    availability: string | null;
    pms_systems: string[] | null;
    cert_kinds: string[];
    saved: boolean;
    saved_entry_id: string | null;
    fit_score: number | null;
    fit_bucket: FitBucket | null;
  }> = [];
  let discoverTotal = 0;

  // Fit-job picker: open jobs for the DSO. Always fetched (cheap) so the
  // job-picker dropdown can render even when fit_job isn't set yet.
  const { data: jobsForPicker } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("dso_id", dsoUser.dso_id as string)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("posted_at", { ascending: false })
    .limit(50);
  const fitJobOptions = (jobsForPicker ?? []) as Array<{
    id: string;
    title: string;
  }>;
  const fitJobId = (sp.fit_job ?? "").trim();
  const fitJobSelected = fitJobId
    ? fitJobOptions.find((j) => j.id === fitJobId) ?? null
    : null;
  if (tab === "discover") {
    const keyword = (sp.q ?? "").trim();
    const role = (sp.role ?? "").trim();
    const stateFilter = (sp.state ?? "").trim().toUpperCase();
    const licenseFilter = (sp.license ?? "").trim().toUpperCase();
    const minYears = Number.parseInt(sp.min_years ?? "", 10);
    const pmsFilter = (sp.pms ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const certFilter = (sp.cert ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // Certification facet (N3): certs live in the candidate_certifications
    // table, not an array on candidates. Resolve the matching candidate ids
    // first, then constrain the main query with .in(). A DSO asking for
    // multiple certs wants candidates holding ALL of them, so we intersect.
    let certCandidateIds: string[] | null = null;
    if (certFilter.length > 0) {
      const { data: certRows } = await supabase
        .from("candidate_certifications")
        .select("candidate_id, kind")
        .in("kind", certFilter);
      const kindsByCand = new Map<string, Set<string>>();
      for (const r of (certRows ?? []) as Array<{
        candidate_id: string;
        kind: string;
      }>) {
        const set = kindsByCand.get(r.candidate_id) ?? new Set<string>();
        set.add(r.kind);
        kindsByCand.set(r.candidate_id, set);
      }
      certCandidateIds = [...kindsByCand.entries()]
        .filter(([, kinds]) => certFilter.every((k) => kinds.has(k)))
        .map(([cid]) => cid);
    }

    let q = supabase
      .from("candidates")
      .select(
        "id, full_name, headline, current_title, years_experience, avatar_url, license_states, current_location_city, current_location_state, availability, pms_systems, desired_roles, anonymous_mode, cv_visibility, deleted_at",
        { count: "exact" }
      )
      .in("cv_visibility", ["open_to_work", "recruiters_only"])
      .eq("is_guest", false)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(40);

    if (keyword) {
      // E7.7 boolean search over candidates.search_doc (generated FTS
      // vector spanning name/headline/title/summary/city + skills/
      // specialty/PMS arrays). A single bare token uses to_tsquery prefix
      // matching (`token:*`) so partial typing still resolves ("hygien" ->
      // hygienist). Anything with whitespace, a quote, a leading "-", or an
      // OR operator is handed to websearch_to_tsquery, which safely parses
      // AND / OR / NOT / "phrases" from raw user input and never throws on
      // malformed syntax (unlike to_tsquery).
      const isBooleanQuery = /\s|["]|(^|\s)-|\bOR\b/.test(keyword);
      if (isBooleanQuery) {
        q = q.textSearch("search_doc", keyword, {
          type: "websearch",
          config: "english",
        });
      } else {
        const token = keyword.replace(/[^a-zA-Z0-9]/g, "");
        if (token.length > 0) {
          q = q.textSearch("search_doc", `${token}:*`, { config: "english" });
        }
      }
    }
    if (role) {
      q = q.contains("desired_roles", [role]);
    }
    if (stateFilter && /^[A-Z]{2}$/.test(stateFilter)) {
      q = q.eq("current_location_state", stateFilter);
    }
    if (licenseFilter && /^[A-Z]{2}$/.test(licenseFilter)) {
      q = q.contains("license_states", [licenseFilter]);
    }
    if (Number.isFinite(minYears) && minYears > 0) {
      q = q.gte("years_experience", minYears);
    }
    if (pmsFilter.length > 0) {
      // text[] overlap — candidate has experience in ANY selected PMS.
      q = q.overlaps("pms_systems", pmsFilter);
    }
    if (certCandidateIds !== null) {
      // Cert facet active: constrain to the candidates holding all selected
      // certs. Empty match list => a sentinel id so the query returns none.
      q = q.in(
        "id",
        certCandidateIds.length > 0
          ? certCandidateIds
          : ["00000000-0000-0000-0000-000000000000"]
      );
    }

    // Block-list (Phase 0): a candidate who blocked this DSO must never appear
    // in Discover. App-layer filter — the discoverable-read RLS intentionally
    // doesn't carry the (candidate,dso) block.
    const blockedIds = await getBlockedCandidateIdsForDso(
      supabase,
      dsoUser.dso_id as string
    );
    if (blockedIds.size > 0) {
      q = q.not("id", "in", `(${Array.from(blockedIds).join(",")})`);
    }

    const { data, count, error } = await q;
    if (error) {
      console.warn("[talent-pool] discover query failed", error);
    }
    const rows = (data ?? []) as Array<{
      id: string;
      full_name: string | null;
      headline: string | null;
      current_title: string | null;
      years_experience: number | null;
      avatar_url: string | null;
      license_states: string[] | null;
      current_location_city: string | null;
      current_location_state: string | null;
      availability: string | null;
      pms_systems: string[] | null;
      anonymous_mode: boolean | null;
      desired_roles: string[] | null;
    }>;
    discoverTotal = count ?? rows.length;

    // Cross-reference saved entries so each card can show "Saved"
    // vs "Save to pool".
    const ids = rows.map((r) => r.id);
    const savedSet = new Map<string, string>();
    if (ids.length > 0) {
      const { data: existing } = await supabase
        .from("dso_talent_pool_entries")
        .select("id, candidate_id")
        .eq("dso_id", dsoUser.dso_id as string)
        .in("candidate_id", ids);
      for (const e of (existing ?? []) as Array<{
        id: string;
        candidate_id: string;
      }>) {
        savedSet.set(e.candidate_id, e.id);
      }
    }
    // Pull each shown candidate's cert kinds so result cards can render
    // the matched credentials (and the dental edge is visible at a glance).
    const certKindsByCand = new Map<string, string[]>();
    if (ids.length > 0) {
      const { data: certs } = await supabase
        .from("candidate_certifications")
        .select("candidate_id, kind")
        .in("candidate_id", ids);
      for (const c of (certs ?? []) as Array<{
        candidate_id: string;
        kind: string;
      }>) {
        const list = certKindsByCand.get(c.candidate_id) ?? [];
        if (!list.includes(c.kind)) list.push(c.kind);
        certKindsByCand.set(c.candidate_id, list);
      }
    }

    // Reveal candidates who've applied to one of our jobs (anonymity rule);
    // mask name + photo for the rest who browse anonymously.
    const discoverApplied = await getDsoAppliedCandidateIds(
      supabase,
      dsoUser.dso_id as string,
      ids
    );

    discoverResults = rows.map((r) => {
      const masked = Boolean(r.anonymous_mode) && !discoverApplied.has(r.id);
      return {
        ...r,
        full_name: masked ? anonymousDisplayLabel(r) : r.full_name,
        avatar_url: masked ? null : r.avatar_url,
        cert_kinds: certKindsByCand.get(r.id) ?? [],
        saved: savedSet.has(r.id),
        saved_entry_id: savedSet.get(r.id) ?? null,
        fit_score: null,
        fit_bucket: null,
      };
    });

    // Polish item (2026-05-12) — when fit_job is set, compute Practice
    // Fit for every result candidate against that job, then sort desc
    // by score. Candidates the score returns null for (role filter mis-
    // match) go to the bottom but stay visible.
    if (fitJobSelected) {
      const fitResults = await Promise.all(
        discoverResults.map(async (r) => {
          try {
            const fit = await getPracticeFit(r.id, fitJobSelected.id);
            return {
              candidateId: r.id,
              score: fit?.score ?? null,
              bucket: (fit?.bucket as FitBucket | undefined) ?? null,
            };
          } catch (err) {
            console.warn("[talent-pool] getPracticeFit failed", err);
            return { candidateId: r.id, score: null, bucket: null };
          }
        })
      );
      const fitByCandidateId = new Map(
        fitResults.map((f) => [f.candidateId, f])
      );
      discoverResults = discoverResults.map((r) => {
        const f = fitByCandidateId.get(r.id);
        return {
          ...r,
          fit_score: f?.score ?? null,
          fit_bucket: f?.bucket ?? null,
        };
      });
      // Sort: scored candidates desc, unscored to the tail (preserving
      // pre-sort order for those — most-recent-updated first).
      discoverResults.sort((a, b) => {
        const sa = a.fit_score;
        const sb = b.fit_score;
        if (sa == null && sb == null) return 0;
        if (sa == null) return 1;
        if (sb == null) return -1;
        return sb - sa;
      });
    }
  }

  return (
    <>
      <header className="mb-8 max-w-[820px]">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Talent Pool
        </div>
        <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink mb-3">
          Find candidates before they apply.
        </h1>
        <p className="text-[14px] text-slate-body leading-relaxed">
          Search opt-in candidates across DSO Hire, save the best fits to
          your DSO&apos;s pool, and reach out when a matching role opens.
          Only candidates who&apos;ve enabled discoverability appear in
          Discover.
        </p>
      </header>

      <HelpDisclosure helpKey="talent.overview" className="mb-6" />

      {/* Tab bar */}
      <div className="mb-6 border-b border-[var(--rule)] flex gap-6">
        <TabLink active={tab === "discover"} href="/employer/talent-pool">
          <Search className="h-3.5 w-3.5" /> Discover
        </TabLink>
        <TabLink active={tab === "saved"} href="/employer/talent-pool?tab=saved">
          <Bookmark className="h-3.5 w-3.5" /> Saved ({savedEntries.length})
        </TabLink>
        <TabLink
          active={tab === "pipeline"}
          href="/employer/talent-pool?tab=pipeline"
        >
          <KanbanSquare className="h-3.5 w-3.5" /> Pipeline
        </TabLink>
      </div>

      {tab === "discover" && (
        <>
          <DiscoverFilters
            initial={{
              q: sp.q ?? "",
              role: sp.role ?? "",
              state: sp.state ?? "",
              license: sp.license ?? "",
              min_years: sp.min_years ?? "",
              pms: sp.pms ?? "",
              cert: sp.cert ?? "",
            }}
            roleOptions={ROLE_FILTERS}
          />

          {/* PracticeFit job picker (2026-05-12 polish). Pure GET form
              so the picker state lives in the URL — bookmark-friendly +
              shareable with teammates. */}
          {fitJobOptions.length > 0 && (
            <form
              action="/employer/talent-pool"
              method="get"
              className="mt-4 mb-2 flex flex-wrap items-center gap-2 text-[12px]"
            >
              {/* Persist current filter state so the picker doesn't wipe
                  active filter selections on submit. */}
              {sp.q && <input type="hidden" name="q" value={sp.q} />}
              {sp.role && <input type="hidden" name="role" value={sp.role} />}
              {sp.state && (
                <input type="hidden" name="state" value={sp.state} />
              )}
              {sp.license && (
                <input type="hidden" name="license" value={sp.license} />
              )}
              {sp.min_years && (
                <input
                  type="hidden"
                  name="min_years"
                  value={sp.min_years}
                />
              )}
              {sp.pms && <input type="hidden" name="pms" value={sp.pms} />}
              {sp.cert && <input type="hidden" name="cert" value={sp.cert} />}
              <label
                htmlFor="fit_job"
                className="font-medium text-slate-body inline-flex items-center gap-1.5 flex-wrap"
              >
                Rank by fit against
              </label>
              <select
                id="fit_job"
                name="fit_job"
                defaultValue={fitJobId}
                className="border border-[var(--rule)] bg-card px-2 py-1 text-[12px] text-ink"
              >
                <option value="">— pick a job —</option>
                {fitJobOptions.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="px-3 py-1 bg-primary text-primary-foreground text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-primary/90"
              >
                Apply
              </button>
              {fitJobSelected && (
                <Link
                  href="/employer/talent-pool"
                  className="text-[11px] text-slate-meta hover:text-ink underline"
                >
                  Clear ranking
                </Link>
              )}
            </form>
          )}

          <div className="mt-6 mb-4 text-[12px] text-slate-meta">
            {discoverResults.length === 0
              ? "No candidates match these filters."
              : `${discoverResults.length} candidate${discoverResults.length === 1 ? "" : "s"} shown${discoverTotal > discoverResults.length ? ` of ${discoverTotal} total` : ""}${fitJobSelected ? ` · ranked by fit against ${fitJobSelected.title}` : ""}`}
          </div>

          {discoverResults.length === 0 ? (
            <EmptyDiscoverState />
          ) : (
            <ul className="space-y-3">
              {discoverResults.map((r) => (
                <li key={r.id}>
                  <CandidateResultCard
                    candidateId={r.id}
                    fullName={r.full_name}
                    headline={r.headline}
                    currentTitle={r.current_title}
                    yearsExperience={r.years_experience}
                    avatarUrl={r.avatar_url}
                    licenseStates={r.license_states}
                    cityState={[r.current_location_city, r.current_location_state]
                      .filter(Boolean)
                      .join(", ")}
                    availability={r.availability}
                    pmsSystems={r.pms_systems}
                    certKinds={r.cert_kinds}
                    initiallySaved={r.saved}
                    initialEntryId={r.saved_entry_id}
                    fitScore={r.fit_score}
                    fitBucket={r.fit_bucket}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "saved" && (
        <>
          {savedEntries.length === 0 ? (
            <EmptySavedState />
          ) : (
            <ul className="space-y-3">
              {savedEntries.map((e) => (
                <li key={e.entry_id}>
                  <SavedEntryCard
                    entryId={e.entry_id}
                    candidateId={e.candidate_id}
                    fullName={e.full_name}
                    headline={e.headline}
                    currentTitle={e.current_title}
                    yearsExperience={e.years_experience}
                    avatarUrl={e.avatar_url}
                    notes={e.notes}
                    tags={e.tags}
                    addedAt={e.created_at}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "pipeline" && (
        <>
          {pipelineCards.length === 0 ? (
            <div className="rounded-lg border border-[var(--rule)] bg-cream/30 px-6 py-10 text-center">
              <p className="text-[14px] font-semibold text-ink">
                No prospects yet
              </p>
              <p className="mt-1 text-[13px] text-slate-body">
                Save candidates from{" "}
                <a
                  href="/employer/talent-pool"
                  className="text-heritage-deep underline underline-offset-2 font-semibold"
                >
                  Discover
                </a>{" "}
                to start building your pipeline.
              </p>
            </div>
          ) : (
            <PipelineBoard initial={pipelineCards} />
          )}
        </>
      )}
    </>
  );
}

function TabLink({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        "inline-flex items-center gap-2 pb-3 -mb-px border-b-2 text-[11px] font-bold tracking-[1.5px] uppercase transition-colors " +
        (active
          ? "border-heritage text-ink"
          : "border-transparent text-slate-meta hover:text-ink")
      }
    >
      {children}
    </Link>
  );
}

function EmptyDiscoverState() {
  return (
    <div className="border border-[var(--rule)] bg-cream/30 p-8 text-center">
      <Users
        className="h-10 w-10 text-slate-meta mx-auto mb-3"
        aria-hidden
      />
      <p className="text-[14px] text-slate-body leading-relaxed max-w-[480px] mx-auto">
        No candidates yet match these filters. As more candidates opt
        into discoverability, this pool grows.
      </p>
    </div>
  );
}

function EmptySavedState() {
  return (
    <div className="border border-[var(--rule)] bg-cream/30 p-8 text-center">
      <Bookmark
        className="h-10 w-10 text-slate-meta mx-auto mb-3"
        aria-hidden
      />
      <p className="text-[14px] text-slate-body leading-relaxed max-w-[480px] mx-auto">
        No candidates saved yet. Discover candidates above and click
        &quot;Save to pool&quot; to start building your list.
      </p>
    </div>
  );
}
