/**
 * /admin/analytics — Vantage founder dashboard (build spec §7).
 *
 * Founder-only (superadmin gate). The cockpit: where leads come from, which
 * pages convert, where the funnel leaks, and what each channel produced —
 * first-party + cookieless, no third-party tracker.
 *
 * All data is AGGREGATE and read via service_role-only RPCs (the analytics
 * schema is off the REST surface). Nothing here surfaces a raw visitor row,
 * PII, or anything EEO; channel attribution never links anonymous browsing to
 * an account.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Globe, MousePointerClick, Users } from "lucide-react";
import { requireSuperadmin } from "@/lib/admin/gate";
import { ANALYTICS_PRODUCT_NAME } from "@/lib/analytics/product";
import {
  loadVantageOverview,
  loadVantageChannels,
  loadVantageTopPages,
  loadVantageGoals,
  loadVantageLoop,
  goalVisitors,
  type VantageOverview,
} from "@/lib/analytics/vantage-dashboard";

export const metadata: Metadata = {
  title: `${ANALYTICS_PRODUCT_NAME} · Admin`,
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ days?: string }>;
}

const WINDOWS = [7, 30] as const;

export default async function VantageDashboard({ searchParams }: PageProps) {
  await requireSuperadmin("/admin/analytics");

  const sp = await searchParams;
  const days = sp.days === "7" ? 7 : 30;

  const [overview, channels, pages, goals, loop] = await Promise.all([
    loadVantageOverview(),
    loadVantageChannels(days),
    loadVantageTopPages(days, 15),
    loadVantageGoals(days),
    loadVantageLoop(),
  ]);

  const windowVisitors =
    days === 7 ? overview.last7.visitors : overview.last30.visitors;

  const employerFunnel = [
    { label: "Visitors", count: windowVisitors },
    { label: "Employer sign-up", count: goalVisitors(goals, "signup_employer") },
    { label: "Job posted", count: goalVisitors(goals, "job_post_create") },
    { label: "Checkout started", count: goalVisitors(goals, "checkout_start") },
    { label: "Paid", count: goalVisitors(goals, "checkout_success") },
  ];
  const candidateFunnel = [
    { label: "Visitors", count: windowVisitors },
    { label: "Candidate sign-up", count: goalVisitors(goals, "signup_candidate") },
    { label: "Assessment done", count: goalVisitors(goals, "assessment_complete") },
    { label: "Application sent", count: goalVisitors(goals, "apply_submit") },
  ];

  return (
    <div className="mx-auto max-w-[1100px]">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-1">
            Founder analytics · first-party · cookieless
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-[-1px] text-ink">
            {ANALYTICS_PRODUCT_NAME}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {WINDOWS.map((w) => (
            <Link
              key={w}
              href={`/admin/analytics?days=${w}`}
              className={`px-3 py-1.5 text-[11px] font-bold tracking-[1.5px] uppercase border transition-colors ${
                days === w
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-[var(--rule-strong)] text-slate-body hover:bg-cream/60"
              }`}
            >
              {w}d
            </Link>
          ))}
        </div>
      </div>

      {/* Live now */}
      <div className="mt-6 inline-flex items-center gap-2 border border-[var(--rule)] bg-card px-4 py-2">
        <Activity className="h-4 w-4 text-heritage" />
        <span className="text-[13px] text-slate-body">
          <span className="font-extrabold text-ink">{overview.live5min}</span>{" "}
          visitor{overview.live5min === 1 ? "" : "s"} in the last 5 min
        </span>
      </div>

      {/* Top-line stat cards */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <TopLineCard label="Today" win={overview.today} />
        <TopLineCard label="Last 7 days" win={overview.last7} />
        <TopLineCard label="Last 30 days" win={overview.last30} />
      </div>

      {/* Acquisition by channel */}
      <Section title={`Acquisition by channel · last ${days} days`}>
        {channels.length === 0 ? (
          <Empty>No pageviews yet in this window.</Empty>
        ) : (
          <div className="space-y-2">
            {channels.map((c) => {
              const max = channels[0].visitors || 1;
              const pct = Math.round((c.visitors / max) * 100);
              return (
                <div key={c.channel} className="flex items-center gap-3">
                  <div className="w-36 shrink-0 text-[13px] text-ink font-semibold truncate">
                    {c.channel}
                  </div>
                  <div className="flex-1 h-5 bg-cream/60 relative">
                    <div
                      className="h-full bg-heritage/70"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="w-28 shrink-0 text-right text-[12px] text-slate-meta tabular-nums">
                    <span className="text-ink font-bold">{c.visitors}</span> vis ·{" "}
                    {c.pageviews} pv
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Funnels */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Funnel title={`Employer funnel · last ${days} days`} rows={employerFunnel} />
        <Funnel title={`Candidate funnel · last ${days} days`} rows={candidateFunnel} />
      </div>

      {/* Top pages */}
      <Section title={`Top pages · last ${days} days`}>
        {pages.length === 0 ? (
          <Empty>No pageviews yet in this window.</Empty>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta border-b border-[var(--rule)]">
                <th className="text-left py-2 font-bold">Path</th>
                <th className="text-right py-2 font-bold">Pageviews</th>
                <th className="text-right py-2 font-bold">Visitors</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.path} className="border-b border-[var(--rule)]/60">
                  <td className="py-1.5 text-ink font-mono text-[12px] truncate max-w-[520px]">
                    {p.path}
                  </td>
                  <td className="py-1.5 text-right text-ink font-semibold tabular-nums">
                    {p.pageviews}
                  </td>
                  <td className="py-1.5 text-right text-slate-body tabular-nums">
                    {p.visitors}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Closed-loop conversions by channel */}
      <Section title="Closed loop · signups & paying by channel (all-time)">
        {loop.length === 0 ? (
          <Empty>No signups recorded yet.</Empty>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta border-b border-[var(--rule)]">
                <th className="text-left py-2 font-bold">Channel</th>
                <th className="text-right py-2 font-bold">Employer signups</th>
                <th className="text-right py-2 font-bold">Paying</th>
                <th className="text-right py-2 font-bold">Candidate signups</th>
              </tr>
            </thead>
            <tbody>
              {loop.map((r) => (
                <tr key={r.channel} className="border-b border-[var(--rule)]/60">
                  <td className="py-1.5 text-ink font-semibold">{r.channel}</td>
                  <td className="py-1.5 text-right text-ink tabular-nums">
                    {r.employer_signups}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    <span className="text-heritage-deep font-bold">
                      {r.employer_paying}
                    </span>
                  </td>
                  <td className="py-1.5 text-right text-slate-body tabular-nums">
                    {r.candidate_signups}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <p className="mt-8 text-[11px] text-slate-meta leading-relaxed">
        {ANALYTICS_PRODUCT_NAME} is first-party + cookieless. Visitors are counted
        via a daily-rotating salted hash (no cookies, no cross-day/-site
        identity); raw IP &amp; User-Agent are never stored. Channel attribution
        is aggregate-only and never links anonymous browsing to an account.
      </p>
    </div>
  );
}

/* ───────────── presentational helpers ───────────── */

function TopLineCard({ label, win }: { label: string; win: VantageOverview["today"] }) {
  return (
    <div className="border border-[var(--rule)] bg-card p-5">
      <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep mb-3">
        {label}
      </div>
      <div className="flex items-center gap-5">
        <div>
          <div className="flex items-center gap-1.5 text-slate-meta text-[11px] mb-0.5">
            <Users className="h-3.5 w-3.5" /> Visitors
          </div>
          <div className="text-2xl font-extrabold tracking-[-0.5px] text-ink tabular-nums">
            {win.visitors}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-slate-meta text-[11px] mb-0.5">
            <MousePointerClick className="h-3.5 w-3.5" /> Pageviews
          </div>
          <div className="text-2xl font-extrabold tracking-[-0.5px] text-ink tabular-nums">
            {win.pageviews}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 border border-[var(--rule)] bg-card p-6">
      <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
        {title}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-slate-meta italic">{children}</p>;
}

function Funnel({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; count: number }[];
}) {
  const top = rows[0]?.count || 0;
  return (
    <section className="border border-[var(--rule)] bg-card p-6">
      <div className="flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
        <Globe className="h-3.5 w-3.5" /> {title}
      </div>
      <div className="space-y-2.5">
        {rows.map((r, i) => {
          const widthPct = top > 0 ? Math.max((r.count / top) * 100, 2) : 2;
          const prev = i > 0 ? rows[i - 1].count : null;
          const stepPct =
            prev && prev > 0 ? Math.round((r.count / prev) * 100) : null;
          return (
            <div key={r.label}>
              <div className="flex items-center justify-between text-[12px] mb-1">
                <span className="text-ink font-semibold">{r.label}</span>
                <span className="text-slate-meta tabular-nums">
                  <span className="text-ink font-bold">{r.count}</span>
                  {stepPct !== null && (
                    <span className="ml-2 text-slate-meta">{stepPct}%</span>
                  )}
                </span>
              </div>
              <div className="h-4 bg-cream/60">
                <div
                  className="h-full bg-heritage/70"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
