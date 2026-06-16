/**
 * /candidate/dashboard — landing page after candidate sign-in.
 *
 * v4 layout — "Command Center" (Direction A, Day 35, 2026-06-16):
 *
 *   Header                       ← welcome, live pulse, today's date
 *   Pipeline board (full width)  ← apps as Applied→Hired columns; the
 *                                  one thing that needs the horizontal
 *                                  room. Setup hero stands in at 0 apps.
 *   Two-column:
 *     LEFT  Offer moment / hero  ← offer in hand leads; else the adaptive
 *           + PracticeFit summary   new-replies / active-apps hero
 *           + Roles that fit
 *     RIGHT Profile strength     ← compact rail; rises beside the offer
 *           + Credentials & CE      (Your market card lands next commit)
 *   ActivityFeed (full width)    ← recent moves; terminal apps live here
 *
 * The left-column hero adapts to what's most actionable:
 *   - Offer extended → the green "offer in hand" moment (highest priority)
 *   - Else unread employer replies → "New Replies" hero
 *   - Else active applications → "Active Applications" hero
 *   - Fresh signup (0 apps) → "Get Hired" 3-step setup hero (full width)
 *
 * Important UX rule (locked with Cam): we deliberately do NOT show
 * "days waiting in stage" anywhere on the candidate side. Stage
 * progress yes; time-in-stage no. The candidate already has anxiety
 * about waiting — our job isn't to count the days for them.
 */

import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  FileText,
  Mail,
  Send,
} from "lucide-react";
import { CandidateShell } from "@/components/candidate/candidate-shell";
// Lane 7 (Career HQ) — OnboardingChecklist retired from this page
// (component kept on disk for revert); CareerStrength replaces it.
import { CareerStrength } from "@/components/dashboard/career-strength";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { CandidateHero } from "@/components/dashboard/candidate-hero";
// Day 35 (Direction A v2.1) — the pipeline board replaces both the KPI
// grid and the journeys stepper as the primary applications view.
// ApplicationJourneys + KpiTile kept on disk for revert.
import {
  CandidatePipelineBoard,
  type BoardCard,
} from "@/components/dashboard/candidate-pipeline-board";
import {
  CredentialsCard,
  type CredItem,
} from "@/components/dashboard/credentials-card";
import { loadMarketRange } from "@/lib/comp/market";
import { YourMarketCard } from "@/components/dashboard/your-market-card";
import {
  SavedJobsCard,
  type SavedJobItem,
} from "@/components/dashboard/saved-jobs-card";
import { getDsoResponseMedians } from "@/lib/applications/response-medians";
import {
  ActivityFeed,
  type ActivityEvent,
} from "@/components/dashboard/activity-feed";
import {
  KANBAN_KINDS,
  KIND_DEFAULT_LABELS,
  CANDIDATE_KIND_LABELS,
  isTerminalKind,
  type StageKind,
} from "@/lib/applications/stages";
import { computeCompleteness } from "@/lib/candidate/completeness";
import { greetingFirstName } from "@/lib/candidate/name";
import type { ProfileData } from "@/app/candidate/profile/profile-sections";
import { CandidateFitSummary } from "@/components/practice-fit/candidate-fit-summary";
import { RolesThatFitCard } from "@/components/practice-fit/roles-that-fit-card";
import { getPracticeFit } from "@/lib/practice-fit/get-or-compute";
import { getTopFitJobsForCandidate } from "@/lib/practice-fit/roles-that-fit";
import type { FitResult, FitDimensionKey } from "@/lib/practice-fit/types";
import { resolveCandidateApplicationAffiliations } from "@/lib/dso/affiliation-display";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Candidate Dashboard",
};

export default async function CandidateDashboardPage() {
  const nowMs = new Date().getTime();
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Pull every column computeCompleteness() reads — keep the existing
  // legacy columns too (current_title, years_experience, resume_url)
  // since other downstream sections still display them.
  const { data: candidate } = await supabase
    .from("candidates")
    .select(
      "id, first_name, last_name, salutation, full_name, headline, summary, current_title, years_experience, years_experience_dental, pronouns, current_location_city, current_location_state, current_location_zip, desired_roles, desired_locations, desired_specialty, license_states, pms_systems, skills, languages, temp_or_perm, dso_size_preference, schedule_preferences, min_salary, salary_unit, cv_visibility, availability, resume_url, linkedin_url, avatar_url, practice_fit_consent, work_pace, autonomy_pref, mentorship_pref, practice_feel, ce_growth_importance, work_life_priority, benefit_priorities, patient_population_pref, assessment_completed_at, dsofit_assessment_completed_at, privacy_choices_reviewed_at, primary_fit_product",
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!candidate) return null;

  // ── Profile completeness (reconciled with /candidate/profile per
  // ROADMAP 4.2.b.2). Reads every structured-profile table the
  // computeCompleteness() function expects so both surfaces report the
  // same tier + missing items.
  const candidateRowId = candidate.id as string;
  const [
    { data: rawWorkHistory },
    { data: rawEducation },
    { data: rawLicenses },
    { data: rawCertifications },
  ] = await Promise.all([
    supabase
      .from("candidate_work_history")
      .select(
        "id, title, company_name, is_dso, start_date, end_date, is_current, description, pms_systems_used, procedures_performed, auto_blocklisted",
      )
      .eq("candidate_id", candidateRowId),
    supabase
      .from("candidate_education")
      .select("id, school_name, degree, field_of_study, start_year, end_year, description")
      .eq("candidate_id", candidateRowId),
    supabase
      .from("candidate_licenses")
      .select("id, license_type, license_number, state, issued_date, expires_date, display_number")
      .eq("candidate_id", candidateRowId),
    supabase
      .from("candidate_certifications")
      .select("id, kind, level, issued_date, expires_date")
      .eq("candidate_id", candidateRowId),
  ]);

  const c = candidate as Record<string, unknown>;
  const profileData: ProfileData = {
    identity: {
      first_name: (c.first_name as string | null) ?? "",
      last_name: (c.last_name as string | null) ?? "",
      salutation: (c.salutation as string | null) ?? null,
      pronouns: (c.pronouns as string | null) ?? null,
      headline: (c.headline as string | null) ?? null,
      summary: (c.summary as string | null) ?? null,
      phone: null,
      current_location_city: (c.current_location_city as string | null) ?? null,
      current_location_state: (c.current_location_state as string | null) ?? null,
      years_experience_dental:
        (c.years_experience_dental as number | null) ??
        (c.years_experience as number | null) ??
        null,
      linkedin_url: (c.linkedin_url as string | null) ?? null,
    },
    rolePreferences: {
      desired_roles: (c.desired_roles as string[] | null) ?? [],
      desired_specialty: (c.desired_specialty as string[] | null) ?? [],
      temp_or_perm: (c.temp_or_perm as ProfileData["rolePreferences"]["temp_or_perm"]) ?? null,
    },
    skillsLanguages: {
      skills: (c.skills as string[] | null) ?? [],
      languages: (c.languages as string[] | null) ?? [],
      pms_systems: (c.pms_systems as string[] | null) ?? [],
    },
    jobPreferences: {
      desired_locations: (c.desired_locations as string[] | null) ?? [],
      min_salary: (c.min_salary as number | null) ?? null,
      salary_unit:
        (c.salary_unit as ProfileData["jobPreferences"]["salary_unit"]) ?? null,
      schedule_preferences:
        (c.schedule_preferences as ProfileData["jobPreferences"]["schedule_preferences"]) ?? {},
      cv_visibility:
        (c.cv_visibility as ProfileData["jobPreferences"]["cv_visibility"]) ??
        "recruiters_only",
      availability: (c.availability as string | null) ?? null,
    },
    workHistory: ((rawWorkHistory ?? []) as ProfileData["workHistory"]),
    education: ((rawEducation ?? []) as ProfileData["education"]),
    licenses: ((rawLicenses ?? []) as ProfileData["licenses"]),
    certifications: ((rawCertifications ?? []) as ProfileData["certifications"]),
  };
  const completeness = computeCompleteness(
    profileData,
    (c.avatar_url as string | null) ?? null,
  );
  const profilePct = Math.round((completeness.score / completeness.total) * 100);

  // #54 — the candidate's chosen track drives which fit product leads their
  // dashboard (matches feed, assessment nudge, prefs CTA). null → PracticeFit.
  const primaryFitProduct: "practicefit" | "dsofit" =
    (c.primary_fit_product as string | null) === "dsofit"
      ? "dsofit"
      : "practicefit";
  const isDsoPrimary = primaryFitProduct === "dsofit";
  const fitName = isDsoPrimary ? "DSOFit" : "PracticeFit";
  const desiredRoles = ((c.desired_roles as string[] | null) ?? []) as string[];
  const hasCorporateInterest =
    isDsoPrimary || desiredRoles.includes("dso_corporate");
  const hasNonCorporateInterest = desiredRoles.some((r) => r !== "dso_corporate");

  const pfAssessmentItem = {
    key: "assessment",
    label: "Take your 5-minute PracticeFit assessment",
    done: (c.assessment_completed_at as string | null) != null,
    href: "/candidate/assessment",
  };
  const dsoAssessmentItem = {
    key: "dsofit",
    label: "Take your 5-minute DSOFit assessment",
    done: (c.dsofit_assessment_completed_at as string | null) != null,
    href: "/candidate/dsofit-assessment",
  };
  // Lead with the candidate's PRIMARY track's assessment; surface the other
  // only when they've signalled interest in it (corporate role, or any
  // non-corporate role for a DSO-primary candidate).
  const assessmentItems = isDsoPrimary
    ? [dsoAssessmentItem, ...(hasNonCorporateInterest ? [pfAssessmentItem] : [])]
    : [pfAssessmentItem, ...(hasCorporateInterest ? [dsoAssessmentItem] : [])];

  // Progressive onboarding checklist (dismissible; auto-hides when complete).
  const onboardingItems = [
    {
      key: "profile",
      label: "Finish your profile",
      done: completeness.missing.length === 0,
      href: "/candidate/profile",
    },
    // #94 (Day 28) — drive every new candidate to their fit assessment (our
    // differentiator + feeds match quality). Prominent, second only to the
    // profile. Primary track leads; the other follows only on signalled interest.
    ...assessmentItems,
    {
      key: "prefs",
      label: `Tell ${fitName} what you're looking for`,
      done:
        profileData.jobPreferences.desired_locations.length > 0 ||
        profileData.jobPreferences.min_salary != null,
      href: isDsoPrimary
        ? "/candidate/dsofit"
        : "/candidate/practice-fit#preferences",
    },
    {
      key: "visible",
      label: "Set your profile visibility so recruiters can find you",
      // #92 (Day 28) — a default value existing is NOT the user deciding.
      // Only mark this done once the candidate has actually reviewed their
      // privacy/matching choices (privacy_choices_reviewed_at, stamped when
      // they save the privacy settings page). The default still applies
      // silently underneath; we just don't pre-check the box for them.
      done: (c.privacy_choices_reviewed_at as string | null) != null,
      // #103 (Day 28) — deep-link to the exact section, not just the page.
      href: "/candidate/settings/privacy#visibility",
    },
    {
      key: "fit",
      label: `Choose your ${fitName} matching setting`,
      done: (c.privacy_choices_reviewed_at as string | null) != null,
      href: "/candidate/settings/privacy#practice-fit",
    },
  ];

  // Lane 7 — the ONE next action, biggest unlock first. Order:
  // top missing completeness item → unfinished assessment → privacy
  // review. Payoffs are honest and qualitative (no invented counts).
  const COMPLETENESS_PAYOFFS: Record<string, string> = {
    photo: "Profiles with photos read as real people to hiring teams.",
    headline: "Your headline is the first line recruiters see anywhere.",
    summary: "A short summary gives your applications a voice.",
    location: "Location unlocks commute-distance match scoring.",
    work: "Work history powers experience matching and your free resume.",
    license: "License details unlock license-match scoring on clinical roles.",
    skills: "Skills feed a scored match dimension directly.",
    language: "Languages help multilingual practices find you.",
    job_prefs: "Preferences sharpen every match score you receive.",
  };
  const firstMissing = completeness.missing[0] ?? null;
  // Both assessment kinds count — "assessment" (PracticeFit) and "dsofit";
  // onboardingItems already ordered them primary-track-first.
  const assessmentItem = onboardingItems.find(
    (i) => (i.key === "assessment" || i.key === "dsofit") && !i.done
  );
  const privacyItem = onboardingItems.find(
    (i) => (i.key === "visible" || i.key === "fit") && !i.done
  );
  const nextAction = firstMissing
    ? {
        label: firstMissing.label,
        payoff:
          COMPLETENESS_PAYOFFS[firstMissing.key] ??
          "Strengthens your match scores.",
        href: "/candidate/profile",
        ctaLabel: "Add it now",
      }
    : assessmentItem
      ? {
          label: assessmentItem.label,
          payoff:
            "Sharpens schedule and culture matching — it never gates anything.",
          href: assessmentItem.href,
          ctaLabel: "Pick it up",
        }
      : privacyItem
        ? {
            label: privacyItem.label,
            payoff: "Your visibility, your call — decide once, change anytime.",
            href: privacyItem.href,
            ctaLabel: "Review settings",
          }
        : null;

  // ── All applications ────────────────────────────────────────────────
  // RLS on dso_pipeline_stages is DSO-only, so the candidate's RLS-scoped
  // client can't read stage kinds via embed. Two-step: pull the
  // candidate's own application rows (RLS-scoped), then resolve each
  // stage_id to a kind via the service-role client. RLS still gates
  // which applications they can see — the kind lookup is just metadata
  // on rows they're already permitted to read.
  const { data: rawApps, error: appsErr } = await supabase
    .from("applications")
    .select(
      "id, job_id, stage_id, created_at, updated_at, affiliation_revealed"
    )
    .eq("candidate_id", candidate.id)
    .order("created_at", { ascending: false });
  if (appsErr) {
    console.warn("[candidate dashboard] applications fetch failed", appsErr);
  }

  type AppRow = {
    id: string;
    job_id: string;
    stage_id: string;
    kind: StageKind;
    created_at: string;
    updated_at: string;
    affiliation_revealed: boolean;
  };
  const rawAppsList = (rawApps ?? []) as Array<Record<string, unknown>>;
  const stageIdsToLookup = Array.from(
    new Set(rawAppsList.map((r) => r.stage_id as string).filter(Boolean))
  );
  const kindByStageId = new Map<string, StageKind>();
  if (stageIdsToLookup.length > 0) {
    const admin = createSupabaseServiceRoleClient();
    const { data: stageRows } = await admin
      .from("dso_pipeline_stages")
      .select("id, kind")
      .in("id", stageIdsToLookup);
    for (const r of (stageRows ?? []) as Array<{ id: string; kind: string }>) {
      kindByStageId.set(r.id, r.kind as StageKind);
    }
  }
  const apps: AppRow[] = rawAppsList.map((row) => ({
    id: row.id as string,
    job_id: row.job_id as string,
    stage_id: row.stage_id as string,
    kind: kindByStageId.get(row.stage_id as string) ?? "open",
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    affiliation_revealed: row.affiliation_revealed as boolean,
  }));

  const activeApps = apps.filter(
    (a) => a.kind !== "hired" && !isTerminalKind(a.kind),
  );

  // ── PracticeFit per active application (Phase 5D v1.2) ─────────────
  // Compute in parallel; cached after first compute. Role-filtered or
  // consent-off pairs return null — handled by the summary widget.
  const fitsByActiveAppId = new Map<string, FitResult | null>();
  if (activeApps.length > 0) {
    const fits = await Promise.all(
      activeApps.map((a) => getPracticeFit(candidateRowId, a.job_id))
    );
    activeApps.forEach((a, i) => fitsByActiveAppId.set(a.id, fits[i]));
  }

  // ── "Roles that fit you" feed (Phase B.1) ───────────────────────────
  // Top open roles ranked by the candidate's PracticeFit. Role-filtered
  // jobs drop out (relevance fix). Respect the opt-out: skip when the
  // candidate set PracticeFit matching to off.
  const pfConsentOn =
    (((candidate as Record<string, unknown>).practice_fit_consent as
      | string
      | null) ?? "off") !== "off";
  // Single source of truth for "matches": the PracticeFit role-gated open-role
  // set. The KPI tile count AND the "Roles that fit you" card both derive from
  // this list, so the dashboard can never show "0 matches" next to a populated
  // fit list again (the contradiction Cam hit). Capped scan; top 4 in the card.
  const rolesThatFitAll = pfConsentOn
    ? await getTopFitJobsForCandidate(
        candidateRowId,
        24,
        undefined,
        primaryFitProduct
      )
    : [];
  const rolesThatFit = rolesThatFitAll.slice(0, 4);

  // Dimensions the candidate has ALREADY filled — used to suppress
  // "lift your match" nudges that would otherwise tell them to add data they
  // already provided (defense-in-depth against any stale candidate-side CTA).
  const filledDims = new Set<FitDimensionKey>();
  {
    const cr = candidate as Record<string, unknown>;
    const filled = (v: unknown) => Array.isArray(v) && v.length > 0;
    if (filled(cr.desired_roles) || cr.current_title) filledDims.add("role_fit");
    if (cr.min_salary != null) filledDims.add("compensation");
    if (filled(cr.desired_locations)) filledDims.add("location");
    if (filled(cr.pms_systems)) filledDims.add("pms_fluency");
    if (filled(cr.license_states)) filledDims.add("license_state");
    if ((rawCertifications ?? []).length > 0) filledDims.add("certifications");
    if (filled(cr.desired_specialty)) filledDims.add("specialty");
    if (filled(cr.skills)) filledDims.add("skills");
    if ((cr.years_experience_dental ?? cr.years_experience) != null)
      filledDims.add("years_experience");
    if (cr.temp_or_perm) filledDims.add("employment_type");
    if (cr.dso_size_preference) filledDims.add("dso_size");
    const sched = cr.schedule_preferences as Record<string, unknown> | null;
    if (sched && Object.keys(sched).length > 0)
      filledDims.add("schedule_overlap");
    // #74 — assessment-driven dims. Once the candidate has answered these in
    // the PracticeFit assessment, the gap is on the practice's side (their
    // profile), NOT the candidate's — so never nag them to "Take the
    // assessment" again. Marking each filled here is what stops the
    // "Take the assessment ×3" repeat after Sarah completed it.
    if (cr.work_pace) filledDims.add("work_pace");
    if (cr.autonomy_pref) filledDims.add("autonomy");
    if (cr.mentorship_pref) filledDims.add("mentorship");
    if (cr.practice_feel) filledDims.add("practice_feel");
    if (cr.ce_growth_importance != null) filledDims.add("ce_growth");
    if (cr.work_life_priority != null) filledDims.add("work_life");
    if (filled(cr.benefit_priorities)) filledDims.add("benefits");
    if (filled(cr.patient_population_pref))
      filledDims.add("patient_population");
  }

  // ── Job + DSO maps ──────────────────────────────────────────────────
  const jobIds = Array.from(new Set(apps.map((a) => a.job_id)));
  const { data: rawJobs } = jobIds.length
    ? await supabase
        .from("jobs")
        // hide_stages_from_candidate was READ by the mapper but missing
        // from this select since 2026-05-05 — untyped client returned
        // undefined and the `?? false` default silently ignored the
        // employer's toggle (loader-select-must-match-mapper rule).
        .select(
          "id, title, dso_id, role_category, employment_type, hide_stages_from_candidate"
        )
        .in("id", jobIds)
    : { data: [] };
  type JobRow = {
    id: string;
    title: string;
    dso_id: string;
    role_category: string;
    employment_type: string;
    /** Future: per-job stage-visibility toggle. Read defensively. */
    hide_stages_from_candidate?: boolean | null;
  };
  const jobs = (rawJobs ?? []) as JobRow[];
  const jobMap = new Map(jobs.map((j) => [j.id, j]));

  // Pull the FIRST job_location per active job so the kanban cards
  // can show a practice-name chip. Multi-location jobs use the first
  // location; matches the employer-side convention from
  // project_location_chip_practice_name_revisit (memory).
  //
  // Supabase returns the joined `location` as a single object OR an
  // array depending on FK config — normalize via unknown-cast and a
  // runtime shape check.
  const locationByJobId = new Map<string, string>();
  if (jobIds.length > 0) {
    const { data: rawLocs } = await supabase
      .from("job_locations")
      .select("job_id, location:dso_locations(name, city, state)")
      .in("job_id", jobIds);
    for (const rawRow of (rawLocs ?? []) as unknown as Array<
      Record<string, unknown>
    >) {
      const jobId = rawRow.job_id as string;
      if (locationByJobId.has(jobId)) continue; // first wins
      // Normalize array-or-object → single record.
      const locRaw = rawRow.location;
      const loc = (Array.isArray(locRaw) ? locRaw[0] : locRaw) as
        | { name: string | null; city: string | null; state: string | null }
        | null
        | undefined;
      if (!loc) continue;
      const cityState = [loc.city, loc.state].filter(Boolean).join(", ");
      const label = loc.name ?? (cityState.length > 0 ? cityState : null);
      if (label) locationByJobId.set(jobId, label);
    }
  }

  // ── Affiliation display per application (Phase 4.5.b) ───────────────
  // Service-role resolver so RLS can't silently zero out the lookup
  // (caught 2026-05-08 PM stress test — DSO name + logo were leaking
  // through across the dashboard / list / inbox because the inline
  // candidate-RLS query was returning empty). The helper handles
  // policy + per-app reveal + single-vs-multi-loc fallback + logo
  // masking in one call.
  const affiliationByAppId = await resolveCandidateApplicationAffiliations(
    apps.map((a) => a.id)
  );

  // ── Unread employer messages (drives the "New Replies" hero) ────────
  const appIds = apps.map((a) => a.id);
  const { data: rawUnread } = appIds.length
    ? await supabase
        .from("application_message_unread_counts")
        .select("application_id, sender_role, unread_count")
        .in("application_id", appIds)
        .eq("sender_role", "employer")
    : { data: [] };
  type UnreadRow = {
    application_id: string;
    sender_role: string;
    unread_count: number;
  };
  const unread = (rawUnread ?? []) as UnreadRow[];
  const unreadByAppId = new Map(
    unread.map((u) => [u.application_id, u.unread_count]),
  );
  const totalUnread = unread.reduce(
    (acc, u) => acc + (u.unread_count || 0),
    0,
  );

  // ── Pull most recent employer messages for the hero preview list ────
  type ReplyPreview = {
    id: string;
    senderName: string;
    dsoName: string;
    preview: string;
    timestamp: string;
    jobTitle: string;
  };
  let replyPreviews: ReplyPreview[] = [];
  if (totalUnread > 0 && appIds.length > 0) {
    const unreadAppIds = unread
      .filter((u) => u.unread_count > 0)
      .map((u) => u.application_id);
    if (unreadAppIds.length > 0) {
      const { data: rawMessages } = await supabase
        .from("application_messages")
        .select(
          "id, application_id, body, sender_role, sender_dso_user_id, created_at",
        )
        .in("application_id", unreadAppIds)
        .eq("sender_role", "employer")
        .order("created_at", { ascending: false })
        .limit(10);
      type MessageRow = {
        id: string;
        application_id: string;
        body: string;
        sender_role: string;
        sender_dso_user_id: string | null;
        created_at: string;
      };
      const messages = (rawMessages ?? []) as MessageRow[];

      const senderIds = Array.from(
        new Set(messages.map((m) => m.sender_dso_user_id).filter(Boolean)),
      ) as string[];
      const { data: rawSenders } = senderIds.length
        ? await supabase
            .from("dso_users")
            .select("id, full_name")
            .in("id", senderIds)
        : { data: [] };
      type SenderRow = { id: string; full_name: string | null };
      const senderMap = new Map(
        ((rawSenders ?? []) as SenderRow[]).map((s) => [
          s.id,
          s.full_name ?? "Recruiter",
        ]),
      );

      // Latest reply per application (de-dupe by application_id).
      const seenApps = new Set<string>();
      replyPreviews = messages
        .filter((m) => {
          if (seenApps.has(m.application_id)) return false;
          seenApps.add(m.application_id);
          return true;
        })
        .slice(0, 3)
        .map((m): ReplyPreview => {
          const app = apps.find((a) => a.id === m.application_id);
          const job = app ? jobMap.get(app.job_id) : null;
          return {
            id: m.id,
            senderName: m.sender_dso_user_id
              ? (senderMap.get(m.sender_dso_user_id) ?? "Recruiter")
              : "Recruiter",
            dsoName: app
              ? ((affiliationByAppId.get(app.id)?.name ?? "Hiring team"))
              : "Hiring team",
            preview: truncatePreview(m.body, 60),
            timestamp: relativeDate(m.created_at, nowMs),
            jobTitle: job?.title ?? "Unknown role",
          };
        });
    }
  }

  // ── Stage breakdown (active apps only) ──────────────────────────────
  const stageBreakdown: Record<(typeof KANBAN_KINDS)[number], number> = {
    open: 0,
    screen: 0,
    interview: 0,
    offer: 0,
    hired: 0,
  };
  for (const a of activeApps) {
    if (a.kind in stageBreakdown) {
      stageBreakdown[a.kind as keyof typeof stageBreakdown] += 1;
    }
  }

  const heroStageStrip = [
    {
      key: "open",
      label: CANDIDATE_KIND_LABELS.open,
      count: stageBreakdown.open,
    },
    {
      key: "screen",
      label: CANDIDATE_KIND_LABELS.screen,
      count: stageBreakdown.screen,
    },
    {
      key: "interview",
      label: CANDIDATE_KIND_LABELS.interview,
      count: stageBreakdown.interview,
    },
    {
      key: "offer",
      label: CANDIDATE_KIND_LABELS.offer,
      count: stageBreakdown.offer,
    },
  ];

  // ── Application journeys (Lane 7, active only) ──────────────────────
  // Honest per-practice response medians: service-role aggregate
  // (≥5 responded apps in 90d or nothing), keyed by DSO. Derived
  // number only — no cross-candidate rows reach the page.
  const journeyDsoIds = Array.from(
    new Set(
      activeApps
        .map((a) => jobMap.get(a.job_id)?.dso_id)
        .filter((d): d is string => Boolean(d)),
    ),
  );
  const responseMedians =
    journeyDsoIds.length > 0
      ? await getDsoResponseMedians(journeyDsoIds)
      : new Map<string, number>();

  // ── Pipeline board cards (Direction A v2.1) ─────────────────────────
  // All non-terminal apps INCLUDING hired (so the Hired column fills);
  // rejected/withdrawn stay out of the board and surface in Recent
  // Activity below. Same honest data as the old journeys — laid out as a
  // board. The component enforces the locked rules (no days-in-stage,
  // hide_stages collapse, real medians, masked affiliation).
  const boardApps = apps.filter((a) => !isTerminalKind(a.kind));
  const boardCards: BoardCard[] = boardApps.map((a): BoardCard => {
    const job = jobMap.get(a.job_id);
    const days = Math.max(
      0,
      Math.floor((nowMs - new Date(a.created_at).getTime()) / 86400000),
    );
    const fit = fitsByActiveAppId.get(a.id) ?? null;
    return {
      id: a.id,
      role: job?.title ?? "Unknown role",
      dsoName: affiliationByAppId.get(a.id)?.name ?? "Hiring team",
      locationName: job ? locationByJobId.get(job.id) ?? null : null,
      stage: a.kind as BoardCard["stage"],
      daysSinceApplied: days,
      hideStages: job?.hide_stages_from_candidate ?? false,
      hasUnreadMessage: (unreadByAppId.get(a.id) ?? 0) > 0,
      offerPending: a.kind === "offer",
      medianResponseDays: (job && responseMedians.get(job.dso_id)) ?? null,
      fitScore: fit?.score ?? null,
      fitBucket: fit?.bucket ?? null,
      href: `/candidate/applications/${a.id}`,
    };
  });

  // The single most actionable moment: an offer in hand → it leads the
  // left column (above matches), the rail rises beside it.
  const offerApp = activeApps.find((a) => a.kind === "offer") ?? null;
  const offerJob = offerApp ? jobMap.get(offerApp.job_id) : null;
  const offerDsoName = offerApp
    ? affiliationByAppId.get(offerApp.id)?.name ?? "A practice"
    : null;
  const offerLocation =
    offerApp && offerJob ? locationByJobId.get(offerJob.id) ?? null : null;
  const offerCount = stageBreakdown.offer;
  const hasOffer = offerCount > 0;

  // Interview hero state (#1) — apps the candidate is actively interviewing
  // for. Uses the stage we already resolved; no extra query.
  const interviewAppsList = activeApps.filter((a) => a.kind === "interview");
  const interviewItems = interviewAppsList.map((a) => ({
    role: jobMap.get(a.job_id)?.title ?? "Interview",
    dsoName: affiliationByAppId.get(a.id)?.name ?? "Hiring team",
  }));
  const hasInterview = interviewItems.length > 0;
  const firstInterviewHref = interviewAppsList[0]
    ? `/candidate/applications/${interviewAppsList[0].id}`
    : "/candidate/applications";

  // Credentials & CE rail card — straight off the data already loaded.
  const credItems: CredItem[] = [
    ...((rawLicenses ?? []) as Array<Record<string, unknown>>).map((l) => ({
      id: l.id as string,
      label: `${prettyCred((l.license_type as string | null) ?? null, "License")} License`,
      detail: (l.state as string | null) ?? null,
      expiresDate: (l.expires_date as string | null) ?? null,
    })),
    ...((rawCertifications ?? []) as Array<Record<string, unknown>>).map(
      (ct) => ({
        id: ct.id as string,
        label: prettyCred((ct.kind as string | null) ?? null, "Certification"),
        detail: (ct.level as string | null) ?? null,
        expiresDate: (ct.expires_date as string | null) ?? null,
      }),
    ),
  ];

  // "Your market" — BLS OEWS band for the candidate's role + state. Returns
  // null (card hidden) until the OEWS loader has populated comp_benchmarks
  // or when the role/area can't be mapped — never a guessed number.
  const marketRange = await loadMarketRange(supabase, {
    // Specialty first so a specialist candidate resolves to their specialist
    // SOC (ortho/OMS/etc.) before the general-dentist fallback.
    roles: [
      ...(((c.desired_specialty as string[] | null) ?? []) as string[]),
      ...desiredRoles,
    ],
    currentTitle: (c.current_title as string | null) ?? null,
    state: (c.current_location_state as string | null) ?? null,
    zip: (c.current_location_zip as string | null) ?? null,
  });
  // Offer comp-context (#2) — the candidate's local market band, shown on the
  // offer moment so they can weigh the offer against the market.
  const offerMarketBand = marketRange
    ? marketRange.unit === "hourly"
      ? `$${Math.round(marketRange.p25)}–$${Math.round(marketRange.p75)}/hr`
      : `$${Math.round(marketRange.p25 / 1000)}K–$${Math.round(marketRange.p75 / 1000)}K`
    : null;

  // Saved jobs (#5) — active jobs the candidate bookmarked but hasn't applied
  // to ("still exploring"). Title + city/state only (never a practice name, so
  // a confidential posting can't leak here). Kept small.
  const appliedJobIdSet = new Set(jobIds);
  const { data: rawSaved } = await supabase
    .from("saved_jobs")
    .select("job_id, saved_at, job:jobs(id, title, status)")
    .eq("candidate_id", candidate.id)
    .order("saved_at", { ascending: false })
    .limit(12);
  const savedActive = ((rawSaved ?? []) as Array<Record<string, unknown>>)
    .map((r) => {
      const jr = r.job;
      const j = (Array.isArray(jr) ? jr[0] : jr) as
        | { id: string; title: string | null; status: string | null }
        | null
        | undefined;
      if (!j) return null;
      return { id: j.id, title: j.title ?? "Untitled role", status: j.status };
    })
    .filter(
      (x): x is { id: string; title: string; status: string | null } =>
        x !== null && x.status === "active" && !appliedJobIdSet.has(x.id),
    )
    .slice(0, 3);
  const savedJobIds = savedActive.map((s) => s.id);
  const savedLocByJobId = new Map<string, string>();
  if (savedJobIds.length > 0) {
    const { data: rawSavedLocs } = await supabase
      .from("job_locations")
      .select("job_id, location:dso_locations(city, state)")
      .in("job_id", savedJobIds);
    for (const rawRow of (rawSavedLocs ?? []) as unknown as Array<
      Record<string, unknown>
    >) {
      const jid = rawRow.job_id as string;
      if (savedLocByJobId.has(jid)) continue;
      const locRaw = rawRow.location;
      const loc = (Array.isArray(locRaw) ? locRaw[0] : locRaw) as
        | { city: string | null; state: string | null }
        | null
        | undefined;
      if (!loc) continue;
      const cityState = [loc.city, loc.state].filter(Boolean).join(", ");
      if (cityState) savedLocByJobId.set(jid, cityState);
    }
  }
  const savedItems: SavedJobItem[] = savedActive.map((s) => ({
    id: s.id,
    title: s.title,
    location: savedLocByJobId.get(s.id) ?? null,
  }));

  const recentForFeed = apps.slice(0, 5);

  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // ── Strength facts (Lane 7) — real data only, never invented ────────
  const strengthFacts: string[] = [];
  if (rolesThatFitAll.length > 0) {
    strengthFacts.push(
      `${rolesThatFitAll.length} open role${rolesThatFitAll.length === 1 ? "" : "s"} fit${rolesThatFitAll.length === 1 ? "s" : ""} you right now`,
    );
  }
  if (totalUnread > 0) {
    strengthFacts.push(
      `${totalUnread} unread repl${totalUnread === 1 ? "y" : "ies"} from employers`,
    );
  }
  const winningCount = stageBreakdown.interview + stageBreakdown.offer;
  if (winningCount > 0) {
    strengthFacts.push(
      `${winningCount} application${winningCount === 1 ? "" : "s"} at interview or offer`,
    );
  } else if (activeApps.length > 0) {
    strengthFacts.push(
      `${activeApps.length} active application${activeApps.length === 1 ? "" : "s"}`,
    );
  }

  // ── Mode selection ──────────────────────────────────────────────────
  type Mode = "new-replies" | "active-apps" | "setup";
  const heroMode: Mode =
    totalUnread > 0
      ? "new-replies"
      : activeApps.length > 0
        ? "active-apps"
        : "setup";

  const headerSub =
    heroMode === "new-replies"
      ? `${totalUnread} new repl${totalUnread === 1 ? "y" : "ies"} waiting and ${activeApps.length} application${activeApps.length === 1 ? "" : "s"} in flight.`
      : heroMode === "active-apps"
        ? `${activeApps.length} application${activeApps.length === 1 ? "" : "s"} in flight.`
        : "Three quick steps and you'll start hearing from employers.";

  return (
    <CandidateShell active="dashboard">
      <header className="mb-8">
        <div className="flex items-center gap-3.5 mb-2 flex-wrap">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-heritage opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-heritage" />
          </span>
          <span className="text-[10px] font-extrabold tracking-[3px] uppercase text-heritage-deep">
            {heroMode === "setup" ? "Setup" : "Active search"}
          </span>
          <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta border-l border-rule pl-3.5">
            {dateLabel}
          </span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink">
          {heroMode === "setup"
            ? `Welcome to DSO Hire, ${greetingFirstName({ first_name: candidate.first_name, full_name: candidate.full_name }, "there")}.`
            : `Welcome back, ${greetingFirstName({ first_name: candidate.first_name, full_name: candidate.full_name }, "there")}.`}
        </h1>
        <p className="mt-3 text-base text-slate-body max-w-[640px]">
          {headerSub}
        </p>
      </header>

      {/* Pipeline board — full width on top (needs the horizontal room).
          Setup hero stands in when there are no applications yet. */}
      {boardCards.length > 0 ? (
        <section className="mb-8">
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <h2 className="text-[11px] font-extrabold tracking-[2.5px] uppercase text-heritage-deep">
                Your applications
              </h2>
              <p className="text-[12px] text-slate-meta mt-1">
                Where each one stands — your whole search at a glance.
              </p>
            </div>
            <Link
              href="/candidate/applications"
              className="shrink-0 text-[10px] font-extrabold tracking-[1.5px] uppercase text-heritage hover:text-heritage-deep transition-colors"
            >
              All applications →
            </Link>
          </div>
          <CandidatePipelineBoard cards={boardCards} />
          <p className="mt-3 text-[11px] text-slate-meta">
            Honest by design — no “days-in-stage” countdowns. The only clock is
            your own “applied X ago.”
          </p>
        </section>
      ) : (
        <section className="mb-8">
          <CandidateHero
            mode="setup"
            totalSteps={3}
            doneSteps={profilePct >= 100 ? 1 : 0}
            hint="Most candidates who finish these three steps hear back from an employer within 5 days."
            steps={[
              {
                label: "Complete your profile",
                done: profilePct >= 100,
                upNext: profilePct < 100,
              },
              {
                label: "Apply to your first job",
                done: false,
                upNext: profilePct >= 100,
              },
              { label: "Watch employers respond", done: false },
            ]}
            href={profilePct < 100 ? "/candidate/profile" : "/candidate/jobs"}
            ctaLabel={profilePct < 100 ? "Finish my profile" : "Browse jobs"}
          />
        </section>
      )}

      {/* Lower: the moment + matches (left) · strength / credentials rail
          (right). The offer card is constrained to the left column so the
          rail rises up beside it (Cam, Day 35). */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_330px] gap-6 items-start">
        <div className="min-w-0 space-y-6">
          {boardCards.length > 0 &&
            (hasOffer && offerApp ? (
              <section className="relative overflow-hidden border border-heritage/30 bg-heritage text-ivory p-6 sm:p-7">
                <div className="text-[10px] font-extrabold tracking-[2px] uppercase text-[#e9c873] mb-2">
                  ★ Offer extended
                  {offerCount > 1 ? ` · ${offerCount} offers` : ""}
                </div>
                <h3 className="text-xl sm:text-2xl font-extrabold tracking-[-0.4px] leading-tight">
                  {offerDsoName} extended you an offer.
                </h3>
                <p className="mt-1.5 text-[13.5px] text-ivory/80">
                  {offerJob?.title ?? "Role"}
                  {offerLocation ? ` · ${offerLocation}` : ""} · no rush — it’s
                  open.
                </p>
                {offerMarketBand && marketRange && (
                  <p className="mt-2 text-[12.5px] text-ivory/70">
                    For context, {marketRange.areaName} pay for your field runs{" "}
                    <strong className="text-ivory">{offerMarketBand}</strong> —
                    weigh your offer against it.
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Link
                    href={`/candidate/applications/${offerApp.id}`}
                    className="inline-flex items-center gap-2 bg-[#e9c873] text-ink px-5 py-2.5 text-[12px] font-bold tracking-[1px] uppercase hover:bg-[#dcb95f] transition-colors"
                  >
                    Review &amp; respond
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <Link
                    href="/candidate/inbox"
                    className="inline-flex items-center gap-2 border border-white/25 bg-white/10 px-5 py-2.5 text-[12px] font-bold tracking-[1px] uppercase hover:bg-white/20 transition-colors"
                  >
                    Message the practice
                  </Link>
                </div>
              </section>
            ) : heroMode === "new-replies" ? (
              <CandidateHero
                mode="new-replies"
                unreadCount={totalUnread}
                replies={replyPreviews}
                href="/candidate/inbox"
                ctaLabel="Open inbox"
              />
            ) : hasInterview ? (
              <CandidateHero
                mode="interview"
                interviewCount={interviewItems.length}
                items={interviewItems}
                hint="You're in the interview round. Review the role, line up your questions, and bring your best — details are on your application."
                href={firstInterviewHref}
                ctaLabel="Open interview"
              />
            ) : (
              <CandidateHero
                mode="active-apps"
                activeCount={activeApps.length}
                hint={buildActiveAppsHint(stageBreakdown)}
                stages={heroStageStrip}
                href="/candidate/applications"
                ctaLabel="See applications"
              />
            ))}

          {/* PracticeFit summary — best match + lift-your-match nudges */}
          <CandidateFitSummary
            fitsByAppId={fitsByActiveAppId}
            totalActiveApps={activeApps.length}
            filledDims={filledDims}
            pfAssessmentDone={pfAssessmentItem.done}
            dsofitAssessmentDone={dsoAssessmentItem.done}
          />

          {/* Roles that fit you — top open roles ranked by PracticeFit */}
          <RolesThatFitCard roles={rolesThatFit} product={primaryFitProduct} />
        </div>

        {/* Right rail — profile strength · credentials. (Your market card
            lands in the follow-up commit.) */}
        <div className="space-y-6">
          <CareerStrength
            pct={profilePct}
            facts={strengthFacts}
            nextAction={nextAction}
            compact
          />
          {marketRange && <YourMarketCard range={marketRange} />}
          <CredentialsCard items={credItems} />
          <SavedJobsCard items={savedItems} />
        </div>
      </div>

      {/* Recent Activity */}
      <section className="mt-6">
        <div className="flex items-end justify-between gap-4 mb-4">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
            Recent Activity
          </div>
          {apps.length > 0 && (
            <Link
              href="/candidate/applications"
              className="text-[10px] font-bold tracking-[1.5px] uppercase text-heritage hover:text-heritage-deep transition-colors"
            >
              View all
            </Link>
          )}
        </div>
        {apps.length === 0 ? (
          <div className="border border-[var(--rule)] bg-cream p-7 text-center">
            <FileText
              className="h-8 w-8 text-slate-meta mx-auto mb-4"
              strokeWidth={1.5}
            />
            <p className="text-[15px] text-ink leading-relaxed mb-2">
              You haven&apos;t applied to any jobs yet.
            </p>
            <p className="text-[14px] text-slate-body leading-relaxed mb-6">
              Browse open roles at multi-location dental groups.
            </p>
            <Link
              href="/candidate/jobs"
              className="inline-flex items-center gap-2 px-6 py-3 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
            >
              <Briefcase className="h-4 w-4" />
              Browse Jobs
            </Link>
          </div>
        ) : (
          <ActivityFeed
            title=""
            events={recentForFeed.map((app): ActivityEvent => {
              const job = jobMap.get(app.job_id);
              const stageLabel =
                CANDIDATE_KIND_LABELS[app.kind] ??
                KIND_DEFAULT_LABELS[app.kind] ??
                app.kind;
              const isWinning = ["interview", "offer", "hired"].includes(
                app.kind,
              );
              return {
                id: app.id,
                icon:
                  app.kind === "hired"
                    ? CheckCircle2
                    : isTerminalKind(app.kind)
                      ? FileText
                      : app.kind === "offer"
                        ? Mail
                        : Send,
                tone: isWinning ? "positive" : "neutral",
                body: (
                  <>
                    <strong className="font-semibold">
                      {job?.title ?? "Job removed"}
                    </strong>{" "}
                    at{" "}
                    <span className="text-slate-body">
                      {(affiliationByAppId.get(app.id)?.name ?? "Hiring team")}
                    </span>{" "}
                    · {stageLabel}
                  </>
                ),
                timestamp: `Applied ${new Date(app.created_at).toLocaleDateString()}`,
                href: `/candidate/applications/${app.id}`,
              };
            })}
          />
        )}
      </section>
    </CandidateShell>
  );
}

/* ───── Helpers ───── */

function buildActiveAppsHint(
  breakdown: Record<(typeof KANBAN_KINDS)[number], number>,
): string {
  const parts: string[] = [];
  if (breakdown.interview > 0) {
    parts.push(`${breakdown.interview} in interview`);
  }
  if (breakdown.offer > 0) {
    parts.push(`${breakdown.offer} with an offer`);
  }
  if (breakdown.open > 0) {
    parts.push(`${breakdown.open} awaiting first review`);
  }
  if (breakdown.screen > 0) {
    parts.push(`${breakdown.screen} in screening`);
  }
  if (parts.length === 0) return "Track each application's progress here.";
  return parts.join(" · ") + ".";
}

function truncatePreview(body: string, max: number): string {
  const cleaned = body.trim().replace(/\s+/g, " ");
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max - 1).trimEnd() + "…";
}

function relativeDate(iso: string, nowMs: number): string {
  const ms = nowMs - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Common dental credential acronyms that should stay fully capitalized. */
const CRED_ACRONYMS = new Set([
  "HIPAA", "OSHA", "CPR", "BLS", "ACLS", "PALS", "AED", "CDA", "RDA", "EFDA",
  "DANB", "DEA", "NPI", "CE", "CDC", "DDS", "DMD", "RDH", "RDHAP", "OMFS",
]);

/** Tidy a credential slug for display: known acronyms upper, words title-cased. */
function prettyCred(s: string | null | undefined, fallback: string): string {
  const raw = (s ?? "").trim();
  if (!raw) return fallback;
  return raw
    .split(/[\s_]+/)
    .map((w) => {
      const up = w.toUpperCase();
      if (CRED_ACRONYMS.has(up)) return up;
      return w.length <= 3
        ? up
        : w[0].toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}
