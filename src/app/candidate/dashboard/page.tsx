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
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
  KANBAN_STAGES,
  STAGE_LABELS,
  type ApplicationStatus,
} from "@/lib/applications/stages";
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

  const { data: candidate } = await supabase
    .from("candidates")
    .select(
      "id, full_name, headline, summary, current_title, years_experience, desired_roles, desired_locations, availability, resume_url, linkedin_url",
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!candidate) return null;

  // ── Profile completeness ────────────────────────────────────────────
  const profileFields = [
    candidate.full_name,
    candidate.headline,
    candidate.current_title,
    candidate.years_experience !== null &&
      candidate.years_experience !== undefined,
    candidate.desired_roles && (candidate.desired_roles as string[])?.length > 0,
    candidate.resume_url,
    candidate.availability,
  ];
  const filledFields = profileFields.filter(Boolean).length;
  const totalFields = profileFields.length;
  const profilePct = Math.round((filledFields / totalFields) * 100);
  const missingFields = totalFields - filledFields;

  // ── All applications ────────────────────────────────────────────────
  const { data: rawApps } = await supabase
    .from("applications")
    .select("id, job_id, status, created_at, updated_at")
    .eq("candidate_id", candidate.id)
    .order("created_at", { ascending: false });

  type AppRow = {
    id: string;
    job_id: string;
    status: ApplicationStatus;
    created_at: string;
    updated_at: string;
  };
  const apps = (rawApps ?? []) as AppRow[];

  const activeApps = apps.filter(
    (a) => !["hired", "rejected", "withdrawn"].includes(a.status),
  );

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

  const dsoIds = Array.from(new Set(jobs.map((j) => j.dso_id)));
  const { data: rawDsos } = dsoIds.length
    ? await supabase.from("dsos").select("id, name").in("id", dsoIds)
    : { data: [] };
  type DsoRow = { id: string; name: string };
  const dsos = (rawDsos ?? []) as DsoRow[];
  const dsoMap = new Map(dsos.map((d) => [d.id, d]));

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
          const dso = job ? dsoMap.get(job.dso_id) : null;
          return {
            id: m.id,
            senderName: m.sender_dso_user_id
              ? (senderMap.get(m.sender_dso_user_id) ?? "Recruiter")
              : "Recruiter",
            dsoName: dso?.name ?? "Unknown DSO",
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
  const stageBreakdown: Record<(typeof KANBAN_STAGES)[number], number> = {
    new: 0,
    reviewed: 0,
    interviewing: 0,
    offered: 0,
    hired: 0,
  };
  for (const a of activeApps) {
    if ((a.status as string) in stageBreakdown) {
      stageBreakdown[a.status as keyof typeof stageBreakdown] += 1;
    }
  }

  const heroStageStrip = [
    { key: "new", label: STAGE_LABELS.new, count: stageBreakdown.new },
    {
      key: "reviewed",
      label: STAGE_LABELS.reviewed,
      count: stageBreakdown.reviewed,
    },
    {
      key: "interviewing",
      label: STAGE_LABELS.interviewing,
      count: stageBreakdown.interviewing,
    },
    {
      key: "offered",
      label: STAGE_LABELS.offered,
      count: stageBreakdown.offered,
    },
  ];

  // ── Application kanban cards (active only) ──────────────────────────
  const kanbanCards: MyApplicationCard[] = activeApps.map(
    (a): MyApplicationCard => {
      const job = jobMap.get(a.job_id);
      const dso = job ? dsoMap.get(job.dso_id) : null;
      const days = Math.max(
        0,
        Math.floor((nowMs - new Date(a.created_at).getTime()) / 86400000),
      );
      return {
        id: a.id,
        role: job?.title ?? "Unknown role",
        dsoName: dso?.name ?? "Unknown DSO",
        stage: a.status as MyApplicationCard["stage"],
        daysSinceApplied: days,
        hasUnreadMessage: (unreadByAppId.get(a.id) ?? 0) > 0,
        offerPending: a.status === "offered",
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
            ? `Welcome to DSO Hire, ${candidate.full_name?.split(" ")[0] ?? "there"}.`
            : `Welcome back, ${candidate.full_name?.split(" ")[0] ?? "there"}.`}
        </h1>
        <p className="mt-3 text-base text-slate-body max-w-[640px]">
          {headerSub}
        </p>
      </header>

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
              href={profilePct < 100 ? "/candidate/profile" : "/jobs"}
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
              ? `Add ${missingFields} more field${missingFields === 1 ? "" : "s"} to be visible to employers.`
              : "Profile complete — employers can find you."
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
                : "Across verified DSOs in your area."
          }
          href={desiredRoles.length > 0 ? "/jobs?match=1" : "/jobs"}
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
              Browse open roles at verified dental support organizations.
            </p>
            <Link
              href="/jobs"
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
              const dso = job ? dsoMap.get(job.dso_id) : null;
              const stageLabel = STAGE_LABELS[app.status] ?? app.status;
              const isWinning = ["interviewing", "offered", "hired"].includes(
                app.status,
              );
              return {
                id: app.id,
                icon:
                  app.status === "hired"
                    ? CheckCircle2
                    : ["rejected", "withdrawn"].includes(app.status)
                      ? FileText
                      : app.status === "offered"
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
                      {dso?.name ?? "Unknown DSO"}
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
  breakdown: Record<(typeof KANBAN_STAGES)[number], number>,
): string {
  const parts: string[] = [];
  if (breakdown.interviewing > 0) {
    parts.push(`${breakdown.interviewing} in interview`);
  }
  if (breakdown.offered > 0) {
    parts.push(`${breakdown.offered} with an offer`);
  }
  if (breakdown.new > 0) {
    parts.push(`${breakdown.new} awaiting first review`);
  }
  if (breakdown.reviewed > 0) {
    parts.push(`${breakdown.reviewed} in screening`);
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
