/**
 * Saved-search filter shape (comp-filter + save-search spec, 2026-07-09).
 *
 * ONE serialized shape, three consumers:
 *   1. /jobs "Save this search" CTA serializes the current URL filters.
 *   2. createSavedSearch() validates + stores it in
 *      candidate_saved_searches.filter_state (jsonb).
 *   3. /api/cron/job-alert-dispatch maps it back onto the SAME
 *      search_jobs_public RPC the /jobs page calls, so an alert can never
 *      match a different set of jobs than the filter showed.
 *
 * The radius filter is stored pre-geocoded (lat/lng resolved at save time by
 * the /jobs page, which already geocoded it to render results) so the
 * dispatcher never needs a Mapbox call. `surface` + `corporate_function`
 * aren't RPC args — /jobs filters those client-side on job.scope — so the
 * dispatcher applies them the same way, post-RPC.
 */

/** Whitelisted min-comp thresholds (annual $). URL uses the "150k" form. */
export const MIN_COMP_OPTIONS = [
  { value: "100k", label: "$100k+", amount: 100_000 },
  { value: "125k", label: "$125k+", amount: 125_000 },
  { value: "150k", label: "$150k+", amount: 150_000 },
  { value: "175k", label: "$175k+", amount: 175_000 },
  { value: "200k", label: "$200k+", amount: 200_000 },
] as const;
export type MinCompValue = (typeof MIN_COMP_OPTIONS)[number]["value"];

/** Parse a ?comp= URL param to its annual dollar amount (null = no filter). */
export function parseMinComp(raw: string | undefined | null): number | null {
  if (!raw) return null;
  return MIN_COMP_OPTIONS.find((o) => o.value === raw)?.amount ?? null;
}

/** The jsonb stored in candidate_saved_searches.filter_state. All optional —
 *  an empty object means "every job". */
export interface SavedSearchFilters {
  q?: string;
  /** Canonical 2-letter state codes. */
  states?: string[];
  employment?: string;
  category?: string;
  posted_within_days?: number;
  /** Annual dollar floor against jobs.est_annual_max. */
  min_comp?: number;
  /** "practice" (scope ∈ location, regional) or "corporate". */
  surface?: "practice" | "corporate";
  /** Corporate function slug — only meaningful with surface "corporate". */
  corporate_function?: string;
  /** Radius filter, geocoded at save time. All three or none. */
  near_label?: string;
  near_lat?: number;
  near_lng?: number;
  within_miles?: number;
}

/** Drop empty/invalid keys so filter_state stays a clean minimal object. */
export function sanitizeSavedSearchFilters(
  input: SavedSearchFilters
): SavedSearchFilters {
  const out: SavedSearchFilters = {};
  if (typeof input.q === "string" && input.q.trim())
    out.q = input.q.trim().slice(0, 200);
  if (Array.isArray(input.states)) {
    const states = input.states
      .filter((s): s is string => typeof s === "string" && /^[A-Za-z]{2}$/.test(s))
      .map((s) => s.toUpperCase());
    if (states.length > 0) out.states = Array.from(new Set(states));
  }
  if (typeof input.employment === "string" && input.employment)
    out.employment = input.employment;
  if (typeof input.category === "string" && input.category)
    out.category = input.category;
  if (
    typeof input.posted_within_days === "number" &&
    Number.isInteger(input.posted_within_days) &&
    input.posted_within_days > 0
  )
    out.posted_within_days = input.posted_within_days;
  if (
    typeof input.min_comp === "number" &&
    MIN_COMP_OPTIONS.some((o) => o.amount === input.min_comp)
  )
    out.min_comp = input.min_comp;
  if (input.surface === "corporate") out.surface = "corporate";
  if (typeof input.corporate_function === "string" && input.corporate_function)
    out.corporate_function = input.corporate_function;
  if (
    typeof input.near_lat === "number" &&
    Number.isFinite(input.near_lat) &&
    typeof input.near_lng === "number" &&
    Number.isFinite(input.near_lng) &&
    typeof input.within_miles === "number" &&
    input.within_miles > 0
  ) {
    out.near_lat = input.near_lat;
    out.near_lng = input.near_lng;
    out.within_miles = input.within_miles;
    if (typeof input.near_label === "string" && input.near_label.trim())
      out.near_label = input.near_label.trim().slice(0, 80);
  }
  return out;
}

/** Human name for a saved search built from its filters ("Hygienist · KS, MO ·
 *  $150k+"). Candidates can rename in Settings → Credentials. */
export function describeSavedSearchFilters(f: SavedSearchFilters): string {
  const parts: string[] = [];
  if (f.category) parts.push(labelizeSlug(f.category));
  if (f.q) parts.push(`“${f.q}”`);
  if (f.surface === "corporate") parts.push("Corporate");
  if (f.corporate_function) parts.push(labelizeSlug(f.corporate_function));
  if (f.states?.length) parts.push(f.states.join(", "));
  if (f.near_label && f.within_miles)
    parts.push(`${f.within_miles} mi of ${f.near_label}`);
  if (f.employment) parts.push(labelizeSlug(f.employment));
  if (f.min_comp) parts.push(`$${Math.round(f.min_comp / 1000)}k+`);
  if (f.posted_within_days) parts.push(`last ${f.posted_within_days}d`);
  const name = parts.join(" · ");
  return name || "All jobs";
}

function labelizeSlug(slug: string): string {
  return slug
    .split(/[_-]/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Map stored filters onto search_jobs_public named args. The dispatcher
 * spreads this straight into supabase.rpc — same function, same predicates
 * as the /jobs page.
 */
export function savedSearchFiltersToRpcArgs(
  f: SavedSearchFilters
): Record<string, unknown> {
  const args: Record<string, unknown> = {
    query_text: f.q ?? null,
    states_filter: f.states?.length ? f.states : null,
    employment_filter: f.employment ?? null,
    category_filter: f.category ?? null,
    posted_within_days: null, // alerts window on posted_at explicitly instead
    min_comp: f.min_comp ?? null,
  };
  if (
    typeof f.near_lat === "number" &&
    typeof f.near_lng === "number" &&
    typeof f.within_miles === "number"
  ) {
    args.near_lat = f.near_lat;
    args.near_lng = f.near_lng;
    args.within_miles = f.within_miles;
  }
  return args;
}

/** Rebuild the /jobs URL a stored filter set came from (email deep-link). */
export function savedSearchFiltersToJobsUrl(
  f: SavedSearchFilters,
  siteUrl: string
): string {
  const params = new URLSearchParams();
  if (f.q) params.append("q", f.q);
  for (const s of f.states ?? []) params.append("state", s);
  if (f.employment) params.append("employment", f.employment);
  if (f.category) params.append("category", f.category);
  const postedChip = { 1: "24h", 7: "7d", 14: "14d", 30: "30d" }[
    f.posted_within_days ?? 0
  ];
  if (postedChip) params.append("posted", postedChip);
  const comp = MIN_COMP_OPTIONS.find((o) => o.amount === f.min_comp)?.value;
  if (comp) params.append("comp", comp);
  if (f.surface === "corporate") params.append("surface", "corporate");
  if (f.corporate_function) params.append("function", f.corporate_function);
  if (f.near_label && f.within_miles) {
    params.append("near", f.near_label);
    params.append("within", String(f.within_miles));
  }
  const qs = params.toString();
  return `${siteUrl}/jobs${qs ? `?${qs}` : ""}`;
}

/**
 * The scope-side filter /jobs applies client-side (surface tabs + corporate
 * function chips). The dispatcher must apply it too or a "Practice roles"
 * saved search would alert on corporate postings.
 */
export function jobMatchesSurfaceFilters(
  job: { scope?: string | null; corporate_function?: string | null },
  f: SavedSearchFilters
): boolean {
  const scope = job.scope ?? "location";
  if (f.surface === "corporate") {
    if (scope !== "corporate") return false;
    if (f.corporate_function && job.corporate_function !== f.corporate_function)
      return false;
    return true;
  }
  // Default surface is "practice" — mirror /jobs, which only shows
  // location/regional scopes on that tab.
  return scope === "location" || scope === "regional";
}
