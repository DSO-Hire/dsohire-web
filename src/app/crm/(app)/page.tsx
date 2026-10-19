import Link from "next/link";
import { CountUp } from "@/components/marketing/motion";
import { crmPageGate } from "@/lib/crm/auth";
import { photoClass, photoStyle } from "./avatars";
import {
  ACCOUNT_STATUS_LABELS,
  EVENT_LABELS,
  LEAD_KIND_LABELS,
  SALES_LEAD_KINDS,
  channelOf,
  daysBetween,
  daysSince,
  firstNameOf,
  fmtDate,
  fmtMoney,
  fmtToday,
  greeting,
  initialsOf,
  isoPlusDays,
  nowMs,
  oppAcv,
  parseStageWeights,
  relTime,
  stageLabel,
  TEMPLATE_STAGES,
  todayIso,
  weightedAcv,
} from "./format";
import BarRows from "./BarRow";
import ActionError from "./ActionError";
import EmptyState from "./EmptyState";
import PaletteButton from "./_workspace/PaletteButton";
import { toggleTask } from "./_workspace/actions";

/*
 * Today: the morning brief, ported from the EDC CRM. One round of queries,
 * then plain arithmetic. Every date is Central time. EDC's deal-room and
 * buyer activity become DSO Hire's demo opens; its deals become open
 * opportunities, weighted on annual contract value.
 */

type Opp = {
  id: string;
  name: string;
  stage: string;
  custom_stages: string[] | null;
  account_id: string;
  plan_tier: string | null;
  billing: string | null;
  mrr: number | string | null;
  close_probability: number | null;
  target_close: string | null;
  next_step: string | null;
  next_step_due: string | null;
  created_at: string;
  updated_at: string;
  stage_changed_at: string | null;
  crm_accounts: { name?: string; last_touch_at?: string | null } | null;
};
type Task = {
  id: string;
  title: string;
  ball: "us" | "prospect" | "partner";
  due_date: string | null;
  waiting_since: string | null;
  created_at: string;
  account_id: string | null;
  opportunity_id: string | null;
  owner_id: string | null;
  repeat: string | null;
  crm_accounts: { name?: string } | null;
};
type DoneTask = { id: string; completed_at: string };
type Lead = {
  id: string;
  kind: string;
  name: string | null;
  company: string | null;
  contact: string;
  created_at: string;
  utm: unknown;
  referrer: string | null;
  crm_lead_triage: { status?: string } | { status?: string }[] | null;
};
type Ev = {
  id: string;
  account_id: string;
  opportunity_id: string | null;
  kind: string;
  body: string | null;
  meta: { from?: string; to?: string } | null;
  created_by: string | null;
  occurred_at: string;
  crm_accounts: { name?: string } | null;
};
type Demo = { id: string; for_label: string | null; for_key: string; visits: number; last_seen_at: string; created_at: string };

const COURTS: { ball: Task["ball"]; label: string }[] = [
  { ball: "prospect", label: "PROSPECT" },
  { ball: "partner", label: "PARTNER" },
];
const PER_BUCKET = 8;
const DAY = 86_400_000;
const OUTREACH = new Set(["email", "call", "meeting", "linkedin"]);

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export default async function Today({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; owner?: string }>;
}) {
  const { error, owner } = await searchParams;
  const gate = await crmPageGate("/crm");
  if (typeof gate === "string") return null;
  const { supabase, me, admin } = gate;

  const now = nowMs();
  const today = todayIso();
  const since90 = new Date(now - 90 * DAY).toISOString();
  const since30 = new Date(now - 30 * DAY).toISOString();
  const since7 = new Date(now - 7 * DAY).toISOString();

  const [oppsRes, tasksRes, doneRes, leadsRes, eventsRes, demosRes, prefsRes, settingsRes, targetsRes] =
    await Promise.all([
      supabase
        .from("crm_opportunities")
        .select("*, crm_accounts(name, last_touch_at)")
        .not("stage", "in", "(won,lost)"),
      supabase
        .from("crm_tasks")
        .select(
          "id, title, ball, due_date, waiting_since, created_at, account_id, opportunity_id, owner_id, repeat, crm_accounts(name)",
        )
        .is("completed_at", null)
        .order("created_at", { ascending: true })
        .limit(500),
      supabase.from("crm_tasks").select("id, completed_at").gte("completed_at", since90).limit(1000),
      supabase
        .from("marketing_leads")
        .select("id, kind, name, company, contact, created_at, utm, referrer, crm_lead_triage(status)")
        .in("kind", SALES_LEAD_KINDS)
        .neq("status", "spam")
        .gte("created_at", since30)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("crm_events")
        .select("id, account_id, opportunity_id, kind, body, meta, created_by, occurred_at, crm_accounts(name)")
        .neq("kind", "import")
        .gte("occurred_at", since90)
        .order("occurred_at", { ascending: false })
        .limit(1000),
      supabase
        .from("demo_visits")
        .select("id, for_label, for_key, visits, last_seen_at, created_at")
        .not("for_key", "is", null)
        .neq("for_key", "qa-probe")
        .gte("last_seen_at", since7)
        .order("last_seen_at", { ascending: false })
        .limit(50),
      supabase.from("crm_user_prefs").select("today_scope, quiet_after_days").eq("user_id", me).maybeSingle(),
      supabase.from("crm_workspace_settings").select("stage_weights").maybeSingle(),
      supabase
        .from("crm_accounts")
        .select("id", { count: "exact", head: true })
        .eq("status", "target")
        .is("archived_at", null),
    ]);

  const opps = (oppsRes.data ?? []) as unknown as Opp[];
  const openTasks = (tasksRes.data ?? []) as unknown as Task[];
  const done = (doneRes.data ?? []) as DoneTask[];
  const triageOf = (l: Lead) => {
    const t = l.crm_lead_triage;
    return (Array.isArray(t) ? t[0]?.status : t?.status) ?? "new";
  };
  const leads = ((leadsRes.data ?? []) as unknown as Lead[]).filter((l) => triageOf(l) === "new");
  const events = (eventsRes.data ?? []) as unknown as Ev[];
  const demos = (demosRes.data ?? []) as Demo[];
  const prefs = (prefsRes.data ?? null) as { today_scope?: string; quiet_after_days?: number } | null;
  const quietAfter = Math.min(Math.max(Number(prefs?.quiet_after_days) || 7, 3), 90);
  const weights = parseStageWeights((settingsRes.data as { stage_weights?: unknown } | null)?.stage_weights);
  const untouchedTargets = targetsRes.count ?? 0;

  const firstName = firstNameOf(admin);

  /* ---------- owner scope: ?owner=all | mine, default from prefs ---------- */
  const defaultScope = prefs?.today_scope === "all" ? "all" : "mine";
  const scope = owner === "all" ? "all" : owner === "mine" ? "mine" : defaultScope;
  const inScope = (t: Task) => scope === "all" || t.owner_id === me || t.owner_id === null;

  const usTasks = openTasks.filter((t) => t.ball === "us");
  const mine = usTasks.filter((t) => t.owner_id === me || t.owner_id === null);
  const myOverdue = mine.filter((t) => t.due_date && t.due_date < today);
  const myDueToday = mine.filter((t) => t.due_date === today);

  const scoped = usTasks.filter(inScope);
  const in7 = isoPlusDays(today, 7);
  const byDue = (a: Task, b: Task) => String(a.due_date).localeCompare(String(b.due_date));
  const buckets = [
    { key: "overdue", label: "OVERDUE", tone: "crit", rows: scoped.filter((t) => t.due_date && t.due_date < today).sort(byDue) },
    { key: "today", label: "DUE TODAY", tone: "warn", rows: scoped.filter((t) => t.due_date === today) },
    { key: "week", label: "NEXT 7 DAYS", tone: "", rows: scoped.filter((t) => t.due_date && t.due_date > today && t.due_date <= in7).sort(byDue) },
    { key: "later", label: "LATER", tone: "", rows: scoped.filter((t) => t.due_date && t.due_date > in7).sort(byDue) },
    { key: "none", label: "NO DATE", tone: "", rows: scoped.filter((t) => !t.due_date) },
  ].filter((b) => b.rows.length > 0);

  const waiting = openTasks
    .filter((t) => t.ball !== "us" && inScope(t))
    .sort((a, b) => String(a.waiting_since ?? a.created_at).localeCompare(String(b.waiting_since ?? b.created_at)));

  /* ---------- opportunities needing a touch ----------
     Last touch = the account's last outreach, or any event on the
     opportunity, or its own update, whichever is latest. */
  const lastTouch = new Map<string, number>();
  const bump = (id: string, iso: string | null | undefined) => {
    if (!iso) return;
    const t = new Date(iso).getTime();
    if (!Number.isNaN(t) && t > (lastTouch.get(id) ?? 0)) lastTouch.set(id, t);
  };
  for (const o of opps) {
    bump(o.id, o.stage_changed_at ?? o.created_at);
    bump(o.id, o.crm_accounts?.last_touch_at);
  }
  for (const e of events) if (e.opportunity_id && OUTREACH.has(e.kind)) bump(e.opportunity_id, e.occurred_at);
  const openByOpp = new Map<string, number>();
  for (const t of openTasks) if (t.opportunity_id) openByOpp.set(t.opportunity_id, (openByOpp.get(t.opportunity_id) ?? 0) + 1);

  const touch = opps
    .map((o) => {
      const reasons: { label: string; tone: string }[] = [];
      const quiet = Math.floor((now - (lastTouch.get(o.id) ?? new Date(o.created_at).getTime())) / DAY);
      if (!o.next_step && !openByOpp.get(o.id)) reasons.push({ label: "NO NEXT STEP", tone: "warn" });
      else if (o.next_step_due && o.next_step_due < today) reasons.push({ label: "NEXT STEP LATE", tone: "crit" });
      if (quiet >= quietAfter) reasons.push({ label: `QUIET ${quiet}D`, tone: quiet >= quietAfter * 2 ? "crit" : "warn" });
      if (o.target_close) {
        const left = daysBetween(today, o.target_close);
        if (left < 0) reasons.push({ label: "PAST TARGET CLOSE", tone: "crit" });
        else if (left <= 14) reasons.push({ label: `CLOSE IN ${left}D`, tone: "navy" });
      }
      return { o, reasons, quiet };
    })
    .filter((x) => x.reasons.length > 0)
    .sort((a, b) => b.reasons.length - a.reasons.length || b.quiet - a.quiet);

  /* ---------- KPIs ---------- */
  const opened90 = opps.filter((o) => o.created_at >= since90).length;
  const unweighted = opps.reduce((a, o) => a + oppAcv(o), 0);
  const weighted = opps.reduce((a, o) => a + weightedAcv(o, weights), 0);
  const inMyCourt = mine.length;
  const oldestLead = leads.reduce((m, s) => Math.max(m, daysSince(s.created_at)), 0);
  const clearedThisWeek = done.filter((t) => t.completed_at >= since7).length;
  const touchesThisWeek = events.filter((e) => OUTREACH.has(e.kind) && e.occurred_at >= since7).length;

  /* ---------- pipeline snapshot, template order then custom stages ---------- */
  const stageAgg = new Map<string, { n: number; w: number; u: number }>();
  for (const o of opps) {
    const a = stageAgg.get(o.stage) ?? { n: 0, w: 0, u: 0 };
    a.n += 1;
    a.w += weightedAcv(o, weights);
    a.u += oppAcv(o);
    stageAgg.set(o.stage, a);
  }
  const stageOrder = [
    ...TEMPLATE_STAGES.filter((s) => stageAgg.has(s)),
    ...[...stageAgg.keys()].filter((s) => !(TEMPLATE_STAGES as readonly string[]).includes(s)),
  ];
  const snapshot = stageOrder.map((s) => {
    const a = stageAgg.get(s)!;
    return {
      label: stageLabel(s),
      value: a.w,
      display: fmtMoney(a.w),
      sub: `${plural(a.n, "opportunity", "opportunities")} · ${fmtMoney(a.u)} ACV unweighted`,
    };
  });
  const weightsCustom = Object.keys(weights).length > 0;

  /* ---------- demo opens, 7 days, matched to accounts by ?for= key ---------- */
  const demoKeys = demos.map((d) => d.for_key);
  const { data: demoAccts } = demoKeys.length
    ? await supabase.from("crm_accounts").select("id, name, status, demo_for_key").in("demo_for_key", demoKeys)
    : { data: [] as { id: string; name: string; status: string; demo_for_key: string }[] };
  const acctByKey = new Map(
    ((demoAccts ?? []) as { id: string; name: string; status: string; demo_for_key: string }[]).map((a) => [
      a.demo_for_key,
      a,
    ]),
  );

  /* ---------- feed, last 72 hours ---------- */
  const since72 = new Date(now - 72 * 3600 * 1000).toISOString();
  const feed = events.filter((e) => e.occurred_at >= since72).slice(0, 12);

  /* ---------- header summary from counts only ---------- */
  const parts: string[] = [];
  if (myOverdue.length) parts.push(`${myOverdue.length} overdue`);
  if (myDueToday.length) parts.push(`${myDueToday.length} due today`);
  if (leads.length === 1) parts.push(`1 new lead waiting ${plural(oldestLead, "day")}`);
  else if (leads.length > 1) parts.push(`${leads.length} new leads, oldest waiting ${plural(oldestLead, "day")}`);
  if (demos.length) parts.push(`${plural(demos.length, "group")} opened the demo this week`);
  const quietCount = touch.filter((t) => t.quiet >= quietAfter).length;
  if (quietCount) parts.push(`${plural(quietCount, "opportunity", "opportunities")} gone quiet`);
  const summary = parts.length ? `${parts.join(", ")}.` : "Nothing is due and nothing is waiting on you.";

  const taskHref = (t: Task) =>
    t.opportunity_id ? `/crm/opportunities/${t.opportunity_id}` : t.account_id ? `/crm/accounts/${t.account_id}` : "/crm/tasks";

  const renderTask = (t: Task) => {
    const acct = t.crm_accounts?.name ?? "No account";
    const own = t.owner_id === me || t.owner_id === null ? initialsOf(admin) : null;
    const late = t.due_date && t.due_date < today ? daysBetween(t.due_date, today) : 0;
    return (
      <div className="ws-task" key={t.id}>
        <form action={toggleTask}>
          <input type="hidden" name="id" value={t.id} />
          <input type="hidden" name="done" value="false" />
          <button type="submit" className="ws-check" aria-label={`Mark done: ${t.title}`} title="Mark done">
            ✓
          </button>
        </form>
        <Link className="ws-task-main" href={taskHref(t)}>
          <span className="deal">{acct}</span>
          <span className="pill ball edc">US</span>
          {own ? (
            <span className={`ownchip${photoClass(admin)}`} style={photoStyle(admin)} title={admin.full_name ?? admin.email ?? undefined}>
              {own}
            </span>
          ) : null}
          <span className="ttl">{t.title}</span>
          {t.repeat && t.repeat !== "none" ? (
            <span className="rep" title={`Repeats ${t.repeat}`} aria-label={`Repeats ${t.repeat}`}>
              ↻
            </span>
          ) : null}
        </Link>
        <span className={`due${late ? " crit" : ""}`}>
          {!t.due_date ? "" : late ? `${late}d late` : t.due_date === today ? "today" : fmtDate(t.due_date)}
        </span>
      </div>
    );
  };

  const touchRow = ({ o, reasons, quiet }: (typeof touch)[number], withStage: boolean) => (
    <Link key={o.id} className="court-row" href={`/crm/opportunities/${o.id}`}>
      <span className="deal">{o.crm_accounts?.name ?? o.name}</span>
      {withStage ? <span className="pill navy">{stageLabel(o.stage)}</span> : null}
      <span className="ws-reasons">
        {reasons.map((r) => (
          <span key={r.label} className={`pill ${r.tone}`}>
            {r.label}
          </span>
        ))}
      </span>
      <span className="age">{quiet === 0 ? "touched today" : `last touch ${quiet}d`}</span>
    </Link>
  );

  return (
    <>
      <ActionError error={error} />
      <div className="ws-head">
        <div className="ws-head-txt">
          <span className="ws-date">{fmtToday().toUpperCase()}</span>
          <h1>{`${greeting()}, ${firstName}.`}</h1>
          <span className="ws-summary">{summary}</span>
        </div>
        <div className="right">
          <PaletteButton mode="note" label="Log a note" />
          <PaletteButton mode="create" label="+ New opportunity" className="dbtn dbtn-green" />
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="kl">OPEN OPPORTUNITIES</div>
          <div className="kv num">
            <CountUp to={opps.length} />
          </div>
          <div className="kd">{opened90 ? `+${opened90} opened in 90 days` : "none opened in 90 days"}</div>
        </div>
        <div className="kpi">
          <div className="kl">WEIGHTED PIPELINE</div>
          <div className="kv num">{fmtMoney(weighted)}</div>
          <div className="kd">ACV, of {fmtMoney(unweighted)} unweighted · indicative weights</div>
        </div>
        <div className="kpi">
          <div className="kl">IN MY COURT</div>
          <div className="kv num">
            <CountUp to={inMyCourt} />
          </div>
          <div className="kd">
            {myOverdue.length
              ? `${myOverdue.length} overdue · ${myDueToday.length} due today`
              : `${myDueToday.length} due today`}
          </div>
        </div>
        <div className="kpi">
          <div className="kl">TOUCHES THIS WEEK</div>
          <div className="kv num">
            <CountUp to={touchesThisWeek} />
          </div>
          <div className="kd">
            {untouchedTargets ? `${plural(untouchedTargets, "target")} not contacted yet` : "every target contacted"}
          </div>
        </div>
      </div>

      <div className="grid2">
        <div>
          {/* a. my tasks */}
          <section className="dcardx" aria-labelledby="ws-tasks-h">
            <div className="ch">
              <h3 id="ws-tasks-h">{scope === "all" ? "Everyone's tasks" : "My tasks"}</h3>
              <span className="ownerchips" role="group" aria-label="Whose tasks">
                <Link className={`fchip2${scope === "all" ? " on" : ""}`} href="/crm?owner=all" aria-current={scope === "all" ? "true" : undefined}>
                  ALL
                </Link>
                <Link className={`fchip2${scope === "mine" ? " on" : ""}`} href="/crm?owner=mine" aria-current={scope === "mine" ? "true" : undefined}>
                  MINE
                </Link>
              </span>
              <span className="mini">{clearedThisWeek ? `${clearedThisWeek} CLEARED THIS WEEK` : "YOUR COURT"}</span>
            </div>
            {buckets.length === 0 ? (
              <EmptyState
                compact
                title="Nothing in your court here."
                body="Add tasks from any account or opportunity and they land in these buckets by due date."
                action={{ href: "/crm/accounts", label: "Open accounts" }}
              />
            ) : (
              buckets.map((b) => (
                <div key={b.key}>
                  <div className={`ws-bucket${b.tone ? ` ${b.tone}` : ""}`}>
                    {b.label} <span className="n">· {b.rows.length}</span>
                  </div>
                  {b.rows.slice(0, PER_BUCKET).map(renderTask)}
                  {b.rows.length > PER_BUCKET ? (
                    <details className="ws-more">
                      <summary>SHOW ALL {b.rows.length}</summary>
                      {b.rows.slice(PER_BUCKET).map(renderTask)}
                    </details>
                  ) : null}
                </div>
              ))
            )}
          </section>

          {/* b. waiting on others */}
          <section className="dcardx" aria-labelledby="ws-wait-h">
            <div className="ch">
              <h3 id="ws-wait-h">Waiting on others</h3>
              <span className="mini">OLDEST FIRST · NUDGE AT 4 DAYS</span>
            </div>
            {waiting.length === 0 ? (
              <EmptyState
                compact
                title="Nobody owes you a reply right now."
                body="Tasks in the prospect or partner court show here with how long they have waited."
              />
            ) : (
              COURTS.map((c) => {
                const rows = waiting.filter((t) => t.ball === c.ball);
                if (!rows.length) return null;
                return (
                  <div key={c.ball}>
                    <div className="ws-court-gh">
                      {c.label} · {rows.length}
                    </div>
                    {rows.slice(0, PER_BUCKET).map((t) => {
                      const age = daysSince(t.waiting_since ?? t.created_at);
                      return (
                        <Link key={t.id} className="court-row" href={taskHref(t)}>
                          <span className="deal">{t.crm_accounts?.name ?? "No account"}</span>
                          {age >= 4 ? <span className="pill warn">NUDGE</span> : null}
                          <span>{t.title}</span>
                          <span className={`age${age >= 4 ? " crit" : ""}`}>{age === 0 ? "today" : `${age}d waiting`}</span>
                        </Link>
                      );
                    })}
                  </div>
                );
              })
            )}
          </section>

          {/* c. opportunities needing a touch */}
          <section className="dcardx" aria-labelledby="ws-touch-h">
            <div className="ch">
              <h3 id="ws-touch-h">Opportunities needing a touch</h3>
              <span className="mini">QUIET AFTER {quietAfter} DAYS</span>
            </div>
            {opps.length === 0 ? (
              <EmptyState
                compact
                title="No open opportunities yet."
                body="Start one from an account once a group replies, or convert a lead from the Inbox."
                action={{ label: "+ New opportunity", event: "create" }}
              />
            ) : touch.length === 0 ? (
              <EmptyState
                compact
                title="All caught up."
                body={`Every open opportunity has a next step and a touch inside ${quietAfter} days.`}
              />
            ) : (
              <>
                {touch.slice(0, PER_BUCKET).map((x) => touchRow(x, true))}
                {touch.length > PER_BUCKET ? (
                  <details className="ws-more">
                    <summary>SHOW ALL {touch.length}</summary>
                    {touch.slice(PER_BUCKET).map((x) => touchRow(x, false))}
                  </details>
                ) : null}
              </>
            )}
          </section>
        </div>

        <div>
          {/* a. new leads */}
          <section className="dcardx" aria-labelledby="ws-leads-h">
            <div className="ch">
              <h3 id="ws-leads-h">New leads</h3>
              <span className="mini">UNTRIAGED · 30 DAYS</span>
            </div>
            {leads.length === 0 ? (
              <EmptyState
                compact
                title="No new leads."
                body="Demo requests, calculator leads and contact forms land here until you work them in the Inbox."
              />
            ) : (
              leads.slice(0, 6).map((l) => {
                const age = daysSince(l.created_at);
                return (
                  <Link key={l.id} className="ws-lead" href={`/crm/inbox?lead=${l.id}`}>
                    <span className="ws-lead-top">
                      <b>{l.company || l.name || l.contact}</b>
                      <span className={`pill ${l.kind === "demo_request" ? "good" : "navy"}`}>
                        {(LEAD_KIND_LABELS[l.kind] ?? l.kind).toUpperCase()}
                      </span>
                      <span
                        className={`ws-age${age >= 2 ? " crit" : age >= 1 ? " warn" : ""}`}
                        style={{ marginLeft: "auto" }}
                      >
                        {age === 0 ? "TODAY" : `${age}D`}
                      </span>
                    </span>
                    <span className="ws-lead-meta">
                      {[l.company && l.name ? l.name : null, channelOf(l.utm, l.referrer)].filter(Boolean).join(" · ")}
                    </span>
                  </Link>
                );
              })
            )}
            <div className="ws-foot">
              <span>{leads.length > 6 ? `${leads.length - 6} more` : ""}</span>
              <Link className="ws-link" href="/crm/inbox">
                OPEN INBOX →
              </Link>
            </div>
          </section>

          {/* b. demo opens */}
          <section className="dcardx" aria-labelledby="ws-demo-h">
            <div className="ch">
              <h3 id="ws-demo-h">Demo opens</h3>
              <span className="mini">PERSONALIZED LINKS · 7 DAYS</span>
            </div>
            {demos.length === 0 ? (
              <EmptyState
                compact
                title="No demo opens this week."
                body="Every outreach email carries a personalized demo link. When a group opens theirs, it shows here."
              />
            ) : (
              demos.slice(0, 6).map((d) => {
                const acct = acctByKey.get(d.for_key);
                const label = acct?.name ?? d.for_label ?? d.for_key;
                return (
                  <div key={d.id}>
                    <div className="ws-act-deal">
                      <b>
                        <Link className="ws-link" href={acct ? `/crm/accounts/${acct.id}` : "/crm/inbox?tab=demos"}>
                          {label}
                        </Link>
                      </b>
                      {acct ? (
                        <span className="pill navy">{ACCOUNT_STATUS_LABELS[acct.status] ?? acct.status}</span>
                      ) : (
                        <span className="pill warn">NO ACCOUNT</span>
                      )}
                    </div>
                    <div className="ws-act-line">
                      <span>
                        {d.visits > 1 ? `${plural(d.visits, "open")}, first ${fmtDate(d.created_at)}` : "Opened once"}
                      </span>
                      <span className="ts">{relTime(d.last_seen_at)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </section>

          {/* c. pipeline snapshot */}
          <section className="dcardx" aria-labelledby="ws-snap-h">
            <div className="ch">
              <h3 id="ws-snap-h">Pipeline snapshot</h3>
              <span className="mini">ACV WEIGHTED BY STAGE</span>
            </div>
            {snapshot.length === 0 ? (
              <EmptyState compact title="No open opportunities to weigh." />
            ) : unweighted === 0 ? (
              <EmptyState
                compact
                title="No plans picked yet."
                body="Pick a plan (or set MRR) on each opportunity and the weighted pipeline fills in."
              />
            ) : (
              <BarRows data={snapshot} ariaLabel="Weighted pipeline value by stage" />
            )}
            <div className="ws-foot">
              <span>
                Weighted {fmtMoney(weighted)} of {fmtMoney(unweighted)} · weights are indicative
                {weightsCustom ? "" : " (defaults)"}, set in{" "}
                <Link className="ws-link" href="/crm/settings#weights">
                  Settings
                </Link>
              </span>
            </div>
          </section>

          {/* d. activity feed */}
          <section className="dcardx" aria-labelledby="ws-feed-h">
            <div className="ch">
              <h3 id="ws-feed-h">Last 72 hours</h3>
              <span className="mini">OUTREACH · NOTES · STAGE MOVES</span>
            </div>
            {feed.length === 0 ? (
              <EmptyState compact title="Nothing logged in 72 hours." body="Log a note with N from anywhere in the CRM." />
            ) : (
              feed.map((e) => {
                const name = e.crm_accounts?.name ?? "an account";
                const body = String(e.body ?? "");
                const href = e.opportunity_id ? `/crm/opportunities/${e.opportunity_id}` : `/crm/accounts/${e.account_id}`;
                return (
                  <div className="ws-feed" key={e.id}>
                    <span className={`ownchip${photoClass(admin)}`} style={photoStyle(admin)} title={EVENT_LABELS[e.kind] ?? e.kind}>
                      {e.created_by ? initialsOf(admin) : "··"}
                    </span>
                    <span className="ws-feed-body">
                      <span>
                        <Link className="ws-link" href={href}>
                          {name}
                        </Link>{" "}
                        {e.kind === "stage_change"
                          ? `stage moved: ${stageLabel(e.meta?.from ?? "?")} → ${stageLabel(e.meta?.to ?? "?")}`
                          : (EVENT_LABELS[e.kind] ?? e.kind).toLowerCase()}
                      </span>
                      {body ? <span className="q">{body.length > 140 ? `${body.slice(0, 140)}…` : body}</span> : null}
                    </span>
                    <span className="ts">{relTime(e.occurred_at)}</span>
                  </div>
                );
              })
            )}
          </section>

          {/* e. prospect list shortcut */}
          <section className="dcardx" aria-label="Prospect list">
            <div className="ws-room-mini">
              <span>
                {untouchedTargets
                  ? `${plural(untouchedTargets, "researched group")} not contacted yet.`
                  : "Every researched group has been contacted."}
              </span>
              <Link className="dbtn dbtn-line dbtn-sm" href="/crm/accounts?status=target">
                Open targets
              </Link>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
