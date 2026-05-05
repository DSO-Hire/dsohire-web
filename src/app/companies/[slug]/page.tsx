/**
 * /companies/[slug] — public DSO detail page.
 *
 * Surfaces:
 *   - Name, description, logo, website, headquarters, practice count
 *   - List of locations (name + city/state) for context
 *   - Their currently active job postings, linking to /jobs/[id]
 *
 * Slug history: if the requested slug isn't on an active DSO, fall back to
 * dso_slug_history.from_slug → 301 redirect to the DSO's current slug. Keeps
 * old links and search-engine results from breaking when a DSO renames.
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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: dso } = await supabase
    .from("dsos")
    .select("name, description, status")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  if (!dso) {
    return { title: "DSO not found" };
  }

  const description =
    (dso.description as string | null)?.slice(0, 160) ??
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
      "id, name, legal_name, slug, description, logo_url, website, headquarters_city, headquarters_state, practice_count, verified_at, status"
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

  const dsoRow = dso as DsoRow;

  // Pull DSO locations + their active jobs in parallel
  const [{ data: rawLocations }, { data: rawJobs }] = await Promise.all([
    supabase
      .from("dso_locations")
      .select("id, name, city, state")
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
  ]);

  const locations = (rawLocations ?? []) as LocationRow[];
  const jobs = (rawJobs ?? []) as JobRow[];

  // Pull each job's location associations so we can show location chips on cards
  const jobIds = jobs.map((j) => j.id);
  const locationsByJob = new Map<string, Array<{ city: string | null; state: string | null }>>();
  if (jobIds.length > 0) {
    const { data: jobLocs } = await supabase
      .from("job_locations")
      .select("job_id, location:dso_locations(city, state)")
      .in("job_id", jobIds);

    for (const row of (jobLocs ?? []) as unknown as Array<{
      job_id: string;
      location: { city: string | null; state: string | null } | null;
    }>) {
      if (!row.location) continue;
      const list = locationsByJob.get(row.job_id) ?? [];
      list.push(row.location);
      locationsByJob.set(row.job_id, list);
    }
  }

  const cityState = [dsoRow.headquarters_city, dsoRow.headquarters_state]
    .filter(Boolean)
    .join(", ");

  return (
    <SiteShell>
      <article className="pt-[140px] pb-24 px-6 sm:px-14 max-w-[1100px] mx-auto">
        <Link
          href="/companies"
          className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-8"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All Companies
        </Link>

        {/* Title block */}
        <header className="pb-10 border-b border-[var(--rule)] mb-12">
          <div className="flex items-center gap-2.5 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
            <ShieldCheck className="h-3.5 w-3.5" />
            Verified DSO
          </div>
          <h1 className="text-3xl sm:text-6xl font-extrabold tracking-[-1.8px] leading-[1.05] text-ink mb-5">
            {dsoRow.name}
          </h1>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-slate-body">
            {cityState && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-heritage" />
                {cityState}
              </span>
            )}
            {dsoRow.practice_count !== null && (dsoRow.practice_count ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-heritage" />
                {dsoRow.practice_count}{" "}
                {dsoRow.practice_count === 1 ? "practice" : "practices"}
              </span>
            )}
            {dsoRow.website && (
              <a
                href={dsoRow.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-heritage hover:text-heritage-deep underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {formatWebsite(dsoRow.website)}
              </a>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-12">
          {/* Main column: description + jobs */}
          <div>
            {dsoRow.description && (
              <section className="mb-12">
                <h2 className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
                  About
                </h2>
                <p className="text-[15px] text-ink leading-[1.7] whitespace-pre-wrap">
                  {dsoRow.description}
                </p>
              </section>
            )}

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
                      className="text-heritage underline underline-offset-2 hover:text-heritage-deep font-semibold"
                    >
                      browse all open roles
                    </Link>
                    .
                  </p>
                </div>
              ) : (
                <ul className="list-none border-t border-[var(--rule)]">
                  {jobs.map((job) => (
                    <JobRow
                      key={job.id}
                      job={job}
                      locations={locationsByJob.get(job.id) ?? []}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Side column: locations */}
          <aside>
            <div className="border border-[var(--rule)] bg-cream/50 p-6 sticky top-[120px]">
              <h2 className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
                Practice locations
              </h2>
              {locations.length === 0 ? (
                <p className="text-[14px] text-slate-body leading-relaxed">
                  Location list coming soon.
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
  logo_url: string | null;
  website: string | null;
  headquarters_city: string | null;
  headquarters_state: string | null;
  practice_count: number | null;
  verified_at: string | null;
  status: string;
}

interface LocationRow {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
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

function JobRow({
  job,
  locations,
}: {
  job: JobRow;
  locations: Array<{ city: string | null; state: string | null }>;
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
              <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep">
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
            {job.compensation_visible &&
              job.compensation_min !== null && (
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
            <ArrowRight className="h-4 w-4 text-slate-meta group-hover:text-heritage transition-colors" />
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
