/**
 * /employer/locations/new — add a new practice location.
 *
 * Auth-gated by EmployerShell. Form fields and submit-action shared with
 * /employer/locations/[id] via location-form.tsx.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LocationForm } from "../location-form";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Add Location" };

export default async function NewLocationPage() {
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
          New Practice Location
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.1] text-ink">
          Add a location.
        </h1>
        <p className="mt-3 text-base text-slate-body leading-relaxed max-w-[640px]">
          Locations are the tags you attach to job postings. Add every office
          your DSO operates so candidates can filter and apply to specific
          practices.
        </p>
      </header>

      <LocationForm dsoId={dsoUser.dso_id} mode="create" />
    </EmployerShell>
  );
}
