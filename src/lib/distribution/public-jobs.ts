/**
 * THE single source of truth for jobs that may leave the platform via public
 * distribution surfaces: the syndication XML feed, the public jobs JSON API,
 * the embeddable widget + iframe, and distribution sitemap entries.
 *
 * Every one of those surfaces calls getPublicJobsForDistribution() and renders
 * the returned PublicJob[] — they never query jobs directly — so the
 * launch-safety + masking rules cannot drift between them.
 *
 * Layers of defense (all enforced here / in the RPC this calls):
 *   1. Launch gate  — isDistributionLive() must be true; otherwise we return
 *      [] before touching the database. (src/lib/launch/gate.ts)
 *   2. Demo/seed exclusion — public.list_distribution_jobs() filters
 *      dsos.is_demo = false; DEMO_DSO_SLUGS below is a redundant TS denylist
 *      in case a future seed forgets the flag.
 *   3. Content filters — the RPC also enforces active/public/non-confidential/
 *      distribution_enabled jobs from active, non-deleted DSOs.
 *   4. Masking — mapping below reuses the SAME displayed-name flip and
 *      comp-visibility rule used on /jobs/[id], so private-affiliation jobs
 *      never reveal the real DSO and salary is emitted only when visible.
 *
 * No candidate or PII data is ever read or emitted here.
 */

import { sanitizeTiptapHtml, htmlToPlainText } from "@/lib/html/sanitize-tiptap";
import { isDistributionLive } from "@/lib/launch/gate";

// NOTE: the Supabase server client is imported LAZILY inside
// getPublicJobsForDistribution (it pulls next/headers transitively). Keeping it
// out of the module's top level means the pure mapping/masking helpers and the
// gate-off path stay importable in plain unit tests + scripts.

export const SITE_URL = "https://dsohire.com";

/**
 * Redundant denylist of known seed/demo DSO slugs (belt-and-suspenders on top
 * of the dsos.is_demo column). If a future seed migration forgets is_demo,
 * these still never distribute. Keep in sync with the demo seed migrations.
 */
export const DEMO_DSO_SLUGS: ReadonlySet<string> = new Set([
  "lakeshore-dental-group",
  "riverstone-dental-partners",
  "summit-dental-group",
  "bridgeway-dental-operations",
]);

/** schema.org employmentType tokens (mirrors EMP_SCHEMA in /jobs/[id]). */
const EMPLOYMENT_TYPE_SCHEMA: Record<string, string> = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  prn: "PER_DIEM",
  locum: "TEMPORARY",
};

/** Indeed XML <jobtype> tokens. */
const EMPLOYMENT_TYPE_INDEED: Record<string, string> = {
  full_time: "fulltime",
  part_time: "parttime",
  contract: "contract",
  prn: "perdiem",
  locum: "temporary",
};

export function jobPostingEmploymentType(raw: string): string {
  return EMPLOYMENT_TYPE_SCHEMA[raw] ?? "OTHER";
}

export function indeedJobType(raw: string): string | null {
  return EMPLOYMENT_TYPE_INDEED[raw] ?? null;
}

export interface PublicJobLocation {
  city: string | null;
  state: string | null;
  /** Omitted (null) when the location is anonymized, to avoid de-anonymizing. */
  streetAddress: string | null;
  postalCode: string | null;
}

/** A job as it is safe to expose publicly — masking already applied. */
export interface PublicJob {
  id: string;
  slug: string | null;
  title: string;
  /** Sanitized HTML body (safe to embed / CDATA-wrap). */
  descriptionHtml: string;
  /** Plain-text body (for JSON-LD + meta). */
  descriptionText: string;
  employmentType: string; // raw enum, e.g. "full_time"
  roleCategory: string;
  scope: string;
  postedAt: string | null;
  expiresAt: string | null;
  /**
   * The employer name to display — already masked: the real DSO name only when
   * the job is publicly affiliated, otherwise the practice name / "Multiple
   * locations" / "Corporate". NEVER the real DSO for private-affiliation jobs.
   */
  employerName: string;
  isPublicAffiliated: boolean;
  /** Real DSO slug — only safe to link to when isPublicAffiliated. */
  dsoSlug: string;
  locations: PublicJobLocation[];
  /** Present only when compensation is visible. */
  comp: { min: number; max: number | null; period: string } | null;
}

export interface DistributionRpcRow {
  job_id: string;
  title: string;
  slug: string | null;
  description: string | null;
  employment_type: string;
  role_category: string;
  scope: string;
  posted_at: string | null;
  expires_at: string | null;
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_period: string | null;
  compensation_visible: boolean;
  dso_id: string;
  dso_name: string;
  dso_slug: string;
  is_public_affiliated: boolean;
  locations:
    | Array<{
        name: string | null;
        city: string | null;
        state: string | null;
        address_line1: string | null;
        postal_code: string | null;
        public_dso_affiliation: boolean | null;
        anonymize_name: boolean | null;
      }>
    | null;
}

/**
 * The public name a location presents. Mirrors publicLocName in /jobs/[id] and
 * maskedLocationName in affiliation-display.ts: anonymized locations never
 * reveal their real practice name.
 */
function publicLocationName(loc: {
  name: string | null;
  city: string | null;
  anonymize_name: boolean | null;
}): string {
  if (loc.anonymize_name) {
    return loc.city ? `Dental Office in ${loc.city}` : "A dental office";
  }
  return loc.name ?? "A dental office";
}

/**
 * Compute the masked employer name shown publicly. Identical rule to
 * /jobs/[id]: public-affiliated → DSO name; otherwise practice name for a
 * single location, "Corporate" for corporate-scope, else "Multiple locations".
 */
function computeEmployerName(row: DistributionRpcRow): string {
  if (row.is_public_affiliated) return row.dso_name;
  const locs = row.locations ?? [];
  const singlePracticeName = locs.length === 1 ? publicLocationName(locs[0]!) : null;
  if (row.scope === "corporate") return singlePracticeName ?? "Corporate";
  return singlePracticeName ?? "Multiple locations";
}

export function mapRowToPublicJob(row: DistributionRpcRow): PublicJob {
  const rawHtml = row.description ?? "";
  const locs = row.locations ?? [];
  return {
    id: row.job_id,
    slug: row.slug,
    title: row.title,
    descriptionHtml: sanitizeTiptapHtml(rawHtml),
    descriptionText: htmlToPlainText(rawHtml),
    employmentType: row.employment_type,
    roleCategory: row.role_category,
    scope: row.scope,
    postedAt: row.posted_at,
    expiresAt: row.expires_at,
    employerName: computeEmployerName(row),
    isPublicAffiliated: row.is_public_affiliated,
    dsoSlug: row.dso_slug,
    locations: locs.map((l) => ({
      city: l.city,
      state: l.state,
      // Drop the street address for anonymized locations so the masked name
      // can't be reverse-resolved from the address.
      streetAddress: l.anonymize_name ? null : l.address_line1,
      postalCode: l.anonymize_name ? null : l.postal_code,
    })),
    comp:
      row.compensation_visible && row.compensation_min !== null
        ? {
            min: row.compensation_min,
            max: row.compensation_max,
            period: row.compensation_period ?? "annual",
          }
        : null,
  };
}

/**
 * Fetch the jobs that may be distributed publicly. Returns [] (valid, empty)
 * whenever distribution is not live — the primary launch-safety gate — so feed
 * / API / embed callers can render an empty-but-valid document pre-launch.
 *
 * @param opts.dsoSlug Narrow to a single DSO (powers per-DSO feed + JSON API).
 */
export async function getPublicJobsForDistribution(
  opts: { dsoSlug?: string } = {}
): Promise<PublicJob[]> {
  // PRIMARY GATE — never hit the DB until distribution is explicitly live.
  if (!isDistributionLive()) return [];

  // Lazy import — pulls next/headers transitively; only load on the live path.
  const { createSupabaseServiceRoleClient } = await import(
    "@/lib/supabase/server"
  );
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.rpc("list_distribution_jobs", {
    p_dso_slug: opts.dsoSlug ?? null,
  });
  if (error || !data) return [];

  return (data as unknown as DistributionRpcRow[])
    .filter((row) => !DEMO_DSO_SLUGS.has(row.dso_slug)) // redundant safety net
    .map(mapRowToPublicJob);
}

/** Canonical public URL for a job. */
export function jobUrl(job: Pick<PublicJob, "id">): string {
  return `${SITE_URL}/jobs/${job.id}`;
}

/**
 * Apply deep-link carrying the ?source= channel for Vantage closed-loop
 * attribution (mirrors src/lib/analytics/record-view.ts).
 */
export function applyUrl(job: Pick<PublicJob, "id">, source: string): string {
  return `${SITE_URL}/jobs/${job.id}/apply?source=${encodeURIComponent(source)}`;
}

/** A single job location summarized as "City, ST". */
export function locationLabel(loc: PublicJobLocation): string {
  return [loc.city, loc.state].filter(Boolean).join(", ");
}

/**
 * The public JSON shape served by the jobs.json API and consumed by the embed
 * widget. Already-masked PublicJob in → safe, serializable object out. The
 * apply/url links carry the given ?source= channel for Vantage attribution.
 */
export function publicJobToJson(
  job: PublicJob,
  source: string,
): Record<string, unknown> {
  const src = `?source=${encodeURIComponent(source)}`;
  return {
    id: job.id,
    title: job.title,
    employerName: job.employerName,
    employmentType: job.employmentType,
    roleCategory: job.roleCategory,
    locations: job.locations.map((l) => ({ city: l.city, state: l.state })),
    compensation: job.comp
      ? { min: job.comp.min, max: job.comp.max, period: job.comp.period }
      : null,
    postedAt: job.postedAt,
    url: `${jobUrl(job)}${src}`,
    applyUrl: `${SITE_URL}/jobs/${job.id}/apply${src}`,
  };
}

/**
 * Build the schema.org JobPosting object from a PublicJob. This is the canonical
 * mapping shared by /jobs/[id] (Google for Jobs JSON-LD) and any distribution
 * surface, so masking + comp rules are written once. Adds the Google-recommended
 * validThrough / identifier / directApply fields.
 */
export function buildJobPostingJsonLd(job: PublicJob): Record<string, unknown> {
  return {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title,
    description: job.descriptionText,
    datePosted: job.postedAt ?? undefined,
    validThrough: job.expiresAt ?? undefined,
    employmentType: jobPostingEmploymentType(job.employmentType),
    identifier: {
      "@type": "PropertyValue",
      name: "DSO Hire",
      value: job.id,
    },
    directApply: true,
    hiringOrganization: {
      "@type": "Organization",
      name: job.employerName,
      // sameAs only for public-affiliation — a private-affiliation slug would
      // leak the corporate identity through indexed schema.
      ...(job.isPublicAffiliated
        ? { sameAs: `${SITE_URL}/companies/${job.dsoSlug}` }
        : {}),
    },
    jobLocation: job.locations.map((loc) => ({
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        streetAddress: loc.streetAddress ?? undefined,
        addressLocality: loc.city ?? undefined,
        addressRegion: loc.state ?? undefined,
        postalCode: loc.postalCode ?? undefined,
        addressCountry: "US",
      },
    })),
    baseSalary: job.comp
      ? {
          "@type": "MonetaryAmount",
          currency: "USD",
          value: {
            "@type": "QuantitativeValue",
            minValue: job.comp.min,
            maxValue: job.comp.max ?? job.comp.min,
            unitText: job.comp.period.toUpperCase(),
          },
        }
      : undefined,
  };
}
