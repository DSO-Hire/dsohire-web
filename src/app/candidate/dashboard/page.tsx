/**
 * /candidate/dashboard — landing page after candidate sign-in.
 *
 * v3 layout (locked 2026-05-05):
 *
 *   Header                       ← welcome, live pulse, today's date
 *   KPI grid                     ← adaptive hero + 4 tonal tiles
 *   Profile completion CTA       ← when profile <100%
 *   MyApplicationStages          ← personal kanban-lite (active apps only)
 *   ActivityFeed                 ← recent stage moves + employer messages
 *
 * The hero adapts based on what's most actionable for the candidate:
 *   - If unread employer replies → "New Replies" hero with reply previews
 *   - Else if active applications → "Active Applications" hero with stages
 *   - Else (fresh signup) → "Get Hired" 3-step setup hero
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
  Search,
  Send,
  UserCircle,
} from "lucide-react";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { CandidateHero } from "@/components/dashboard/candidate-hero";
import {
  MyApplicationStages,
  type MyApplicationCard,
} from "@/components/dashboard/my-application-stages";
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
import type { FitResult } from "@/lib/practice-fit/types";
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
      "id, first_name, last_name, salutation, full_name, headline, summary, current_title, years_experience, years_experience_dental, pronouns, current_location_city, current_location_state, desired_roles, desired_locations, desired_specialty, pms_systems, skills, languages, temp_or_perm, schedule_preferences, min_salary, salary_unit, cv_visibility, availability, resume_url, linkedin_url, avatar_url, practice_fit_consent",
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
  const missingFields = completeness.missing.length;

  // Progressive onboarding checklist (dismissible; auto-hides when complete).
  const onboardingItems = [
    {
      key: "profile",
      label: "Finish your profile",
      done: completeness.missing.length === 0,
      href: "/candidate/profile",
    },
    {
      key: "prefs",
      label: "Set your job preferences",
      done:
        profileData.jobPreferences.desired_locations.length > 0 ||
        profileData.jobPreferences.min_salary != null,
      href: "/candidate/profile",
    },
    {
      key: "visible",
      label: "Set your profile visibility so recruiters can find you",
      // cv_visibility is the "Profile status" enum: hidden / recruiters_only /
      // open_to_work. Anything but "hidden" means discoverable → done.
      done: ((c.cv_visibility as string | null) ?? "hidden") !== "hidden",
      href: "/candidate/settings/privacy",
    },
    {
      key: "fit",
      label: "Choose your PracticeFit matching setting",
      done: ((c.practice_fit_consent as string | null) ?? "off") !== "off",
      href: "/candidate/settings/privacy",
    },
  ];

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
  const rolesThatFit = pfConsentOn
    ? await getTopFitJobsForCandidate(candidateRowId, 4)
    : [];

  // ── Job + DSO maps ──────────────────────────────────────────────────
  const jobIds = Array.from(new Set(apps.map((a) => a.job_id)));
  const { data: rawJobs } = jobIds.length
    ? await supabase
        .from("jobs")
        .select("id, title, dso_id, role_category, employment_type")
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

  // ── Job matches (count of active jobs matching desired_roles) ───────
  const desiredRoles = (candidate.desired_roles as string[] | null) ?? [];
  let jobMatchCount = 0;
  if (desiredRoles.length > 0) {
    const { count } = await supabase
      .from("jobs")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")
      .is("deleted_at", null)
      .in("role_category", desiredRoles);
    jobMatchCount = count ?? 0;
  } else {
    const { count } = await supabase
      .from("jobs")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")
      .is("deleted_at", null);
    jobMatchCount = count ?? 0;
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

  // ── Application kanban cards (active only) ──────────────────────────
  const kanbanCards: MyApplicationCard[] = activeApps.map(
    (a): MyApplicationCard => {
      const job = jobMap.get(a.job_id);
      const days = Math.max(
        0,
        Math.floor((nowMs - new Date(a.created_at).getTime()) / 86400000),
      );
      return {
        id: a.id,
        role: job?.title ?? "Unknown role",
        dsoName: affiliationByAppId.get(a.id)?.name ?? "Hiring team",
        locationName: job ? locationByJobId.get(job.id) ?? null : null,
        stage: a.kind as MyApplicationCard["stage"],
        daysSinceApplied: days,
        hasUnreadMessage: (unreadByAppId.get(a.id) ?? 0) > 0,
        offerPending: a.kind === "offer",
        hideStageBadge: job?.hide_stages_from_candidate ?? false,
        href: `/candidate/applications/${a.id}`,
      };
    },
  );

  const recentForFeed = apps.slice(0, 5);

  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

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

      <div className="mb-6">
        <OnboardingChecklist
          title="Get set up"
          subtitle="A few quick steps to get the most out of DSO Hire — you can change anything later in Settings."
          storageKey="candidate-onboarding-checklist-v1"
          items={onboardingItems}
        />
      </div>

      {/* KPI grid — adaptive hero + 4 tonal tiles */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr] gap-px bg-[var(--rule)] border border-[var(--rule)] mb-6">
        <div className="lg:row-span-2">
          {heroMode === "new-replies" ? (
            <CandidateHero
              mode="new-replies"
              unreadCount={totalUnread}
              replies={replyPreviews}
              href="/candidate/applications"
              ctaLabel="Open inbox"
            />
          ) : heroMode === "active-apps" ? (
            <CandidateHero
              mode="active-apps"
              activeCount={activeApps.length}
              hint={buildActiveAppsHint(stageBreakdown)}
              stages={heroStageStrip}
              href="/candidate/applications"
              ctaLabel="See applications"
            />
          ) : (
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
          )}
        </div>

        <KpiTile
          icon={Send}
          value={String(activeApps.length)}
          label="Active Applications"
          hint={
            activeApps.length === 0
              ? "Once you apply, every active application appears here."
              : buildActiveAppsHint(stageBreakdown)
          }
          href="/candidate/applications"
          routeLabel={
            activeApps.length === 0 ? "Browse jobs" : "See applications"
          }
        />

        <KpiTile
          icon={UserCircle}
          value={`${profilePct}%`}
          label="Profile Completeness"
          hint={
            profilePct < 100
              ? `Add ${missingFields} more field${missingFields === 1 ? "" : "s"} to stand out to employers.`
              : "Profile complete — you're putting your best foot forward."
          }
          href="/candidate/profile"
          routeLabel="Finish profile"
        />

        <KpiTile
          icon={Search}
          value={String(jobMatchCount)}
          label={desiredRoles.length > 0 ? "Jobs Matching You" : "Open Jobs"}
          hint={
            desiredRoles.length === 0
              ? "Set your target roles in your profile to get matched jobs."
              : jobMatchCount === 0
                ? "No matches yet. Try widening your role preferences."
                : "Across multi-location dental groups in your area."
          }
          href={desiredRoles.length > 0 ? "/candidate/jobs?match=1" : "/candidate/jobs"}
          routeLabel={desiredRoles.length > 0 ? "Browse matches" : "Browse jobs"}
        />

        <KpiTile
          icon={CheckCircle2}
          value={String(apps.length)}
          label="Total Apps · All Time"
          hint={
            apps.length === 0
              ? "Your application history will show up here once you start applying."
              : `${apps.length} submitted across ${jobs.length} role${jobs.length === 1 ? "" : "s"}.`
          }
          href="/candidate/applications"
          routeLabel="See history"
        />
      </section>

      {/* Profile completion CTA */}
      {profilePct < 100 && (
        <section className="mb-6 p-7 sm:p-8 bg-ink text-ivory border-l-4 border-heritage">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-5 items-center">
            <div>
              <div className="text-[10px] font-extrabold tracking-[2.5px] uppercase text-heritage-light mb-2">
                Finish Your Profile
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.6px] leading-tight mb-3">
                {profilePct < 50
                  ? "Most candidates with complete profiles hear back 3× faster."
                  : "Almost there — finish strong."}
              </h3>
              <p className="text-[14px] text-ivory/70 leading-relaxed max-w-[560px]">
                {profilePct < 50
                  ? "Add your headline, target roles, location preferences, résumé, and availability — takes about 4 minutes."
                  : "Just a few more fields and your profile is fully discoverable by employers."}
              </p>
            </div>
            <Link
              href="/candidate/profile"
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-heritage text-ivory text-[12px] font-bold tracking-[1.8px] uppercase hover:bg-heritage-deep transition-colors flex-shrink-0"
            >
              <UserCircle className="h-4 w-4" />
              Continue Setup
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      )}

      {/* PracticeFit summary — best match + lift-your-match nudges */}
      <CandidateFitSummary
        fitsByAppId={fitsByActiveAppId}
        totalActiveApps={activeApps.length}
      />

      {/* Roles that fit you — top open roles ranked by PracticeFit (B.1) */}
      <RolesThatFitCard roles={rolesThatFit} />

      {/* My Application Stages — personal kanban */}
      {activeApps.length > 0 && (
        <section className="mb-6">
          <MyApplicationStages cards={kanbanCards} />
        </section>
      )}

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
