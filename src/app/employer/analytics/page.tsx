/**
 * /employer/analytics — the Analytics Hub.
 *
 * Absorbs the former /employer/reports. Standalone analytics destination;
 * the dashboard stays the high-level launchpad and links in here.
 *
 * Phase 1: tabbed IA (Overview / Funnel & velocity / Sources / Offers /
 * Locations) over a date-window filter (?window=30|90|365). Each tab reads
 * the location-scopable hub-metrics bundle. Drill-down + export + the
 * remaining tabs (Benchmarks, Compliance) land in later phases.
 *
 * Server component — RLS-gated reads via the authenticated client.
 */

import type { ComponentProps } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Download } from "lucide-react";
import type { Metadata } from "next";
import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getDsoCrossLocationStats,
  getRecruiterProductivity,
} from "@/lib/analytics/metrics";
import {
  getAnalyticsOverview,
  type AnalyticsOverview,
} from "@/lib/analytics/hub-metrics";
import { StatCard } from "@/components/analytics/hub/stat-card";
import { TrendChart } from "@/components/analytics/hub/trend-chart";
import { LocationFilter } from "@/components/analytics/hub/location-filter";
import { PortfolioTable } from "@/components/analytics/hub/portfolio-table";
import { BulletBar } from "@/components/analytics/hub/bullet-bar";
import { AnalyticsNarrative } from "@/components/analytics/hub/analytics-narrative";
import {
  getPayBenchmarks,
  getVacancyCost,
  type PayBenchmarkRow,
  type VacancyCostResult,
} from "@/lib/analytics/benchmarks";
import { FunnelChart } from "@/components/analytics/funnel-chart";
import { RecruiterProductivityTable } from "@/components/analytics/recruiter-productivity-table";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

type TabId =
  | "overview"
  | "funnel"
  | "sources"
  | "offers"
  | "locations"
  | "benchmarks";
const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "funnel", label: "Funnel & velocity" },
  { id: "sources", label: "Sources" },
  { id: "offers", label: "Offers" },
  { id: "locations", label: "Locations" },
  { id: "benchmarks", label: "Benchmarks" },
];

const WINDOWS: Array<{ value: string; days: number; label: string }> = [
  { value: "30", days: 30, label: "30 days" },
  { value: "90", days: 90, label: "90 days" },
  { value: "365", days: 365, label: "12 months" },
];

function fmtDays(n: number | null): string {
  return n === null ? "—" : Math.round(n).toLocaleString("en-US");
}
function fmtPct(n: number | null): string {
  return n === null ? "—" : `${Math.round(n * 100)}`;
}
function fmtRatio(n: number | null): string {
  return n === null ? "—" : n.toFixed(1);
}

interface PageProps {
  searchParams: Promise<{ tab?: string; window?: string; loc?: string }>;
}

export default async function AnalyticsHubPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const tab: TabId =
    (TABS.find((t) => t.id === sp.tab)?.id as TabId) ?? "overview";
  const win = WINDOWS.find((w) => w.value === sp.window) ?? WINDOWS[1];
  const loc = (sp.loc ?? "").trim();

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

  const [overview, crossLocationRows, recruiterRows] = await Promise.all([
    getAnalyticsOverview(supabase, dsoId, {
      windowDays: win.days,
      locationIds: loc ? [loc] : undefined,
    }),
    getDsoCrossLocationStats(supabase, dsoId),
    getRecruiterProductivity(supabase, dsoId, 30),
  ]);

  // Benchmarks tab pulls its own (heavier) data only when active.
  let payBenchmarks: PayBenchmarkRow[] = [];
  let vacancyCost: VacancyCostResult | null = null;
  if (tab === "benchmarks") {
    [payBenchmarks, vacancyCost] = await Promise.all([
      getPayBenchmarks(supabase, dsoId),
      getVacancyCost(supabase, dsoId),
    ]);
  }

  const scopedLocation = loc
    ? crossLocationRows.find((r) => r.location_id === loc) ?? null
    : null;
  const locSuffix = loc ? `&loc=${loc}` : "";
  const hrefFor = (t: TabId) =>
    `/employer/analytics?tab=${t}&window=${win.value}${locSuffix}`;
  const winHref = (w: string) =>
    `/employer/analytics?tab=${tab}&window=${w}${locSuffix}`;

  return (
    <EmployerShell active="reports">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-[820px]">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
            Analytics
          </div>
          <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink mb-3">
            Your hiring, measured.
          </h1>
          <p className="text-[14px] text-slate-body leading-relaxed">
            Every metric across your jobs, locations, and recruiters — live as
            candidates apply and move through the pipeline.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/api/employer/analytics.csv"
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-cream"
            title="Download per-practice analytics as CSV"
          >
            <Download className="size-3.5" />
            Practices CSV
          </a>
          <a
            href="/api/employer/applications.csv"
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-cream"
            title="Download all applications as CSV"
          >
            <Download className="size-3.5" />
            Applications CSV
          </a>
        </div>
      </header>

      {/* Tab bar + window selector */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule)]">
        <nav className="flex flex-wrap -mb-px">
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <Link
                key={t.id}
                href={hrefFor(t.id)}
                className={
                  "px-4 py-3 text-[12px] font-bold tracking-[0.5px] border-b-2 transition-colors " +
                  (active
                    ? "border-heritage text-ink"
                    : "border-transparent text-slate-meta hover:text-ink hover:border-[var(--rule-strong)]")
                }
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 pb-2">
          <LocationFilter
            locations={crossLocationRows.map((r) => ({
              id: r.location_id,
              name: r.name,
              city: r.city,
            }))}
            value={loc}
            tab={tab}
            window={win.value}
          />
          <div className="flex items-center gap-1">
            {WINDOWS.map((w) => {
              const active = w.value === win.value;
              return (
                <Link
                  key={w.value}
                  href={winHref(w.value)}
                  className={
                    "px-3 py-1.5 text-[11px] font-semibold border transition-colors " +
                    (active
                      ? "bg-ink text-ivory border-ink"
                      : "bg-white text-slate-body border-[var(--rule-strong)] hover:border-ink")
                  }
                >
                  {w.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {scopedLocation && (
        <div className="mb-6 -mt-2 flex items-center gap-2 text-[12px] text-slate-body">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-cream border border-[var(--rule-strong)]">
            <span className="font-semibold text-ink">
              {scopedLocation.name}
            </span>
            {scopedLocation.city ? ` · ${scopedLocation.city}` : ""}
          </span>
          <Link
            href={`/employer/analytics?tab=${tab}&window=${win.value}`}
            className="text-heritage-deep hover:text-ink font-semibold underline"
          >
            Clear · all practices
          </Link>
        </div>
      )}

      {tab === "overview" && (
        <>
          <AnalyticsNarrative windowDays={win.days} loc={loc || null} />
          <OverviewTab
            overview={overview}
            funnel={overview.funnel}
            recruiterRows={recruiterRows}
          />
        </>
      )}
      {tab === "funnel" && (
        <FunnelTab overview={overview} funnel={overview.funnel} />
      )}
      {tab === "sources" && <SourcesTab overview={overview} />}
      {tab === "offers" && <OffersTab overview={overview} />}
      {tab === "locations" && (
        <LocationsTab rows={crossLocationRows} window={win.value} />
      )}
      {tab === "benchmarks" && (
        <BenchmarksTab pay={payBenchmarks} vacancy={vacancyCost} />
      )}
    </EmployerShell>
  );
}

/* ───────────────────────── Tabs ───────────────────────── */

function KpiGrid({ overview }: { overview: AnalyticsOverview }) {
  const ttf = overview.time_to_hire_fill.time_to_fill_median_days;
  const tth = overview.time_to_hire_fill.time_to_hire_median_days;
  const oar = overview.offers.acceptance_rate;
  const coverage = overview.pipeline_coverage.ratio;
  const bookRate = overview.interviews.booking_rate;
  const aging = overview.req_aging;
  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <StatCard
        label="Pipeline coverage"
        value={fmtRatio(coverage)}
        unit={coverage !== null ? "× per open req" : undefined}
        hint={`${overview.pipeline_coverage.active_candidates} active · ${overview.pipeline_coverage.open_reqs} open reqs`}
        href="/employer/applications"
      />
      <StatCard
        label="Open reqs · aging"
        value={aging.open_reqs.toLocaleString()}
        hint={
          aging.buckets.d90_plus > 0
            ? `${aging.buckets.d90_plus} aging past 90 days`
            : aging.oldest_days !== null
              ? `oldest ${Math.round(aging.oldest_days)}d open`
              : "no open reqs"
        }
        href="/employer/jobs?status=active"
      />
      <StatCard
        label="Interview booking rate"
        value={fmtPct(bookRate)}
        unit={bookRate !== null ? "%" : undefined}
        hint={`${overview.interviews.booked} booked · ${overview.interviews.proposals} proposed`}
      />
      <StatCard
        label="Offer acceptance"
        value={fmtPct(oar)}
        unit={oar !== null ? "%" : undefined}
        hint={`${overview.offers.accepted} of ${overview.offers.sent} offers`}
        benchmark="Strong: 80–90%"
      />
      <StatCard
        label="Time to fill"
        value={fmtDays(ttf)}
        unit={ttf !== null ? "days" : undefined}
        hint="posted → hired (median)"
        benchmark="Industry ~60d"
      />
      <StatCard
        label="Time to hire"
        value={fmtDays(tth)}
        unit={tth !== null ? "days" : undefined}
        hint="applied → hired (median)"
      />
      <StatCard
        label="Applications"
        value={overview.applications.toLocaleString()}
        hint={`last ${overview.window_days} days`}
        href="/employer/applications"
      />
      <StatCard
        label="Hires"
        value={overview.hires.toLocaleString()}
        hint={`last ${overview.window_days} days`}
        href="/employer/applications?stage=hired"
      />
    </section>
  );
}

function OverviewTab({
  overview,
  funnel,
  recruiterRows,
}: {
  overview: AnalyticsOverview;
  funnel: ComponentProps<typeof FunnelChart>["rows"];
  recruiterRows: ComponentProps<typeof RecruiterProductivityTable>["rows"];
}) {
  return (
    <>
      <KpiGrid overview={overview} />
      <div className="mb-6">
        <TrendChart
          title={`Applications & hires · last ${overview.window_days} days`}
          series={[
            {
              label: "Applications",
              color: "var(--color-heritage, #4D7A60)",
              data: overview.trends.applications,
            },
            { label: "Hires", color: "#14233F", data: overview.trends.hires },
          ]}
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <FunnelChart rows={funnel} title="Pipeline funnel · all jobs" />
        <SourcePerformance rows={overview.sources} />
      </div>
      {recruiterRows.length >= 1 && (
        <div className="mb-6">
          <RecruiterProductivityTable rows={recruiterRows} windowDays={30} />
        </div>
      )}
      <PublicReportCallout />
    </>
  );
}

function FunnelTab({
  overview,
  funnel,
}: {
  overview: AnalyticsOverview;
  funnel: ComponentProps<typeof FunnelChart>["rows"];
}) {
  const t = overview.time_to_hire_fill;
  return (
    <>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Time to fill · median"
          value={fmtDays(t.time_to_fill_median_days)}
          unit={t.time_to_fill_median_days !== null ? "days" : undefined}
          hint={`mean ${fmtDays(t.time_to_fill_avg_days)}d · posted → hired`}
          benchmark="Industry ~60d"
        />
        <StatCard
          label="Time to hire · median"
          value={fmtDays(t.time_to_hire_median_days)}
          unit={t.time_to_hire_median_days !== null ? "days" : undefined}
          hint={`mean ${fmtDays(t.time_to_hire_avg_days)}d · applied → hired`}
        />
        <StatCard
          label="Time to first response"
          value={fmtDays(overview.time_to_first_response.median_days)}
          unit={
            overview.time_to_first_response.median_days !== null
              ? "days"
              : undefined
          }
          hint={`${overview.time_to_first_response.responded} of ${overview.time_to_first_response.total} apps · median`}
        />
        <StatCard
          label="Pipeline coverage"
          value={fmtRatio(overview.pipeline_coverage.ratio)}
          unit={overview.pipeline_coverage.ratio !== null ? "×" : undefined}
          hint={`${overview.pipeline_coverage.active_candidates} active candidates`}
        />
      </section>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FunnelChart rows={funnel} title="Pipeline funnel · all jobs" />
        <ReqAgingCard aging={overview.req_aging} />
      </div>
    </>
  );
}

function SourcesTab({ overview }: { overview: AnalyticsOverview }) {
  const tof = overview.top_of_funnel;
  return (
    <>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Application completion"
          value={fmtPct(tof.completion_rate)}
          unit={tof.completion_rate !== null ? "%" : undefined}
          hint={`${tof.submitted} submitted · ${tof.starts} started`}
          benchmark="Industry avg ~11%"
        />
        <StatCard
          label="Applications"
          value={overview.applications.toLocaleString()}
          hint={`last ${overview.window_days} days`}
        />
        <StatCard
          label="Hires"
          value={overview.hires.toLocaleString()}
          hint={`last ${overview.window_days} days`}
        />
        <StatCard
          label="Apps per hire"
          value={
            overview.hires > 0
              ? Math.round(overview.applications / overview.hires).toLocaleString()
              : "—"
          }
          hint="overall efficiency"
        />
      </section>
      <div className="max-w-[760px]">
        <SourcePerformance rows={overview.sources} showAll />
      </div>
    </>
  );
}

function OffersTab({ overview }: { overview: AnalyticsOverview }) {
  return (
    <div className="max-w-[760px]">
      <OfferBreakdown offers={overview.offers} />
    </div>
  );
}

function LocationsTab({
  rows,
  window,
}: {
  rows: ComponentProps<typeof PortfolioTable>["rows"];
  window: string;
}) {
  if (rows.length < 2) {
    return (
      <p className="text-[13px] text-slate-meta italic">
        Location comparison appears once you have jobs across two or more
        practices.
      </p>
    );
  }
  return <PortfolioTable rows={rows} window={window} />;
}

function BenchmarksTab({
  pay,
  vacancy,
}: {
  pay: PayBenchmarkRow[];
  vacancy: VacancyCostResult | null;
}) {
  const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  const openSeats = vacancy
    ? vacancy.hygiene_open + vacancy.dentist_open
    : 0;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="border border-[var(--rule)] bg-white p-6">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1">
          Your pay vs. market
        </div>
        <p className="text-[12px] text-slate-body leading-snug mb-3">
          Your average offered pay against the BLS OEWS median for each role.
          The marker is the market median; the bar is your average.
        </p>
        {pay.map((r) => {
          const caption =
            r.market_hourly != null
              ? `Market median ${usd(r.market_hourly)}/hr (${
                  r.market_scope === "state"
                    ? `${r.market_state} · `
                    : "national · "
                }BLS OEWS ${r.vintage})${
                  r.your_job_count > 0
                    ? ` · your avg from ${r.your_job_count} posting${r.your_job_count === 1 ? "" : "s"}`
                    : " · no active postings to compare"
                }`
              : "No market data for this role.";
          return (
            <BulletBar
              key={r.role}
              label={r.label}
              yourValue={r.your_hourly}
              marketValue={r.market_hourly}
              caption={caption}
            />
          );
        })}
        <p className="mt-3 text-[11px] text-slate-meta leading-snug">
          BLS OEWS employee medians (a lagging government survey). Temp/1099 day
          rates often run higher, and state figures mask metro and cost-of-living
          variation. Directional guide, not legal/comp advice.
        </p>
      </section>

      <section className="border border-[var(--rule)] bg-white p-6">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1">
          Cost of open chairs
        </div>
        <p className="text-[12px] text-slate-body leading-snug mb-4">
          Estimated production lost each month while clinical seats sit unfilled
          — the dollar case for hiring speed.
        </p>
        {vacancy && openSeats > 0 ? (
          <>
            <div className="text-[28px] font-extrabold tracking-[-0.8px] text-ink leading-none">
              {usd(vacancy.monthly_low)}
              <span className="text-slate-meta font-bold"> – </span>
              {usd(vacancy.monthly_high)}
              <span className="ml-2 text-[13px] font-semibold text-slate-meta">
                / month
              </span>
            </div>
            <div className="mt-4 space-y-1.5 text-[13px] text-slate-body">
              {vacancy.hygiene_open > 0 && (
                <div>
                  <span className="font-bold text-ink">
                    {vacancy.hygiene_open}
                  </span>{" "}
                  open hygiene seat{vacancy.hygiene_open === 1 ? "" : "s"} · ~$15K–$25K each
                </div>
              )}
              {vacancy.dentist_open > 0 && (
                <div>
                  <span className="font-bold text-ink">
                    {vacancy.dentist_open}
                  </span>{" "}
                  open dentist seat{vacancy.dentist_open === 1 ? "" : "s"} · ~$70K–$100K each
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-[13px] text-slate-meta italic">
            No open hygienist or dentist reqs right now — nothing to estimate.
          </p>
        )}
        <p className="mt-4 text-[11px] text-slate-meta leading-snug">
          Industry estimate (not government data): hygiene seat ≈ $1,000–$1,500
          production/day, dentist seat ≈ $3,500–$5,000/day. Your practice&apos;s
          actual figures may differ.
        </p>
      </section>
    </div>
  );
}

/* ───────────────────────── Pieces ───────────────────────── */

function ReqAgingCard({
  aging,
}: {
  aging: AnalyticsOverview["req_aging"];
}) {
  const b = aging.buckets;
  const total = b.d0_30 + b.d31_60 + b.d61_90 + b.d90_plus;
  const segs = [
    { label: "0–30d", n: b.d0_30, color: "var(--color-heritage, #4D7A60)" },
    { label: "31–60d", n: b.d31_60, color: "#8db8a3" },
    { label: "61–90d", n: b.d61_90, color: "#EF9F27" },
    { label: "90+d", n: b.d90_plus, color: "#D85A30" },
  ];
  return (
    <section className="border border-[var(--rule)] bg-white p-6">
      <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
        Open requisitions by age
      </div>
      {total === 0 ? (
        <p className="text-[13px] text-slate-meta italic">No open reqs.</p>
      ) : (
        <>
          <div className="flex h-3 w-full overflow-hidden mb-4 border border-[var(--rule)]">
            {segs.map(
              (s) =>
                s.n > 0 && (
                  <div
                    key={s.label}
                    style={{
                      width: `${(s.n / total) * 100}%`,
                      background: s.color,
                    }}
                    title={`${s.label}: ${s.n}`}
                  />
                )
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {segs.map((s) => (
              <div key={s.label}>
                <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[1px] uppercase text-slate-meta mb-1">
                  <span
                    className="inline-block h-2 w-2"
                    style={{ background: s.color }}
                  />
                  {s.label}
                </div>
                <div className="text-[20px] font-extrabold tabular-nums text-ink leading-none">
                  {s.n}
                </div>
              </div>
            ))}
          </div>
          {aging.oldest_days !== null && (
            <p className="mt-4 text-[12px] text-slate-body">
              Oldest open req:{" "}
              <span className="font-bold text-ink">
                {Math.round(aging.oldest_days)} days
              </span>
              {aging.avg_age_days !== null && (
                <>
                  {" "}
                  · average{" "}
                  <span className="font-bold text-ink">
                    {Math.round(aging.avg_age_days)} days
                  </span>
                </>
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function SourcePerformance({
  rows,
  showAll = false,
}: {
  rows: AnalyticsOverview["sources"];
  showAll?: boolean;
}) {
  const display = showAll ? rows : rows.slice(0, 8);
  return (
    <section className="border border-[var(--rule)] bg-white p-6">
      <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
        Source performance
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
            {display.map((r) => (
              <tr
                key={r.source}
                className="border-b border-[var(--rule)] last:border-0"
              >
                <td className="py-2 text-ink font-medium truncate max-w-[200px]">
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

function OfferBreakdown({
  offers,
}: {
  offers: AnalyticsOverview["offers"];
}) {
  return (
    <section className="border border-[var(--rule)] bg-white p-6">
      <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
        Offers
      </div>
      {offers.sent === 0 ? (
        <p className="text-[13px] text-slate-meta italic">
          No offers sent yet. Offer analytics appear once you extend offers.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MiniStat label="Sent" value={offers.sent} />
          <MiniStat label="Accepted" value={offers.accepted} />
          <MiniStat label="Declined" value={offers.declined} />
          <MiniStat
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

function MiniStat({ label, value }: { label: string; value: string | number }) {
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

function PublicReportCallout() {
  return (
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
  );
}
