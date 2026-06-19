/**
 * /employer/jobs/new — create a new job posting.
 *
 * Server component fetches the DSO's locations (for the location picker),
 * passes them to the client-side form. Tiptap editor for the description,
 * Q4 spec.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, Briefcase, Copy } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveSubscription } from "@/lib/billing/subscription";
import { JobWizard, type LocationOption } from "../job-wizard";
import { cloneJob } from "../actions";
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
            className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-primary text-primary-foreground text-[12px] font-bold tracking-[1.8px] uppercase hover:bg-primary/90 transition-colors"
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
      <div className="mb-8 max-w-[820px] border-l-4 border-heritage bg-hero text-hero-foreground p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Briefcase className="h-5 w-5 text-[var(--heritage-bright,#8db8a3)] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[14px] font-bold text-hero-foreground mb-0.5">
              Hiring for a corporate role instead?
            </p>
            <p className="text-[12px] text-hero-foreground/70 leading-relaxed">
              DSO-wide leadership and corporate-function roles — finance,
              ops, marketing, HR — use the corporate job wizard.
            </p>
          </div>
        </div>
        <Link
          href="/employer/jobs/new/corporate"
          className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 bg-heritage text-primary-foreground text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-heritage-deep transition-colors"
        >
          Corporate job wizard
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Lane 6 — start from a previous posting. Each chip submits the
          existing cloneJob server action: full draft copy (skills +
          screening questions included), lands on the populated editor. */}
      {recentJobs.length > 0 && (
        <div className="mb-8 max-w-[820px]">
          <p className="text-[10px] font-bold tracking-[2px] uppercase text-slate-meta mb-2">
            Start from
          </p>
          <div className="flex flex-wrap gap-2">
            {recentJobs.map((j) => (
              <form key={j.id} action={cloneJob}>
                <input type="hidden" name="job_id" value={j.id} />
                <button
                  type="submit"
                  title={`Duplicate "${j.title}" as a new draft and open it in the editor`}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-card border border-[var(--rule-strong)] text-[12px] font-semibold text-ink hover:border-heritage hover:bg-heritage/5 transition-colors max-w-[320px]"
                >
                  <Copy className="h-3.5 w-3.5 text-heritage-deep shrink-0" />
                  <span className="truncate">{j.title}</span>
                  <span className="text-[10px] text-slate-meta whitespace-nowrap">
                    {j.locationName ? `${j.locationName} · ` : ""}
                    {new Date(j.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      year: "2-digit",
                    })}
                  </span>
                </button>
              </form>
            ))}
            <span className="self-center text-[11px] text-slate-meta">
              — or start blank below
            </span>
          </div>
        </div>
      )}

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
