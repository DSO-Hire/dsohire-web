/**
 * /employer/dashboard — operator landing page after sign-in.
 *
 * v3 layout (locked 2026-05-05):
 *
 *   Header                ← welcome, live pulse, today's date
 *   BillingBanner         ← unchanged
 *   KPI grid              ← navy hero (Awaiting Review) + 4 tonal tiles
 *   Quick actions strip   ← Post a job · Invite teammate · Add location
 *   PipelineFunnel        ← 5-stage funnel + conversion %, last 30d
 *   2-col: JobHealth      ← per-opening funnel + velocity sparks
 *          LocationPulse  ← ranked application density per location
 *
 * Every tile, alert pill, health row, and pulse event is a real
 * navigation destination — the dashboard is a launchpad, not a museum.
 *
 * "Applications This Week" uses date_trunc('week', now()) semantics — i.e.
 * a Monday-anchored UTC week — so the tile resets every Monday.
 *
 * ── Perf pass #91, P0-A (2026-07-07) ─────────────────────────────────
 * This page STREAMS. The pre-#91 version ran 25+ sequential awaits in one
 * server pass (measured 11.9s to content on prod). Now:
 *   • The shell — greeting, KPI strip, funnel — awaits only the batched
 *     loaders in ./data.ts (each dependency level is one Promise.all).
 *   • Every heavy panel is an async server component (./sections.tsx)
 *     inside <Suspense>, streaming in when its own data lands.
 *   • Fit-scored panels read the pre-warmed practice_fit_scores cache
 *     only — scoring never runs in the request path (see smart-picks).
 * Display timing only — data, masking, and pixels are unchanged.
 */

import { Suspense } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowRightCircle,
  Briefcase,
  Clock,
  Mail,
  MapPin,
  Plus,
  UserPlus,
} from "lucide-react";
// BOH Lane 2c — HelpDisclosure + HeroKpiTile retired from this page
// (About box → help center + ? launcher; hero → slim KPI strip).
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { FirstRunDashboard } from "./first-run";
import { BillingBanner } from "@/components/employer/billing-banner";
import { Eyebrow } from "@/components/brand/eyebrow";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { PipelineFunnel } from "@/components/dashboard/pipeline-funnel";
import { buildGreeting } from "@/lib/dashboard/greeting";
import {
  getCore,
  getHmScopeLocations,
  getJobScope,
  getNowMs,
  getOffersOut,
  getPipeline,
  getTtf,
  getViewer,
  STUCK_SLA_DAYS,
} from "./data";
import {
  CredentialsExpiringSection,
  InterestedInYouSection,
  JobHealthSection,
  LivePulseSection,
  LocationPulseSection,
  NextBestActionsSection,
  TodaysTopFitsSection,
} from "./sections";
import {
  JobHealthPanelSkeleton,
  LocationPulsePanelSkeleton,
  PulsePanelSkeleton,
  QueuePanelSkeleton,
} from "./panel-skeletons";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function EmployerDashboard() {
  // Shell data — ONLY what the greeting bar + KPI strip + funnel band
  // need. Loaders are per-request memoized, so the streamed sections
  // below share these fetches instead of repeating them.
  const { dsoUser } = await getViewer();
  const [
    { dso, locationsCount, teamCount, jobsCount, customAutomationCount, subscription },
    hmScopeLocations,
    { openJobsCount },
    pipeline,
    { ttfMedianDays, ttfFillCount, hiresLast7Days },
    offersOutCount,
  ] = await Promise.all([
    getCore(),
    getHmScopeLocations(),
    getJobScope(),
    getPipeline(),
    getTtf(),
    getOffersOut(),
  ]);

  const {
    appsThisWeekCount,
    awaitingReviewCount,
    oldestAwaitingDays,
    appsLast7Days,
    appsWeekOverWeekDelta,
    stuckTotalCount,
    staleTotalCount,
    stage30dCounts,
  } = pipeline;

  // Hint for the hero tile — adapts based on whether anything is awaiting.
  // The oldest-waiting detail now lives in the SLA chip next to the value, so
  // the hint no longer repeats the day count.
  const heroHint =
    awaitingReviewCount === 0
      ? "Inbox is clear. A good moment to source from the talent pool or keep interview-stage candidates moving."
      : "Clear the queue to keep candidates moving — each one is a real applicant waiting on you.";

  // SLA chip — the queue's decision-driving secondary stat. Replaces the old
  // applications-volume sparkline (which plotted a different metric than the
  // count and so misled). Tone flips to "breach" once the oldest item is past
  // the same SLA the StuckAlert uses.
  const heroSlaChip:
    | { label: string; tone: "ok" | "breach" }
    | undefined =
    awaitingReviewCount > 0 && oldestAwaitingDays !== null
      ? {
          label:
            oldestAwaitingDays >= STUCK_SLA_DAYS
              ? `oldest waiting ${oldestAwaitingDays}d · past your ${STUCK_SLA_DAYS}-day response goal`
              : `oldest waiting ${oldestAwaitingDays}d`,
          tone: oldestAwaitingDays >= STUCK_SLA_DAYS ? "breach" : "ok",
        }
      : undefined;

  // Today's date stamp for the eyebrow row.
  const today = new Date(getNowMs());
  const dateLabel = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const isDsoAdmin = dsoUser?.role === "owner" || dsoUser?.role === "admin";
  // Day one = no job has ever been posted. HMs are excluded — they don't
  // set up the account and their scoped view handles empty on its own.
  const isFirstRun =
    (jobsCount ?? 0) === 0 && dsoUser?.role !== "hiring_manager";
  const employerOnboardingItems = [
    {
      key: "job",
      label: "Post your first job",
      done: (jobsCount ?? 0) > 0,
      href: "/employer/jobs/new",
    },
    {
      key: "loc",
      label: "Add a practice location",
      done: (locationsCount ?? 0) > 0,
      href: "/employer/locations",
    },
    ...(isDsoAdmin
      ? [
          {
            key: "team",
            label: "Invite a teammate",
            done: (teamCount ?? 0) > 1,
            href: "/employer/team",
          },
          {
            key: "auto",
            label: "Set up an automation to save time",
            done: (customAutomationCount ?? 0) > 0,
            href: "/employer/automations",
          },
        ]
      : []),
  ];

  return (
    <>
      {/* BOH Lane 2c (Model 01, full-refresh doctrine) — the compact
          mission-control greeting bar replaces the tall welcome block.
          Open Jobs lives here as a live chip (the KPI strip below holds
          the four hiring numbers). The "About your dashboard" inline
          disclosure is retired — the entry remains in /employer/help and
          the ? assistant. No time-of-day greeting: the server renders in
          UTC and we don't fake local time. */}
      <header className="mb-7">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-[-0.6px] leading-snug text-ink">
              {/* Reactive greeting (Cam, Day 32) — leads with the most
                  newsworthy TRUE fact from data this page already
                  loaded. Pure function, zero extra queries. */}
              {buildGreeting({
                firstName: dsoUser?.full_name?.split(" ")[0] ?? "there",
                awaitingReview: awaitingReviewCount,
                slaBreached: heroSlaChip?.tone === "breach",
                appsThisWeek: appsThisWeekCount,
                hiresThisWeek: hiresLast7Days.reduce((a, b) => a + b, 0),
                offersOut: offersOutCount,
                stalledCount: stuckTotalCount + staleTotalCount,
                daySeed: Math.floor(getNowMs() / 86400000),
              })}
            </h1>
            <div className="mt-2 flex items-center gap-3.5 flex-wrap text-xs font-medium text-slate-meta">
              <span className="inline-flex items-center gap-2 text-heritage-deep">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-heritage opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-heritage" />
                </span>
                {dso?.status === "active" ? "Active" : "Onboarding"}
              </span>
              <span className="border-l border-rule pl-3.5">{dateLabel}</span>
              <span className="inline-flex items-center gap-1.5 border-l border-rule pl-3.5 text-ink tabular">
                <Briefcase className="size-3" />
                {openJobsCount} {openJobsCount === 1 ? "job" : "jobs"} live
              </span>
              <span className="border-l border-rule pl-3.5">{dso?.name}</span>
            </div>
          </div>
          {dsoUser?.role !== "hiring_manager" && (
            <Link
              href="/employer/jobs/new"
              className="inline-flex items-center gap-2 px-5 py-3 bg-heritage text-primary-foreground text-sm font-bold hover:bg-heritage-deep transition-colors shrink-0"
            >
              <Plus className="size-4" strokeWidth={2.5} />
              Post a job
            </Link>
          )}
        </div>
      </header>

      {/* Design program 3b — day one (no job posted yet) swaps the wall
          of zero tiles for the calm first-run composition. Graduates to
          the full cockpit the moment the first job exists. HMs never see
          it (they don't set up the account). */}
      {isFirstRun ? (
        <>
          <BillingBanner subscription={subscription} />
          <FirstRunDashboard
            firstName={dsoUser?.full_name?.split(" ")[0] ?? "there"}
            hasLocation={(locationsCount ?? 0) > 0}
            items={employerOnboardingItems}
          />
        </>
      ) : (
        <>
      {dsoUser?.role !== "hiring_manager" && (
        <div className="mb-8">
          <OnboardingChecklist
            title="Get started"
            subtitle="Knock these out to get your hiring running — you can do them in any order."
            storageKey="employer-onboarding-checklist-v1"
            items={employerOnboardingItems}
          />
        </div>
      )}

      {dsoUser?.role === "hiring_manager" && (
        <HmScopeContextBar locations={hmScopeLocations} />
      )}

      <BillingBanner subscription={subscription} />

      {/* BOH Lane 2c (Model 01) — the slim four-KPI sparkline strip
          replaces the hero+2×2 grid. Awaiting Review keeps its SLA chip
          as hint; the hero's pipeline stage-strip retires in favor of the
          PipelineFunnel section below (same data, one home); Open Jobs
          moved to the greeting bar. No "Interviews this week" until real
          scheduling data exists — no invented numbers. */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--rule)] border border-[var(--rule)] mb-6">
        <KpiTile
          icon={Mail}
          tone="navy"
          value={String(awaitingReviewCount)}
          label="Awaiting Review"
          hint={heroSlaChip ? heroSlaChip.label : heroHint}
          trendIntent={
            heroSlaChip?.tone === "breach" ? "negative" : "neutral"
          }
          spark={appsLast7Days.some((v) => v > 0) ? appsLast7Days : undefined}
          href="/employer/applications?status=open&sort=oldest"
          routeLabel="Review new applications"
        />

        <KpiTile
          icon={ArrowRightCircle}
          value={String(appsThisWeekCount)}
          label="Apps This Week"
          hint={
            appsThisWeekCount > 0
              ? "Since Monday"
              : "Share the job board to drive traffic"
          }
          spark={appsLast7Days.some((v) => v > 0) ? appsLast7Days : undefined}
          delta={appsWeekOverWeekDelta}
          deltaLabel="vs last week"
          href="/employer/applications"
          routeLabel="View applications"
        />

        {/* BOH Lane 2c — Offers Out (sent, awaiting candidate response).
            The Hires number lives on in the TTF tile's hint + the funnel. */}
        <KpiTile
          icon={UserPlus}
          value={String(offersOutCount)}
          label="Offers Out"
          hint={
            offersOutCount > 0
              ? "Awaiting candidate response"
              : "Sent offers awaiting reply show here"
          }
          href="/employer/applications?status=offer"
          routeLabel="View offers"
        />

        {/* BOH Lane 2b (Model 01, Cam pick) — median time-to-fill. Same
            fill definition as the analytics hub; spark = fills last 7d. */}
        <KpiTile
          icon={Clock}
          value={ttfMedianDays != null ? `${ttfMedianDays}d` : "—"}
          label="Time To Fill · 90d"
          hint={
            ttfMedianDays != null
              ? `Median across ${ttfFillCount} ${ttfFillCount === 1 ? "fill" : "fills"} · posting → hire`
              : "Measures posting → hire once roles fill"
          }
          spark={
            hiresLast7Days.some((v) => v > 0) ? hiresLast7Days : undefined
          }
          href="/employer/analytics"
          routeLabel="View analytics"
        />
      </section>

      {/* BOH Lane 2a+2d (Model 01) — queue + live pulse side by side.
          The queue (j/k + Enter triage) supersedes the alert banners; the
          pulse supersedes the bottom Recent Activity section, seeded from
          the same data and kept live by realtime INSERT subscriptions.
          Stacks to one column below lg. Each cell streams independently
          (#91) — the queue waits on fit-cache reads, the pulse only on
          candidate names. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 mb-6 items-start">
        <Suspense fallback={<QueuePanelSkeleton />}>
          <NextBestActionsSection />
        </Suspense>
        <Suspense fallback={<PulsePanelSkeleton />}>
          <LivePulseSection />
        </Suspense>
      </div>

      {/* Onboarding nudge — only when no locations on file. */}
      {(locationsCount ?? 0) === 0 && (
        <section className="mb-6 p-7 sm:p-8 bg-hero text-hero-foreground border-l-4 border-heritage">
          <Eyebrow className="text-heritage-bright mb-3">Finish onboarding</Eyebrow>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.6px] leading-tight mb-3">
            Add your first practice location to start posting jobs.
          </h2>
          <p className="text-sm text-hero-foreground/70 leading-relaxed max-w-[560px] mb-6">
            DSO Hire posts jobs across your locations in one flow. We need
            at least one location to enable job posting.
          </p>
          <Link
            href="/employer/onboarding"
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-heritage text-primary-foreground text-sm font-bold hover:bg-heritage-deep transition-colors"
          >
            Continue onboarding
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      )}

      {/* Quick action command strip — Post a job · Invite teammate · Add location.
          Hidden for hiring managers (who can't post or invite). */}
      {dsoUser?.role !== "hiring_manager" && (
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[var(--rule)] border border-[var(--rule)] mb-6">
          <CommandTile
            href="/employer/jobs/new"
            icon={Plus}
            title="Post a job"
            meta="Multi-location in one flow"
          />
          <CommandTile
            href="/employer/team"
            icon={UserPlus}
            title="Invite a teammate"
            meta="Owner · Admin · Recruiter · HM"
          />
          <CommandTile
            href="/employer/locations"
            icon={MapPin}
            title={(locationsCount ?? 0) === 0 ? "Add a location" : "Manage locations"}
            meta={
              (locationsCount ?? 0) === 0
                ? "Each location lights up the map"
                : `${locationsCount} on file · ${teamCount ?? 1} on the team`
            }
          />
        </section>
      )}

      {/* v3 Phase D — inbound interest (candidates who saved your jobs) — a
          warmer signal than an algorithmic pick, so it leads. Renders nothing
          when nobody's saved a job yet (hence fallback null — no ghost that
          might vanish). */}
      <div id="interested-in-you" className="scroll-mt-24">
        <Suspense fallback={null}>
          <InterestedInYouSection />
        </Suspense>
      </div>

      {/* v3 Phase C — Today's top fits (cross-job PracticeFit roll-up).
          Renders nothing when there are no scored fits yet. */}
      <Suspense fallback={null}>
        <TodaysTopFitsSection />
      </Suspense>

      {/* #9c — credential expiry roll-up (hired/active). Renders nothing when
          nothing is expired or expiring soon. */}
      <div id="credentials-expiring" className="scroll-mt-24 mb-6">
        <Suspense fallback={null}>
          <CredentialsExpiringSection />
        </Suspense>
      </div>

      {/* Pipeline funnel — full-width. Rendered from the shell's pipeline
          batch (no extra fetch), so it paints with the KPI strip. */}
      <section className="mb-6">
        <PipelineFunnel
          stageCounts={{
            submitted:
              stage30dCounts.open +
              stage30dCounts.screen +
              stage30dCounts.interview +
              stage30dCounts.offer +
              stage30dCounts.hired,
            reviewed:
              stage30dCounts.screen +
              stage30dCounts.interview +
              stage30dCounts.offer +
              stage30dCounts.hired,
            interview:
              stage30dCounts.interview +
              stage30dCounts.offer +
              stage30dCounts.hired,
            offer: stage30dCounts.offer + stage30dCounts.hired,
            hired: stage30dCounts.hired,
          }}
          windowLabel="Last 30 days"
          medianTimeToHireDays={null}
          href="/employer/applications"
        />
      </section>

      {/* Two-column row — Job health (Lane 2e) + ranked location list
          (replaces the density-map blob; component kept on disk). */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 mb-6 items-start">
        <Suspense fallback={<JobHealthPanelSkeleton />}>
          <JobHealthSection />
        </Suspense>
        <Suspense fallback={<LocationPulsePanelSkeleton />}>
          <LocationPulseSection />
        </Suspense>
      </section>
        </>
      )}
    </>
  );
}

/* ───── Local Quick-actions command tile ───── */

function CommandTile({
  href,
  icon: Icon,
  title,
  meta,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  meta: string;
}) {
  return (
    <Link
      href={href}
      className="group bg-card p-5 sm:p-6 flex items-center gap-4 hover:bg-ivory-deep transition-colors"
    >
      <div className="h-9 w-9 bg-ink text-ivory flex items-center justify-center flex-shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-extrabold text-ink tracking-[-0.2px]">
          {title}
        </div>
        <div className="text-2xs text-slate-meta mt-0.5 tabular">{meta}</div>
      </div>
      <ArrowRight className="h-4 w-4 text-slate-meta group-hover:text-heritage group-hover:translate-x-1 transition-all flex-shrink-0" />
    </Link>
  );
}

/**
 * Persistent scope-context bar for hiring managers — sits at the top of
 * the dashboard so an HM always knows which locations the data on this
 * page is scoped to. Trust signal + sales-demo answer to "will my
 * dentist owner see her competitor's candidates?" — no, scoped to her
 * practice only, and the product literally tells her so.
 */
function HmScopeContextBar({
  locations,
}: {
  locations: Array<{ name: string; state: string | null }>;
}) {
  const labels = locations.map((l) => (l.state ? `${l.name} · ${l.state}` : l.name));
  return (
    <div className="mb-6 border-l-2 border-heritage bg-cream/60 px-4 py-3">
      <div className="flex items-start gap-2 flex-wrap">
        <MapPin className="h-3.5 w-3.5 text-heritage-deep mt-1 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <Eyebrow className="mb-1">Your hiring-manager scope</Eyebrow>
          {labels.length === 0 ? (
            <p className="text-xs text-warning leading-relaxed">
              No locations assigned to you yet. Reach out to whoever invited
              you so they can update your scope on the Team page — until then,
              you&apos;ll only see corporate-scoped jobs.
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-body leading-relaxed">
                You&apos;re reviewing applications for{" "}
                {labels.length === 1 ? "this location" : `these ${labels.length} locations`}{" "}
                only. Other locations at this DSO won&apos;t appear anywhere
                in your view.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {labels.map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center px-2.5 py-0.5 bg-ivory border border-[var(--rule-strong)] text-2xs font-semibold tracking-[0.4px] text-ink"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
