/**
 * /admin/cs — Customer Success dashboard (Tier 3 #5, Day 21).
 *
 * Cam-only. Single-page operational view of:
 *   1. Health summary (top): total/active/at-risk/cost/tickets
 *   2. At-risk customers (stuck-onboarding / inactive / churn-risk)
 *   3. Feature adoption matrix (which DSOs have touched which features)
 *   4. Top support questions of the week (gaps in HELP_CONTENT)
 *   5. Onboarding funnel (signup → first hire conversion)
 *
 * Pure read-only. All queries run server-side via service-role. No
 * action surfaces; this is "Cam stays informed" not "Cam takes
 * action." Action-taking lands in Tier 3 #1 later.
 *
 * Reuses the admin email gate pattern from
 * /admin/support/conversations.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  DollarSign,
  MessageSquare,
  ShieldCheck,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Customer Success · Admin" };
export const dynamic = "force-dynamic";

const ADMIN_EMAILS = new Set([
  "cam@dsohire.com",
  "cameron@eslingerdental.com",
]);

const STUCK_ONBOARDING_DAYS = 7;
const INACTIVE_DAYS = 14;
const TOP_QUESTIONS_DAYS = 7;
const TOP_QUESTIONS_LIMIT = 10;

export default async function CustomerSuccessDashboard() {
  // ── Auth + admin gate ──
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in?next=/admin/cs");
  if (!user.email || !ADMIN_EMAILS.has(user.email.toLowerCase())) {
    notFound();
  }

  const admin = createSupabaseServiceRoleClient();

  // ── Parallel fetch — all the raw data we need ──
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );

  const [
    { data: dsos },
    { data: jobs },
    { data: applications },
    { data: dsoUsers },
    { data: dsoLocations },
    { data: emailTemplates },
    { data: subscriptions },
    { data: recentSupport },
    { data: claudeUsage },
    { data: supportTickets },
  ] = await Promise.all([
    admin
      .from("dsos")
      .select("id, name, slug, status, created_at, deleted_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    admin
      .from("jobs")
      .select("id, dso_id, status, posted_at, created_at, deleted_at")
      .is("deleted_at", null),
    admin
      .from("applications")
      .select("id, job_id, created_at"),
    admin.from("dso_users").select("id, dso_id, role, created_at"),
    admin.from("dso_locations").select("id, dso_id, created_at"),
    admin
      .from("email_templates")
      .select("id, dso_id, is_custom, is_archived"),
    admin
      .from("subscriptions")
      .select("dso_id, tier, status, cancel_at_period_end"),
    admin
      .from("support_chat_messages")
      .select("request_id, content, role, created_at")
      .eq("role", "user")
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false }),
    admin
      .from("claude_usage_log")
      .select("dso_id, cost_cents, created_at")
      .gte("created_at", monthStart.toISOString()),
    admin
      .from("support_requests")
      .select("id, dso_id, review_status, created_at")
      .gte("created_at", sevenDaysAgo.toISOString()),
  ]);

  type DsoRow = {
    id: string;
    name: string;
    slug: string | null;
    status: string;
    created_at: string;
    deleted_at: string | null;
  };
  const dsoList = (dsos as DsoRow[] | null) ?? [];

  type JobRow = {
    id: string;
    dso_id: string;
    status: string;
    posted_at: string | null;
    created_at: string;
  };
  const jobList = (jobs as JobRow[] | null) ?? [];

  type AppRow = { id: string; job_id: string; created_at: string };
  const appList = (applications as AppRow[] | null) ?? [];

  type DsoUserRow = {
    id: string;
    dso_id: string;
    role: string;
    created_at: string;
  };
  const dsoUserList = (dsoUsers as DsoUserRow[] | null) ?? [];

  type LocRow = { id: string; dso_id: string; created_at: string };
  const locList = (dsoLocations as LocRow[] | null) ?? [];

  type TemplateRow = {
    id: string;
    dso_id: string;
    is_custom: boolean;
    is_archived: boolean;
  };
  const templateList = (emailTemplates as TemplateRow[] | null) ?? [];

  type SubRow = {
    dso_id: string;
    tier: string;
    status: string;
    cancel_at_period_end: boolean | null;
  };
  const subList = (subscriptions as SubRow[] | null) ?? [];

  type SupportMsgRow = {
    request_id: string;
    content: string | null;
    role: string;
    created_at: string;
  };
  const supportMsgs = (recentSupport as SupportMsgRow[] | null) ?? [];

  type UsageRow = {
    dso_id: string | null;
    cost_cents: number | string;
    created_at: string;
  };
  const usageList = (claudeUsage as UsageRow[] | null) ?? [];

  type TicketRow = {
    id: string;
    dso_id: string | null;
    review_status: string;
    created_at: string;
  };
  const ticketList = (supportTickets as TicketRow[] | null) ?? [];

  // ── Per-DSO indexes ──
  const jobsByDso = bucket(jobList, (j) => j.dso_id);
  const usersByDso = bucket(dsoUserList, (u) => u.dso_id);
  const locsByDso = bucket(locList, (l) => l.dso_id);
  const subByDso = new Map(subList.map((s) => [s.dso_id, s]));
  const customTemplatesByDso = bucket(
    templateList.filter((t) => t.is_custom && !t.is_archived),
    (t) => t.dso_id
  );

  // Job-id → dso_id map so we can attribute applications by DSO.
  const jobIdToDso = new Map(jobList.map((j) => [j.id, j.dso_id]));
  const appsByDso = bucket(
    appList
      .map((a) => ({ ...a, dso_id: jobIdToDso.get(a.job_id) ?? null }))
      .filter((a): a is AppRow & { dso_id: string } => a.dso_id !== null),
    (a) => a.dso_id
  );

  // ── Health summary ──
  const totalCustomers = dsoList.length;
  const activeDsoIds = new Set<string>();
  for (const j of jobList) {
    if (new Date(j.created_at) >= sevenDaysAgo) activeDsoIds.add(j.dso_id);
  }
  for (const a of appList) {
    const dsoId = jobIdToDso.get(a.job_id);
    if (dsoId && new Date(a.created_at) >= sevenDaysAgo) activeDsoIds.add(dsoId);
  }
  const activeCount = activeDsoIds.size;

  const totalClaudeCentsMonth = usageList.reduce((sum, u) => {
    const v = typeof u.cost_cents === "string" ? parseFloat(u.cost_cents) : u.cost_cents;
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);

  const ticketsThisWeek = ticketList.length;
  const flaggedTicketsThisWeek = ticketList.filter(
    (t) => t.review_status === "flagged_bad"
  ).length;

  // ── At-risk classification ──
  const atRisk: Array<{
    dso: DsoRow;
    reason: string;
    tier: string | null;
    flag: "stuck_onboarding" | "inactive" | "churn_risk";
  }> = [];

  for (const dso of dsoList) {
    const createdAt = new Date(dso.created_at);
    const sub = subByDso.get(dso.id);
    const tier = sub?.tier ?? null;
    const dsoJobs = jobsByDso.get(dso.id) ?? [];
    const dsoApps = appsByDso.get(dso.id) ?? [];
    const dsoUsersList = usersByDso.get(dso.id) ?? [];

    // Stuck onboarding: created >7d ago, no jobs posted ever, no team
    // (only the founding owner counts as 1).
    if (
      createdAt < sevenDaysAgo &&
      dsoJobs.length === 0 &&
      dsoUsersList.length <= 1
    ) {
      atRisk.push({
        dso,
        reason: `Signed up ${daysAgo(createdAt)}d ago, no jobs posted, ${dsoUsersList.length} team member${dsoUsersList.length === 1 ? "" : "s"}`,
        tier,
        flag: "stuck_onboarding",
      });
      continue;
    }

    // Inactive: had jobs ever, but no jobs created AND no applications
    // received in 14+ days.
    const latestJobCreate = dsoJobs.reduce<Date | null>(
      (acc, j) => {
        const d = new Date(j.created_at);
        return !acc || d > acc ? d : acc;
      },
      null
    );
    const latestApp = dsoApps.reduce<Date | null>((acc, a) => {
      const d = new Date(a.created_at);
      return !acc || d > acc ? d : acc;
    }, null);
    const lastActivity =
      latestJobCreate && latestApp
        ? latestJobCreate > latestApp
          ? latestJobCreate
          : latestApp
        : latestJobCreate ?? latestApp;
    if (
      dsoJobs.length > 0 &&
      lastActivity &&
      lastActivity < fourteenDaysAgo
    ) {
      atRisk.push({
        dso,
        reason: `Last activity ${daysAgo(lastActivity)}d ago — ${dsoJobs.length} job${dsoJobs.length === 1 ? "" : "s"} posted historically`,
        tier,
        flag: "inactive",
      });
      continue;
    }

    // Churn-risk: subscription scheduled for cancellation OR status not
    // active/trialing.
    if (
      sub &&
      (sub.cancel_at_period_end === true ||
        (sub.status !== "active" && sub.status !== "trialing"))
    ) {
      atRisk.push({
        dso,
        reason: sub.cancel_at_period_end
          ? "Subscription scheduled for cancellation"
          : `Subscription status: ${sub.status}`,
        tier,
        flag: "churn_risk",
      });
    }
  }

  // ── Feature adoption matrix ──
  const featureAdoption = dsoList.map((dso) => {
    const dsoJobs = jobsByDso.get(dso.id) ?? [];
    const dsoUsersList = usersByDso.get(dso.id) ?? [];
    const dsoLocsList = locsByDso.get(dso.id) ?? [];
    const dsoCustomTemplates = customTemplatesByDso.get(dso.id) ?? [];
    const sub = subByDso.get(dso.id);
    return {
      dso,
      tier: sub?.tier ?? "no_sub",
      posted_job: dsoJobs.length > 0,
      multi_member: dsoUsersList.length > 1,
      multi_location: dsoLocsList.length > 1,
      custom_template: dsoCustomTemplates.length > 0,
      has_subscription: !!sub,
    };
  });

  // ── Top support questions ──
  const questionCounts = new Map<string, number>();
  for (const m of supportMsgs) {
    if (!m.content) continue;
    const normalized = normalizeQuestion(m.content);
    if (!normalized) continue;
    questionCounts.set(normalized, (questionCounts.get(normalized) ?? 0) + 1);
  }
  const topQuestions = Array.from(questionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_QUESTIONS_LIMIT);

  // ── Onboarding funnel ──
  const fnSignedUp = dsoList.length;
  const fnAddedLocation = dsoList.filter(
    (d) => (locsByDso.get(d.id) ?? []).length > 0
  ).length;
  const fnPostedJob = dsoList.filter(
    (d) => (jobsByDso.get(d.id) ?? []).length > 0
  ).length;
  const fnReceivedApp = dsoList.filter(
    (d) => (appsByDso.get(d.id) ?? []).length > 0
  ).length;
  const fnMultiLocation = dsoList.filter(
    (d) => (locsByDso.get(d.id) ?? []).length > 1
  ).length;
  const fnMultiMember = dsoList.filter(
    (d) => (usersByDso.get(d.id) ?? []).length > 1
  ).length;

  return (
    <main className="min-h-screen bg-cream/30 px-6 py-10">
      <div className="mx-auto max-w-[1200px] space-y-8">
        <header className="space-y-2">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep inline-flex items-center gap-2">
            <ShieldCheck className="size-3" />
            Admin · Customer Success
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.8px] text-ink leading-tight">
            Where your customers actually stand
          </h1>
          <p className="text-[13px] text-slate-meta">
            Read-only ops dashboard. Every metric below is computed live
            from the database — no caching, no stale numbers.
          </p>
          <nav className="flex items-center gap-2 pt-2 text-[12px]">
            <Link
              href="/admin/support/conversations"
              className="text-heritage-deep underline-offset-2 hover:underline"
            >
              Support conversations →
            </Link>
          </nav>
        </header>

        {/* ── HEALTH SUMMARY ── */}
        <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <SummaryCard
            label="Total customers"
            value={totalCustomers.toString()}
            icon={Users}
          />
          <SummaryCard
            label="Active (7d)"
            value={activeCount.toString()}
            sub={
              totalCustomers > 0
                ? `${Math.round((activeCount / totalCustomers) * 100)}%`
                : "—"
            }
            icon={TrendingUp}
          />
          <SummaryCard
            label="At risk"
            value={atRisk.length.toString()}
            icon={AlertTriangle}
            tone={atRisk.length > 0 ? "amber" : undefined}
          />
          <SummaryCard
            label="Claude spend (mo)"
            value={`$${(totalClaudeCentsMonth / 100).toFixed(2)}`}
            icon={DollarSign}
          />
          <SummaryCard
            label="Support (7d)"
            value={ticketsThisWeek.toString()}
            sub={
              flaggedTicketsThisWeek > 0
                ? `${flaggedTicketsThisWeek} flagged`
                : "all clear"
            }
            icon={MessageSquare}
            tone={flaggedTicketsThisWeek > 0 ? "amber" : undefined}
          />
        </section>

        {/* ── AT-RISK CUSTOMERS ── */}
        <section>
          <SectionHeader
            title="At-risk customers"
            subtitle={`${atRisk.length} ${atRisk.length === 1 ? "DSO" : "DSOs"} needing attention`}
            icon={AlertTriangle}
          />
          {atRisk.length === 0 ? (
            <EmptyCard
              icon={CheckCircle2}
              tone="heritage"
              title="Nobody at risk right now."
              body="Every DSO with a posted job has been active in the last 14 days, no canceled subs, no stuck onboarding."
            />
          ) : (
            <ul className="space-y-2">
              {atRisk.map(({ dso, reason, tier, flag }) => (
                <li
                  key={dso.id}
                  className="flex items-start gap-3 border border-[var(--rule)] bg-card p-4"
                >
                  <RiskBadge flag={flag} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-ink text-[14px]">
                        {dso.name}
                      </span>
                      <span className="text-[10px] font-bold tracking-[1px] uppercase text-slate-meta">
                        {tier ?? "no_sub"}
                      </span>
                      <RiskLabel flag={flag} />
                    </div>
                    <p className="text-[12.5px] text-slate-body mt-0.5">
                      {reason}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── FEATURE ADOPTION MATRIX ── */}
        <section>
          <SectionHeader
            title="Feature adoption"
            subtitle="Which DSOs have touched which features"
            icon={BarChart3}
          />
          <div className="border border-[var(--rule)] bg-card overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-cream/40 border-b border-[var(--rule)]">
                <tr>
                  <th className="text-left px-3 py-2 font-bold tracking-[0.5px] uppercase text-[10px] text-slate-body">
                    DSO
                  </th>
                  <th className="text-left px-3 py-2 font-bold tracking-[0.5px] uppercase text-[10px] text-slate-body">
                    Tier
                  </th>
                  <th className="text-center px-3 py-2 font-bold tracking-[0.5px] uppercase text-[10px] text-slate-body">
                    Sub
                  </th>
                  <th className="text-center px-3 py-2 font-bold tracking-[0.5px] uppercase text-[10px] text-slate-body">
                    Posted Job
                  </th>
                  <th className="text-center px-3 py-2 font-bold tracking-[0.5px] uppercase text-[10px] text-slate-body">
                    Team 2+
                  </th>
                  <th className="text-center px-3 py-2 font-bold tracking-[0.5px] uppercase text-[10px] text-slate-body">
                    Loc 2+
                  </th>
                  <th className="text-center px-3 py-2 font-bold tracking-[0.5px] uppercase text-[10px] text-slate-body">
                    Custom Template
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule)]">
                {featureAdoption.map(
                  ({
                    dso,
                    tier,
                    has_subscription,
                    posted_job,
                    multi_member,
                    multi_location,
                    custom_template,
                  }) => (
                    <tr key={dso.id}>
                      <td className="px-3 py-2 font-semibold text-ink">
                        {dso.name}
                      </td>
                      <td className="px-3 py-2 text-slate-meta uppercase text-[10px] tracking-[1px] font-bold">
                        {tier}
                      </td>
                      <td className="text-center px-3 py-2">
                        <Check yes={has_subscription} />
                      </td>
                      <td className="text-center px-3 py-2">
                        <Check yes={posted_job} />
                      </td>
                      <td className="text-center px-3 py-2">
                        <Check yes={multi_member} />
                      </td>
                      <td className="text-center px-3 py-2">
                        <Check yes={multi_location} />
                      </td>
                      <td className="text-center px-3 py-2">
                        <Check yes={custom_template} />
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── TOP SUPPORT QUESTIONS ── */}
        <section>
          <SectionHeader
            title={`Top support questions (last ${TOP_QUESTIONS_DAYS} days)`}
            subtitle="Patterns surface gaps in help docs and product confusion"
            icon={MessageSquare}
          />
          {topQuestions.length === 0 ? (
            <EmptyCard
              icon={MessageSquare}
              title="No support questions this week."
              body="Either it's been quiet or customers are finding what they need."
            />
          ) : (
            <ul className="border border-[var(--rule)] bg-card divide-y divide-[var(--rule)]">
              {topQuestions.map(([question, count], i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 px-4 py-2.5 text-[13px]"
                >
                  <span className="font-mono text-slate-meta w-5 shrink-0 text-right">
                    {count}
                  </span>
                  <span className="text-ink">{question}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-slate-meta mt-2">
            Questions are case-normalized + truncated to ~80 chars before
            grouping; counts are approximate (variant phrasings may not
            collapse).
          </p>
        </section>

        {/* ── ONBOARDING FUNNEL ── */}
        <section>
          <SectionHeader
            title="Onboarding funnel"
            subtitle="Drop-off between sign-up and first hire"
            icon={TrendingUp}
          />
          <ul className="border border-[var(--rule)] bg-card divide-y divide-[var(--rule)]">
            <FunnelStep label="Signed up (created a DSO)" count={fnSignedUp} total={fnSignedUp} />
            <FunnelStep label="Added a location" count={fnAddedLocation} total={fnSignedUp} />
            <FunnelStep label="Posted a job" count={fnPostedJob} total={fnSignedUp} />
            <FunnelStep label="Received an application" count={fnReceivedApp} total={fnSignedUp} />
            <FunnelStep label="Multi-location (2+)" count={fnMultiLocation} total={fnSignedUp} />
            <FunnelStep label="Multi-member team (2+)" count={fnMultiMember} total={fnSignedUp} />
          </ul>
        </section>
      </div>
    </main>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Helpers + sub-components
 * ────────────────────────────────────────────────────────── */

function SummaryCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "amber";
}) {
  const toneClass =
    tone === "amber"
      ? "border-warning bg-warning-bg"
      : "border-[var(--rule)] bg-card";
  return (
    <div className={"border p-4 " + toneClass}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta">
          {label}
        </span>
        <Icon
          className={
            "size-3.5 " +
            (tone === "amber" ? "text-warning" : "text-heritage-deep")
          }
        />
      </div>
      <div className="font-display text-2xl font-extrabold tracking-[-0.4px] text-ink">
        {value}
      </div>
      {sub && (
        <div className="text-[11px] text-slate-meta mt-0.5">{sub}</div>
      )}
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  icon: Icon,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-start gap-3 mb-3 pb-2 border-b border-[var(--rule)]">
      <Icon className="size-4 text-heritage-deep mt-0.5 shrink-0" />
      <div>
        <h2 className="font-display text-lg font-bold tracking-[-0.3px] text-ink leading-tight">
          {title}
        </h2>
        <p className="text-[12px] text-slate-meta">{subtitle}</p>
      </div>
    </div>
  );
}

function EmptyCard({
  icon: Icon,
  tone,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: "heritage";
  title: string;
  body: string;
}) {
  const toneClass =
    tone === "heritage"
      ? "border-heritage/30 bg-heritage/[0.05]"
      : "border-[var(--rule)] bg-card";
  const iconColor =
    tone === "heritage" ? "text-heritage-deep" : "text-slate-meta";
  return (
    <div className={"border px-5 py-4 inline-flex items-start gap-3 " + toneClass}>
      <Icon className={"size-4 mt-0.5 shrink-0 " + iconColor} />
      <div>
        <p className="font-semibold text-ink text-[13px]">{title}</p>
        <p className="text-[12px] text-slate-meta">{body}</p>
      </div>
    </div>
  );
}

function RiskBadge({
  flag,
}: {
  flag: "stuck_onboarding" | "inactive" | "churn_risk";
}) {
  const color =
    flag === "churn_risk"
      ? "bg-danger-bg text-danger"
      : flag === "stuck_onboarding"
        ? "bg-warning-bg text-warning"
        : "bg-muted text-foreground";
  return (
    <div
      className={
        "size-6 rounded-full flex items-center justify-center shrink-0 " +
        color
      }
    >
      <AlertTriangle className="size-3.5" />
    </div>
  );
}

function RiskLabel({
  flag,
}: {
  flag: "stuck_onboarding" | "inactive" | "churn_risk";
}) {
  const label =
    flag === "churn_risk"
      ? "Churn risk"
      : flag === "stuck_onboarding"
        ? "Stuck onboarding"
        : "Inactive";
  const color =
    flag === "churn_risk"
      ? "bg-danger-bg text-danger"
      : flag === "stuck_onboarding"
        ? "bg-warning-bg text-warning"
        : "bg-muted text-foreground";
  return (
    <span
      className={
        "inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold tracking-[1px] uppercase " +
        color
      }
    >
      {label}
    </span>
  );
}

function Check({ yes }: { yes: boolean }) {
  return yes ? (
    <CheckCircle2 className="size-3.5 text-heritage-deep inline-block" />
  ) : (
    <X className="size-3.5 text-slate-meta/50 inline-block" />
  );
}

function FunnelStep({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <li className="grid grid-cols-[1fr_auto_120px] items-center gap-3 px-4 py-2.5 text-[13px]">
      <span className="text-ink">{label}</span>
      <span className="font-mono text-slate-meta tabular-nums text-[12px]">
        {count} / {total}
      </span>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-cream/60 rounded">
          <div
            className="h-2 bg-heritage rounded"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="font-mono text-slate-meta tabular-nums text-[10px] w-8 text-right">
          {pct}%
        </span>
      </div>
    </li>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Pure helpers
 * ────────────────────────────────────────────────────────── */

function bucket<T, K extends string>(
  rows: T[],
  keyFn: (row: T) => K
): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const row of rows) {
    const k = keyFn(row);
    const arr = m.get(k);
    if (arr) arr.push(row);
    else m.set(k, [row]);
  }
  return m;
}

function daysAgo(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Normalize a support question for grouping: lowercase, strip
 * punctuation, collapse whitespace, truncate. Same-pattern questions
 * collide so we can count frequencies. Imperfect — "how do i bulk
 * import locations" and "bulk locations import" still don't collide —
 * but good enough for v1 surfacing.
 */
function normalizeQuestion(raw: string): string | null {
  const stripped = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length < 3) return null;
  return stripped.length > 80 ? stripped.slice(0, 80) + "…" : stripped;
}
