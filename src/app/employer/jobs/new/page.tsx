/**
 * /employer/jobs/new — create a new job posting.
 *
 * Server component fetches the DSO's locations (for the location picker),
 * passes them to the client-side form. Tiptap editor for the description,
 * Q4 spec.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, Briefcase } from "lucide-react";
import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveSubscription } from "@/lib/billing/subscription";
import { JobWizard, type LocationOption } from "../job-wizard";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Post a Job" };

export default async function NewJobPage() {
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

  // Permission gate — hiring managers cannot create jobs (per locked
  // 2026-05-05 decision). RLS would block the insert anyway, but we
  // bounce them at the page level so they don't see a job-creation UI
  // they can't submit.
  if (dsoUser.role === "hiring_manager")
    redirect("/employer/jobs?notice=no_post_permission");

  // Feature gate — must have an active subscription to post a job.
  const subscription = await getActiveSubscription(supabase, dsoUser.dso_id);
  if (!subscription) redirect("/employer/billing");

  const { data: locations } = await supabase
    .from("dso_locations")
    .select("id, name, city, state, public_dso_affiliation, anonymize_name")
    .eq("dso_id", dsoUser.dso_id)
    .order("name");

  const locationOptions: LocationOption[] = (locations ?? []).map((l) => ({
    id: l.id as string,
    name: l.name as string,
    city: (l.city as string | null) ?? null,
    state: (l.state as string | null) ?? null,
    publicDsoAffiliation: (l.public_dso_affiliation as boolean | null) ?? true,
    anonymizeName: (l.anonymize_name as boolean | null) ?? false,
  }));

  // DSO name for the pre-publish name-leak nudge.
  const { data: dsoRow } = await supabase
    .from("dsos")
    .select("name")
    .eq("id", dsoUser.dso_id)
    .maybeSingle();
  const dsoName = (dsoRow?.name as string | null) ?? undefined;

  if (locationOptions.length === 0) {
    return (
      <EmployerShell active="jobs">
        <div className="max-w-[640px]">
          <Link
            href="/employer/jobs"
            className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-6"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Jobs
          </Link>
          <h1 className="text-3xl font-extrabold tracking-[-1px] text-ink mb-4">
            Add a location first.
          </h1>
          <p className="text-[14px] text-slate-body leading-relaxed mb-7">
            Every job posting tags one or more of your practice locations. You
            haven&apos;t added any locations yet, so there&apos;s nothing to attach
            this job to.
          </p>
          <Link
            href="/employer/onboarding"
            className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-ink text-ivory text-[12px] font-bold tracking-[1.8px] uppercase hover:bg-ink-soft transition-colors"
          >
            Add a Location
          </Link>
        </div>
      </EmployerShell>
    );
  }

  return (
    <EmployerShell active="jobs">
      <Link
        href="/employer/jobs"
        className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Jobs
      </Link>

      <header className="mb-10">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          New Job Posting
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.1] text-ink">
          Post a job.
        </h1>
        <p className="mt-3 text-base text-slate-body max-w-[640px]">
          Write the role once. Assign it to as many of your practices as you
          need. We render separate location-specific listings automatically.
        </p>
      </header>

      {/* Cross-link banner — over to the corporate job wizard. The reverse
          banner lives on /employer/jobs/new/corporate. Placed in the route
          page (not JobWizard) so job-wizard.tsx stays untouched. */}
      <div className="mb-8 max-w-[820px] border-l-4 border-heritage bg-ink text-ivory p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Briefcase className="h-5 w-5 text-[var(--heritage-bright,#8db8a3)] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[14px] font-bold text-ivory mb-0.5">
              Hiring for a corporate role instead?
            </p>
            <p className="text-[12px] text-ivory/70 leading-relaxed">
              DSO-wide leadership and corporate-function roles — finance,
              ops, marketing, HR — use the corporate job wizard.
            </p>
          </div>
        </div>
        <Link
          href="/employer/jobs/new/corporate"
          className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 bg-heritage text-ivory text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-heritage-deep transition-colors"
        >
          Corporate job wizard
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <JobWizard
        dsoId={dsoUser.dso_id}
        locations={locationOptions}
        mode="create"
        dsoName={dsoName}
      />
    </EmployerShell>
  );
}
