/**
 * /companies — public directory of verified DSOs.
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
  title: "Verified Dental Support Organizations",
  description:
    "Browse the dental support organizations hiring through DSO Hire — verified, mid-market dental groups operating 10+ practices across the U.S.",
};

const COMPANIES_SORT_OPTIONS = [
  { value: "name", label: "Name (A→Z)" },
  { value: "practices", label: "Most practices" },
  { value: "jobs", label: "Most open jobs" },
  { value: "newest", label: "Recently verified" },
] as const;
type CompaniesSortKey = (typeof COMPANIES_SORT_OPTIONS)[number]["value"];

interface PageProps {
  searchParams: Promise<{ sort?: string }>;
}

interface DsoRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  headquarters_city: string | null;
  headquarters_state: string | null;
  practice_count: number | null;
  verified_at: string | null;
}

export default async function CompaniesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const sortKey: CompaniesSortKey =
    (COMPANIES_SORT_OPTIONS.find((o) => o.value === sp.sort)?.value as
      | CompaniesSortKey
      | undefined) ?? "name";
  const supabase = await createSupabaseServerClient();

  const { data: rawDsos } = await supabase
    .from("dsos")
    .select(
      "id, name, slug, description, logo_url, headquarters_city, headquarters_state, practice_count, verified_at"
    )
    .eq("status", "active")
    .order("name", { ascending: true });

  const allDsos = (rawDsos ?? []) as DsoRow[];

  // Affiliation filter (Phase 4.5.b launch-blocker, Q7 + Q4 sandbox).
  // Hide DSOs from this directory if every one of their locations is
  // private — surfacing a fully-private DSO in a public list would be
  // the direct leak Q7 was locked to prevent. The DSO's /companies/[slug]
  // page itself still renders for them (per Q4 sandbox philosophy);
  // they just don't get listed in the directory until they flip at
  // least one location to public.
  const allDsoIds = allDsos.map((d) => d.id);
  const dsosWithPublicLocation = new Set<string>();
  if (allDsoIds.length > 0) {
    const { data: pubLocs } = await supabase
      .from("dso_locations")
      .select("dso_id")
      .in("dso_id", allDsoIds)
      .eq("public_dso_affiliation", true);
    for (const r of (pubLocs ?? []) as Array<{ dso_id: string }>) {
      dsosWithPublicLocation.add(r.dso_id);
    }
  }
  const filteredDsos = allDsos.filter((d) =>
    dsosWithPublicLocation.has(d.id)
  );
  const dsoIds = filteredDsos.map((d) => d.id);

  // Count active jobs per DSO. RLS already filters to active+non-deleted, so
  // a single query gives us the raw rows; we group in memory.
  const jobCountByDso = new Map<string, number>();
  if (dsoIds.length > 0) {
    const { data: jobRows } = await supabase
      .from("jobs")
      .select("dso_id")
      .in("dso_id", dsoIds)
      .eq("status", "active")
      .is("deleted_at", null);

    for (const row of (jobRows ?? []) as Array<{ dso_id: string }>) {
      jobCountByDso.set(row.dso_id, (jobCountByDso.get(row.dso_id) ?? 0) + 1);
    }
  }

  // Apply sort
  const dsos = (() => {
    const sorted = [...filteredDsos];
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
            Verified Dental Support Organizations
          </span>
        </div>
        <h1 className="text-4xl sm:text-7xl font-extrabold tracking-[-2px] leading-[1.02] text-ink mb-5 max-w-[820px]">
          The DSOs hiring on DSO Hire.
        </h1>
        <p className="text-base sm:text-lg text-slate-body leading-relaxed max-w-[640px]">
          Every organization listed here operates multiple practices and has
          been verified by our team. Browse to learn more, or jump straight to
          an open role.
        </p>
      </section>

      <section className="px-6 sm:px-14 pb-24 max-w-[1240px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-meta">
            {dsos.length === 0
              ? "No DSOs listed yet"
              : dsos.length === 1
                ? "1 verified DSO"
                : `${dsos.length} verified DSOs`}
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

        {dsos.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[var(--rule)] border border-[var(--rule)]">
            {dsos.map((dso) => (
              <DsoCard
                key={dso.id}
                dso={dso}
                openJobs={jobCountByDso.get(dso.id) ?? 0}
              />
            ))}
          </div>
        )}
      </section>
    </SiteShell>
  );
}

function DsoCard({ dso, openJobs }: { dso: DsoRow; openJobs: number }) {
  const cityState = [dso.headquarters_city, dso.headquarters_state]
    .filter(Boolean)
    .join(", ");

  return (
    <Link
      href={`/companies/${dso.slug}`}
      className="group block bg-white p-7 hover:bg-cream motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-14px_rgba(7,15,28,0.18)] flex flex-col"
    >
      <div className="flex items-center gap-3 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
        <Building2 className="h-3.5 w-3.5" />
        Verified DSO
      </div>

      <div className="text-xl font-extrabold tracking-[-0.6px] text-ink mb-1 leading-tight">
        {dso.name}
      </div>

      {(cityState || dso.practice_count) && (
        <div className="text-[13px] tracking-[0.3px] text-slate-meta mb-4 flex flex-wrap gap-x-3 gap-y-1">
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

      {dso.description && (
        <p className="text-[14px] text-slate-body leading-relaxed line-clamp-3 mb-4">
          {dso.description}
        </p>
      )}

      <div className="mt-auto pt-4 border-t border-[var(--rule)] flex justify-between items-center">
        <div>
          <div className="text-[16px] font-extrabold text-ink leading-none">
            {openJobs}
          </div>
          <div className="text-[9px] font-semibold tracking-[1.5px] uppercase text-slate-meta mt-1.5">
            {openJobs === 1 ? "Open role" : "Open roles"}
          </div>
        </div>
        <div className="w-7 h-7 border border-[var(--rule-strong)] flex items-center justify-center text-heritage-light group-hover:bg-ink group-hover:text-heritage group-hover:border-ink transition-colors">
          <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="border border-[var(--rule)] bg-cream p-12 text-center max-w-[640px] mx-auto">
      <Building2 className="h-10 w-10 text-slate-meta mx-auto mb-5" />
      <h2 className="text-2xl font-extrabold tracking-[-0.5px] text-ink mb-3">
        No verified DSOs yet.
      </h2>
      <p className="text-[14px] text-slate-body leading-relaxed max-w-[440px] mx-auto">
        DSO Hire is in early launch — verified DSOs are onboarding through
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
