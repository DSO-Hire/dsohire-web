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
import { ArrowLeft, ArrowRight, Building2 } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveSubscription } from "@/lib/billing/subscription";
import { CorporateJobWizard } from "../../corporate-wizard";
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
        className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-[#3D5266] hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Jobs
      </Link>

      <header className="mb-8">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-[#3D5266] mb-2">
          New Corporate Job Posting
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.1] text-ink">
          Post a corporate role.
        </h1>
        <p className="mt-3 text-base text-slate-body max-w-[640px]">
          DSO-wide leadership and corporate-function roles — finance, ops,
          marketing, HR, and more. These post to the Corporate Roles tab on
          the public job board.
        </p>
      </header>

      {/* Cross-link banner — back to the practice/clinical wizard. The
          reverse banner lives on /employer/jobs/new. Placed in the route
          page (not the wizard component) to keep corporate-wizard.tsx and
          job-wizard.tsx untouched by cross-linking concerns. */}
      <div className="mb-8 max-w-[820px] border-l-4 border-heritage-deep bg-heritage text-ivory p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Building2 className="h-5 w-5 text-ivory flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[14px] font-bold text-ivory mb-0.5">
              Hiring for a practice role instead?
            </p>
            <p className="text-[12px] text-ivory/80 leading-relaxed">
              Dentists, hygienists, assistants, and front-office roles use
              the practice job wizard.
            </p>
          </div>
        </div>
        <Link
          href="/employer/jobs/new"
          className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 bg-ink text-ivory text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors"
        >
          Practice job wizard
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <CorporateJobWizard
        dsoId={dsoUser.dso_id}
        locations={locationOptions}
        mode="create"
        teammates={teammates}
      />
    </>
  );
}
