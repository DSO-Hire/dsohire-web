/**
 * /employer/jobs/new — create a new job posting.
 *
 * Server component fetches the DSO's locations (for the location picker),
 * passes them to the client-side form. Tiptap editor for the description,
 * Q4 spec.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveSubscription } from "@/lib/billing/subscription";
import { JobWizard, type LocationOption } from "../job-wizard";
import { JobIntro } from "./job-intro";
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

  // DSO name for the pre-publish name-leak nudge + practice-profile
  // completion flags for the Matchability meter (Lane 6). SELECT lists
  // every column the mapper reads (hard rule).
  const { data: dsoRow } = await supabase
    .from("dsos")
    .select(
      "name, practice_pace, autonomy_level, mentorship_offered, ce_support, work_life_balance, patient_populations"
    )
    .eq("id", dsoUser.dso_id)
    .maybeSingle();
  const dsoName = (dsoRow?.name as string | null) ?? undefined;
  const dsoProfile = (dsoRow ?? {}) as Record<string, unknown>;
  const profileFlags = {
    practice_pace: dsoProfile.practice_pace != null,
    autonomy_level: dsoProfile.autonomy_level != null,
    mentorship_offered: dsoProfile.mentorship_offered != null,
    ce_support: dsoProfile.ce_support != null,
    work_life_balance: dsoProfile.work_life_balance != null,
    patient_populations:
      Array.isArray(dsoProfile.patient_populations) &&
      (dsoProfile.patient_populations as unknown[]).length > 0,
  };

  // #83 Phase 4 — team roster for the confidential-search assignee picker.
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

  if (locationOptions.length === 0) {
    return (
      <>
        <div className="max-w-[640px]">
          <Link
            href="/employer/jobs"
            className="inline-flex items-center gap-2 text-2xs font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-6"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Jobs
          </Link>
          <h1 className="text-3xl font-extrabold tracking-[-1px] text-ink mb-4">
            Add a location first.
          </h1>
          <p className="text-sm text-slate-body leading-relaxed mb-7">
            Every job posting tags one or more of your practice locations. You
            haven&apos;t added any locations yet, so there&apos;s nothing to attach
            this job to.
          </p>
          <Link
            href="/employer/onboarding"
            className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-primary text-primary-foreground text-xs font-bold tracking-[1.8px] uppercase hover:bg-primary/90 transition-colors"
          >
            Add a Location
          </Link>
        </div>
      </>
    );
  }

  // Lane 6 — "Start from" chips. Most dental postings are 90% repeats;
  // each chip submits the EXISTING cloneJob action (full copy incl.
  // skills + screening questions, lands on the populated editor as a
  // draft). Clinical postings only — the corporate wizard is its own
  // flow. Drafts excluded ("start from" means a real past posting).
  // Two shallow queries, NOT a jobs→job_locations→dso_locations chain —
  // multi-level embeds are the GenericStringError Vercel build-breaker
  // (feedback_supabase_nested_embed_generic_string_error).
  const { data: recentRows } = await supabase
    .from("jobs")
    .select("id, title, created_at, status")
    .eq("dso_id", dsoUser.dso_id)
    .eq("scope", "location")
    .neq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(4);
  const recentJobRows = ((recentRows ?? []) as Array<Record<string, unknown>>);
  const recentIds = recentJobRows.map((r) => r.id as string);
  const locByJob = new Map<string, string>();
  if (recentIds.length > 0) {
    const { data: jlRows } = await supabase
      .from("job_locations")
      .select("job_id, location:dso_locations(name)")
      .in("job_id", recentIds);
    for (const row of (jlRows ?? []) as Array<Record<string, unknown>>) {
      const jobId = row.job_id as string;
      if (locByJob.has(jobId)) continue; // first location wins
      const loc = row.location as
        | { name: string | null }
        | Array<{ name: string | null }>
        | null;
      const name = Array.isArray(loc) ? loc[0]?.name : loc?.name;
      if (name) locByJob.set(jobId, name);
    }
  }
  const recentJobs = recentJobRows.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    locationName: locByJob.get(r.id as string) ?? null,
    createdAt: r.created_at as string,
  }));

  return (
    <>
      <Link
        href="/employer/jobs"
        className="inline-flex items-center gap-2 text-2xs font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Jobs
      </Link>

      {/* Step-1 launchpad chrome (hero + corporate banner + Start-from
          chips) — client component that collapses once the wizard advances
          past Step 1 (wizard-step signal). */}
      <JobIntro recentJobs={recentJobs} />

      <JobWizard
        dsoId={dsoUser.dso_id}
        locations={locationOptions}
        mode="create"
        dsoName={dsoName}
        teammates={teammates}
        profileFlags={profileFlags}
      />
    </>
  );
}
