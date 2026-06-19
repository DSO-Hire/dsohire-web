/**
 * /dental-hiring-report — public Annual Hiring Report (Phase 5C / E6.15).
 *
 * SEO-indexable trend report drawing on aggregate platform data.
 * Designed as the dental-vertical answer to the generic annual salary
 * surveys: compensation bands by role + period, role volume mix, top
 * states by hiring activity, platform-wide time-to-fill.
 *
 * Sample-size gated: any aggregate with fewer than 5 rows is omitted
 * and shows a "data accruing" placeholder. As the platform scales,
 * more slices cross the threshold automatically.
 *
 * Revalidates every 6 hours via Next.js ISR so the page stays warm and
 * cheap to serve while still reflecting recent data.
 */

import Link from "next/link";
import {
  ArrowRight,
  TrendingUp,
  MapPin,
  Briefcase,
  Building2,
  Users,
  Clock,
} from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import {
  getHiringReportSnapshot,
  MIN_REPORT_SAMPLE_SIZE,
  type RoleCompBand,
  type RoleVolumeRow,
  type StateActivityRow,
} from "@/lib/analytics/hiring-report";
import type { Metadata } from "next";

export const revalidate = 21600; // 6 hours

export const metadata: Metadata = {
  title: "Dental Hiring Report 2026 · DSO Hire",
  description:
    "Anonymized compensation bands, role mix, and hiring velocity across the DSO Hire platform — updated continuously from real job postings and applications. Built for DSO operators, dental professionals, and industry analysts.",
  openGraph: {
    title: "Dental Hiring Report 2026",
    description:
      "Compensation bands, role mix, and hiring velocity from the DSO Hire platform.",
    type: "article",
  },
};

function currency(v: number): string {
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default async function HiringReportPage() {
  const snapshot = await getHiringReportSnapshot();

  return (
    <SiteShell>
      <article className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
        <header className="mb-12 max-w-[760px]">
          <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-3">
            Dental Hiring Report · 2026
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink mb-5">
            How the dental industry is hiring.
          </h1>
          <p className="text-[16px] text-slate-body leading-relaxed mb-3">
            Real compensation bands, role mix, and hiring velocity drawn
            from the DSO Hire platform. Continuously updated as dental groups post
            jobs and candidates apply — refreshed every six hours.
          </p>
          <p className="text-[12px] text-slate-meta uppercase tracking-wide">
            Last updated{" "}
            {new Date(snapshot.generated_at).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </header>

        {/* Headline metrics */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
          <HeadlineTile
            icon={Briefcase}
            label="Active job postings"
            value={snapshot.total_active_jobs.toLocaleString()}
          />
          <HeadlineTile
            icon={Users}
            label="Applications · lifetime"
            value={snapshot.total_applications_lifetime.toLocaleString()}
          />
          <HeadlineTile
            icon={Building2}
            label="Participating dental groups"
            value={snapshot.participating_dsos.toLocaleString()}
          />
          <HeadlineTile
            icon={Clock}
            label="Avg time-to-fill"
            value={
              snapshot.avg_time_to_fill_days !== null
                ? `${snapshot.avg_time_to_fill_days.toFixed(0)}d`
                : "—"
            }
            secondary={
              snapshot.avg_time_to_fill_days !== null
                ? "12-month avg"
                : "data accruing"
            }
          />
        </section>

        {/* Compensation bands */}
        <section className="mb-16">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
            Compensation · Section 1
          </div>
          <h2 className="text-3xl font-extrabold tracking-[-0.8px] text-ink mb-3">
            What dental roles pay.
          </h2>
          <p className="text-[14px] text-slate-body leading-relaxed max-w-[640px] mb-8">
            Median ranges from posted compensation across the platform.
            P25 = lower quartile, P75 = upper quartile — useful for
            calibrating an offer against the broader market. Bands with
            fewer than {MIN_REPORT_SAMPLE_SIZE} samples are omitted to
            avoid misleading single-data-point figures.
          </p>

          <CompBandsTable
            title="Hourly roles"
            bands={snapshot.comp_bands_hourly}
            period="hourly"
          />
          <div className="h-8" />
          <CompBandsTable
            title="Annual-salary roles"
            bands={snapshot.comp_bands_annual}
            period="annual"
          />

          {snapshot.comp_bands_hourly.length === 0 &&
            snapshot.comp_bands_annual.length === 0 && (
              <DataAccruingNotice />
            )}
        </section>

        {/* Role mix */}
        <section className="mb-16">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
            Role mix · Section 2
          </div>
          <h2 className="text-3xl font-extrabold tracking-[-0.8px] text-ink mb-3">
            What dental groups are hiring most.
          </h2>
          <p className="text-[14px] text-slate-body leading-relaxed max-w-[640px] mb-8">
            Open jobs and application volume by role category.
            Application count reflects total applications received across
            all postings in that role.
          </p>

          {snapshot.role_volume.length > 0 ? (
            <RoleMixTable rows={snapshot.role_volume} />
          ) : (
            <DataAccruingNotice />
          )}
        </section>

        {/* By state */}
        <section className="mb-16">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
            Geography · Section 3
          </div>
          <h2 className="text-3xl font-extrabold tracking-[-0.8px] text-ink mb-3">
            Where the hiring is happening.
          </h2>
          <p className="text-[14px] text-slate-body leading-relaxed max-w-[640px] mb-8">
            Top 15 states by application activity. Reflects job postings
            on the platform and the candidates applying to them — not a
            census of dental employment overall.
          </p>

          {snapshot.by_state.length > 0 ? (
            <StateActivityTable rows={snapshot.by_state} />
          ) : (
            <DataAccruingNotice />
          )}
        </section>

        {/* Methodology */}
        <section className="mb-16 border-l-4 border-heritage bg-cream p-6">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
            Methodology
          </div>
          <p className="text-[13px] text-slate-body leading-relaxed mb-3">
            All figures are anonymized by construction — medians and
            percentile bands only, never individual employer data.
            Compensation bands use the midpoint of each posted range.
            Time-to-fill is calculated from a job&apos;s posted date to
            the date of its first hire. State activity reflects practice
            location, not candidate residence.
          </p>
          <p className="text-[13px] text-slate-body leading-relaxed mb-3">
            Aggregates drawn from {snapshot.jobs_with_comp_count.toLocaleString()}{" "}
            job postings with disclosed compensation. Slices with fewer than{" "}
            {MIN_REPORT_SAMPLE_SIZE} samples are excluded.
          </p>
          <p className="text-[12px] text-slate-meta">
            For interview requests, custom data pulls, or feedback on
            methodology, reach out at{" "}
            <a
              href="mailto:info@dsohire.com"
              className="font-semibold text-heritage-deep hover:text-ink underline underline-offset-2"
            >
              info@dsohire.com
            </a>
            .
          </p>
        </section>

        {/* CTAs */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <CallToActionCard
            eyebrow="DSO Operators"
            title="Post a job and join the next report."
            description="Every job you post strengthens the platform's view of the dental hiring market. Job posting on DSO Hire is flat-rate, unlimited multi-location."
            cta="Pricing"
            href="/pricing"
          />
          <CallToActionCard
            eyebrow="Dental Professionals"
            title="See open roles near you."
            description="Browse active dental jobs by role, location, and compensation. Free to apply, no recruiter middleman."
            cta="Browse jobs"
            href="/jobs"
          />
        </section>
      </article>

      {/* JSON-LD for SEO. Datasets / Report structured data. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Report",
            name: "Dental Hiring Report 2026",
            description:
              "Anonymized compensation bands, role mix, and hiring velocity from the DSO Hire platform.",
            datePublished: snapshot.generated_at,
            dateModified: snapshot.generated_at,
            publisher: {
              "@type": "Organization",
              name: "DSO Hire",
              url: "https://dsohire.com",
            },
            url: "https://dsohire.com/dental-hiring-report",
          }),
        }}
      />
    </SiteShell>
  );
}

function HeadlineTile({
  icon: Icon,
  label,
  value,
  secondary,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  secondary?: string;
}) {
  return (
    <div className="border border-[var(--rule)] bg-card p-5">
      <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[2px] uppercase text-slate-meta mb-3">
        <Icon className="h-3 w-3" aria-hidden />
        {label}
      </div>
      <div className="text-3xl font-extrabold tracking-[-0.8px] text-ink leading-none mb-1">
        {value}
      </div>
      {secondary && (
        <div className="text-[11px] text-slate-body">{secondary}</div>
      )}
    </div>
  );
}

function CompBandsTable({
  title,
  bands,
  period,
}: {
  title: string;
  bands: RoleCompBand[];
  period: "hourly" | "annual";
}) {
  if (bands.length === 0) {
    return (
      <div>
        <div className="text-[12px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-2">
          {title}
        </div>
        <div className="text-[13px] text-slate-meta italic">
          Sample size below threshold — bands appear as the platform scales.
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="text-[12px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-3">
        {title}
      </div>
      <div className="overflow-x-auto border border-[var(--rule)]">
        <table className="w-full text-[13px] bg-card">
          <thead>
            <tr className="text-left text-[10px] font-bold tracking-[2px] uppercase text-slate-meta border-b border-[var(--rule)]">
              <th className="px-4 py-3">Role</th>
              <th className="px-3 py-3 text-right">P25</th>
              <th className="px-3 py-3 text-right">Median</th>
              <th className="px-3 py-3 text-right">P75</th>
              <th className="px-4 py-3 text-right">Sample</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((b) => (
              <tr
                key={`${b.role}-${b.period}`}
                className="border-b border-[var(--rule)] last:border-b-0"
              >
                <td className="px-4 py-3 font-semibold text-ink">{b.label}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-body">
                  {period === "hourly"
                    ? `$${b.p25.toFixed(0)}/hr`
                    : currency(b.p25)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-bold text-ink">
                  {period === "hourly"
                    ? `$${b.p50.toFixed(0)}/hr`
                    : currency(b.p50)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-body">
                  {period === "hourly"
                    ? `$${b.p75.toFixed(0)}/hr`
                    : currency(b.p75)}
                </td>
                <td className="px-4 py-3 text-right text-[11px] text-slate-meta">
                  n = {b.sample_size}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoleMixTable({ rows }: { rows: RoleVolumeRow[] }) {
  const maxApps = Math.max(...rows.map((r) => r.applications), 1);
  return (
    <div className="overflow-x-auto border border-[var(--rule)] bg-card">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[10px] font-bold tracking-[2px] uppercase text-slate-meta border-b border-[var(--rule)]">
            <th className="px-4 py-3">Role</th>
            <th className="px-3 py-3 text-right">Jobs</th>
            <th className="px-3 py-3 text-right">Applications</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const widthPct = (r.applications / maxApps) * 100;
            return (
              <tr
                key={r.role}
                className="border-b border-[var(--rule)] last:border-b-0"
              >
                <td className="px-4 py-3 font-semibold text-ink">
                  <span className="inline-flex items-center gap-2">
                    <TrendingUp
                      className="h-3.5 w-3.5 text-slate-meta"
                      aria-hidden
                    />
                    {r.label}
                  </span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-ink">
                  {r.jobs}
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-bold text-ink">
                  {r.applications}
                </td>
                <td className="px-4 py-3 w-32">
                  <div className="h-1.5 bg-cream relative overflow-hidden rounded-sm">
                    <div
                      className="h-full bg-heritage"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StateActivityTable({ rows }: { rows: StateActivityRow[] }) {
  const maxApps = Math.max(...rows.map((r) => r.applications), 1);
  return (
    <div className="overflow-x-auto border border-[var(--rule)] bg-card">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[10px] font-bold tracking-[2px] uppercase text-slate-meta border-b border-[var(--rule)]">
            <th className="px-4 py-3">State</th>
            <th className="px-3 py-3 text-right">Jobs</th>
            <th className="px-3 py-3 text-right">Applications</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const widthPct = (r.applications / maxApps) * 100;
            return (
              <tr
                key={r.state}
                className="border-b border-[var(--rule)] last:border-b-0"
              >
                <td className="px-4 py-3 font-semibold text-ink">
                  <span className="inline-flex items-center gap-2">
                    <MapPin
                      className="h-3.5 w-3.5 text-slate-meta"
                      aria-hidden
                    />
                    {r.state}
                  </span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-ink">
                  {r.jobs}
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-bold text-ink">
                  {r.applications}
                </td>
                <td className="px-4 py-3 w-32">
                  <div className="h-1.5 bg-cream relative overflow-hidden rounded-sm">
                    <div
                      className="h-full bg-heritage"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DataAccruingNotice() {
  return (
    <div className="border border-[var(--rule)] bg-cream/40 p-5 text-[13px] text-slate-body italic leading-relaxed">
      Sample size below threshold ({MIN_REPORT_SAMPLE_SIZE}) for this
      section. Data will populate as more dental groups and candidates join the
      platform.
    </div>
  );
}

function CallToActionCard({
  eyebrow,
  title,
  description,
  cta,
  href,
}: {
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block border border-[var(--rule)] bg-card p-6 hover:bg-cream/40 transition-colors"
    >
      <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
        {eyebrow}
      </div>
      <div className="text-xl font-extrabold tracking-[-0.4px] text-ink mb-2">
        {title}
      </div>
      <p className="text-[13px] text-slate-body leading-relaxed mb-3">
        {description}
      </p>
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[1.5px] uppercase text-heritage-deep">
        {cta} <ArrowRight className="h-3 w-3" />
      </span>
    </Link>
  );
}
