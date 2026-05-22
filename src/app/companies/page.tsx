/**
 * /companies — public directory of DSOs on DSO Hire.
 *
 * Lists every DSO with status = 'active' alphabetically. Each card shows
 * headquarters, practice count, and a count of currently open jobs.
 *
 * RLS: dsos public-read policy already filters status='active', and
 * jobs public-read policy filters status='active' AND deleted_at is null,
 * so we can query both directly with the standard server client.
 */

import Link from "next/link";
import { ArrowRight, Building2, MapPin } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ListSort } from "@/components/ui/list-sort";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dental Groups & DSOs on DSO Hire",
  description:
    "Browse the dental groups hiring through DSO Hire — multi-location practices and DSOs operating across the U.S.",
};

const COMPANIES_SORT_OPTIONS = [
  { value: "name", label: "Name (A→Z)" },
  { value: "practices", label: "Most practices" },
  { value: "jobs", label: "Most open jobs" },
  { value: "newest", label: "Recently joined" },
] as const;
type CompaniesSortKey = (typeof COMPANIES_SORT_OPTIONS)[number]["value"];

// Practice-count tiers for the directory filter strip. Lower bound only —
// "50+" means "50 or more". Picked thresholds at meaningful DSO scale
// breakpoints (mid-market starts around 10-15; enterprise around 35-50).
const PRACTICE_TIER_OPTIONS = [
  { value: "10", label: "10+ practices", min: 10 },
  { value: "25", label: "25+ practices", min: 25 },
  { value: "50", label: "50+ practices", min: 50 },
] as const;
type PracticeTierValue = (typeof PRACTICE_TIER_OPTIONS)[number]["value"];

interface PageProps {
  searchParams: Promise<{
    sort?: string;
    /** 2-letter state code filter (matches against dso_locations.state). */
    state?: string;
    /** Practice-count lower bound. One of PRACTICE_TIER_OPTIONS values. */
    min_practices?: string;
  }>;
}

interface DsoRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  brand_color: string | null;
  headquarters_city: string | null;
  headquarters_state: string | null;
  practice_count: number | null;
  verified_at: string | null;
  featured_until: string | null;
}

export default async function CompaniesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const sortKey: CompaniesSortKey =
    (COMPANIES_SORT_OPTIONS.find((o) => o.value === sp.sort)?.value as
      | CompaniesSortKey
      | undefined) ?? "name";
  const supabase = await createSupabaseServerClient();

  const { data: rawDsos, error: dsosError } = await supabase
    .from("dsos")
    .select(
      "id, name, slug, description, logo_url, banner_url, brand_color, headquarters_city, headquarters_state, practice_count, verified_at, featured_until"
    )
    .eq("status", "active")
    .order("name", { ascending: true });

  if (dsosError) {
    console.warn("[companies] dsos query failed", dsosError);
  }

  const allDsos = (rawDsos ?? []) as DsoRow[];

  // Affiliation filter (Phase 4.5.b launch-blocker, Q7 + Q4 sandbox).
  // Hide DSOs from this directory if every one of their locations is
  // private — surfacing a fully-private DSO in a public list would be
  // the direct leak Q7 was locked to prevent. The DSO's /companies/[slug]
  // page itself still renders for them (per Q4 sandbox philosophy);
  // they just don't get listed in the directory until they flip at
  // least one location to public.
  // Pull public locations in one shot. Two outputs from this single query:
  //   1. Set of DSO IDs with at least one public location (the existing
  //      affiliation filter — fully-private DSOs stay out of the directory).
  //   2. Map of dso_id → unique states list (powers the multi-state coverage
  //      badge on each card). Only public locations are folded in so we
  //      never leak a state inferred from a private location.
  const allDsoIds = allDsos.map((d) => d.id);
  const dsosWithPublicLocation = new Set<string>();
  const statesByDso = new Map<string, Set<string>>();
  if (allDsoIds.length > 0) {
    const { data: pubLocs, error: pubLocsError } = await supabase
      .from("dso_locations")
      .select("dso_id, state")
      .in("dso_id", allDsoIds)
      .eq("public_dso_affiliation", true);
    if (pubLocsError) {
      console.warn("[companies] public locations query failed", pubLocsError);
    }
    for (const r of (pubLocs ?? []) as Array<{
      dso_id: string;
      state: string | null;
    }>) {
      dsosWithPublicLocation.add(r.dso_id);
      if (r.state) {
        const existing = statesByDso.get(r.dso_id) ?? new Set<string>();
        existing.add(r.state);
        statesByDso.set(r.dso_id, existing);
      }
    }
  }
  const filteredDsos = allDsos.filter((d) =>
    dsosWithPublicLocation.has(d.id)
  );
  const dsoIds = filteredDsos.map((d) => d.id);

  // Count active jobs + collect role-category mix per DSO. RLS already
  // filters to active+non-deleted, so a single query gives us the raw rows;
  // we group in memory. The role-mix chips on each card show the top 3
  // distinct categories the DSO is currently hiring for.
  const jobCountByDso = new Map<string, number>();
  const roleMixByDso = new Map<string, Map<string, number>>();
  if (dsoIds.length > 0) {
    const { data: jobRows, error: jobRowsError } = await supabase
      .from("jobs")
      .select("dso_id, role_category")
      .in("dso_id", dsoIds)
      .eq("status", "active")
      .eq("visibility", "public") // E1.22 — internal-only jobs never count toward public totals
      .is("deleted_at", null);

    if (jobRowsError) {
      console.warn("[companies] job count query failed", jobRowsError);
    }

    for (const row of (jobRows ?? []) as Array<{
      dso_id: string;
      role_category: string | null;
    }>) {
      jobCountByDso.set(row.dso_id, (jobCountByDso.get(row.dso_id) ?? 0) + 1);
      if (row.role_category) {
        const inner = roleMixByDso.get(row.dso_id) ?? new Map<string, number>();
        inner.set(
          row.role_category,
          (inner.get(row.role_category) ?? 0) + 1
        );
        roleMixByDso.set(row.dso_id, inner);
      }
    }
  }

  // Recent jobs per DSO for the hover-expand preview. Pull title + posted_at
  // ordered desc, group in app code, keep top 3 per DSO. No LIMIT on the
  // query because we need all candidates before partitioning — but the
  // result set stays small (only active jobs across visible DSOs).
  const recentJobsByDso = new Map<
    string,
    Array<{ title: string; posted_at: string | null }>
  >();
  if (dsoIds.length > 0) {
    const { data: recentJobRows } = await supabase
      .from("jobs")
      .select("dso_id, title, posted_at")
      .in("dso_id", dsoIds)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("posted_at", { ascending: false, nullsFirst: false });

    for (const row of (recentJobRows ?? []) as Array<{
      dso_id: string;
      title: string;
      posted_at: string | null;
    }>) {
      const arr = recentJobsByDso.get(row.dso_id) ?? [];
      if (arr.length < 3) {
        arr.push({ title: row.title, posted_at: row.posted_at });
        recentJobsByDso.set(row.dso_id, arr);
      }
    }
  }

  // Every active + public DSO appears in the directory — Cam 2026-05-19
  // reverted the hide-zero-roles rule. Rationale: a paying DSO member
  // paid for the listing; pulling them off the directory when they
  // happen to be between job posts undercuts the visibility they paid
  // for. The "Hiring now" pulse + role-mix chips on the card already
  // signal whether they have active roles right now — the candidate
  // can read that without needing the platform to gatekeep.
  let visibleDsos = [...filteredDsos];

  // Filter strip: state + practice-count tier. Both URL-param-driven so
  // the filtered URL is shareable and the back button works naturally.
  const stateFilterRaw = (sp.state ?? "").trim().toUpperCase();
  const stateFilter = /^[A-Z]{2}$/.test(stateFilterRaw) ? stateFilterRaw : null;
  const practiceTierFilter: PracticeTierValue | null =
    (PRACTICE_TIER_OPTIONS.find((t) => t.value === sp.min_practices)?.value as
      | PracticeTierValue
      | undefined) ?? null;
  const practiceTierMin =
    PRACTICE_TIER_OPTIONS.find((t) => t.value === practiceTierFilter)?.min ?? 0;

  if (stateFilter) {
    visibleDsos = visibleDsos.filter((d) =>
      statesByDso.get(d.id)?.has(stateFilter)
    );
  }
  if (practiceTierMin > 0) {
    visibleDsos = visibleDsos.filter(
      (d) => (d.practice_count ?? 0) >= practiceTierMin
    );
  }

  // Compute the union of states actually represented across visible DSOs
  // BEFORE the state filter is applied — so the dropdown always shows
  // every available state, not just the one currently selected. Computed
  // from filteredDsos (pre-filter) so swapping states works naturally.
  const availableStates = new Set<string>();
  for (const d of filteredDsos) {
    const stateSet = statesByDso.get(d.id);
    if (!stateSet) continue;
    for (const s of stateSet) availableStates.add(s);
  }
  const availableStatesList = Array.from(availableStates).sort();

  // Featured DSO — the one with featured_until in the future AND at
  // least one active job. Spotlight position is reserved for active
  // hiring activity; promoting a DSO with 0 openings is misleading and
  // pushes the "Hiring now" promise badge into incoherence. If they
  // need brand visibility without hiring activity, the regular grid
  // card still surfaces them.
  const now = Date.now();
  const featuredDso = visibleDsos
    .filter(
      (d) =>
        d.featured_until !== null &&
        new Date(d.featured_until).getTime() > now &&
        (jobCountByDso.get(d.id) ?? 0) > 0
    )
    .sort(
      (a, b) =>
        new Date(a.featured_until!).getTime() -
        new Date(b.featured_until!).getTime()
    )[0] ?? null;
  if (featuredDso) {
    visibleDsos = visibleDsos.filter((d) => d.id !== featuredDso.id);
  }

  // Apply sort (operates on the actively-hiring set so sort positions
  // reflect what the candidate can actually see).
  const dsos = (() => {
    const sorted = [...visibleDsos];
    if (sortKey === "practices") {
      sorted.sort(
        (a, b) => (b.practice_count ?? 0) - (a.practice_count ?? 0)
      );
    } else if (sortKey === "jobs") {
      sorted.sort(
        (a, b) =>
          (jobCountByDso.get(b.id) ?? 0) - (jobCountByDso.get(a.id) ?? 0)
      );
    } else if (sortKey === "newest") {
      sorted.sort((a, b) => {
        const ta = a.verified_at ? new Date(a.verified_at).getTime() : 0;
        const tb = b.verified_at ? new Date(b.verified_at).getTime() : 0;
        return tb - ta;
      });
    }
    // Default: name (already DB-ordered).
    return sorted;
  })();

  return (
    <SiteShell>
      <section className="pt-[140px] pb-12 px-6 sm:px-14 max-w-[1240px] mx-auto">
        <div className="flex items-center gap-3.5 mb-6">
          <span className="block w-7 h-px bg-heritage" />
          <span className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep">
            Dental Groups on DSO Hire
          </span>
        </div>
        <h1 className="text-4xl sm:text-7xl font-extrabold tracking-[-2px] leading-[1.02] text-ink mb-5 max-w-[820px]">
          The dental groups hiring on DSO Hire.
        </h1>
        <p className="text-base sm:text-lg text-slate-body leading-relaxed max-w-[640px]">
          Every organization listed here operates multiple practices and is
          a DSO Hire employer member. Browse to learn more, or jump straight
          to an open role.
        </p>
      </section>

      <section className="px-6 sm:px-14 pb-24 max-w-[1240px] mx-auto">
        {/* Filter strip — state + practice-count tier. Both URL-driven so
            the filtered view is shareable and back-button-friendly. */}
        <CompaniesFilters
          activeState={stateFilter}
          activePracticeTier={practiceTierFilter}
          activeSort={sortKey}
          availableStates={availableStatesList}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-meta">
            {dsos.length === 0
              ? "No dental groups match these filters"
              : dsos.length === 1
                ? "1 dental group listed"
                : `${dsos.length} dental groups listed`}
          </div>
          {dsos.length > 1 && (
            <ListSort
              basePath="/companies"
              options={COMPANIES_SORT_OPTIONS}
              activeValue={sortKey}
              defaultValue="name"
            />
          )}
        </div>

        {/* Featured DSO spotlight — single full-width card sitting above
            the regular grid. Honors the active filters (state, practice
            tier) so a featured Kansas DSO doesn't surface when the
            candidate has filtered to Texas. */}
        {featuredDso && (
          <FeaturedDsoSpotlight
            dso={featuredDso}
            openJobs={jobCountByDso.get(featuredDso.id) ?? 0}
            states={statesByDso.get(featuredDso.id) ?? new Set()}
            roleMix={roleMixByDso.get(featuredDso.id) ?? new Map()}
          />
        )}

        {dsos.length === 0 && !featuredDso ? (
          <EmptyState />
        ) : dsos.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[var(--rule)] border border-[var(--rule)]">
            {dsos.map((dso) => (
              <DsoCard
                key={dso.id}
                dso={dso}
                openJobs={jobCountByDso.get(dso.id) ?? 0}
                states={statesByDso.get(dso.id) ?? new Set()}
                roleMix={roleMixByDso.get(dso.id) ?? new Map()}
                recentJobs={recentJobsByDso.get(dso.id) ?? []}
              />
            ))}
          </div>
        ) : null}
      </section>
    </SiteShell>
  );
}

// Short role-category labels for the per-card role-mix chips. Kept inline
// (rather than imported) because /jobs has its own copy with a slightly
// different display order; the labels match but the contexts differ.
const ROLE_LABELS: Record<string, string> = {
  dentist: "Dentist",
  dental_hygienist: "Hygienist",
  dental_assistant: "Dental Assistant",
  front_office: "Front Office",
  office_manager: "Office Manager",
  regional_manager: "Regional Mgr",
  specialist: "Specialist",
  other: "Other",
};

// Render a "posted N {time} ago" relative-time label for the hover-preview
// recent-jobs list. Falls back to "—" when posted_at is missing.
function relativePostedAt(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days < 1) return "today";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function DsoCard({
  dso,
  openJobs,
  states,
  roleMix,
  recentJobs,
}: {
  dso: DsoRow;
  openJobs: number;
  states: Set<string>;
  roleMix: Map<string, number>;
  recentJobs: Array<{ title: string; posted_at: string | null }>;
}) {
  const cityState = [dso.headquarters_city, dso.headquarters_state]
    .filter(Boolean)
    .join(", ");

  // Multi-state badge — only render when the DSO has locations in more
  // than one state. Single-state DSOs don't get this signal (it's the
  // multi-location moat we want to surface).
  const stateList = Array.from(states).sort();
  const showStateCoverage = stateList.length >= 2;
  const stateCoverageLabel =
    stateList.length <= 4
      ? stateList.join(" · ")
      : `${stateList.slice(0, 3).join(" · ")} · +${stateList.length - 3} more`;

  // Top 3 role categories by current active-job count. Sorted desc so the
  // DSO's most-hiring role lands first. Falls back to nothing when the DSO
  // has only "other" or untagged jobs.
  const topRoles = Array.from(roleMix.entries())
    .filter(([k]) => k !== "other" && ROLE_LABELS[k])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => ROLE_LABELS[k]);

  // Per-DSO brand color, validated as a 6-digit hex so we never inline
  // arbitrary CSS from the DB into a style attribute. Fallback to the
  // platform heritage-deep when null or malformed — keeps every card
  // visually consistent and on-brand even when the DSO hasn't set one.
  const validHex =
    dso.brand_color && /^#[0-9A-Fa-f]{6}$/.test(dso.brand_color)
      ? dso.brand_color
      : null;
  const accentColor = validHex ?? "#2F5D4F"; // heritage-deep fallback

  // Some DSO descriptions arrive with HTML tags (rich-text editors paste
  // <p>…</p> wrappers). Strip tags + collapse whitespace before rendering
  // as plain text so the card never shows raw markup. The full /companies/[slug]
  // page can render rich HTML safely; the directory card only ever shows a
  // clamp-3 plain-text snippet.
  const descriptionText = dso.description
    ? dso.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    : null;

  return (
    <Link
      href={`/companies/${dso.slug}`}
      className="group relative block bg-white overflow-hidden hover:bg-cream motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-14px_rgba(7,15,28,0.18)] flex flex-col"
      style={{ ["--card-accent" as string]: accentColor }}
    >
      {/* Left-edge brand accent strip — full card height, 4px wide.
          Sits flush to the card's left border so each card reads as
          "owned" by the DSO instead of looking like a generic listing.
          z-10 keeps it above the banner image when present. */}
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-1 z-10"
        style={{ background: "var(--card-accent)" }}
      />

      {/* Banner intentionally removed from the regular grid card
          (Cam 2026-05-19 feedback) — at 80px height, even good banner
          images cropped uncomfortably under object-cover. The
          brand-color left accent strip + logo + brand-color pill +
          brand-color count already give each card strong per-DSO
          identity without competing for the small footprint. The
          spotlight card below the directory still renders banners at
          a more generous height where the crop math works out. */}

      {/* Content body — padded. Inner div carries flex-1 so the bottom
          row's mt-auto pushes correctly. */}
      <div className="p-7 pl-8 flex flex-col flex-1">

      {/* Top row: logo (or branded mark fallback) + member pill chip */}
      <div className="flex items-start justify-between gap-3 mb-4">
        {dso.logo_url ? (
          <div className="size-12 shrink-0 overflow-hidden border border-[var(--rule)] bg-white flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={dso.logo_url}
              alt={`${dso.name} logo`}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ) : (
          <div
            className="size-12 shrink-0 flex items-center justify-center text-white"
            style={{ background: "var(--card-accent)" }}
          >
            <Building2 className="h-5 w-5" />
          </div>
        )}

        {/* Brand-tinted pill — single-line, modern, ditches the awkward
            two-line "DSO Hire / Member" stack the narrow column forced. */}
        <span
          className="inline-flex items-center px-2.5 py-1 text-[9px] font-bold tracking-[1.8px] uppercase rounded-full whitespace-nowrap"
          style={{
            background: `color-mix(in srgb, ${accentColor} 12%, transparent)`,
            color: accentColor,
          }}
        >
          DSO Hire Member
        </span>
      </div>

      <h3 className="text-xl font-extrabold tracking-[-0.6px] text-ink mb-1 leading-tight">
        {dso.name}
      </h3>

      {(cityState || dso.practice_count) && (
        <div className="text-[13px] tracking-[0.3px] text-slate-meta mb-2 flex flex-wrap gap-x-3 gap-y-1">
          {cityState && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {cityState}
            </span>
          )}
          {dso.practice_count !== null && dso.practice_count > 0 && (
            <span>
              {dso.practice_count}{" "}
              {dso.practice_count === 1 ? "practice" : "practices"}
            </span>
          )}
        </div>
      )}

      {/* Multi-state coverage — only when 2+ states. Single-state DSOs
          don't get this signal; it's the multi-location scale moat. */}
      {showStateCoverage && (
        <div className="text-[11px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-4">
          Active in {stateList.length} states
          <span className="ml-2 font-normal tracking-normal normal-case text-slate-body">
            {stateCoverageLabel}
          </span>
        </div>
      )}

      {descriptionText && (
        <p className="text-[14px] text-slate-body leading-relaxed line-clamp-3 mb-4">
          {descriptionText}
        </p>
      )}

      {/* Role-mix chips — top 3 distinct role categories the DSO is
          currently hiring for. Helps a candidate evaluate fit at a glance
          without clicking through. */}
      {topRoles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {topRoles.map((label) => (
            <span
              key={label}
              className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold tracking-[0.5px] bg-cream text-slate-body border border-[var(--rule)]"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Hover-reveal panel — slides up from bottom on desktop hover.
          Shows up to 3 most recent role titles + relative post date so
          a candidate can evaluate fit without clicking. Hidden entirely
          on touch devices via the @media(hover:hover) guard so a tap
          doesn't accidentally trigger it. */}
      {recentJobs.length > 0 && (
        <div
          aria-hidden
          className="absolute left-1 right-0 bottom-[72px] bg-white border-t-2 px-7 py-4 opacity-0 translate-y-2 transition-all duration-200 ease-out pointer-events-none [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-hover:translate-y-0 shadow-[0_-8px_24px_-12px_rgba(7,15,28,0.15)]"
          style={{ borderTopColor: accentColor }}
        >
          <div
            className="text-[9px] font-bold tracking-[1.5px] uppercase mb-2.5"
            style={{ color: accentColor }}
          >
            Recent openings
          </div>
          <ul className="space-y-1.5 list-none">
            {recentJobs.map((job, i) => (
              <li
                key={i}
                className="flex items-baseline justify-between gap-3 text-[12px]"
              >
                <span className="text-ink font-semibold truncate">
                  {job.title}
                </span>
                <span className="text-slate-meta text-[10px] shrink-0">
                  {relativePostedAt(job.posted_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto pt-4 border-t border-[var(--rule)] flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div
            className="text-[18px] font-extrabold leading-none"
            style={{ color: "var(--card-accent)" }}
          >
            {openJobs}
          </div>
          <div className="flex flex-col">
            <div className="text-[9px] font-semibold tracking-[1.5px] uppercase text-slate-meta leading-tight">
              {openJobs === 1 ? "Open role" : "Open roles"}
            </div>
            {/* Hiring-now pulse only renders when there's actual hiring
                activity. Cards with 0 roles (paying members between
                postings) stay visible but without the misleading badge. */}
            {openJobs > 0 ? (
              <div className="inline-flex items-center gap-1 text-[9px] font-bold tracking-[1px] uppercase mt-0.5" style={{ color: accentColor }}>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: accentColor }} />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: accentColor }} />
                </span>
                Hiring now
              </div>
            ) : (
              <div className="text-[9px] font-semibold tracking-[1px] uppercase text-slate-meta mt-0.5">
                Not hiring now
              </div>
            )}
          </div>
        </div>
        <div
          className="w-7 h-7 border flex items-center justify-center transition-colors group-hover:bg-[var(--card-accent)] group-hover:text-white"
          style={{
            color: "var(--card-accent)",
            borderColor: "var(--card-accent)",
          }}
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </div>
      </div>{/* end inner content wrapper */}
    </Link>
  );
}

/* ───────── Featured DSO spotlight ───────── */

function FeaturedDsoSpotlight({
  dso,
  openJobs,
  states,
  roleMix,
}: {
  dso: DsoRow;
  openJobs: number;
  states: Set<string>;
  roleMix: Map<string, number>;
}) {
  const cityState = [dso.headquarters_city, dso.headquarters_state]
    .filter(Boolean)
    .join(", ");
  const validHex =
    dso.brand_color && /^#[0-9A-Fa-f]{6}$/.test(dso.brand_color)
      ? dso.brand_color
      : null;
  const accentColor = validHex ?? "#2F5D4F";
  const descriptionText = dso.description
    ? dso.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    : null;
  const stateList = Array.from(states).sort();
  const topRoles = Array.from(roleMix.entries())
    .filter(([k]) => k !== "other" && ROLE_LABELS[k])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k]) => ROLE_LABELS[k]);

  return (
    <Link
      href={`/companies/${dso.slug}`}
      className="group relative block bg-white overflow-hidden hover:bg-cream motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-18px_rgba(7,15,28,0.25)] border border-[var(--rule)] mb-6"
      style={{ ["--card-accent" as string]: accentColor }}
    >
      {/* Left accent strip — wider (6px) than the regular grid cards to
          underscore the spotlight treatment. */}
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-1.5 z-10"
        style={{ background: "var(--card-accent)" }}
      />

      {/* Featured tag — top-right corner, sits over the banner */}
      <span
        className="absolute top-4 right-4 z-20 inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold tracking-[2px] uppercase rounded-full text-white"
        style={{ background: accentColor }}
      >
        <span className="text-[11px]">★</span> Featured Member
      </span>

      {/* Banner (when set) — taller than regular cards to emphasize the
          spotlight. Fallback to a tinted brand-color gradient when null. */}
      <div className="w-full h-36 overflow-hidden bg-cream">
        {dso.banner_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={dso.banner_url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background: `linear-gradient(135deg, ${accentColor} 0%, color-mix(in srgb, ${accentColor} 60%, transparent) 100%)`,
            }}
          />
        )}
      </div>

      {/* Horizontal split: left = identity + description, right = stats */}
      <div className="p-8 pl-10 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 items-start">
        <div>
          <div className="flex items-start gap-5 mb-5">
            {dso.logo_url ? (
              <div className="size-16 shrink-0 overflow-hidden border border-[var(--rule)] bg-white flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={dso.logo_url}
                  alt={`${dso.name} logo`}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : (
              <div
                className="size-16 shrink-0 flex items-center justify-center text-white"
                style={{ background: "var(--card-accent)" }}
              >
                <Building2 className="h-7 w-7" />
              </div>
            )}
            <div>
              <h3 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.8px] text-ink mb-1.5 leading-tight">
                {dso.name}
              </h3>
              <div className="text-[13px] tracking-[0.3px] text-slate-meta flex flex-wrap gap-x-3 gap-y-1">
                {cityState && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {cityState}
                  </span>
                )}
                {dso.practice_count !== null && dso.practice_count > 0 && (
                  <span>
                    {dso.practice_count}{" "}
                    {dso.practice_count === 1 ? "practice" : "practices"}
                  </span>
                )}
                {stateList.length >= 2 && (
                  <span style={{ color: accentColor, fontWeight: 600 }}>
                    Active in {stateList.length} states
                  </span>
                )}
              </div>
            </div>
          </div>

          {descriptionText && (
            <p className="text-[15px] text-slate-body leading-relaxed line-clamp-3 mb-5 max-w-[640px]">
              {descriptionText}
            </p>
          )}

          {topRoles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {topRoles.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center px-2.5 py-1 text-[11px] font-semibold tracking-[0.5px] bg-cream text-slate-body border border-[var(--rule)]"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right column: stats + CTA */}
        <div className="lg:border-l lg:border-[var(--rule)] lg:pl-8 flex flex-col gap-4 lg:min-w-[200px]">
          <div>
            <div
              className="text-[40px] font-extrabold leading-none"
              style={{ color: "var(--card-accent)" }}
            >
              {openJobs}
            </div>
            <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mt-2">
              {openJobs === 1 ? "Open role" : "Open roles"}
            </div>
            <div className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[1px] uppercase mt-1.5" style={{ color: accentColor }}>
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: accentColor }} />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: accentColor }} />
              </span>
              Hiring now
            </div>
          </div>
          <div
            className="inline-flex items-center gap-2 px-5 py-3 text-[11px] font-bold tracking-[1.5px] uppercase border transition-colors group-hover:bg-[var(--card-accent)] group-hover:text-white w-fit"
            style={{
              color: "var(--card-accent)",
              borderColor: "var(--card-accent)",
            }}
          >
            View profile
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ───────── Filter strip ───────── */

function CompaniesFilters({
  activeState,
  activePracticeTier,
  activeSort,
  availableStates,
}: {
  activeState: string | null;
  activePracticeTier: PracticeTierValue | null;
  activeSort: CompaniesSortKey;
  availableStates: string[];
}) {
  // Build a URL with the given state + practice tier (either may be null to
  // clear). Sort is preserved across filter toggles when non-default.
  const buildHref = (
    nextState: string | null,
    nextTier: PracticeTierValue | null
  ): string => {
    const params: Array<[string, string]> = [];
    if (nextState) params.push(["state", nextState]);
    if (nextTier) params.push(["min_practices", nextTier]);
    if (activeSort !== "name") params.push(["sort", activeSort]);
    if (params.length === 0) return "/companies";
    return `/companies?${new URLSearchParams(params).toString()}`;
  };

  const chipBaseClass =
    "px-3 py-1.5 text-[12px] font-semibold border transition-colors whitespace-nowrap";
  const chipActiveClass =
    "bg-heritage-deep text-ivory border-heritage-deep";
  const chipInactiveClass =
    "bg-white text-ink border-[var(--rule-strong)] hover:border-heritage";

  return (
    <div className="mb-6 space-y-3">
      {/* Practice-count tier */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-meta mr-2 shrink-0">
          Size
        </span>
        <Link
          href={buildHref(activeState, null)}
          className={`${chipBaseClass} ${activePracticeTier === null ? chipActiveClass : chipInactiveClass}`}
        >
          All
        </Link>
        {PRACTICE_TIER_OPTIONS.map((opt) => {
          const isActive = activePracticeTier === opt.value;
          return (
            <Link
              key={opt.value}
              href={buildHref(activeState, isActive ? null : opt.value)}
              className={`${chipBaseClass} ${isActive ? chipActiveClass : chipInactiveClass}`}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>

      {/* State coverage — only render the strip when we have 2+ states to
          choose between; with 0-1 the filter is meaningless. */}
      {availableStates.length >= 2 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-meta mr-2 shrink-0">
            State
          </span>
          <Link
            href={buildHref(null, activePracticeTier)}
            className={`${chipBaseClass} ${activeState === null ? chipActiveClass : chipInactiveClass}`}
          >
            All
          </Link>
          {availableStates.map((st) => {
            const isActive = activeState === st;
            return (
              <Link
                key={st}
                href={buildHref(isActive ? null : st, activePracticeTier)}
                className={`${chipBaseClass} ${isActive ? chipActiveClass : chipInactiveClass}`}
              >
                {st}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border border-[var(--rule)] bg-cream p-12 text-center max-w-[640px] mx-auto">
      <Building2 className="h-10 w-10 text-slate-meta mx-auto mb-5" />
      <h2 className="text-2xl font-extrabold tracking-[-0.5px] text-ink mb-3">
        No dental groups listed yet.
      </h2>
      <p className="text-[14px] text-slate-body leading-relaxed max-w-[440px] mx-auto">
        DSO Hire is in early launch — dental groups are onboarding through
        summer 2026. Check back soon, or{" "}
        <Link
          href="/jobs"
          className="text-heritage underline underline-offset-2 hover:text-heritage-deep font-semibold"
        >
          browse open roles
        </Link>
        {" "}as they come online.
      </p>
    </div>
  );
}
