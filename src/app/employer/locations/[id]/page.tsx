/**
 * /employer/locations/[id] — edit a single practice location.
 *
 * Server component fetches the location, hands the data to LocationForm.
 * Delete affordance lives below the form (gated on whether the location is
 * still tagged on any non-deleted job).
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LocationForm, type LocationFormInitial } from "../location-form";
import { DeleteLocationButton } from "./delete-button";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Edit Location" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditLocationPage({ params }: PageProps) {
  const { id } = await params;
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

  const { data: location } = await supabase
    .from("dso_locations")
    .select("id, name, address_line1, address_line2, city, state, postal_code, dso_id")
    .eq("id", id)
    .eq("dso_id", dsoUser.dso_id)
    .maybeSingle();

  if (!location) notFound();

  // Count non-deleted jobs that still tag this location — drives the delete
  // safety guard.
  const { data: jobLinks } = await supabase
    .from("job_locations")
    .select("job_id, jobs:jobs!inner(id, deleted_at)")
    .eq("location_id", id);

  const liveJobCount = (
    (jobLinks ?? []) as unknown as Array<{
      job_id: string;
      jobs: { id: string; deleted_at: string | null } | null;
    }>
  ).filter((row) => row.jobs && row.jobs.deleted_at === null).length;

  const initial: LocationFormInitial = {
    id: location.id as string,
    name: location.name as string,
    address_line1: (location.address_line1 as string | null) ?? null,
    address_line2: (location.address_line2 as string | null) ?? null,
    city: (location.city as string | null) ?? null,
    state: (location.state as string | null) ?? null,
    postal_code: (location.postal_code as string | null) ?? null,
  };

  return (
    <EmployerShell active="locations">
      <Link
        href="/employer/locations"
        className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Locations
      </Link>

      <header className="mb-10 max-w-[720px]">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          Edit Location
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.1] text-ink">
          {initial.name}
        </h1>
        <p className="mt-3 text-[13px] tracking-[0.3px] text-slate-meta">
          Currently tagged on{" "}
          <span className="font-semibold text-ink">
            {liveJobCount} {liveJobCount === 1 ? "job" : "jobs"}
          </span>
          .
        </p>
      </header>

      <LocationForm
        dsoId={dsoUser.dso_id}
        mode="edit"
        initial={initial}
      />

      <div className="mt-12 max-w-[720px]">
        <DeleteLocationButton
          dsoId={dsoUser.dso_id}
          locationId={initial.id}
          locationName={initial.name}
          liveJobCount={liveJobCount}
        />
      </div>
    </EmployerShell>
  );
}
