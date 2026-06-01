/**
 * /employer/analytics — the Analytics Hub (Phase 0 overview).
 *
 * Absorbs the former /employer/reports (which now redirects here). This is
 * the standalone analytics destination; the dashboard stays the high-level
 * "what needs me now" launchpad and links in here for depth.
 *
 * Phase 0 ships the Overview: headline KPI cards from the new hub-metrics
 * bundle (time-to-fill + time-to-hire, offer acceptance, pipeline coverage,
 * req aging, interview conversion) over the existing funnel, source, cross-
 * location, and recruiter surfaces. Phase 1 layers in tabs + drill-down.
 *
 * Server component — RLS-gated reads via the authenticated client.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Download } from "lucide-react";
import type { Metadata } from "next";
import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getDsoAnalytics,
  getDsoCrossLocationStats,
  getRecruiterProductivity,
} from "@/lib/analytics/metrics";
import { getAnalyticsOverview } from "@/lib/analytics/hub-metrics";
import { StatCard } from "@/components/analytics/hub/stat-card";
import { FunnelChart } from "@/components/analytics/funnel-chart";
import { CrossLocationTable } from "@/components/analytics/cross-location-table";
import { RecruiterProductivityTable } from "@/components/analytics/recruiter-productivity-table";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

function fmtDays(n: number | null): string {
  return n === null ? "—" : Math.round(n).toLocaleString("en-US");
}
function fmtPct(n: number | null): string {
  return n === null ? "—" : `${Math.round(n * 100)}`;
}
function fmtRatio(n: number | null): string {
  return n === null ? "—" : n.toFixed(1);
}

export default async function AnalyticsHubPage() {
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

  const dsoId = dsoUser.dso_id as string;

  const [overview, analytics, crossLocationRows, recruiterRows] =
    await Promise.all([
      getAnalyticsOverview(supabase, dsoId, { windowDays: 90 }),
      getDsoAnalytics(supabase, dsoId),
      getDsoCrossLocationStats(supabase, dsoId),
      getRecruiterProductivity(supabase, dsoId, 30),
    ]);

  const ttf = overview.time_to_hire_fill.time_to_fill_median_days;
  const tth = overview.time_to_hire_fill.time_to_hire_median_days;
  const oar = overview.offers.acceptance_rate;
  const coverage = overview.pipeline_coverage.ratio;
  const bookRate = overview.interviews.booking_rate;
  const aging = overview.req_aging;

  return (
    <EmployerShell active="reports">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-[820px]">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
            Analytics
          </div>
          <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink mb-3">
            Your hiring, measured.
          </h1>
          <p className="text-[14px] text-slate-body leading-relaxed">
            Every metric across your jobs, locations, and recruiters — live as
            candidates apply and move through the pipeline. Last 90 days unless
            noted.
          </p>
        </div>
        <a
          href="/api/employer/applications.csv"
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-cream shrink-0"
          title="Download all applications as CSV"
        >
          <Download className="size-3.5" />
          Export CSV
        </a>
      </header>

      {/* Headline KPI grid — leading indicators first. */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--rule)] border border-[var(--rule)] mb-4">
        <div className="bg-white">
          <StatCard
            label="Pipeline coverage"
            value={fmtRatio(coverage)}
            unit={coverage !== null ? "× per open req" : undefined}
            hint={`${overview.pipeline_coverage.active_candidates} active · ${overview.pipeline_coverage.open_reqs} open reqs`}
          />
        </div>
        <div className="bg-white">
          <StatCard
            label="Open reqs · aging"
            value={aging.open_reqs.toLocaleString()}
            hint={
              aging.d90_plus > 0
                ? `${aging.d90_plus} aging past 90 days`
                : aging.oldest_days !== null
                  ? `oldest ${Math.round(aging.oldest_days)}d open`
                  : "no open reqs"
            }
          />
        </div>
        <div className="bg-white">
          <StatCard
            label="Interview booking rate"
            value={fmtPct(bookRate)}
            unit={bookRate !== null ? "%" : undefined}
            hint={`${overview.interviews.booked} booked · ${overview.interviews.proposals} proposed`}
          />
        </div>
        <div className="bg-white">
          <StatCard
            label="Offer acceptance"
            value={fmtPct(oar)}
            unit={oar !== null ? "%" : undefined}
            hint={`${overview.offers.accepted} of ${overview.offers.sent} offers`}
            benchmark="Strong: 80–90%"
          />
        </div>
        <div className="bg-white">
          <StatCard
            label="Time to fill"
            value={fmtDays(ttf)}
            unit={ttf !== null ? "days" : undefined}
            hint="posted → hired (median)"
            benchmark="Industry ~60d"
          />
        </div>
        <div className="bg-white">
          <StatCard
            label="Time to hire"
            value={fmtDays(tth)}
            unit={tth !== null ? "days" : undefined}
            hint="applied → hired (median)"
          />
        </div>
        <div className="bg-white">
          <StatCard
            label="Applications"
            value={overview.applications.toLocaleString()}
            hint="last 90 days"
          />
        </div>
        <div className="bg-white">
          <StatCard
            label="Hires"
            value={overview.hires.toLocaleString()}
            hint="last 90 days"
          />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <FunnelChart rows={analytics.funnel} title="Pipeline funnel · all jobs" />
        <SourcePerformance rows={overview.sources} />
      </div>

      <div className="mb-6">
        <OfferBreakdown offers={overview.offers} />
      </div>

      {crossLocationRows.length >= 2 && (
        <div className="mb-6">
          <CrossLocationTable rows={crossLocationRows} />
        </div>
      )}

      {recruiterRows.length >= 1 && (
        <div className="mb-6">
          <RecruiterProductivityTable rows={recruiterRows} windowDays={30} />
        </div>
      )}

      <section className="border border-[var(--rule)] bg-cream/40 p-6">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Public report
        </div>
        <h2 className="text-lg font-extrabold tracking-[-0.3px] text-ink mb-2">
          Dental Hiring Report · 2026
        </h2>
        <p className="text-[13px] text-slate-body leading-relaxed max-w-[560px] mb-3">
          Anonymized, continuously-updated industry trend report drawn from the
          DSO Hire platform: compensation bands by role, role mix, top states,
          time-to-fill. Public-facing and SEO-indexed.
        </p>
        <Link
          href="/dental-hiring-report"
          className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink"
        >
          View the report <ArrowRight className="h-3 w-3" />
        </Link>
      </section>
    </EmployerShell>
  );
}

/* ───── Source performance table ───── */

function SourcePerformance({
  rows,
}: {
  rows: Array<{
    source: string;
    applications: number;
    hires: number;
    apps_per_hire: number | null;
    hire_rate: number | null;
  }>;
}) {
  return (
    <section className="border border-[var(--rule)] bg-white p-6">
      <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
        Source performance · last 90 days
      </div>
      {rows.length === 0 ? (
        <p className="text-[13px] text-slate-meta italic">
          No applications yet. Source data appears as candidates apply.
        </p>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[10px] font-bold tracking-[1px] uppercase text-slate-meta border-b border-[var(--rule)]">
              <th className="text-left py-2">Source</th>
              <th className="text-right py-2">Apps</th>
              <th className="text-right py-2">Hires</th>
              <th className="text-right py-2">Apps / hire</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((r) => (
              <tr key={r.source} className="border-b border-[var(--rule)] last:border-0">
                <td className="py-2 text-ink font-medium truncate max-w-[180px]">
                  {r.source}
                </td>
                <td className="py-2 text-right tabular-nums text-ink">
                  {r.applications.toLocaleString()}
                </td>
                <td className="py-2 text-right tabular-nums text-ink">
                  {r.hires.toLocaleString()}
                </td>
                <td className="py-2 text-right tabular-nums text-slate-body">
                  {r.apps_per_hire !== null ? Math.round(r.apps_per_hire) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/* ───── Offer breakdown ───── */

function OfferBreakdown({
  offers,
}: {
  offers: {
    sent: number;
    accepted: number;
    declined: number;
    pending: number;
    acceptance_rate: number | null;
    avg_days_to_response: number | null;
    decline_reasons: Array<{ reason: string; count: number }>;
  };
}) {
  return (
    <section className="border border-[var(--rule)] bg-white p-6">
      <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
        Offers · last 90 days
      </div>
      {offers.sent === 0 ? (
        <p className="text-[13px] text-slate-meta italic">
          No offers sent yet. Offer analytics appear once you extend offers.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Sent" value={offers.sent} />
          <Stat label="Accepted" value={offers.accepted} />
          <Stat label="Declined" value={offers.declined} />
          <Stat
            label="Avg response"
            value={
              offers.avg_days_to_response !== null
                ? `${Math.round(offers.avg_days_to_response)}d`
                : "—"
            }
          />
          {offers.decline_reasons.length > 0 && (
            <div className="col-span-2 sm:col-span-4 mt-2 pt-3 border-t border-[var(--rule)]">
              <div className="text-[10px] font-bold tracking-[1px] uppercase text-slate-meta mb-2">
                Why offers were declined
              </div>
              <div className="flex flex-wrap gap-2">
                {offers.decline_reasons.map((d) => (
                  <span
                    key={d.reason}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-cream border border-[var(--rule)] text-[12px] text-ink"
                  >
                    {d.reason}
                    <span className="font-bold tabular-nums text-slate-meta">
                      {d.count}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[10px] font-bold tracking-[1px] uppercase text-slate-meta mb-1">
        {label}
      </div>
      <div className="text-[24px] font-extrabold tabular-nums text-ink leading-none">
        {typeof value === "number" ? value.toLocaleString("en-US") : value}
      </div>
    </div>
  );
}
