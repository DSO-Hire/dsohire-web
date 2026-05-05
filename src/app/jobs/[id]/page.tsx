/**
 * /jobs/[id] — public job detail page.
 *
 * Renders the Tiptap-authored description through DOMPurify, plus a
 * JobPosting JSON-LD <script> that satisfies Google for Jobs structured data.
 *
 * Apply CTA is a stub for now — Phase 2 Week 4 wires the real apply form
 * to /api/jobs/[id]/apply.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Briefcase, Clock, DollarSign } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import {
  RenderedJobDescription,
  htmlToPlainText,
} from "@/components/rendered-job-description";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
}

const ROLE_LABELS: Record<string, string> = {
  dentist: "Dentist",
  dental_hygienist: "Dental Hygienist",
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

const EMP_SCHEMA: Record<string, string> = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  prn: "PER_DIEM",
  locum: "TEMPORARY",
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("title, description, role_category, status, deleted_at")
    .eq("id", id)
    .maybeSingle();

  if (!job || (job.status as string) !== "active" || job.deleted_at) {
    return { title: "Job not found" };
  }

  const plainDescription = htmlToPlainText((job.description as string) ?? "").slice(
    0,
    160
  );

  return {
    title: `${job.title as string} · DSO Hire`,
    description: plainDescription,
    openGraph: {
      title: job.title as string,
      description: plainDescription,
      type: "website",
    },
  };
}

export default async function JobDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, dso_id, title, slug, description, employment_type, role_category, compensation_min, compensation_max, compensation_period, compensation_visible, benefits, requirements, posted_at, status"
    )
    .eq("id", id)
    .maybeSingle();

  if (!job || (job.status as string) !== "active") notFound();

  const [
    { data: dso },
    { data: jobLocations },
    { data: jobSkills },
  ] = await Promise.all([
    supabase
      .from("dsos")
      .select("id, name, slug, description, headquarters_city, headquarters_state")
      .eq("id", job.dso_id as string)
      .maybeSingle(),
    supabase
      .from("job_locations")
      .select(
        "location:dso_locations(id, name, address_line1, city, state, postal_code)"
      )
      .eq("job_id", id),
    supabase.from("job_skills").select("skill").eq("job_id", id),
  ]);

  const locations = ((jobLocations ?? []) as unknown as Array<{
    location: {
      id: string;
      name: string;
      address_line1: string | null;
      city: string | null;
      state: string | null;
      postal_code: string | null;
    } | null;
  }>)
    .map((row) => row.location)
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const skills = ((jobSkills ?? []) as Array<{ skill: string }>).map((s) => s.skill);

  const dsoName = (dso?.name as string) ?? "DSO";

  // JobPosting JSON-LD for Google for Jobs
  const jsonLd = buildJobPostingJsonLd({
    job,
    dso: dso as DsoForSchema | null,
    locations,
  });

  return (
    <SiteShell>
      <article className="pt-[140px] pb-24 px-6 sm:px-14 max-w-[1100px] mx-auto">
        <Link
          href="/jobs"
          className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-8"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to All Jobs
        </Link>

        {/* Title block */}
        <header className="pb-8 border-b border-[var(--rule)] mb-10">
          <div className="flex items-center gap-3 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
            {ROLE_LABELS[job.role_category as string] ?? job.role_category}
            <span className="block w-1 h-1 rounded-full bg-heritage-deep" />
            {EMP_LABELS[job.employment_type as string] ?? job.employment_type}
          </div>
          <h1 className="text-3xl sm:text-6xl font-extrabold tracking-[-1.8px] leading-[1.05] text-ink mb-5">
            {job.title as string}
          </h1>
          <Link
            href={`/companies/${dso?.slug as string}`}
            className="inline-flex items-center gap-1 text-[15px] text-slate-body hover:text-ink transition-colors"
          >
            at <span className="font-semibold text-ink ml-0.5">{dsoName}</span>
          </Link>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-12">
          {/* Description */}
          <div>
            <RenderedJobDescription html={(job.description as string) ?? ""} />

            {(job.requirements as string | null) && (
              <section className="mt-10 pt-8 border-t border-[var(--rule)]">
                <h2 className="text-xl font-extrabold tracking-[-0.4px] text-ink mb-4">
                  Requirements
                </h2>
                <pre className="text-[14px] text-ink leading-relaxed whitespace-pre-wrap font-sans">
                  {job.requirements as string}
                </pre>
              </section>
            )}

            {((job.benefits as string[] | null) ?? []).length > 0 && (
              <section className="mt-10 pt-8 border-t border-[var(--rule)]">
                <h2 className="text-xl font-extrabold tracking-[-0.4px] text-ink mb-4">
                  Benefits
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {(job.benefits as string[]).map((b) => (
                    <li
                      key={b}
                      className="px-3 py-1.5 text-[13px] font-semibold text-heritage-deep"
                      style={{ background: "var(--heritage-tint)" }}
                    >
                      {b}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {skills.length > 0 && (
              <section className="mt-10 pt-8 border-t border-[var(--rule)]">
                <h2 className="text-xl font-extrabold tracking-[-0.4px] text-ink mb-4">
                  Skills
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {skills.map((s) => (
                    <li
                      key={s}
                      className="px-3 py-1.5 text-[13px] font-semibold text-ink bg-cream border border-[var(--rule-strong)]"
                    >
                      {s}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Apply CTA */}
            <section className="mt-12 pt-8 border-t border-[var(--rule)] flex flex-col sm:flex-row items-start gap-4">
              <Link
                href={`/jobs/${job.id as string}/apply`}
                className="inline-flex items-center px-9 py-4 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
              >
                Apply for this Role
              </Link>
              <p className="text-[13px] text-slate-meta leading-relaxed max-w-[420px]">
                Free for candidates. We&apos;ll route your application directly
                to {dsoName} — no recruiter middleman, no fees.
              </p>
            </section>
          </div>

          {/* Sidebar */}
          <aside className="bg-cream p-7 border border-[var(--rule)] h-fit">
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
              At a Glance
            </div>

            <Detail icon={Briefcase} label="Employment">
              {EMP_LABELS[job.employment_type as string] ?? (job.employment_type as string)}
            </Detail>

            {(job.compensation_visible as boolean) &&
              (job.compensation_min as number | null) !== null && (
                <Detail icon={DollarSign} label="Compensation">
                  {formatComp(job)}
                </Detail>
              )}

            {(job.posted_at as string | null) && (
              <Detail icon={Clock} label="Posted">
                {timeAgo(new Date(job.posted_at as string))}
              </Detail>
            )}

            {locations.length > 0 && (
              <Detail icon={MapPin} label="Locations">
                <ul className="space-y-2 mt-1">
                  {locations.map((loc) => (
                    <li key={loc.id}>
                      <div className="font-semibold text-ink text-[14px]">
                        {loc.name}
                      </div>
                      <div className="text-[13px] text-slate-body">
                        {[loc.city, loc.state].filter(Boolean).join(", ")}
                      </div>
                    </li>
                  ))}
                </ul>
              </Detail>
            )}
          </aside>
        </div>
      </article>

      {/* JSON-LD JobPosting for Google for Jobs */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </SiteShell>
  );
}

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5 pb-5 last:mb-0 last:pb-0 last:border-0 border-b border-[var(--rule)]">
      <div className="flex items-center gap-2 text-[9px] font-bold tracking-[2px] uppercase text-slate-meta mb-1.5">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="text-[14px] text-ink">{children}</div>
    </div>
  );
}

function formatComp(job: { [k: string]: unknown }): string {
  const min = job.compensation_min as number;
  const max = job.compensation_max as number | null;
  const period = job.compensation_period as string | null;
  const fmt = new Intl.NumberFormat("en-US");
  let range: string;
  if (max === null) {
    range = `$${fmt.format(min)}+`;
  } else if (period === "annual") {
    range = `$${Math.round(min / 1000)}K–$${Math.round(max / 1000)}K`;
  } else {
    range = `$${fmt.format(min)}–$${fmt.format(max)}`;
  }
  const periodLabel =
    { hourly: "/hr", daily: "/day", annual: "/yr" }[period ?? ""] ?? "";
  return `${range}${periodLabel}`;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const days = Math.floor(seconds / 86400);
  if (days > 30) return `${Math.floor(days / 30)} months ago`;
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} ago`;
  const hours = Math.floor(seconds / 3600);
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return "Just now";
}

/* ───── JSON-LD ───── */

interface DsoForSchema {
  name: string;
  slug: string;
  description: string | null;
}

interface JobForSchema {
  [k: string]: unknown;
}

interface LocationForSchema {
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
}

function buildJobPostingJsonLd({
  job,
  dso,
  locations,
}: {
  job: JobForSchema;
  dso: DsoForSchema | null;
  locations: LocationForSchema[];
}) {
  return {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title as string,
    description: htmlToPlainText((job.description as string) ?? ""),
    datePosted: job.posted_at as string | null,
    employmentType: EMP_SCHEMA[job.employment_type as string] ?? "OTHER",
    hiringOrganization: dso
      ? {
          "@type": "Organization",
          name: dso.name,
          sameAs: `https://dsohire.com/companies/${dso.slug}`,
        }
      : undefined,
    jobLocation: locations.map((loc) => ({
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        streetAddress: loc.address_line1 ?? undefined,
        addressLocality: loc.city ?? undefined,
        addressRegion: loc.state ?? undefined,
        postalCode: loc.postal_code ?? undefined,
        addressCountry: "US",
      },
    })),
    baseSalary:
      (job.compensation_visible as boolean) &&
      (job.compensation_min as number | null) !== null
        ? {
            "@type": "MonetaryAmount",
            currency: "USD",
            value: {
              "@type": "QuantitativeValue",
              minValue: job.compensation_min as number,
              maxValue:
                (job.compensation_max as number | null) ?? (job.compensation_min as number),
              unitText: ((job.compensation_period as string | null) ?? "annual").toUpperCase(),
            },
          }
        : undefined,
  };
}
