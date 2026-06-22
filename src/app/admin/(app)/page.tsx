/**
 * /admin — the founder "Today" cockpit (Tranche 1, Phase 1).
 *
 * Two zones: a platform-wide North-Star strip, and a "Needs you now" triage
 * queue (each row = count + deep link). Tier-1 (any internal staff) — the
 * (app) layout already gates admin_users. Aggregate-only; no PII/EEO.
 */

import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import { StatCard, type StatDelta } from "@/components/analytics/hub/stat-card";
import {
  getCommandCenterSnapshot,
  type QueueRow,
} from "@/lib/admin/command-center";

export const metadata: Metadata = {
  title: "Command · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

function wowDelta(now: number, prev: number): StatDelta | undefined {
  if (prev === 0) {
    return now > 0 ? { label: `+${now}`, direction: "up", goodWhenUp: true } : undefined;
  }
  const pct = Math.round(((now - prev) / prev) * 100);
  return {
    label: `${pct >= 0 ? "+" : ""}${pct}% WoW`,
    direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat",
    goodWhenUp: true,
  };
}

function usd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

export default async function AdminCommandCenter() {
  const { northStar: n, queue, trafficSpark } = await getCommandCenterSnapshot();

  return (
    <>
      <header className="mb-8">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          Founder cockpit
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink">
          Today
        </h1>
        <p className="mt-3 text-[14px] text-slate-body leading-relaxed max-w-[640px]">
          Platform pulse + what needs you now. First-party data, founder-only.
        </p>
      </header>

      {/* North-Star strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-10">
        <StatCard
          label="Active DSOs"
          value={String(n.activeDsos)}
          hint={`${n.pendingDsos} pending verification`}
          href="/admin/dsos?status=active"
        />
        <StatCard
          label="Paying subscriptions"
          value={String(n.payingSubscriptions)}
          hint={`${n.trials} trialing`}
        />
        <StatCard
          label="MRR (est.)"
          value={usd(n.mrrCents)}
          hint="Monthly list price of active plans"
        />
        <StatCard
          label="Active jobs"
          value={String(n.activeJobs)}
          hint="Open roles across the platform"
        />
        <StatCard
          label="Searchable candidates"
          value={String(n.searchableCandidates)}
          hint="Opted into discovery"
        />
        <StatCard
          label="Applications · 7d"
          value={String(n.applications7d)}
          hint={`${n.applications30d} in last 30d`}
          delta={wowDelta(n.applications7d, n.applicationsPrev7d)}
        />
        <StatCard
          label="Site traffic · 7d"
          value={String(n.pageviews7d)}
          hint="Pageviews (last 14d trend)"
          spark={trafficSpark}
          href="/admin/analytics"
        />
      </div>

      {/* Needs you now */}
      <section>
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
          Needs you now
        </div>
        {queue.every((r) => r.count === 0) ? (
          <div className="flex items-center gap-2.5 border border-[var(--rule)] bg-card p-6 text-[14px] text-slate-body">
            <CheckCircle2 className="h-5 w-5 text-heritage-deep" />
            All clear — nothing in the queue right now.
          </div>
        ) : (
          <ul className="list-none border border-[var(--rule)] divide-y divide-[var(--rule)]">
            {queue.map((row) => (
              <QueueItem key={row.key} row={row} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function QueueItem({ row }: { row: QueueRow }) {
  const muted = row.count === 0;
  return (
    <li>
      <Link
        href={row.href}
        className={`flex items-center justify-between gap-4 px-5 py-4 transition-colors group ${
          muted ? "bg-card hover:bg-cream/40" : "bg-card hover:bg-cream/60"
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center justify-center min-w-[2.25rem] h-9 px-2 text-[15px] font-extrabold tabular-nums ${
              muted
                ? "text-slate-meta bg-cream"
                : row.tone === "warn"
                  ? "text-danger bg-danger/10"
                  : "text-heritage-deep bg-heritage/10"
            }`}
          >
            {row.count}
          </span>
          <span
            className={`text-[14px] font-semibold ${
              muted ? "text-slate-meta" : "text-ink"
            }`}
          >
            {row.label}
          </span>
        </div>
        <ArrowRight className="h-4 w-4 text-slate-meta group-hover:text-ink transition-colors" />
      </Link>
    </li>
  );
}
