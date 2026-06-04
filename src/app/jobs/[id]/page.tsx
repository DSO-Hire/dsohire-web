/**
 * /jobs/[id] — public job detail page.
 *
 * Renders the Tiptap-authored description through DOMPurify, plus a
 * JobPosting JSON-LD <script> that satisfies Google for Jobs structured data.
 *
 * Apply CTA is a stub for now — Phase 2 Week 4 wires the real apply form
 * to /api/jobs/[id]/apply.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Clock,
  DollarSign,
  ExternalLink,
  MapPin,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import {
  RenderedJobDescription,
  htmlToPlainText,
} from "@/components/rendered-job-description";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SaveJobButton } from "@/lib/saved-jobs/save-job-button";
import { ShareToLinkedIn } from "@/components/share-to-linkedin";
import { loadJobAttachmentsWithUrls } from "@/lib/jobs/attachments";
import { JobAttachmentsPublic } from "@/components/job-attachments-public";
import { recordJobView } from "@/lib/analytics/record-view";
import { getPracticeFit } from "@/lib/practice-fit/get-or-compute";
import { PracticeFitChip } from "@/components/practice-fit/practice-fit-chip";
import {
  PracticeFitPlaceholder,
  classifyPlaceholderReason,
  type PlaceholderReason,
} from "@/components/practice-fit/placeholder";
import { WhyThisMatch } from "@/components/practice-fit/why-this-match";
import type { FitResult } from "@/lib/practice-fit/types";
import { getCorporateFunction } from "@/lib/corporate/functions";
import {
  WORK_MODE_LABELS,
  TRAVEL_EXPECTATION_LABELS,
  DIRECT_REPORTS_BAND_LABELS,
  INDIRECT_REPORTS_BAND_LABELS,
  AUTHORITY_LEVEL_LABELS,
  EDUCATION_REQUIREMENT_LABELS,
  INDUSTRY_EXPERIENCE_LABELS,
} from "@/lib/corporate/job-fields";
import { computeOte, formatUsd } from "@/lib/comp/ote";
import { VERIFICATION_TYPE_LABELS } from "@/lib/verifications/types";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ source?: string }>;
}

const ROLE_LABELS: Record<string, string> = {
  dentist: "Dentist",
  dental_hygienist: "Dental Hygienist",
  dental_assistant: "Dental Assistant",
  front_office: "Front Office",
  office_manager: "Office Manager",
  regional_manager: "Regional Manager",
  specialist: "Specialist",
  other: "Other",
};

const EMP_LABELS: Record<string, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  contract: "Contract",
  prn: "PRN",
  locum: "Locum",
};

const EMP_SCHEMA: Record<string, string> = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  prn: "PER_DIEM",
  locum: "TEMPORARY",
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("title, description, role_category, status, deleted_at")
    .eq("id", id)
    .maybeSingle();

  if (!job || (job.status as string) !== "active" || job.deleted_at) {
    return { title: "Job not found" };
  }

  const plainDescription = htmlToPlainText((job.description as string) ?? "").slice(
    0,
    160
  );

  return {
    title: `${job.title as string} · DSO Hire`,
    description: plainDescription,
    openGraph: {
      title: job.title as string,
      description: plainDescription,
      type: "website",
    },
  };
}

export default async function JobDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const supabase = await createSupabaseServerClient();

  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, dso_id, title, slug, description, employment_type, role_category, compensation_min, compensation_max, compensation_period, compensation_type, compensation_visible, variable_comp_enabled, variable_comp_target, variable_comp_structure, bonus_enabled, bonus_target, benefits, requirements, posted_at, status, schedule_days, schedule_evenings, schedule_weekends, scope, external_links, corporate_function, work_mode, work_mode_detail, remote_state_restrictions, travel_expectation, travel_territory, reports_to, direct_reports_band, indirect_reports_band, authority_level, education_requirement, industry_experience, min_years_corporate_experience, max_years_corporate_experience, bonus_structure, equity_offered, equity_note, visibility"
    )
    .eq("id", id)
    .maybeSingle();

  if (!job || (job.status as string) !== "active") notFound();

  const [
    { data: dso },
    { data: jobLocations },
    { data: jobSkills },
    jobAttachments,
    { data: jobVerifications },
  ] = await Promise.all([
    supabase
      .from("dsos")
      .select("id, name, slug, description, headquarters_city, headquarters_state")
      .eq("id", job.dso_id as string)
      .maybeSingle(),
    supabase
      .from("job_locations")
      .select(
        "location:dso_locations(id, name, address_line1, city, state, postal_code, website, public_dso_affiliation)"
      )
      .eq("job_id", id),
    supabase.from("job_skills").select("skill").eq("job_id", id),
    loadJobAttachmentsWithUrls(supabase, id),
    // 5G.e Tier 2 — verification requirements stated on the public listing.
    supabase
      .from("job_verification_requirements")
      .select("verification_type")
      .eq("job_id", id),
  ]);

  const verificationTypes: string[] = (
    (jobVerifications ?? []) as Array<{ verification_type: string }>
  ).map((v) => v.verification_type);

  const locations = ((jobLocations ?? []) as unknown as Array<{
    location: {
      id: string;
      name: string;
      address_line1: string | null;
      city: string | null;
      state: string | null;
      postal_code: string | null;
      website: string | null;
      public_dso_affiliation: boolean | null;
    } | null;
  }>)
    .map((row) => row.location)
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const skills = ((jobSkills ?? []) as Array<{ skill: string }>).map((s) => s.skill);

  const dsoName = (dso?.name as string) ?? "DSO";

  // Affiliation display (Phase 4.5.b launch-blocker, locked 2026-05-08).
  // Public-affiliated jobs render the DSO name + a link to the company
  // page, which is the historical behavior. Private-affiliated jobs
  // mask the DSO name with the practice name (single-location) or
  // "Multiple locations" (multi-location) — and the link goes away.
  // Helper: job_is_publicly_dso_affiliated runs the same check used
  // everywhere else (most-private inherits across multi-location;
  // regional/corporate jobs always public).
  const { data: isPublicAffiliatedRpc } = await supabase.rpc(
    "job_is_publicly_dso_affiliated",
    { p_job_id: id }
  );
  const isPublicAffiliated = isPublicAffiliatedRpc === true;
  const singlePracticeName =
    locations.length === 1 ? locations[0]!.name : null;
  // 5G.a (2026-05-13) — corporate-scope jobs are DSO-wide and may have
  // 0 or many anchor locations. The label "Multiple locations" reads wrong
  // for a CFO posting; "Corporate" (or, when public-affiliated, "{DSO}
  // Corporate") communicates the actual model. Single-anchor corporate
  // jobs still surface the practice name when private-affiliated.
  const jobScope = (job.scope as "location" | "regional" | "corporate" | null) ??
    "location";
  const displayedEmployerName = isPublicAffiliated
    ? dsoName
    : jobScope === "corporate"
      ? (singlePracticeName ?? "Corporate")
      : (singlePracticeName ?? "Multiple locations");

  // ── Candidate-side state for the SaveJobButton + PracticeFit ──────
  // Anonymous visitors get the button hidden. Authenticated DSO members
  // (employers) also get it hidden — only candidates can save jobs.
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

  // Record a view event for Phase 5C analytics. Fire-and-forget — never
  // gates page render. Reuses the `viewer` lookup above. Source +
  // Referer captured inside the helper.
  void recordJobView({
    jobId: id,
    sourceParam: sp.source ?? null,
    authenticatedUserId: viewer?.id ?? null,
  });
  let candidateAuthed = false;
  let initialSaved = false;
  let practiceFit: FitResult | null = null;
  // Reason-rich placeholder support (focused-pass extension, gap caught
  // by Cam 2026-05-08 PM viewing a Front Office job as a dental
  // assistant — page went silent on PracticeFit). Classified only on
  // the candidate's own data, just like the other candidate-side
  // surfaces.
  let practiceFitReason: PlaceholderReason | null = null;
  // Hoisted out of the inner block so the JSX can pass it to
  // WhyThisMatch for the v1 narrative fetch.
  let viewerCandidateId: string | null = null;
  // Already-applied state (Cam 2026-05-08 PM) — drives Apply CTA swap
  // to "View my application" so candidates don't redundantly apply.
  let existingApplicationId: string | null = null;
  if (viewer) {
    const { data: candidateRow } = await supabase
      .from("candidates")
      .select("id, practice_fit_consent, desired_roles")
      .eq("auth_user_id", viewer.id)
      .maybeSingle();
    if (candidateRow) {
      candidateAuthed = true;
      const candidateId = (candidateRow as Record<string, unknown>).id as string;
      viewerCandidateId = candidateId;
      const candidateDesiredRoles =
        ((candidateRow as Record<string, unknown>).desired_roles as
          | string[]
          | null) ?? [];
      const { data: existing } = await supabase
        .from("saved_jobs")
        .select("id")
        .eq("candidate_id", candidateId)
        .eq("job_id", id)
        .maybeSingle();
      initialSaved = Boolean(existing);

      // PracticeFit (Phase 5D) — only when the candidate has opted in.
      const consent = (candidateRow as Record<string, unknown>)
        .practice_fit_consent as string;
      if (consent !== "off") {
        practiceFit = await getPracticeFit(candidateId, id);
        if (!practiceFit) {
          practiceFitReason = classifyPlaceholderReason(
            candidateDesiredRoles,
            (job as { role_category?: string | null } | null)?.role_category
          );
        }
      }

      // Existing application lookup — drives the Apply button swap.
      const { data: existingApp } = await supabase
        .from("applications")
        .select("id")
        .eq("candidate_id", candidateId)
        .eq("job_id", id)
        .maybeSingle();
      if (existingApp) {
        existingApplicationId = (existingApp as { id: string }).id;
      }
    }
  }

  // JobPosting JSON-LD for Google for Jobs. For private-affiliation
  // jobs, hiringOrganization.name flips to the displayed name (practice
  // name single-loc, "Multiple locations" multi-loc). Q5 locked: no
  // parentOrganization extension — the corporate name must not leak
  // through indexed schema. We also drop the `sameAs` link to the
  // /companies/[slug] page since the slug exposes the corporate name.
  const jsonLd = buildJobPostingJsonLd({
    job,
    dso: dso as DsoForSchema | null,
    locations,
    isPublicAffiliated,
    displayedEmployerName,
  });

  return (
    <SiteShell>
      <article className="pt-[140px] pb-24 px-6 sm:px-14 max-w-[1100px] mx-auto">
        <Link
          href="/jobs"
          className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-8"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to All Jobs
        </Link>

        {/* Title block — eyebrow swaps for corporate scope:
            CORPORATE · {function label} · {employment} instead of
            {role_category} · {employment}. role_category is forced to
            'other' for corporate jobs at the server, so falling through
            to it would render "OTHER" on the public page. */}
        <header className="pb-8 border-b border-[var(--rule)] mb-10">
          {(() => {
            const jobScope =
              (job.scope as "location" | "regional" | "corporate" | null) ??
              "location";
            const isCorporate = jobScope === "corporate";
            const corpFn = isCorporate
              ? getCorporateFunction(
                  (job.corporate_function as string | null) ?? ""
                )
              : null;
            // Slate-blue accent on corporate eyebrow + dots matches the
            // /jobs Corporate tab styling so the surface reads consistent.
            const eyebrowColor = isCorporate ? "#3D5266" : undefined;
            const dotBg = isCorporate
              ? eyebrowColor
              : "var(--heritage-deep, #3a5e4d)";
            return (
              <div
                className={
                  isCorporate
                    ? "flex items-center gap-3 text-[10px] font-bold tracking-[2.5px] uppercase mb-3"
                    : "flex items-center gap-3 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3"
                }
                style={isCorporate ? { color: eyebrowColor } : undefined}
              >
                {isCorporate ? (
                  <>
                    Corporate
                    {corpFn && (
                      <>
                        <span
                          className="block w-1 h-1 rounded-full"
                          style={{ background: dotBg }}
                        />
                        {corpFn.label}
                      </>
                    )}
                  </>
                ) : (
                  ROLE_LABELS[job.role_category as string] ??
                  job.role_category
                )}
                <span
                  className="block w-1 h-1 rounded-full"
                  style={{ background: dotBg }}
                />
                {EMP_LABELS[job.employment_type as string] ??
                  job.employment_type}
              </div>
            );
          })()}
          <h1 className="text-3xl sm:text-6xl font-extrabold tracking-[-1.8px] leading-[1.05] text-ink mb-5">
            {job.title as string}
          </h1>
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {isPublicAffiliated ? (
              <Link
                href={`/companies/${dso?.slug as string}`}
                className="inline-flex items-center gap-1 text-[15px] text-slate-body hover:text-ink transition-colors"
              >
                at <span className="font-semibold text-ink ml-0.5">{dsoName}</span>
              </Link>
            ) : (
              // Private affiliation — show the practice name (or
              // "Multiple locations" for multi-loc private jobs) with
              // NO link to /companies/[slug]. Linking would be the
              // direct leak: the URL slug is the corporate name.
              <span className="inline-flex items-center gap-1 text-[15px] text-slate-body">
                at{" "}
                <span className="font-semibold text-ink ml-0.5">
                  {displayedEmployerName}
                </span>
              </span>
            )}
            {practiceFit ? (
              <PracticeFitChip fit={practiceFit} size="md" />
            ) : practiceFitReason === "role_mismatch" ? (
              <PracticeFitPlaceholder reason="role_mismatch" />
            ) : null}
          </div>
          {/* Top CTA bar — Apply + Save. Repeats at the bottom of the
              description for long postings. When the candidate has
              already applied, the Apply CTA swaps to "View my
              application" linking to the candidate-side detail. */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {existingApplicationId ? (
              <Link
                href={`/candidate/applications/${existingApplicationId}`}
                className="inline-flex items-center justify-center px-8 py-3.5 bg-heritage text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-heritage-deep transition-colors"
              >
                View My Application
              </Link>
            ) : (
              <Link
                href={`/jobs/${job.id as string}/apply`}
                className="inline-flex items-center justify-center px-8 py-3.5 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
              >
                Apply for this Role
              </Link>
            )}
            {!existingApplicationId && !candidateAuthed && (
              <Link
                href={`/jobs/${job.id as string}/apply/guest`}
                className="inline-flex items-center justify-center px-6 py-3.5 border border-[var(--rule-strong)] bg-white text-ink text-[12px] font-bold tracking-[2px] uppercase hover:bg-cream transition-colors"
              >
                Apply as guest
              </Link>
            )}
            <SaveJobButton
              jobId={job.id as string}
              initialSaved={initialSaved}
              candidateAuthed={candidateAuthed}
              variant="label"
            />
            <ShareToLinkedIn
              url={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com"}/jobs/${job.id as string}`}
            />
          </div>
        </header>

        {/* PracticeFit. Scored fit → WhyThisMatch expander with
            inline-editor lift-your-match flow. No fit + role_mismatch
            → explanation panel so a signed-in candidate viewing a job
            outside their preferences understands why fit is missing
            (gap caught by Cam stress-testing as Jordan Bailey 2026-05-08).
            Generic "unavailable" stays silent — compute typically
            populates within seconds. */}
        {practiceFit && viewerCandidateId ? (
          <div className="mb-10">
            <WhyThisMatch
              fit={practiceFit}
              candidateId={viewerCandidateId}
              jobId={id}
              audience="candidate"
            />
          </div>
        ) : practiceFitReason === "role_mismatch" ? (
          <div className="mb-10 border border-[var(--rule)] bg-cream/40 p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="h-4 w-4 text-heritage-deep mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-ink mb-1">
                  PracticeFit isn&apos;t scoring this role for you
                </p>
                <p className="text-[13px] text-slate-body leading-relaxed mb-3">
                  This job&apos;s role isn&apos;t in your preferences,
                  so we&apos;re not comparing it. Your application would
                  still go through — but if your goals have shifted,
                  update your preferred roles to start seeing fit
                  scores on roles like this one.
                </p>
                <Link
                  href="/candidate/profile#roles"
                  className="inline-flex items-center gap-1.5 text-[12px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink transition-colors"
                >
                  Update preferred roles
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-12">
          {/* Description */}
          <div>
            <RenderedJobDescription html={(job.description as string) ?? ""} />

            {(job.requirements as string | null) && (
              <section className="mt-10 pt-8 border-t border-[var(--rule)]">
                <h2 className="text-xl font-extrabold tracking-[-0.4px] text-ink mb-4">
                  Requirements
                </h2>
                <pre className="text-[14px] text-ink leading-relaxed whitespace-pre-wrap font-sans">
                  {job.requirements as string}
                </pre>
              </section>
            )}

            {((job.benefits as string[] | null) ?? []).length > 0 && (
              <section className="mt-10 pt-8 border-t border-[var(--rule)]">
                <h2 className="text-xl font-extrabold tracking-[-0.4px] text-ink mb-4">
                  Benefits
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {(job.benefits as string[]).map((b) => (
                    <li
                      key={b}
                      className="px-3 py-1.5 text-[13px] font-semibold text-heritage-deep"
                      style={{ background: "var(--heritage-tint)" }}
                    >
                      {b}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* E1.12 (2026-05-13) — External links surfaced below benefits.
                Renders only when at least one valid {label,url} pair is
                present. Server-side validation already filtered junk; this
                is a defensive check in case future migrations land malformed
                entries. target="_blank" + rel="noopener noreferrer" because
                these point off-platform. */}
            {(() => {
              const links = ((job.external_links as Array<{
                label: string;
                url: string;
              }> | null) ?? []).filter(
                (l) => l && typeof l.label === "string" && typeof l.url === "string"
              );
              if (links.length === 0) return null;
              return (
                <section className="mt-10 pt-8 border-t border-[var(--rule)]">
                  <h2 className="text-xl font-extrabold tracking-[-0.4px] text-ink mb-4">
                    More about this role
                  </h2>
                  <ul className="flex flex-wrap gap-2">
                    {links.map((l, i) => (
                      <li key={`${i}-${l.url}`}>
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cream border border-[var(--rule-strong)] text-[13px] font-semibold text-ink hover:border-heritage hover:bg-heritage/[0.06] transition-colors"
                        >
                          <ExternalLink className="h-3 w-3 text-heritage-deep" aria-hidden />
                          {l.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })()}

            {skills.length > 0 && (
              <section className="mt-10 pt-8 border-t border-[var(--rule)]">
                <h2 className="text-xl font-extrabold tracking-[-0.4px] text-ink mb-4">
                  Skills
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {skills.map((s) => (
                    <li
                      key={s}
                      className="px-3 py-1.5 text-[13px] font-semibold text-ink bg-cream border border-[var(--rule-strong)]"
                    >
                      {s}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Track F (2026-05-13) — surface schedule when the
                employer specified one. Powers candidate-side day-1
                expectations + visually mirrors the PracticeFit
                schedule_overlap dim's inputs. We only render the
                section when at least one signal is present — keeps
                no-schedule postings clean. */}
            {(() => {
              const sched = {
                days: (job.schedule_days as string[] | null) ?? [],
                evenings: Boolean(job.schedule_evenings),
                weekends: Boolean(job.schedule_weekends),
              };
              const hasAny =
                sched.days.length > 0 || sched.evenings || sched.weekends;
              if (!hasAny) return null;
              const DAY_LABELS: Record<string, string> = {
                mon: "Mon",
                tue: "Tue",
                wed: "Wed",
                thu: "Thu",
                fri: "Fri",
                sat: "Sat",
                sun: "Sun",
              };
              const dayOrder = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
              const orderedDays = [...sched.days].sort(
                (a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b)
              );
              return (
                <section className="mt-10 pt-8 border-t border-[var(--rule)]">
                  <h2 className="text-xl font-extrabold tracking-[-0.4px] text-ink mb-4">
                    Schedule
                  </h2>
                  {orderedDays.length > 0 && (
                    <ul className="flex flex-wrap gap-2 mb-3">
                      {orderedDays.map((d) => (
                        <li
                          key={d}
                          className="px-3 py-1.5 text-[13px] font-semibold text-heritage-deep"
                          style={{ background: "var(--heritage-tint)" }}
                        >
                          {DAY_LABELS[d] ?? d}
                        </li>
                      ))}
                    </ul>
                  )}
                  {(sched.evenings || sched.weekends) && (
                    <p className="text-[13px] text-slate-body">
                      {[
                        sched.evenings ? "Evening hours (5pm or later)" : null,
                        sched.weekends ? "Weekend shifts (Sat/Sun)" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </section>
              );
            })()}

            {/* 5G.d (2026-05-14) — Role details for corporate-scope jobs.
                Renders the populated corporate sandbox fields. Whole block
                gated on scope === 'corporate' so clinical jobs are
                untouched; each row gated on its own value so a sparsely
                filled corporate job doesn't show empty rows. Slate-blue
                accent (#3D5266) matches the rest of the 5G corporate
                surface. */}
            {(() => {
              const isCorporate =
                ((job.scope as string | null) ?? "location") === "corporate";
              if (!isCorporate) return null;

              const workMode = job.work_mode as string | null;
              const workModeDetail = (
                job.work_mode_detail as string | null
              )?.trim();
              const authorityLevel = job.authority_level as string | null;
              const travelExpectation =
                job.travel_expectation as string | null;
              const travelTerritory = (
                job.travel_territory as string | null
              )?.trim();
              const reportsTo = (job.reports_to as string | null)?.trim();
              const directReportsBand =
                job.direct_reports_band as string | null;
              const indirectReportsBand =
                job.indirect_reports_band as string | null;
              const educationRequirement =
                job.education_requirement as string | null;
              const industryExperience =
                job.industry_experience as string | null;
              const minYears =
                job.min_years_corporate_experience as number | null;
              const maxYears =
                job.max_years_corporate_experience as number | null;
              // Bonus + equity moved into the compensation display (the
              // composable comp model — they render alongside base + OTE
              // for both clinical and corporate jobs now).
              const remoteStates = (
                (job.remote_state_restrictions as string[] | null) ?? []
              ).filter((s) => typeof s === "string" && s.trim().length > 0);

              // Years-of-experience display string.
              let yearsText: string | null = null;
              if (minYears !== null && maxYears !== null) {
                yearsText =
                  minYears === maxYears
                    ? `${minYears} year${minYears === 1 ? "" : "s"}`
                    : `${minYears}–${maxYears} years`;
              } else if (minYears !== null) {
                yearsText = `${minYears}+ years`;
              } else if (maxYears !== null) {
                yearsText = `Up to ${maxYears} years`;
              }

              const rows: Array<{ label: string; value: React.ReactNode }> =
                [];

              if (workMode) {
                rows.push({
                  label: "Work mode",
                  value: (
                    <>
                      {WORK_MODE_LABELS[
                        workMode as keyof typeof WORK_MODE_LABELS
                      ] ?? workMode}
                      {workModeDetail && (
                        <span className="block text-[13px] text-slate-body mt-0.5">
                          {workModeDetail}
                        </span>
                      )}
                    </>
                  ),
                });
              }
              if (remoteStates.length > 0) {
                rows.push({
                  label: "Remote — eligible states",
                  value: remoteStates.join(", "),
                });
              }
              if (authorityLevel) {
                rows.push({
                  label: "Authority level",
                  value:
                    AUTHORITY_LEVEL_LABELS[
                      authorityLevel as keyof typeof AUTHORITY_LEVEL_LABELS
                    ] ?? authorityLevel,
                });
              }
              if (travelExpectation) {
                rows.push({
                  label: "Travel",
                  value: (
                    <>
                      {TRAVEL_EXPECTATION_LABELS[
                        travelExpectation as keyof typeof TRAVEL_EXPECTATION_LABELS
                      ] ?? travelExpectation}
                      {travelTerritory && (
                        <span className="block text-[13px] text-slate-body mt-0.5">
                          {travelTerritory}
                        </span>
                      )}
                    </>
                  ),
                });
              }
              if (reportsTo) {
                rows.push({ label: "Reports to", value: reportsTo });
              }
              if (directReportsBand) {
                rows.push({
                  label: "Direct reports",
                  value:
                    DIRECT_REPORTS_BAND_LABELS[
                      directReportsBand as keyof typeof DIRECT_REPORTS_BAND_LABELS
                    ] ?? directReportsBand,
                });
              }
              if (indirectReportsBand) {
                rows.push({
                  label: "Indirect reports",
                  value:
                    INDIRECT_REPORTS_BAND_LABELS[
                      indirectReportsBand as keyof typeof INDIRECT_REPORTS_BAND_LABELS
                    ] ?? indirectReportsBand,
                });
              }
              if (yearsText) {
                rows.push({
                  label: "Corporate experience",
                  value: yearsText,
                });
              }
              if (educationRequirement) {
                rows.push({
                  label: "Education",
                  value:
                    EDUCATION_REQUIREMENT_LABELS[
                      educationRequirement as keyof typeof EDUCATION_REQUIREMENT_LABELS
                    ] ?? educationRequirement,
                });
              }
              if (industryExperience) {
                rows.push({
                  label: "Industry experience",
                  value:
                    INDUSTRY_EXPERIENCE_LABELS[
                      industryExperience as keyof typeof INDUSTRY_EXPERIENCE_LABELS
                    ] ?? industryExperience,
                });
              }

              if (rows.length === 0) return null;

              return (
                <section className="mt-10 p-6 sm:p-7 bg-[var(--heritage-tint)] border border-heritage/40">
                  <h2 className="text-xl font-extrabold tracking-[-0.4px] text-ink mb-4">
                    Role details
                  </h2>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                    {rows.map((row) => (
                      <div
                        key={row.label}
                        className="border-l-2 border-heritage/70 pl-3"
                      >
                        <dt className="text-[9px] font-bold tracking-[2px] uppercase text-slate-meta mb-1">
                          {row.label}
                        </dt>
                        <dd className="text-[14px] font-semibold text-ink">
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })()}

            {jobAttachments.length > 0 && (
              <JobAttachmentsPublic attachments={jobAttachments} />
            )}

            {/* Apply CTA + Save button — repeated bottom for long
                postings. Matches the top bar's button shapes. */}
            <section className="mt-12 pt-8 border-t border-[var(--rule)]">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
                {existingApplicationId ? (
                  <Link
                    href={`/candidate/applications/${existingApplicationId}`}
                    className="inline-flex items-center justify-center px-9 py-4 bg-heritage text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-heritage-deep transition-colors"
                  >
                    View My Application
                  </Link>
                ) : (
                  <Link
                    href={`/jobs/${job.id as string}/apply`}
                    className="inline-flex items-center justify-center px-9 py-4 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
                  >
                    Apply for this Role
                  </Link>
                )}
                <SaveJobButton
                  jobId={job.id as string}
                  initialSaved={initialSaved}
                  candidateAuthed={candidateAuthed}
                  variant="label"
                />
              </div>
              <p className="text-[13px] text-slate-meta leading-relaxed max-w-[420px]">
                {existingApplicationId
                  ? "You've already applied to this role. Track its status from My Applications."
                  : `Free for candidates. We'll route your application directly to ${displayedEmployerName} — no recruiter middleman, no fees.`}
              </p>
            </section>
          </div>

          {/* Sidebar */}
          <aside className="bg-ink-3 p-7 h-fit">
            <div className="text-[12px] font-extrabold tracking-[2.5px] uppercase text-heritage-light mb-5">
              At a Glance
            </div>

            <Detail icon={Briefcase} label="Employment">
              {EMP_LABELS[job.employment_type as string] ?? (job.employment_type as string)}
            </Detail>

            {(job.compensation_visible as boolean) &&
              ((job.compensation_min as number | null) !== null ||
                Boolean(job.variable_comp_enabled) ||
                Boolean(job.bonus_enabled) ||
                Boolean(job.equity_offered)) && (
                <Detail icon={DollarSign} label="Compensation">
                  <CompensationGlance job={job} />
                </Detail>
              )}

            {(job.posted_at as string | null) && (
              <Detail icon={Clock} label="Posted">
                {timeAgo(new Date(job.posted_at as string))}
              </Detail>
            )}

            {locations.length > 0 && (
              <Detail icon={MapPin} label="Locations">
                <ul className="space-y-2 mt-1">
                  {locations.map((loc) => {
                    // Per-location website is shown only when this
                    // location is publicly affiliated. Private-affiliation
                    // locations might leak the DSO connection through a
                    // website footer, so we hide the link entirely.
                    const showWebsite =
                      Boolean(loc.website) &&
                      (loc.public_dso_affiliation ?? true) === true;
                    return (
                      <li key={loc.id}>
                        <div className="font-semibold text-ivory text-[15px]">
                          {loc.name}
                        </div>
                        <div className="text-[14px] text-ivory/70">
                          {[loc.city, loc.state].filter(Boolean).join(", ")}
                        </div>
                        {showWebsite && (
                          <a
                            href={loc.website as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 inline-block text-[13px] text-heritage hover:text-heritage-deep underline-offset-2 hover:underline"
                          >
                            Practice website →
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Detail>
            )}

            {verificationTypes.length > 0 && (
              <Detail icon={ShieldCheck} label="Verifications">
                <ul className="space-y-1 mt-1">
                  {verificationTypes.map((vt) => (
                    <li key={vt} className="text-[14px] text-ivory/85">
                      {VERIFICATION_TYPE_LABELS[
                        vt as keyof typeof VERIFICATION_TYPE_LABELS
                      ] ?? vt}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[12px] text-ivory/55 leading-snug">
                  Applicants confirm these as part of applying.
                </p>
              </Detail>
            )}
          </aside>
        </div>
      </article>

      {/* JSON-LD JobPosting for Google for Jobs. E1.22 — internal-only jobs
          are reachable by direct link but are NOT public postings, so we
          suppress the structured data (this is also the hook the future
          Google for Jobs feed uses to exclude internal roles). */}
      {(job.visibility as string) !== "internal_only" && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
    </SiteShell>
  );
}

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5 pb-5 last:mb-0 last:pb-0 last:border-0 border-b border-ivory/15">
      <div className="flex items-center gap-2 text-[11px] font-bold tracking-[2px] uppercase text-ivory/70 mb-2">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-[17px] font-semibold text-ivory leading-snug">
        {children}
      </div>
    </div>
  );
}

function formatComp(job: { [k: string]: unknown }): string {
  // v1.8 — render shape varies by compensation_type. Existing rows
  // were backfilled to a sensible type so old jobs still format the
  // way they used to.
  const type = (job.compensation_type as string | null) ?? "range";
  if (type === "doe") return "Discussed at offer";

  const min = job.compensation_min as number | null;
  const max = job.compensation_max as number | null;
  const period = job.compensation_period as string | null;
  const fmt = new Intl.NumberFormat("en-US");
  const formatNum = (n: number) =>
    period === "annual" ? `$${Math.round(n / 1000)}K` : `$${fmt.format(n)}`;
  const periodLabel =
    { hourly: "/hr", daily: "/day", annual: "/yr" }[period ?? ""] ?? "";

  let range: string;
  if (type === "exact" && min !== null) {
    range = formatNum(min);
  } else if (type === "starting_at" && min !== null) {
    range = `From ${formatNum(min)}`;
  } else if (type === "up_to" && max !== null) {
    range = `Up to ${formatNum(max)}`;
  } else if (min !== null && max !== null) {
    range = `${formatNum(min)}–${formatNum(max)}`;
  } else if (min !== null) {
    range = `${formatNum(min)}+`;
  } else if (max !== null) {
    range = `Up to ${formatNum(max)}`;
  } else {
    return "Discussed at offer";
  }
  return `${range}${periodLabel}`;
}

/**
 * Composable-comp display for the "At a Glance" sidebar. Leads with the
 * computed On-Target Earnings when the job carries variable comp; falls
 * back to the plain base figure otherwise. Bonus + equity structure lines
 * render here too — comp lives in ONE place now (this replaces the
 * scattered bonus/equity rows the 5G.d Role-details section used to show).
 * OTE math comes from the shared src/lib/comp/ote.ts helper, so this and
 * the wizard's <CompensationSection> note always agree.
 */
function CompensationGlance({ job }: { job: { [k: string]: unknown } }) {
  const variableEnabled = Boolean(job.variable_comp_enabled);
  const bonusEnabled = Boolean(job.bonus_enabled);
  const equityOffered = Boolean(job.equity_offered);

  const variableStructure = (
    job.variable_comp_structure as string | null
  )?.trim();
  const bonusStructure = (job.bonus_structure as string | null)?.trim();
  const equityNote = (job.equity_note as string | null)?.trim();

  const ote = computeOte({
    compensationType:
      ((job.compensation_type as string | null) ?? "range") as
        | "range"
        | "starting_at"
        | "up_to"
        | "exact"
        | "doe",
    compensationMin: job.compensation_min as number | null,
    compensationMax: job.compensation_max as number | null,
    compensationPeriod: job.compensation_period as string | null,
    variableCompEnabled: variableEnabled,
    variableCompTarget: job.variable_comp_target as number | null,
    bonusEnabled: bonusEnabled,
    bonusTarget: job.bonus_target as number | null,
  });

  const baseLine = formatComp(job);

  return (
    <div className="space-y-1.5">
      {ote.hasVariable && ote.ote != null ? (
        <>
          <div className="text-[20px] font-extrabold text-ivory leading-tight">
            ~{formatUsd(ote.ote)}
            <span className="ml-1.5 text-[12px] font-semibold text-heritage">
              OTE / yr
            </span>
          </div>
          <div className="text-[14px] text-ivory/70">
            {baseLine} base + {formatUsd(ote.variable)} target variable
          </div>
        </>
      ) : (
        <div className="font-semibold text-ivory">{baseLine}</div>
      )}

      {variableEnabled && variableStructure && (
        <div className="text-[14px] text-ivory/70">
          <span className="font-semibold text-ivory">Variable:</span>{" "}
          {variableStructure}
        </div>
      )}
      {bonusEnabled && bonusStructure && (
        <div className="text-[14px] text-ivory/70">
          <span className="font-semibold text-ivory">Bonus:</span> {bonusStructure}
        </div>
      )}
      {equityOffered && (
        <div className="text-[14px] text-ivory/70">
          <span className="font-semibold text-ivory">Equity:</span>{" "}
          {equityNote || "Offered"}
        </div>
      )}
    </div>
  );
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  const days = Math.floor(seconds / 86400);
  if (days > 30) return `${Math.floor(days / 30)} months ago`;
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} ago`;
  const hours = Math.floor(seconds / 3600);
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return "Just now";
}

/* ───── JSON-LD ───── */

interface DsoForSchema {
  name: string;
  slug: string;
  description: string | null;
}

interface JobForSchema {
  [k: string]: unknown;
}

interface LocationForSchema {
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
}

function buildJobPostingJsonLd({
  job,
  dso,
  locations,
  isPublicAffiliated,
  displayedEmployerName,
}: {
  job: JobForSchema;
  dso: DsoForSchema | null;
  locations: LocationForSchema[];
  isPublicAffiliated: boolean;
  displayedEmployerName: string;
}) {
  return {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.title as string,
    description: htmlToPlainText((job.description as string) ?? ""),
    datePosted: job.posted_at as string | null,
    employmentType: EMP_SCHEMA[job.employment_type as string] ?? "OTHER",
    hiringOrganization: dso
      ? isPublicAffiliated
        ? {
            "@type": "Organization",
            name: dso.name,
            sameAs: `https://dsohire.com/companies/${dso.slug}`,
          }
        : {
            // Private-affiliation: practice/multi-loc name only. No
            // sameAs (would expose corporate slug). No parentOrganization
            // (would expose corporate name through schema indexing).
            "@type": "Organization",
            name: displayedEmployerName,
          }
      : undefined,
    jobLocation: locations.map((loc) => ({
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        streetAddress: loc.address_line1 ?? undefined,
        addressLocality: loc.city ?? undefined,
        addressRegion: loc.state ?? undefined,
        postalCode: loc.postal_code ?? undefined,
        addressCountry: "US",
      },
    })),
    baseSalary:
      (job.compensation_visible as boolean) &&
      (job.compensation_min as number | null) !== null
        ? {
            "@type": "MonetaryAmount",
            currency: "USD",
            value: {
              "@type": "QuantitativeValue",
              minValue: job.compensation_min as number,
              maxValue:
                (job.compensation_max as number | null) ?? (job.compensation_min as number),
              unitText: ((job.compensation_period as string | null) ?? "annual").toUpperCase(),
            },
          }
        : undefined,
  };
}
