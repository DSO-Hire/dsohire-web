"use client";

/**
 * <JobsBrowser /> — the candidate jobs browse experience (rework 2026-06-04).
 *
 * Replaces the old "20 most recent + eject to the public board" teaser. Now the
 * candidate Jobs page is a PracticeFit-ranked, in-shell browser:
 *   • Ranked by fit (when PracticeFit is on), partitioned into
 *     Top matches (Strong+) → More worth a look (Solid/Light) → Other open roles
 *     (off-target, kept browsable so nothing silently disappears).
 *   • Live client-side filters (search, role, state, "top matches only") so the
 *     candidate never has to leave their authed shell for the "full board."
 *
 * Pure client rendering over serializable rows handed down by the server page.
 * The fit chip is rendered inline from {bucket, score} to keep the payload small
 * (we don't ship full FitResult objects for every row).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, MapPin, Search, X } from "lucide-react";
import { PracticeFitMark } from "@/components/practice-fit/brand/practice-fit-mark";
import { PracticeFitWordmark } from "@/components/practice-fit/brand/practice-fit-wordmark";
import { bucketStyle, type FitProduct } from "@/lib/practice-fit/buckets";
import type { FitBucket } from "@/lib/practice-fit/types";

export interface BrowseJob {
  id: string;
  title: string;
  roleCategory: string;
  roleLabel: string;
  employmentLabel: string;
  dsoName: string | null;
  locationLabel: string | null;
  states: string[];
  compLabel: string | null;
  compPeriodLabel: string | null;
  fitScore: number | null;
  fitBucket: FitBucket | null;
  /** #49 — navy PracticeFit vs heritage DSOFit color ramp. */
  fitProduct: FitProduct | null;
  applied: boolean;
}

/** Strong-bucket floor (see buckets.ts: 60-74 Strong, 75+ Excellent). */
const HIGH_FIT = 60;

export function JobsBrowser({
  jobs,
  consentOn,
}: {
  jobs: BrowseJob[];
  consentOn: boolean;
}) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Set<string>>(new Set());
  const [stateFilter, setStateFilter] = useState<string>("");
  const [topOnly, setTopOnly] = useState(false);

  const roleOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const j of jobs) if (!m.has(j.roleCategory)) m.set(j.roleCategory, j.roleLabel);
    return Array.from(m, ([value, label]) => ({ value, label }));
  }, [jobs]);

  const stateOptions = useMemo(
    () => Array.from(new Set(jobs.flatMap((j) => j.states).filter(Boolean))).sort(),
    [jobs]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = jobs.filter((j) => {
      if (roleFilter.size > 0 && !roleFilter.has(j.roleCategory)) return false;
      if (stateFilter && !j.states.includes(stateFilter)) return false;
      if (q && !`${j.title} ${j.dsoName ?? ""}`.toLowerCase().includes(q))
        return false;
      return true;
    });
    if (consentOn) {
      out.sort((a, b) => (b.fitScore ?? -1) - (a.fitScore ?? -1));
    }
    return out;
  }, [jobs, query, roleFilter, stateFilter, consentOn]);

  const top = consentOn
    ? filtered.filter((j) => (j.fitScore ?? -1) >= HIGH_FIT)
    : [];
  const more = consentOn
    ? filtered.filter((j) => j.fitScore != null && j.fitScore < HIGH_FIT)
    : [];
  const other = consentOn
    ? filtered.filter((j) => j.fitScore == null)
    : filtered;

  const hasFilters =
    query.trim() !== "" || roleFilter.size > 0 || stateFilter !== "" || topOnly;

  const toggleRole = (value: string) =>
    setRoleFilter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const clearAll = () => {
    setQuery("");
    setRoleFilter(new Set());
    setStateFilter("");
    setTopOnly(false);
  };

  const totalShown = top.length + more.length + other.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="space-y-3">
        {consentOn ? (
          <>
            <PracticeFitWordmark surface="light" tm className="text-3xl sm:text-4xl" />
            <h1 className="font-display text-xl sm:text-2xl font-bold tracking-[-0.4px] text-ink leading-tight">
              Jobs ranked for you.
            </h1>
            <p className="text-sm text-slate-body leading-relaxed max-w-[640px]">
              Every open role at multi-location dental groups, sorted by how well
              it fits your profile. Filter and search without leaving your
              dashboard.
            </p>
          </>
        ) : (
          <>
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
              Jobs
            </div>
            <h1 className="font-display text-3xl font-extrabold tracking-[-0.8px] text-ink leading-tight">
              Open roles at dental groups.
            </h1>
            <PracticeFitOffBanner />
          </>
        )}
      </header>

      {/* Filter bar */}
      <div className="space-y-3 border-b border-[var(--rule)] pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-meta" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search role or practice…"
              className="w-full rounded-md border border-[var(--rule)] bg-white pl-9 pr-3 py-2 text-[13px] text-ink placeholder:text-slate-meta focus:border-heritage focus:outline-none"
            />
          </label>
          {stateOptions.length > 0 && (
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="rounded-md border border-[var(--rule)] bg-white px-3 py-2 text-[13px] text-ink focus:border-heritage focus:outline-none"
            >
              <option value="">All states</option>
              {stateOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          {consentOn && (
            <button
              type="button"
              onClick={() => setTopOnly((v) => !v)}
              className={
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[12px] font-semibold transition-colors " +
                (topOnly
                  ? "border-heritage-deep bg-heritage/10 text-heritage-deep"
                  : "border-[var(--rule)] text-slate-body hover:border-heritage-deep hover:text-heritage-deep")
              }
            >
              <PracticeFitMark className="h-3 w-3" />
              Top matches only
            </button>
          )}
          {hasFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-meta hover:text-ink"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>

        {roleOptions.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {roleOptions.map((r) => {
              const active = roleFilter.has(r.value);
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => toggleRole(r.value)}
                  className={
                    "rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.3px] transition-colors " +
                    (active
                      ? "border-heritage-deep bg-heritage-deep text-ivory"
                      : "border-[var(--rule)] text-slate-body hover:border-heritage-deep hover:text-heritage-deep")
                  }
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Results */}
      {totalShown === 0 ? (
        <div className="border border-[var(--rule)] bg-cream p-8 text-center">
          <p className="text-[14px] text-slate-body leading-relaxed">
            {jobs.length === 0
              ? "No active roles right now — dental groups post throughout the week. We'll email you when a fitting role opens."
              : "No roles match your filters."}
          </p>
          {hasFilters && jobs.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="mt-3 text-[12px] font-bold tracking-[1px] uppercase text-heritage-deep hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : consentOn ? (
        <div className="space-y-8">
          <JobSection
            title="Your top matches"
            eyebrow="Strong & excellent fit"
            jobs={top}
          />
          {!topOnly && (
            <JobSection
              title="More worth a look"
              eyebrow="Solid & light fit"
              jobs={more}
            />
          )}
          {!topOnly && (
            <JobSection
              title="Other open roles"
              eyebrow="Outside your target roles"
              jobs={other}
              muted
            />
          )}
        </div>
      ) : (
        <JobSection title="Open roles" jobs={other} />
      )}
    </div>
  );
}

function JobSection({
  title,
  eyebrow,
  jobs,
  muted,
}: {
  title: string;
  eyebrow?: string;
  jobs: BrowseJob[];
  muted?: boolean;
}) {
  if (jobs.length === 0) return null;
  return (
    <section>
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <div>
          <h2
            className={
              "font-display text-lg font-bold " +
              (muted ? "text-slate-body" : "text-ink")
            }
          >
            {title}
          </h2>
          {eyebrow && (
            <p className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mt-0.5">
              {eyebrow}
            </p>
          )}
        </div>
        <span className="text-[10px] font-bold tracking-[2px] uppercase text-slate-meta">
          {jobs.length === 1 ? "1 role" : `${jobs.length} roles`}
        </span>
      </div>
      <ul className="list-none border-t border-[var(--rule)]">
        {jobs.map((job) => (
          <Row key={job.id} job={job} />
        ))}
      </ul>
    </section>
  );
}

function Row({ job }: { job: BrowseJob }) {
  const style = job.fitBucket
    ? bucketStyle(job.fitBucket, job.fitProduct ?? undefined)
    : null;
  const fitBrand = job.fitProduct === "dsofit" ? "DSOFit" : "PracticeFit";
  return (
    <li className="border-b border-[var(--rule)]">
      <Link
        href={`/jobs/${job.id}`}
        className="group relative block py-5 -mx-4 pl-5 pr-4 border-l-4 border-l-transparent transition-all duration-150 hover:border-l-heritage-deep hover:bg-white hover:shadow-[0_2px_18px_-12px_rgba(20,35,63,0.25)]"
      >
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1.5 flex-wrap">
              <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep">
                {job.roleLabel}
              </span>
              <span className="text-[10px] tracking-[0.5px] text-slate-meta">
                {job.employmentLabel}
              </span>
              {style && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${style.bgClass} ${style.textClass} ${style.borderClass}`}
                  title={`${fitBrand} · ${style.label} · ${job.fitScore}/100`}
                >
                  {job.fitProduct === "dsofit" ? (
                    <Building2 className="h-2.5 w-2.5 text-current" />
                  ) : (
                    <PracticeFitMark className="h-2.5 w-2.5" />
                  )}
                  {style.label}
                  <span className="font-mono text-[9px] opacity-70">
                    {job.fitScore}
                  </span>
                </span>
              )}
              {job.applied && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-heritage text-ivory text-[10px] font-bold tracking-[1.2px] uppercase">
                  Applied
                </span>
              )}
            </div>
            <div className="text-[17px] font-extrabold tracking-[-0.3px] text-ink leading-tight mb-1 transition-colors group-hover:text-heritage-deep">
              {job.title}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-meta">
              {job.dsoName && (
                <span className="font-semibold text-slate-body">{job.dsoName}</span>
              )}
              {job.locationLabel && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {job.locationLabel}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-6 text-right flex-shrink-0">
            {job.compLabel && (
              <div>
                <div className="text-[15px] font-extrabold text-ink leading-none">
                  {job.compLabel}
                </div>
                {job.compPeriodLabel && (
                  <div className="text-[9px] tracking-[1.2px] uppercase text-slate-meta mt-1.5 font-semibold">
                    {job.compPeriodLabel}
                  </div>
                )}
              </div>
            )}
            <ArrowRight className="h-4 w-4 text-slate-meta transition-all duration-150 group-hover:text-heritage-deep group-hover:translate-x-1" />
          </div>
        </div>
      </Link>
    </li>
  );
}

function PracticeFitOffBanner() {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-l-2 border-heritage bg-cream/60 px-4 py-3">
      <p className="text-[13px] text-slate-body leading-relaxed">
        Turn on PracticeFit to rank these roles to your profile and let dental
        groups find you by fit.
      </p>
      <Link
        href="/candidate/practice-fit"
        className="inline-flex items-center gap-1.5 rounded-md bg-heritage px-3 py-2 text-[11px] font-bold tracking-[1px] uppercase text-ivory hover:bg-heritage-deep"
      >
        <PracticeFitMark className="h-3 w-3" />
        Turn on PracticeFit
      </Link>
    </div>
  );
}
