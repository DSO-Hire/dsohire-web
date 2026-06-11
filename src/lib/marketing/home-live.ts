/**
 * #115 — the homepage "live marketplace" snapshot.
 *
 * The creative unlock of the Day-31 home rework: the job board is PUBLIC
 * data, so the highest-authority URL can show REAL inventory instead of
 * adjectives — live counters and a marquee of actual openings, every
 * number DB-truth at render time (the no-fake-stats rule, weaponized).
 *
 * Honesty floors: counters only render at ≥ MIN_JOBS_FOR_COUNTERS active
 * jobs and the marquee needs ≥ MIN_JOBS_FOR_MARQUEE cards — so the band
 * degrades gracefully (hides) right after the pre-launch seed scrub
 * instead of proudly announcing "3 jobs live."
 *
 * P0 anonymity posture: marquee cards carry NO employer name at all —
 * title + location + pay + role chip only — so the affiliation-masking
 * rules can't be violated here by construction. Don't add a DSO name to
 * these cards without routing through getDisplayedDsoName.
 *
 * Query shape: explicit status/deleted/visibility filters so a signed-in
 * member browsing the homepage sees the same public inventory an
 * anonymous visitor does (RLS would otherwise add their own drafts).
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CORPORATE_FUNCTIONS } from "@/lib/corporate/functions";

export const MIN_JOBS_FOR_COUNTERS = 20;
export const MIN_JOBS_FOR_MARQUEE = 6;

export interface MarqueeJob {
  id: string;
  title: string;
  /** "Westerville, OH" — first tagged location; null for remote/corporate. */
  location: string | null;
  /** Pre-formatted pay ("$38–45/hr", "From $185K/yr") or null when hidden. */
  pay: string | null;
  /** Short chip label ("Hygienist", "Corporate · Finance"). */
  chip: string;
}

export interface HomeLiveSnapshot {
  activeJobs: number;
  states: number;
  showCounters: boolean;
  marquee: MarqueeJob[];
}

const ROLE_CHIP: Record<string, string> = {
  dentist: "Dentist",
  specialist: "Specialist",
  dental_hygienist: "Hygienist",
  dental_assistant: "Dental Assistant",
  front_office: "Front Desk",
  office_manager: "Office Manager",
  regional_manager: "Regional Manager",
};

function corporateChip(fn: string | null): string {
  const f = fn ? CORPORATE_FUNCTIONS.find((c) => c.slug === fn) : undefined;
  return f ? `Corporate · ${f.label}` : "Corporate";
}

function kFmt(n: number): string {
  return n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`;
}

const PERIOD_SUFFIX: Record<string, string> = {
  hourly: "/hr",
  annual: "/yr",
  daily: "/day",
  monthly: "/mo",
};

function formatPay(r: Record<string, unknown>): string | null {
  if (r.compensation_visible !== true) return null;
  const min = typeof r.compensation_min === "number" ? r.compensation_min : null;
  const max = typeof r.compensation_max === "number" ? r.compensation_max : null;
  if (min == null && max == null) return null;
  const period = (r.compensation_period as string | null) ?? "hourly";
  const suffix = PERIOD_SUFFIX[period] ?? "";
  const isAnnual = period === "annual";
  const fmt = (n: number) => (isAnnual ? kFmt(n) : `$${n}`);
  const type = (r.compensation_type as string | null) ?? "range";
  if (type === "doe") return null;
  if (type === "starting_at" && min != null) return `From ${fmt(min)}${suffix}`;
  if (type === "up_to" && max != null) return `Up to ${fmt(max)}${suffix}`;
  if (type === "exact" && min != null) return `${fmt(min)}${suffix}`;
  if (min != null && max != null && min !== max) {
    // Range — share the $ / K formatting: "$38–45/hr", "$185–220K/yr".
    if (isAnnual)
      return `$${Math.round(min / 1000)}–${Math.round(max / 1000)}K${suffix}`;
    return `$${min}–${max}${suffix}`;
  }
  const single = min ?? max;
  return single != null ? `${fmt(single)}${suffix}` : null;
}

export async function getHomeLiveSnapshot(): Promise<HomeLiveSnapshot> {
  const supabase = await createSupabaseServerClient();

  const [{ count }, { data: rows }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .eq("visibility", "public")
      .is("deleted_at", null),
    supabase
      .from("jobs")
      .select(
        "id, title, role_category, scope, corporate_function, compensation_min, compensation_max, compensation_period, compensation_type, compensation_visible, posted_at, job_locations(dso_locations(city, state))"
      )
      .eq("status", "active")
      .eq("visibility", "public")
      .is("deleted_at", null)
      .order("posted_at", { ascending: false })
      .limit(40),
  ]);

  const all = (rows ?? []) as Array<Record<string, unknown>>;

  // Distinct states across the visible inventory (computed in JS — one
  // query, no extra round trip).
  const states = new Set<string>();
  const marquee: MarqueeJob[] = [];
  const seenTitles = new Set<string>();

  for (const r of all) {
    const jl = r.job_locations as
      | Array<{ dso_locations: { city: string | null; state: string | null } | Array<{ city: string | null; state: string | null }> | null }>
      | null;
    let location: string | null = null;
    for (const row of jl ?? []) {
      const relRaw = row?.dso_locations;
      const rel = Array.isArray(relRaw) ? relRaw[0] ?? null : relRaw;
      if (rel?.state) states.add(rel.state);
      if (!location && (rel?.city || rel?.state)) {
        location = [rel?.city, rel?.state].filter(Boolean).join(", ");
      }
    }
    const isCorporate = (r.scope as string | null) === "corporate";
    if (isCorporate && !location) location = "Remote / HQ";

    // Marquee: cap at 12, light dedupe on title so seed data doesn't
    // render four identical "Dental Hygienist" cards in a row.
    if (marquee.length < 12) {
      const title = (r.title as string | null) ?? "";
      const dedupeKey = title.toLowerCase().trim();
      if (title && !seenTitles.has(dedupeKey)) {
        seenTitles.add(dedupeKey);
        marquee.push({
          id: r.id as string,
          title,
          location,
          pay: formatPay(r),
          chip: isCorporate
            ? corporateChip(r.corporate_function as string | null)
            : ROLE_CHIP[(r.role_category as string) ?? ""] ?? "Dental",
        });
      }
    }
  }

  const activeJobs = count ?? 0;
  return {
    activeJobs,
    states: states.size,
    showCounters: activeJobs >= MIN_JOBS_FOR_COUNTERS,
    marquee: marquee.length >= MIN_JOBS_FOR_MARQUEE ? marquee : [],
  };
}
