/**
 * /companies/[slug] — public DSO detail page (Phase 4.5.d redesign).
 *
 * Now consumes the full Public Profile Builder surface:
 *   - Banner image (full-bleed hero, brand-color tinted)
 *   - Logo + name + mission as the title block
 *   - Culture chips row
 *   - Description as sanitized Tiptap HTML
 *   - Why Join Us blocks (3-6 columns)
 *   - Photo gallery (3-6 thumbnails)
 *   - Contact CTA button
 *   - Open roles + locations sidebar (kept from prior version)
 *
 * Slug history: if the requested slug isn't on an active DSO, fall back
 * to dso_slug_history.from_slug → 301 redirect to the DSO's current
 * slug. Keeps old links and search-engine results from breaking when a
 * DSO renames.
 *
 * Brand-color tinting: the DSO's brand_color (validated 6-digit hex) is
 * passed inline to section eyebrows. Falls back to heritage-deep when
 * unset.
 */

import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  ExternalLink,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RenderedJobDescription } from "@/components/rendered-job-description";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ slug: string }>;
}

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

const EMP_LABELS: Record<string, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  contract: "Contract",
  prn: "PRN",
  locum: "Locum",
};

const FALLBACK_BRAND_COLOR = "#4D7A60"; // heritage-deep

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: dso } = await supabase
    .from("dsos")
    .select("name, mission, description, status")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  if (!dso) {
    return { title: "DSO not found" };
  }

  // Mission is the cleanest 1-line summary; fall back to a stripped
  // description; finally to a generic "Open roles at..." string.
  const mission = (dso.mission as string | null)?.trim();
  const descPlain = (dso.description as string | null)
    ?.replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const description =
    mission?.slice(0, 160) ??
    descPlain?.slice(0, 160) ??
    `Open roles at ${dso.name as string} on DSO Hire.`;

  return {
    title: `${dso.name as string} · DSO Hire`,
    description,
    openGraph: {
      title: dso.name as string,
      description,
      type: "website",
    },
  };
}

export default async function CompanyDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: dso } = await supabase
    .from("dsos")
    .select(
      "id, name, legal_name, slug, description, mission, logo_url, banner_url, brand_color, why_join_us, culture_chips, contact_cta_label, contact_cta_url, website, headquarters_city, headquarters_state, practice_count, verified_at, status"
    )
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  // Slug history fallback — preserve old links via 301 redirect.
  if (!dso) {
    const { data: historyHit } = await supabase
      .from("dso_slug_history")
      .select("dso_id")
      .eq("from_slug", slug)
      .maybeSingle();

    if (historyHit?.dso_id) {
      const { data: target } = await supabase
        .from("dsos")
        .select("slug, status")
        .eq("id", historyHit.dso_id as string)
        .maybeSingle();

      if (target && (target.status as string) === "active") {
        permanentRedirect(`/companies/${target.slug as string}`);
      }
    }
    notFound();
  }

  // Cast through `unknown` — supabase's typed-select infers a row type, but
  // hand-patched database.types entries (mission/banner_url/why_join_us/etc.
  // added in 4.5.d) don't always match the consumer-side `DsoRow` shape
  // exactly. Two-step cast keeps strict mode happy.
  const dsoRow = dso as unknown as DsoRow;
  const brandColor = dsoRow.brand_color || FALLBACK_BRAND_COLOR;

  // Pull DSO locations + their active jobs + photos in parallel
  const [{ data: rawLocations }, { data: rawJobs }, { data: rawPhotos }] =
    await Promise.all([
      supabase
        .from("dso_locations")
        .select("id, name, city, state, public_dso_affiliation")
        .eq("dso_id", dsoRow.id)
        .order("name", { ascending: true }),
      supabase
        .from("jobs")
        .select(
          "id, title, slug, role_category, employment_type, compensation_min, compensation_max, compensation_period, compensation_visible, posted_at"
        )
        .eq("dso_id", dsoRow.id)
        .eq("status", "active")
        .is("deleted_at", null)
        .order("posted_at", { ascending: false, nullsFirst: false }),
      supabase
        .from("dso_photos")
        .select("id, storage_url, caption, sort_order")
        .eq("dso_id", dsoRow.id)
        .order("sort_order", { ascending: true }),
    ]);

  // Affiliation filtering (Phase 4.5.b launch-blocker, Q4 + Q7).
  // Per Cam's locked direction: keep the page rendered even when every
  // location is private (sandbox philosophy — the DSO can flip a
  // location to public anytime). BUT exclude private locations from
  // the public location list and exclude private-affiliated jobs from
  // the open-roles list — both would directly leak the corporate
  // affiliation if rendered.
  type LocationWithFlag = LocationRow & { public_dso_affiliation: boolean };
  const allLocationsTyped = (rawLocations ?? []) as LocationWithFlag[];
  const locations = allLocationsTyped.filter(
    (l) => l.public_dso_affiliation !== false
  );
  // Build the set of private location ids so we can filter the jobs
  // query in JS using the most-private-inherits rule (any private
  // location on a job → exclude the job entirely from this surface).
  const privateLocationIds = new Set(
    allLocationsTyped
      .filter((l) => l.public_dso_affiliation === false)
      .map((l) => l.id)
  );

  const allJobs = (rawJobs ?? []) as JobRow[];
  const photos = (rawPhotos ?? []) as PhotoRow[];
  const whyBlocks = (dsoRow.why_join_us ?? []).filter(
    (b): b is WhyJoinUsBlock =>
      !!b && typeof b === "object" && "title" in b && "body" in b
  );
  const cultureChips = dsoRow.culture_chips ?? [];

  // Pull each job's location associations — used both for the
  // affiliation filter (drop jobs touching any private location) and
  // for the location chips rendered on the job cards.
  const allJobIds = allJobs.map((j) => j.id);
  const jobLocationIdsByJob = new Map<string, string[]>();
  const locationsByJob = new Map<
    string,
    Array<{ city: string | null; state: string | null }>
  >();
  if (allJobIds.length > 0) {
    const { data: jobLocs } = await supabase
      .from("job_locations")
      .select("job_id, location_id, location:dso_locations(city, state)")
      .in("job_id", allJobIds);

    for (const row of (jobLocs ?? []) as unknown as Array<{
      job_id: string;
      location_id: string;
      location: { city: string | null; state: string | null } | null;
    }>) {
      const ids = jobLocationIdsByJob.get(row.job_id) ?? [];
      ids.push(row.location_id);
      jobLocationIdsByJob.set(row.job_id, ids);
      if (row.location) {
        const list = locationsByJob.get(row.job_id) ?? [];
        list.push(row.location);
        locationsByJob.set(row.job_id, list);
      }
    }
  }

  // Filter out jobs that touch any private-affiliation location. A
  // privately-affiliated job rendered on /companies/[slug] would
  // directly link the corporate brand to a practice the DSO has
  // chosen to keep separate publicly. Most-private-inherits across
  // the whole job (Q3).
  const jobs = allJobs.filter((j) => {
    const locIds = jobLocationIdsByJob.get(j.id) ?? [];
    return locIds.every((id) => !privateLocationIds.has(id));
  });

  const cityState = [dsoRow.headquarters_city, dsoRow.headquarters_state]
    .filter(Boolean)
    .join(", ");

  return (
    <SiteShell>
      {/* Banner — full-bleed hero, only renders when set */}
      {dsoRow.banner_url && (
        <div className="relative w-full overflow-hidden bg-cream pt-[80px]">
          <div
            className="aspect-[3/1] w-full bg-cover bg-center"
            style={{ backgroundImage: `url(${dsoRow.banner_url})` }}
            aria-label={`${dsoRow.name} banner`}
            role="img"
          />
          {/* Subtle bottom fade for legibility of any overlay copy */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-black/10" />
        </div>
      )}

      <article
        className={
          "px-6 sm:px-14 max-w-[1100px] mx-auto " +
          (dsoRow.banner_url ? "pt-12 pb-24" : "pt-[140px] pb-24")
        }
      >
        <Link
          href="/companies"
          className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase hover:text-ink transition-colors mb-8"
          style={{ color: brandColor }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All Companies
        </Link>

        {/* Title block */}
        <header className="pb-10 border-b border-[var(--rule)] mb-12">
          <div
            className="flex items-center gap-2.5 text-[10px] font-bold tracking-[2.5px] uppercase mb-3"
            style={{ color: brandColor }}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Verified DSO
          </div>

          {/* Logo + Name layout */}
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-6">
            {dsoRow.logo_url && (
              <div className="size-20 shrink-0 overflow-hidden rounded-md border border-[var(--rule)] bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={dsoRow.logo_url}
                  alt={`${dsoRow.name} logo`}
                  className="h-full w-full object-contain"
                />
              </div>
            )}
            <h1 className="text-3xl sm:text-6xl font-extrabold tracking-[-1.8px] leading-[1.05] text-ink">
              {dsoRow.name}
            </h1>
          </div>

          {/* Mission as pull-quote */}
          {dsoRow.mission && (
            <p
              className="mt-6 max-w-[700px] border-l-[3px] pl-5 text-[18px] sm:text-[20px] font-medium text-ink leading-snug"
              style={{ borderColor: brandColor }}
            >
              {dsoRow.mission}
            </p>
          )}

          {/* Stats strip */}
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-slate-body">
            {cityState && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin
                  className="h-3.5 w-3.5"
                  style={{ color: brandColor }}
                />
                {cityState}
              </span>
            )}
            {dsoRow.practice_count !== null && (dsoRow.practice_count ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Building2
                  className="h-3.5 w-3.5"
                  style={{ color: brandColor }}
                />
                {dsoRow.practice_count}{" "}
                {dsoRow.practice_count === 1 ? "practice" : "practices"}
              </span>
            )}
            {dsoRow.website && (
              <a
                href={dsoRow.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline"
                style={{ color: brandColor }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {formatWebsite(dsoRow.website)}
              </a>
            )}
          </div>

          {/* Culture chips */}
          {cultureChips.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {cultureChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-[var(--rule-strong)] bg-cream/40 px-3 py-1 text-[12px] font-semibold text-ink"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-12">
          {/* Main column */}
          <div className="space-y-12">
            {/* About — description.
                New descriptions come through Tiptap (HTML); legacy DSOs
                may still have plain-text descriptions saved before 4.5.d.
                Heuristic: if it starts with a tag, sanitize + render as
                HTML; otherwise treat as plain text with whitespace
                preserved. */}
            {dsoRow.description && (
              <section>
                <h2
                  className="text-[10px] font-bold tracking-[2.5px] uppercase mb-3"
                  style={{ color: brandColor }}
                >
                  About
                </h2>
                {dsoRow.description.trim().startsWith("<") ? (
                  <RenderedJobDescription
                    html={dsoRow.description}
                    className="text-[15px] text-ink leading-[1.7]"
                  />
                ) : (
                  <p className="text-[15px] text-ink leading-[1.7] whitespace-pre-wrap">
                    {dsoRow.description}
                  </p>
                )}
              </section>
            )}

            {/* Why join us */}
            {whyBlocks.length > 0 && (
              <section>
                <h2
                  className="text-[10px] font-bold tracking-[2.5px] uppercase mb-5"
                  style={{ color: brandColor }}
                >
                  Why join us
                </h2>
                <div
                  className={
                    "grid gap-6 " +
                    (whyBlocks.length === 1
                      ? "grid-cols-1"
                      : whyBlocks.length === 2
                        ? "grid-cols-1 sm:grid-cols-2"
                        : "grid-cols-1 sm:grid-cols-2")
                  }
                >
                  {whyBlocks.map((b, idx) => (
                    <article
                      key={idx}
                      className="border-l-[3px] pl-5"
                      style={{ borderColor: brandColor }}
                    >
                      <h3 className="font-display text-[18px] font-bold text-ink leading-tight mb-2">
                        {b.title}
                      </h3>
                      <p className="text-[14px] text-slate-body leading-relaxed">
                        {b.body}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* Photo gallery */}
            {photos.length > 0 && (
              <section>
                <h2
                  className="text-[10px] font-bold tracking-[2.5px] uppercase mb-5"
                  style={{ color: brandColor }}
                >
                  Inside our practices
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {photos.map((photo) => (
                    <figure
                      key={photo.id}
                      className="group relative overflow-hidden bg-cream"
                    >
                      <div className="aspect-[4/3]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.storage_url}
                          alt={photo.caption ?? `${dsoRow.name} practice`}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                          loading="lazy"
                        />
                      </div>
                      {photo.caption && (
                        <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 text-[12px] text-ivory">
                          {photo.caption}
                        </figcaption>
                      )}
                    </figure>
                  ))}
                </div>
              </section>
            )}

            {/* Contact CTA */}
            {dsoRow.contact_cta_label && dsoRow.contact_cta_url && (
              <section>
                <a
                  href={dsoRow.contact_cta_url}
                  className="inline-flex items-center gap-2 rounded-md px-6 py-3 text-[12px] font-bold uppercase tracking-[1.5px] text-ivory transition-opacity hover:opacity-90"
                  style={{ backgroundColor: brandColor }}
                  target={
                    dsoRow.contact_cta_url.startsWith("mailto:") ||
                    dsoRow.contact_cta_url.startsWith("tel:")
                      ? undefined
                      : "_blank"
                  }
                  rel={
                    dsoRow.contact_cta_url.startsWith("http")
                      ? "noopener noreferrer"
                      : undefined
                  }
                >
                  {dsoRow.contact_cta_label}
                  <ArrowRight className="h-4 w-4" />
                </a>
              </section>
            )}

            {/* Open roles */}
            <section>
              <div className="flex items-baseline justify-between gap-4 mb-4">
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.8px] text-ink">
                  Open roles
                </h2>
                <span className="text-[10px] font-bold tracking-[2px] uppercase text-slate-meta">
                  {jobs.length === 0
                    ? "None right now"
                    : jobs.length === 1
                      ? "1 role"
                      : `${jobs.length} roles`}
                </span>
              </div>

              {jobs.length === 0 ? (
                <div className="border border-[var(--rule)] bg-cream p-8 text-center">
                  <Briefcase className="h-7 w-7 text-slate-meta mx-auto mb-3" />
                  <p className="text-[14px] text-slate-body leading-relaxed">
                    {dsoRow.name} doesn&apos;t have any active job postings right
                    now. Check back later, or{" "}
                    <Link
                      href="/jobs"
                      className="underline underline-offset-2 font-semibold"
                      style={{ color: brandColor }}
                    >
                      browse all open roles
                    </Link>
                    .
                  </p>
                </div>
              ) : (
                <ul className="list-none border-t border-[var(--rule)]">
                  {jobs.map((job) => (
                    <JobRowItem
                      key={job.id}
                      job={job}
                      locations={locationsByJob.get(job.id) ?? []}
                      brandColor={brandColor}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Side column: locations */}
          <aside>
            <div className="border border-[var(--rule)] bg-cream/50 p-6 sticky top-[120px]">
              <h2
                className="text-[10px] font-bold tracking-[2.5px] uppercase mb-4"
                style={{ color: brandColor }}
              >
                Practice locations
              </h2>
              {locations.length === 0 ? (
                <p className="text-[14px] text-slate-body leading-relaxed">
                  Practice locations aren&apos;t publicly listed for
                  this DSO. Visit individual job postings to see where
                  each role is based.
                </p>
              ) : (
                <ul className="list-none space-y-3">
                  {locations.map((loc) => (
                    <li key={loc.id}>
                      <div className="text-[14px] font-bold text-ink leading-tight">
                        {loc.name}
                      </div>
                      {(loc.city || loc.state) && (
                        <div className="text-[12px] text-slate-meta tracking-[0.3px] mt-0.5">
                          {[loc.city, loc.state].filter(Boolean).join(", ")}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </article>
    </SiteShell>
  );
}

interface DsoRow {
  id: string;
  name: string;
  legal_name: string | null;
  slug: string;
  description: string | null;
  mission: string | null;
  logo_url: string | null;
  banner_url: string | null;
  brand_color: string | null;
  why_join_us: WhyJoinUsBlock[] | null;
  culture_chips: string[] | null;
  contact_cta_label: string | null;
  contact_cta_url: string | null;
  website: string | null;
  headquarters_city: string | null;
  headquarters_state: string | null;
  practice_count: number | null;
  verified_at: string | null;
  status: string;
}

interface WhyJoinUsBlock {
  title: string;
  body: string;
}

interface LocationRow {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

interface PhotoRow {
  id: string;
  storage_url: string;
  caption: string | null;
  sort_order: number;
}

interface JobRow {
  id: string;
  title: string;
  slug: string;
  role_category: string;
  employment_type: string;
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_period: string | null;
  compensation_visible: boolean;
  posted_at: string | null;
}

function JobRowItem({
  job,
  locations,
  brandColor,
}: {
  job: JobRow;
  locations: Array<{ city: string | null; state: string | null }>;
  brandColor: string;
}) {
  return (
    <li className="border-b border-[var(--rule)]">
      <Link
        href={`/jobs/${job.id}`}
        className="group block py-5 hover:bg-cream/40 transition-colors -mx-2 px-2"
      >
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1.5">
              <span
                className="text-[10px] font-bold tracking-[1.5px] uppercase"
                style={{ color: brandColor }}
              >
                {ROLE_LABELS[job.role_category] ?? job.role_category}
              </span>
              <span className="text-[10px] tracking-[0.5px] text-slate-meta">
                {EMP_LABELS[job.employment_type] ?? job.employment_type}
              </span>
            </div>
            <div className="text-[17px] font-extrabold tracking-[-0.3px] text-ink leading-tight mb-1">
              {job.title}
            </div>
            {locations.length > 0 && (
              <div className="text-[13px] tracking-[0.3px] text-slate-meta inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {formatLocations(locations)}
              </div>
            )}
          </div>

          <div className="flex items-center gap-6 text-right flex-shrink-0">
            {job.compensation_visible && job.compensation_min !== null && (
              <div>
                <div className="text-[15px] font-extrabold text-ink leading-none">
                  {formatCompensation(job)}
                </div>
                {job.compensation_period && (
                  <div className="text-[9px] tracking-[1.2px] uppercase text-slate-meta mt-1.5 font-semibold">
                    {compensationPeriodLabel(job.compensation_period)}
                  </div>
                )}
              </div>
            )}
            <ArrowRight className="h-4 w-4 text-slate-meta transition-colors" />
          </div>
        </div>
      </Link>
    </li>
  );
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

function formatWebsite(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
