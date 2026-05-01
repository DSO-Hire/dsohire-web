/**
 * /jobs — public job board.
 *
 * Powered by the search_jobs_public Postgres function (security definer, so
 * RLS doesn't add per-row checks on every search). Filters: query text,
 * state, employment type, role category, posted-within-days.
 */

import Link from "next/link";
import { ArrowRight, MapPin, Search } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Browse Dental Jobs",
  description:
    "Browse jobs at verified dental support organizations. Hygienist, associate dentist, office manager, and specialist roles posted by DSOs running 10–50 practices.",
};

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

interface PageProps {
  searchParams: Promise<{
    q?: string;
    state?: string;
    employment?: string;
    category?: string;
  }>;
}

export default async function PublicJobsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: rawJobs } = await supabase.rpc("search_jobs_public", {
    query_text: sp.q || null,
    state_filter: sp.state || null,
    employment_filter: sp.employment || null,
    category_filter: sp.category || null,
    posted_within_days: null,
  });

  const jobs = ((rawJobs ?? []) as JobRow[]).slice(0, 60);

  // Pull DSO names + locations for the cards in one batch
  const dsoIds = Array.from(new Set(jobs.map((j) => j.dso_id)));
  const jobIds = jobs.map((j) => j.id);

  const [{ data: dsos }, { data: jobLocations }] = await Promise.all([
    dsoIds.length > 0
      ? supabase.from("dsos").select("id, name, slug").in("id", dsoIds)
      : Promise.resolve({ data: [] }),
    jobIds.length > 0
      ? supabase
          .from("job_locations")
          .select("job_id, location:dso_locations(city, state)")
          .in("job_id", jobIds)
      : Promise.resolve({ data: [] }),
  ]);

  const dsoMap = new Map(
    ((dsos ?? []) as Array<{ id: string; name: string; slug: string }>).map(
      (d) => [d.id, d]
    )
  );

  const locationMap = new Map<string, Array<{ city: string | null; state: string | null }>>();
  for (const row of (jobLocations ?? []) as unknown as Array<{
    job_id: string;
    location: { city: string | null; state: string | null } | null;
  }>) {
    if (!row.location) continue;
    const list = locationMap.get(row.job_id) ?? [];
    list.push(row.location);
    locationMap.set(row.job_id, list);
  }

  return (
    <SiteShell>
      <section className="pt-[140px] pb-12 px-6 sm:px-14 max-w-[1240px] mx-auto">
        <div className="flex items-center gap-3.5 mb-6">
          <span className="block w-7 h-px bg-heritage" />
          <span className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep">
            Open Roles at Verified DSOs
          </span>
        </div>
        <h1 className="text-4xl sm:text-7xl font-extrabold tracking-[-2px] leading-[1.02] text-ink mb-5 max-w-[820px]">
          Find your next role at a real dental group.
        </h1>
        <p className="text-base sm:text-lg text-slate-body leading-relaxed max-w-[640px]">
          Every job on DSO Hire is posted by a verified dental support
          organization — not a recruiter, not a staffing agency, not a solo
          practice with one location.{" "}
          <Link
            href="/companies"
            className="text-heritage hover:text-heritage-deep underline underline-offset-2 font-semibold"
          >
            Browse DSOs →
          </Link>
        </p>

        {/* Search bar */}
        <form
          method="get"
          className="mt-12 grid grid-cols-1 sm:grid-cols-[1.6fr_1fr_1fr_auto] gap-px bg-[var(--rule)] border border-[var(--rule)] bg-white"
          style={{ boxShadow: "0 10px 30px -16px rgba(7,15,28,0.14)" }}
        >
          <SearchField
            label="Role"
            name="q"
            placeholder="hygienist, associate dentist…"
            defaultValue={sp.q}
          />
          <SearchField
            label="State"
            name="state"
            placeholder="KS, TX…"
            defaultValue={sp.state}
            maxLength={2}
            uppercase
          />
          <SearchField
            label="Employment"
            name="employment"
            select
            options={[
              { value: "", label: "Any" },
              ...Object.entries(EMP_LABELS).map(([v, l]) => ({
                value: v,
                label: l,
              })),
            ]}
            defaultValue={sp.employment}
            noBorderRight
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 px-9 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors min-h-[80px]"
          >
            <Search className="h-4 w-4" />
            Search
          </button>
        </form>
      </section>

      {/* Results */}
      <section className="px-6 sm:px-14 pb-24 max-w-[1240px] mx-auto">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-meta mb-5">
          {jobs.length === 0
            ? "No jobs found"
            : jobs.length === 1
              ? "1 open role"
              : `${jobs.length} open roles`}
        </div>

        {jobs.length === 0 ? (
          <div className="border border-[var(--rule)] bg-cream p-12 text-center max-w-[640px] mx-auto">
            <p className="text-[15px] text-ink leading-relaxed mb-4">
              We don&apos;t have any jobs matching that search yet. The platform
              is in early launch — verified DSOs are onboarding through summer 2026.
            </p>
            <p className="text-[13px] text-slate-body leading-relaxed">
              Check back soon, or{" "}
              <Link
                href="/candidate/sign-up"
                className="text-heritage underline underline-offset-2 hover:text-heritage-deep font-semibold"
              >
                set up a job alert
              </Link>{" "}
              and we&apos;ll email you when matching roles open.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-[var(--rule)] border border-[var(--rule)]">
            {jobs.map((job) => {
              const dso = dsoMap.get(job.dso_id);
              const locs = locationMap.get(job.id) ?? [];
              return (
                <JobCard
                  key={job.id}
                  job={job}
                  dsoName={dso?.name ?? "DSO"}
                  locations={locs}
                />
              );
            })}
          </div>
        )}
      </section>
    </SiteShell>
  );
}

interface JobRow {
  id: string;
  dso_id: string;
  title: string;
  slug: string;
  employment_type: string;
  role_category: string;
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_period: string | null;
  compensation_visible: boolean;
  posted_at: string | null;
}

function JobCard({
  job,
  dsoName,
  locations,
}: {
  job: JobRow;
  dsoName: string;
  locations: Array<{ city: string | null; state: string | null }>;
}) {
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="group block bg-white p-7 hover:bg-cream transition-colors flex flex-col"
    >
      <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
        {ROLE_LABELS[job.role_category] ?? job.role_category} ·{" "}
        {EMP_LABELS[job.employment_type] ?? job.employment_type}
      </div>
      <div className="text-lg font-extrabold tracking-[-0.4px] text-ink mb-1 leading-tight">
        {job.title}
      </div>
      <div className="text-[13px] text-slate-body mb-4">
        {dsoName}
        {locations.length > 0 && (
          <>
            {" · "}
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3 inline" />
              {formatLocations(locations)}
            </span>
          </>
        )}
      </div>

      <div className="mt-auto pt-4 border-t border-[var(--rule)] flex justify-between items-end">
        <div>
          {job.compensation_visible && job.compensation_min !== null && (
            <div className="text-[14px] font-extrabold text-ink leading-none">
              {formatCompensation(job)}
            </div>
          )}
          {job.compensation_visible && job.compensation_period && (
            <div className="text-[9px] tracking-[1.2px] uppercase text-slate-meta mt-1.5 font-semibold">
              {compensationPeriodLabel(job.compensation_period)}
            </div>
          )}
        </div>
        <div className="w-7 h-7 border border-[var(--rule-strong)] flex items-center justify-center text-heritage-light group-hover:bg-ink group-hover:text-heritage group-hover:border-ink transition-colors">
          <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </Link>
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

function SearchField({
  label,
  name,
  placeholder,
  defaultValue,
  maxLength,
  uppercase,
  select,
  options,
  noBorderRight,
}: {
  label: string;
  name: string;
  placeholder?: string;
  defaultValue?: string;
  maxLength?: number;
  uppercase?: boolean;
  select?: boolean;
  options?: Array<{ value: string; label: string }>;
  noBorderRight?: boolean;
}) {
  return (
    <div
      className={`px-7 py-5 ${
        noBorderRight ? "" : "border-r border-[var(--rule)]"
      }`}
    >
      <div className="text-[9px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1.5">
        {label}
      </div>
      {select && options ? (
        <select
          name={name}
          defaultValue={defaultValue ?? ""}
          className="w-full bg-transparent text-[14px] text-ink outline-none focus:outline-none"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          name={name}
          placeholder={placeholder}
          defaultValue={defaultValue}
          maxLength={maxLength}
          className={`w-full bg-transparent text-[14px] text-ink placeholder:text-slate-meta outline-none focus:outline-none ${
            uppercase ? "uppercase" : ""
          }`}
        />
      )}
    </div>
  );
}
