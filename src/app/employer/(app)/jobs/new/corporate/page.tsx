/**
 * /employer/jobs/new/corporate — create a new CORPORATE job posting.
 *
 * The parallel route to /employer/jobs/new (the dental-clinical wizard).
 * Scope is locked to "corporate" — the route IS the scope. Server component
 * fetches the DSO's locations (used as OPTIONAL anchor locations — 0/1/N all
 * valid for corporate roles) and renders the corporate wizard in create mode.
 *
 * Phase 5G.d, 2026-05-14.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveSubscription } from "@/lib/billing/subscription";
import { CorporateJobWizard } from "../../corporate-wizard";
import { CorporateJobIntro } from "./corporate-job-intro";
import type { LocationOption } from "../../job-wizard";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Post a Corporate Job" };

export default async function NewCorporateJobPage() {
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

  // Permission gate — hiring managers cannot create jobs (locked
  // 2026-05-05 decision). Bounce them at the page level.
  if (dsoUser.role === "hiring_manager") redirect("/employer/jobs");

  // Feature gate — must have an active subscription to post a job.
  const subscription = await getActiveSubscription(supabase, dsoUser.dso_id);
  if (!subscription) redirect("/employer/billing");

  const { data: locations } = await supabase
    .from("dso_locations")
    .select("id, name, city, state, public_dso_affiliation, anonymize_name")
    .eq("dso_id", dsoUser.dso_id)
    .order("name");

  // Anonymity flags included (P0, Day 33) — the corporate wizard's live
  // preview masks anonymized location names exactly like the public page.
  const locationOptions: LocationOption[] = (locations ?? []).map((l) => ({
    id: l.id as string,
    name: l.name as string,
    city: (l.city as string | null) ?? null,
    state: (l.state as string | null) ?? null,
    publicDsoAffiliation: (l.public_dso_affiliation as boolean | null) ?? true,
    anonymizeName: (l.anonymize_name as boolean | null) ?? false,
  }));

  // #83 Phase 4 — team roster for the confidential-search assignee picker.
  // The quiet C-suite search is THE corporate-side use case (#56).
  const { data: rosterRows } = await supabase
    .from("dso_users")
    .select("id, full_name, role")
    .eq("dso_id", dsoUser.dso_id)
    .order("full_name");
  const teammates = ((rosterRows ?? []) as Array<Record<string, unknown>>).map(
    (t) => ({
      id: t.id as string,
      name: ((t.full_name as string | null) ?? "Teammate").trim() || "Teammate",
      role: (t.role as string | null) ?? "",
    })
  );

  // NOTE: unlike the practice wizard's new/page.tsx, we do NOT bounce when
  // there are zero locations — corporate roles are DSO-wide and the anchor
  // location is optional.

  return (
    <>
      <Link
        href="/employer/jobs"
        className="inline-flex items-center gap-2 text-2xs font-bold tracking-[2.5px] uppercase text-corporate hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Jobs
      </Link>

      {/* Step-1 launchpad chrome (hero + practice banner) — client
          component that collapses once the wizard advances past Step 1
          (wizard-step signal). */}
      <CorporateJobIntro />

      <CorporateJobWizard
        dsoId={dsoUser.dso_id}
        locations={locationOptions}
        mode="create"
        teammates={teammates}
      />
    </>
  );
}
