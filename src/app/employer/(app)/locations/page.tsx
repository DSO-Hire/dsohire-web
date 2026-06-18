/**
 * /employer/locations — list of all practice locations for the signed-in DSO.
 *
 * RLS guarantees we only see this DSO's locations. We also pull a count of
 * non-deleted jobs each location is tagged on so the row can show "in use"
 * context (and so the edit page can warn before deletion).
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPin, Plus, Upload } from "lucide-react";
import { HelpDisclosure } from "@/components/help/help-disclosure";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ListSort } from "@/components/ui/list-sort";
import { LocationsView, type LocationCardData } from "./locations-view";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Locations" };

const LOC_SORT_OPTIONS = [
  { value: "name", label: "Name (A→Z)" },
  { value: "city", label: "City (A→Z)" },
  { value: "jobs", label: "Most active jobs" },
  { value: "newest", label: "Recently added" },
] as const;
type LocSortKey = (typeof LOC_SORT_OPTIONS)[number]["value"];

interface PageProps {
  searchParams: Promise<{ sort?: string }>;
}

export default async function EmployerLocationsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const sortKey: LocSortKey =
    (LOC_SORT_OPTIONS.find((o) => o.value === sp.sort)?.value as
      | LocSortKey
      | undefined) ?? "name";
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");

  // Hiring managers don't manage locations (admin-only surface).
  if (dsoUser.role === "hiring_manager") redirect("/employer/dashboard");

  const { data: locations } = await supabase
    .from("dso_locations")
    .select(
      "id, name, address_line1, address_line2, city, state, postal_code, logo_url, created_at, latitude, longitude"
    )
    .eq("dso_id", dsoUser.dso_id)
    .order("name", { ascending: true });

  const allLocations = (locations ?? []) as LocationRow[];

  // Count active job tags per location so we can show "in use on N jobs"
  const locationIds = allLocations.map((l) => l.id);
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

  // Apply sort
  const locationList = (() => {
    const sorted = [...allLocations];
    if (sortKey === "city") {
      sorted.sort((a, b) =>
        (a.city ?? "").localeCompare(b.city ?? "", undefined, {
          sensitivity: "base",
        })
      );
    } else if (sortKey === "jobs") {
      sorted.sort(
        (a, b) =>
          (jobTagCounts.get(b.id) ?? 0) - (jobTagCounts.get(a.id) ?? 0)
      );
    } else if (sortKey === "newest") {
      sorted.sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
      );
    }
    // Default: name (already DB-ordered).
    return sorted;
  })();

  // Bake the active-job count onto each location for the view component.
  const cards: LocationCardData[] = locationList.map((l) => ({
    ...l,
    activeJobs: jobTagCounts.get(l.id) ?? 0,
  }));

  return (
    <>
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
        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            href="/employer/locations/bulk"
            className="inline-flex items-center gap-2 px-4 py-3.5 bg-white border border-[var(--rule-strong)] text-ink text-[12px] font-bold tracking-[1.8px] uppercase hover:bg-cream/60 transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
            Bulk Import
          </Link>
          <Link
            href="/employer/locations/new"
            className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-ink text-ivory text-[12px] font-bold tracking-[1.8px] uppercase hover:bg-ink-soft transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Location
          </Link>
        </div>
      </header>

      <div className="mb-7">
        <HelpDisclosure helpKey="locations.overview" />
      </div>

      {locationList.length === 0 ? (
        <EmptyState />
      ) : (
        <LocationsView
          locations={cards}
          sortControl={
            locationList.length > 1 ? (
              <ListSort
                basePath="/employer/locations"
                options={LOC_SORT_OPTIONS}
                activeValue={sortKey}
                defaultValue="name"
              />
            ) : null
          }
        />
      )}
    </>
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
  logo_url: string | null;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
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
        className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-ink text-ivory text-[12px] font-bold tracking-[1.8px] uppercase hover:bg-ink-soft transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add Location
      </Link>
    </div>
  );
}
