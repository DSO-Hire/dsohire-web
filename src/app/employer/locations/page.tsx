/**
 * /employer/locations — list of all practice locations for the signed-in DSO.
 *
 * RLS guarantees we only see this DSO's locations. We also pull a count of
 * non-deleted jobs each location is tagged on so the row can show "in use"
 * context (and so the edit page can warn before deletion).
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, MapPin, Plus } from "lucide-react";
import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Locations" };

export default async function EmployerLocationsPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");

  const { data: locations } = await supabase
    .from("dso_locations")
    .select("id, name, address_line1, address_line2, city, state, postal_code, created_at")
    .eq("dso_id", dsoUser.dso_id)
    .order("name", { ascending: true });

  const locationList = (locations ?? []) as LocationRow[];

  // Count active job tags per location so we can show "in use on N jobs"
  const locationIds = locationList.map((l) => l.id);
  const jobTagCounts = new Map<string, number>();

  if (locationIds.length > 0) {
    const { data: jobLinks } = await supabase
      .from("job_locations")
      .select("location_id, jobs:jobs!inner(id, deleted_at)")
      .in("location_id", locationIds);

    for (const row of (jobLinks ?? []) as unknown as Array<{
      location_id: string;
      jobs: { id: string; deleted_at: string | null } | null;
    }>) {
      if (!row.jobs || row.jobs.deleted_at !== null) continue;
      jobTagCounts.set(row.location_id, (jobTagCounts.get(row.location_id) ?? 0) + 1);
    }
  }

  return (
    <EmployerShell active="locations">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
            Locations
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-[-1.2px] leading-tight text-ink">
            Your practice locations
          </h1>
          <p className="mt-3 text-[14px] text-slate-body max-w-[640px]">
            Each location is a tag you can attach to job postings. Add every
            office your DSO operates so candidates can filter and apply by city.
          </p>
        </div>
        <Link
          href="/employer/locations/new"
          className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-ink text-ivory text-[11px] font-bold tracking-[1.8px] uppercase hover:bg-ink-soft transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Location
        </Link>
      </header>

      {locationList.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="list-none border-t border-[var(--rule)]">
          {locationList.map((loc) => (
            <LocationRowItem
              key={loc.id}
              location={loc}
              activeJobs={jobTagCounts.get(loc.id) ?? 0}
            />
          ))}
        </ul>
      )}
    </EmployerShell>
  );
}

interface LocationRow {
  id: string;
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  created_at: string;
}

function LocationRowItem({
  location,
  activeJobs,
}: {
  location: LocationRow;
  activeJobs: number;
}) {
  const cityState = [location.city, location.state].filter(Boolean).join(", ");
  const street = [location.address_line1, location.address_line2]
    .filter(Boolean)
    .join(", ");

  return (
    <li className="border-b border-[var(--rule)]">
      <Link
        href={`/employer/locations/${location.id}`}
        className="group block py-5 hover:bg-cream/40 transition-colors -mx-2 px-2"
      >
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1.5">
              <MapPin className="h-3.5 w-3.5 text-heritage flex-shrink-0" />
              <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta">
                {cityState || "Address incomplete"}
              </span>
            </div>
            <div className="text-[17px] font-extrabold tracking-[-0.3px] text-ink leading-tight mb-1 truncate">
              {location.name}
            </div>
            {street && (
              <div className="text-[12px] tracking-[0.3px] text-slate-meta truncate">
                {street}
                {location.postal_code ? ` · ${location.postal_code}` : ""}
              </div>
            )}
          </div>
          <div className="flex items-center gap-8 text-right flex-shrink-0">
            <div>
              <div className="text-[16px] font-extrabold text-ink leading-none">
                {activeJobs}
              </div>
              <div className="text-[9px] font-semibold tracking-[1.5px] uppercase text-slate-meta mt-1">
                {activeJobs === 1 ? "Job" : "Jobs"}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-meta group-hover:text-heritage transition-colors" />
          </div>
        </div>
      </Link>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="border border-[var(--rule)] bg-cream p-12 text-center">
      <MapPin className="h-10 w-10 text-slate-meta mx-auto mb-5" />
      <h2 className="text-2xl font-extrabold tracking-[-0.5px] text-ink mb-3">
        No locations yet.
      </h2>
      <p className="text-[14px] text-slate-body leading-relaxed max-w-[440px] mx-auto mb-7">
        Add your first practice location to start posting jobs. You can add as
        many as you want — each one becomes a tag you can attach to job
        listings.
      </p>
      <Link
        href="/employer/locations/new"
        className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-ink text-ivory text-[11px] font-bold tracking-[1.8px] uppercase hover:bg-ink-soft transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add Location
      </Link>
    </div>
  );
}
