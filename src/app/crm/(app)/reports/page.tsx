import Link from "next/link";
import { crmPageGate } from "@/lib/crm/auth";
import BarRows, { type BarDatum } from "../BarRow";
import EmptyState from "../EmptyState";
import {
  LEAD_KIND_LABELS,
  LOST_REASONS,
  SALES_LEAD_KINDS,
  SOURCE_LABELS,
  channelOf,
  fmtMoney,
  nowMs,
  oppAcv,
  oppMrr,
  parseStageWeights,
  stageLabel,
  TEMPLATE_STAGES,
  todayIso,
  weightedAcv,
} from "../format";
import {
  currentStageAge,
  funnel,
  medianDaysByStage,
  stageHistory,
  winLoss,
  type MEvent,
  type MOpp,
} from "./metrics";

export const metadata = { title: "Reports" };

/*
 * Reporting, ported from the EDC CRM: every number computed from live
 * rows, nothing modeled except the weighted pipeline, which is labeled
 * indicative everywhere. Single-hue bars with direct labels, and every
 * chart has a plain table behind a disclosure.
 */

type Range = "90" | "365" | "all";
const RANGES: { key: Range; label: string }[] = [
  { key: "90", label: "90 days" },
  { key: "365", label: "12 months" },
  { key: "all", label: "All time" },
];

type Opp = MOpp & {
  custom_stages: string[] | null;
  plan_tier: string | null;
  billing: string | null;
  mrr: number | string | null;
  close_probability: number | null;
  stage_changed_at: string | null;
  crm_accounts: { name?: string; source?: string } | null;
};

function pct(n: number, d: number) {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "n/a";
}

function ChartCard({
  title,
  mini,
  data,
  empty,
  note,
  valueHead = "Value",
  ariaLabel,
}: {
  title: string;
  mini?: string;
  data: BarDatum[];
  empty: { title: string; body?: string };
  note?: string;
  valueHead?: string;
  ariaLabel?: string;
}) {
  const hasData = data.length > 0 && data.some((d) => d.value > 0);
  return (
    <section className="dcardx" aria-label={title}>
      <div className="ch">
        <h3>{title}</h3>
        {mini ? <span className="mini">{mini}</span> : null}
      </div>
      {hasData ? (
        <>
          <BarRows data={data} ariaLabel={ariaLabel ?? title} />
          {note ? <div className="ws-note">{note}</div> : null}
          <DataTable title={title} data={data} valueHead={valueHead} />
        </>
      ) : (
        <>
          <EmptyState compact title={empty.title} body={empty.body} />
          {note ? <div className="ws-note">{note}</div> : null}
        </>
      )}
    </section>
  );
}

function DataTable({ title, data, valueHead }: { title: string; data: BarDatum[]; valueHead: string }) {
  const hasSub = data.some((d) => d.sub);
  return (
    <details className="ws-table">
      <summary>VIEW AS TABLE</summary>
      <div className="ws-tbl-scroll">
        <table className="tbl">
          <caption className="ws-sr">{title}</caption>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col" className="r">
                {valueHead}
              </th>
              {hasSub ? <th scope="col">Detail</th> : null}
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={`${d.label}-${i}`}>
                <th scope="row">{d.href ? <Link href={d.href}>{d.label}</Link> : d.label}</th>
                <td className="r num">{d.display}</td>
                {hasSub ? <td>{d.sub ?? ""}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default async function Reports({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: rawRange } = await searchParams;
  const range: Range = rawRange === "90" || rawRange === "all" ? rawRange : "365";
  const now = nowMs();
  const since = range === "all" ? null : new Date(now - Number(range) * 86_400_000).toISOString();
  const rangeLabel = RANGES.find((r) => r.key === range)!.label.toUpperCase();

  const gate = await crmPageGate("/crm/reports");
  if (typeof gate === "string") return null;
  const { supabase } = gate;
  const [oppsRes, eventsRes, acctsRes, leadsRes, demosRes, tasksRes, settingsRes] = await Promise.all([
    supabase.from("crm_opportunities").select("*, crm_accounts(name, source)").limit(5000),
    supabase
      .from("crm_events")
      .select("opportunity_id, account_id, kind, meta, occurred_at, created_by")
      .neq("kind", "import")
      .order("occurred_at")
      .limit(20000),
    supabase.from("crm_accounts").select("id, created_at, status, source").is("archived_at", null).limit(5000),
    supabase
      .from("marketing_leads")
      .select("id, kind, created_at, utm, referrer, crm_lead_triage(status)")
      .in("kind", SALES_LEAD_KINDS)
      .neq("status", "spam")
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("demo_visits")
      .select("id, for_key, visits, created_at, last_seen_at")
      .not("for_key", "is", null)
      .neq("for_key", "qa-probe")
      .limit(5000),
    supabase.from("crm_tasks").select("id, completed_at, due_date").limit(10000),
    supabase.from("crm_workspace_settings").select("stage_weights").maybeSingle(),
  ]);

  const opps = (oppsRes.data ?? []) as unknown as Opp[];
  const events = (eventsRes.data ?? []) as MEvent[];
  const accounts = (acctsRes.data ?? []) as { id: string; created_at: string; status: string; source: string }[];
  type LeadRow = { id: string; kind: string; created_at: string; utm: unknown; referrer: string | null; crm_lead_triage: { status?: string } | { status?: string }[] | null };
  const leads = (leadsRes.data ?? []) as unknown as LeadRow[];
  const demos = (demosRes.data ?? []) as { id: string; for_key: string; visits: number; created_at: string; last_seen_at: string }[];
  const tasks = (tasksRes.data ?? []) as { id: string; completed_at: string | null; due_date: string | null }[];
  const weights = parseStageWeights((settingsRes.data as { stage_weights?: unknown } | null)?.stage_weights);
  const today = todayIso();
  const inRange = (iso: string | null | undefined) => !!iso && (!since || iso >= since);

  /* ---------- live pipeline (never range-filtered) ---------- */
  const active = opps.filter((o) => o.stage !== "won" && o.stage !== "lost");
  const unweighted = active.reduce((a, o) => a + oppAcv(o), 0);
  const weighted = active.reduce((a, o) => a + weightedAcv(o, weights), 0);
  const agg = new Map<string, { n: number; w: number }>();
  for (const o of active) {
    const a = agg.get(o.stage) ?? { n: 0, w: 0 };
    a.n += 1;
    a.w += weightedAcv(o, weights);
    agg.set(o.stage, a);
  }
  const order = [
    ...TEMPLATE_STAGES.filter((s) => agg.has(s)),
    ...[...agg.keys()].filter((s) => !(TEMPLATE_STAGES as readonly string[]).includes(s)),
  ];
  const byStage: BarDatum[] = order.map((s) => {
    const a = agg.get(s)!;
    return { label: stageLabel(s), value: a.n, display: `${a.n} · ${fmtMoney(a.w)} wtd` };
  });

  /* ---------- accounts by status (live) ---------- */
  const STATUS_ORDER = ["target", "contacted", "engaged", "customer", "churned", "disqualified"];
  const statusBars: BarDatum[] = STATUS_ORDER.map((s) => {
    const n = accounts.filter((a) => a.status === s).length;
    return { label: s[0].toUpperCase() + s.slice(1), value: n, display: String(n), href: `/crm/accounts?status=${s}` };
  }).filter((b) => b.value > 0);

  /* ---------- funnel ---------- */
  const steps = funnel(accounts, opps, events, since);
  const funnelBars: BarDatum[] = steps.map((s, i) => ({
    label: s.label,
    value: s.value,
    display: i === 0 ? String(s.value) : `${s.value} · ${pct(s.value, steps[i - 1].value)}`,
    sub: i === 0 ? undefined : "of prior step",
  }));

  /* ---------- win / loss ---------- */
  const wl = winLoss(opps, events, since);
  const wonMrr = wl.won.reduce((a, x) => a + oppMrr(x.opp as Opp), 0);
  const outcomeBars: BarDatum[] = [
    { label: "Won", value: wl.won.length, display: String(wl.won.length) },
    { label: "Lost", value: wl.lost.length, display: String(wl.lost.length) },
  ];
  const reasonBars: BarDatum[] = wl.reasons.map(([r, n]) => ({ label: LOST_REASONS[r] ?? r, value: n, display: String(n) }));
  const lossStageBars: BarDatum[] = wl.stagesAtLoss.map(([s, n]) => ({
    label: s === "Not recorded" ? s : stageLabel(s),
    value: n,
    display: String(n),
  }));

  /* ---------- velocity ---------- */
  const intervals = opps.flatMap((o) => stageHistory(o, events));
  const med = medianDaysByStage(intervals, since).filter((m) => m.n > 0);
  const velocityBars: BarDatum[] = med.map((m) => ({
    label: stageLabel(m.stage),
    value: m.medianDays,
    display: `${m.medianDays.toFixed(m.medianDays < 10 ? 1 : 0)}d`,
    sub: `n=${m.n}`,
  }));
  const stuckBars: BarDatum[] = active
    .map((o) => ({ o, age: currentStageAge(o, events, now) }))
    .sort((a, b) => b.age - a.age)
    .slice(0, 8)
    .map(({ o, age }) => ({
      label: o.crm_accounts?.name ?? o.name,
      value: age,
      display: `${age}d`,
      sub: stageLabel(o.stage),
      href: `/crm/opportunities/${o.id}`,
    }));

  /* ---------- sources ---------- */
  const triageOf = (l: LeadRow) => {
    const t = l.crm_lead_triage;
    return (Array.isArray(t) ? t[0]?.status : t?.status) ?? "new";
  };
  const leadsInRange = leads.filter((l) => inRange(l.created_at));
  const byChannel = new Map<string, { n: number; conv: number }>();
  for (const l of leadsInRange) {
    const ch = `${LEAD_KIND_LABELS[l.kind] ?? l.kind} · ${channelOf(l.utm, l.referrer)}`;
    const a = byChannel.get(ch) ?? { n: 0, conv: 0 };
    a.n += 1;
    if (triageOf(l) === "converted") a.conv += 1;
    byChannel.set(ch, a);
  }
  const leadBars: BarDatum[] = [...byChannel.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 10)
    .map(([label, a]) => ({ label, value: a.n, display: String(a.n), sub: a.conv ? `${a.conv} converted` : undefined }));
  const convertedLeads = leadsInRange.filter((l) => triageOf(l) === "converted").length;
  const oppSource = new Map<string, { n: number; won: number }>();
  for (const o of opps) {
    if (!inRange(o.created_at)) continue;
    const src = SOURCE_LABELS[o.crm_accounts?.source ?? "other"] ?? "Other";
    const a = oppSource.get(src) ?? { n: 0, won: 0 };
    a.n += 1;
    if (o.stage === "won") a.won += 1;
    oppSource.set(src, a);
  }
  const oppSourceBars: BarDatum[] = [...oppSource.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .map(([label, a]) => ({ label, value: a.n, display: String(a.n), sub: a.won ? `${a.won} won` : undefined }));

  /* ---------- outreach activity ---------- */
  const KIND_NAMES: Record<string, string> = { email: "Emails", call: "Calls", meeting: "Meetings", linkedin: "LinkedIn touches", note: "Notes" };
  const touchBars: BarDatum[] = Object.entries(KIND_NAMES)
    .map(([k, label]) => {
      const n = events.filter((e) => e.kind === k && inRange(e.occurred_at)).length;
      return { label, value: n, display: String(n) };
    })
    .filter((b) => b.value > 0);
  const touchesInRange = events.filter((e) => ["email", "call", "meeting", "linkedin"].includes(e.kind) && inRange(e.occurred_at)).length;
  const demosInRange = demos.filter((d) => inRange(d.last_seen_at));
  const demoOpens = demosInRange.reduce((a, d) => a + d.visits, 0);
  const tasksDone = tasks.filter((t) => inRange(t.completed_at)).length;
  const tasksLate = tasks.filter((t) => !t.completed_at && t.due_date && t.due_date < today).length;
  const activityBars: BarDatum[] = [
    { label: "Groups that opened the demo", value: demosInRange.length, display: String(demosInRange.length), sub: demoOpens ? `${demoOpens} opens` : undefined },
    { label: "Tasks completed", value: tasksDone, display: String(tasksDone), sub: tasksLate ? `${tasksLate} overdue now` : undefined },
  ];

  return (
    <>
      <div className="page-head">
        <h1>Reports</h1>
        <span className="sub2">Live numbers from the CRM. Weighted values use indicative weights on annual contract value.</span>
        <div className="right">
          <nav className="ws-range" aria-label="Report range">
            {RANGES.map((r) => (
              <Link
                key={r.key}
                href={r.key === "365" ? "/crm/reports" : `/crm/reports?range=${r.key}`}
                aria-current={range === r.key ? "true" : undefined}
              >
                {r.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="kl">WEIGHTED PIPELINE</div>
          <div className="kv num">{fmtMoney(weighted)}</div>
          <div className="kd">ACV, of {fmtMoney(unweighted)} unweighted · indicative weights</div>
        </div>
        <div className="kpi">
          <div className="kl">WON MRR</div>
          <div className="kv num">{fmtMoney(wonMrr)}</div>
          <div className="kd">
            {wl.won.length ? `${wl.won.length} won · ${rangeLabel.toLowerCase()}` : `no wins in ${rangeLabel.toLowerCase()} yet`}
          </div>
        </div>
        <div className="kpi">
          <div className="kl">WIN RATE</div>
          <div className="kv num">{wl.winRate === null ? "n/a" : `${Math.round(wl.winRate * 100)}%`}</div>
          <div className="kd">
            {wl.winRate === null
              ? "n/a until an opportunity is won or lost"
              : `${wl.won.length} won · ${wl.lost.length} lost${wl.medianDaysToClose === null ? "" : ` · median ${Math.round(wl.medianDaysToClose)}d to win`}`}
          </div>
        </div>
        <div className="kpi">
          <div className="kl">TOUCHES</div>
          <div className="kv num">{touchesInRange}</div>
          <div className="kd">
            {leadsInRange.length
              ? `${leadsInRange.length} inbound leads · ${pct(convertedLeads, leadsInRange.length)} converted`
              : `no inbound leads in ${rangeLabel.toLowerCase()}`}
          </div>
        </div>
      </div>

      <div className="grid2">
        <div>
          <ChartCard
            title="Pipeline by stage"
            mini={`LIVE · ${active.length} OPEN`}
            data={byStage}
            valueHead="Opportunities · weighted"
            empty={{ title: "No open opportunities.", body: "Start one from an account, or press C anywhere." }}
          />
          <ChartCard
            title="Accounts by status"
            mini={`LIVE · ${accounts.length} ACCOUNTS`}
            data={statusBars}
            valueHead="Accounts"
            empty={{ title: "No accounts yet." }}
          />
          <ChartCard
            title="Outbound funnel"
            mini={rangeLabel}
            data={funnelBars}
            valueHead="Count · step %"
            empty={{ title: "Nothing to convert yet.", body: "Accounts, touches and opportunities in this range build the funnel." }}
          />
          <ChartCard
            title="Velocity: median days per stage"
            mini={`COMPLETED STAGES · ${rangeLabel}`}
            data={velocityBars}
            valueHead="Median days"
            note="History starts Oct 19, 2026; medians firm up as opportunities move."
            empty={{ title: "No completed stages in this range.", body: "A stage counts once an opportunity moves out of it." }}
          />
          <ChartCard title="Stuck now" mini="DAYS IN CURRENT STAGE" data={stuckBars} valueHead="Days" empty={{ title: "No open opportunities." }} />
        </div>

        <div>
          <section className="dcardx" aria-label="Win and loss">
            <div className="ch">
              <h3>Win and loss</h3>
              <span className="mini">{rangeLabel}</span>
            </div>
            {wl.won.length + wl.lost.length === 0 ? (
              <EmptyState compact title="Nothing won or lost in this range." body="Outcomes, loss reasons and the stage an opportunity was lost at show here." />
            ) : (
              <>
                <BarRows data={outcomeBars} ariaLabel="Opportunities won and lost" />
                <DataTable title="Outcomes" data={outcomeBars} valueHead="Opportunities" />
                {reasonBars.length ? (
                  <>
                    <div className="ws-sublbl">LOSS REASONS</div>
                    <BarRows data={reasonBars} ariaLabel="Loss reasons" />
                    <DataTable title="Loss reasons" data={reasonBars} valueHead="Opportunities" />
                    <div className="ws-sublbl">STAGE AT LOSS</div>
                    <BarRows data={lossStageBars} ariaLabel="Stage at loss" />
                    <DataTable title="Stage at loss" data={lossStageBars} valueHead="Opportunities" />
                  </>
                ) : null}
              </>
            )}
          </section>

          <section className="dcardx" aria-label="Source attribution">
            <div className="ch">
              <h3>Source attribution</h3>
              <span className="mini">{rangeLabel}</span>
            </div>
            {leadBars.length === 0 && oppSourceBars.length === 0 ? (
              <EmptyState compact title="No leads or opportunities in this range." />
            ) : (
              <>
                <div className="ws-sublbl">INBOUND LEADS BY FORM AND CHANNEL</div>
                {leadBars.length ? (
                  <>
                    <BarRows data={leadBars} ariaLabel="Leads by channel" />
                    <DataTable title="Leads by channel" data={leadBars} valueHead="Leads" />
                  </>
                ) : (
                  <EmptyState compact title="No inbound leads in this range." />
                )}
                <div className="ws-sublbl">OPPORTUNITIES BY ACCOUNT SOURCE</div>
                {oppSourceBars.length ? (
                  <>
                    <BarRows data={oppSourceBars} ariaLabel="Opportunities by source" />
                    <DataTable title="Opportunities by source" data={oppSourceBars} valueHead="Opportunities" />
                  </>
                ) : (
                  <EmptyState compact title="No opportunities opened in this range." />
                )}
              </>
            )}
          </section>

          <ChartCard
            title="Outreach logged"
            mini={rangeLabel}
            data={touchBars}
            valueHead="Count"
            empty={{ title: "No outreach logged in this range.", body: "Log emails, calls and LinkedIn touches on an account and they count here." }}
          />
          <ChartCard
            title="Demo opens and follow-through"
            mini={rangeLabel}
            data={activityBars}
            valueHead="Count"
            empty={{ title: "No demo opens or completed tasks in this range." }}
          />
        </div>
      </div>
    </>
  );
}
