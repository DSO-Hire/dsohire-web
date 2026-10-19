import Link from "next/link";
import { crmPageGate } from "@/lib/crm/auth";
import ActionError from "../ActionError";
import SavedViews from "../_views/SavedViews";
import AutoSubmit from "../AutoSubmit";
import EmptyState from "../EmptyState";
import { photoClass, photoStyle } from "../avatars";
import { BALL_LABELS, daysBetween, fmtDate, initialsOf, isoPlusDays, stageLabel, todayIso } from "../format";
import { addTask, snoozeTask, toggleTask, updateTask } from "./actions";
import TaskBulk from "./TaskBulk";
import "../opportunities/opportunities.css";
import "../pipeline/pipeline.css";
import "./tasks.css";

/*
 * Tasks (2026-10-19): a port of the EDC CRM's pipeline tasks view. Every
 * open task across accounts and opportunities, grouped by when it is due,
 * with ball-in-court, priority, owner, complete, snooze, and edit.
 */

type SP = { error?: string; tab?: string; account?: string; owner?: string; priority?: string };

type TaskRow = {
  id: string;
  title: string;
  notes: string | null;
  ball: string;
  priority: string;
  repeat: string;
  due_date: string | null;
  waiting_since: string | null;
  completed_at: string | null;
  owner_id: string | null;
  account_id: string | null;
  opportunity_id: string | null;
  crm_accounts: { id?: string; name?: string } | null;
  crm_opportunities: { id?: string; name?: string; stage?: string } | null;
  crm_contacts: { name?: string } | null;
};

type Bucket = "overdue" | "today" | "week" | "later" | "none";

const BUCKET_LABELS: Record<Bucket, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "This week",
  later: "Later",
  none: "No date",
};
const BUCKET_ORDER: Bucket[] = ["overdue", "today", "week", "later", "none"];

const TABS: { key: string; label: string }[] = [
  { key: "mine", label: "Mine" },
  { key: "overdue", label: "Overdue" },
  { key: "week", label: "This week" },
  { key: "waiting", label: "Waiting" },
  { key: "all", label: "All open" },
  { key: "done", label: "Done" },
];

const EMPTY: Record<string, string> = {
  mine: "Nothing on your plate.",
  overdue: "Nothing overdue.",
  week: "Nothing due this week.",
  waiting: "Nothing waiting on a prospect or partner.",
  all: "No open tasks.",
  done: "Nothing completed in the last 14 days.",
};

const PRIORITY_LABELS: Record<string, string> = { high: "HIGH", normal: "NORMAL", low: "LOW" };
const PRIO_RANK: Record<string, number> = { high: 0, normal: 1, low: 2 };
const BALL_NAMES: Record<string, string> = { us: "Us", prospect: "Prospect", partner: "Partner" };

const SELECT =
  "id, title, notes, ball, priority, repeat, due_date, waiting_since, completed_at, owner_id, account_id, opportunity_id, crm_accounts(id, name), crm_opportunities(id, name, stage), crm_contacts(name)";

function bucketOf(due: string | null, today: string): Bucket {
  if (!due) return "none";
  const n = daysBetween(today, due);
  if (n < 0) return "overdue";
  if (n === 0) return "today";
  if (n <= 6) return "week";
  return "later";
}

function countdown(due: string | null, today: string): { label: string; tone: string } {
  if (!due) return { label: "no date", tone: "navy" };
  const n = daysBetween(today, due);
  if (n < 0) return { label: `${-n}d overdue`, tone: "crit" };
  if (n === 0) return { label: "today", tone: "warn" };
  if (n === 1) return { label: "tomorrow", tone: "warn" };
  return { label: `in ${n}d`, tone: n <= 7 ? "warn" : "navy" };
}

function daysAgo(iso: string | null, today: string): number | null {
  if (!iso) return null;
  return Math.max(0, daysBetween(iso.slice(0, 10), today));
}

function sortOpen(tasks: TaskRow[]): TaskRow[] {
  return [...tasks].sort((a, b) => {
    const pa = PRIO_RANK[a.priority] ?? 1;
    const pb = PRIO_RANK[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    if (a.due_date !== b.due_date) {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date < b.due_date ? -1 : 1;
    }
    return (a.waiting_since ?? "").localeCompare(b.waiting_since ?? "");
  });
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const gate = await crmPageGate("/crm/tasks");
  if (typeof gate === "string") return null;
  const { supabase, me, admin } = gate;

  const tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as string) : "mine";
  const today = todayIso();
  const since = `${isoPlusDays(today, -14)}T00:00:00Z`;

  const [openRes, doneRes, acctRes] = await Promise.all([
    supabase.from("crm_tasks").select(SELECT).is("completed_at", null).limit(1000),
    tab === "done"
      ? supabase
          .from("crm_tasks")
          .select(SELECT)
          .not("completed_at", "is", null)
          .gte("completed_at", since)
          .order("completed_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] as TaskRow[], error: null }),
    supabase.from("crm_accounts").select("id, name").is("archived_at", null).order("name").limit(2000),
  ]);
  const loadError = openRes.error ?? doneRes.error;
  const open = (openRes.data ?? []) as unknown as TaskRow[];
  const done = (doneRes.data ?? []) as unknown as TaskRow[];
  const accounts = (acctRes.data ?? []) as { id: string; name: string }[];

  const acctOk = sp.account && accounts.some((a) => a.id === sp.account) ? sp.account : "";
  const ownerOk = sp.owner === "me" || sp.owner === "unassigned" ? sp.owner : "";
  const prioOk = sp.priority && sp.priority in PRIO_RANK ? sp.priority : "";
  const baseFilter = (t: TaskRow) =>
    (!acctOk || t.account_id === acctOk) &&
    (!ownerOk || (ownerOk === "me" ? t.owner_id === me : !t.owner_id)) &&
    (!prioOk || t.priority === prioOk);

  const tabFilter: Record<string, (t: TaskRow) => boolean> = {
    mine: (t) => t.owner_id === me || (!t.owner_id && t.ball === "us"),
    overdue: (t) => !!t.due_date && t.due_date < today,
    week: (t) => {
      const b = bucketOf(t.due_date, today);
      return b === "today" || b === "week";
    },
    waiting: (t) => t.ball !== "us",
    all: () => true,
  };
  const filteredOpen = open.filter(baseFilter);
  const counts: Record<string, number> = {};
  for (const k of Object.keys(tabFilter)) counts[k] = filteredOpen.filter(tabFilter[k]).length;

  const rows =
    tab === "done"
      ? done.filter(baseFilter)
      : tab === "waiting"
        ? filteredOpen
            .filter(tabFilter.waiting)
            .sort((a, b) => (a.waiting_since ?? "").localeCompare(b.waiting_since ?? ""))
        : sortOpen(filteredOpen.filter(tabFilter[tab]));

  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    const next = { tab, account: acctOk, owner: ownerOk, priority: prioOk, ...patch };
    if (next.tab && next.tab !== "mine") p.set("tab", next.tab);
    if (next.account) p.set("account", next.account);
    if (next.owner) p.set("owner", next.owner);
    if (next.priority) p.set("priority", next.priority);
    const q = p.toString();
    return `/crm/tasks${q ? `?${q}` : ""}`;
  };
  const here = qs({});

  const groups: { bucket: Bucket | null; items: TaskRow[] }[] = [];
  if (tab === "done" || tab === "waiting") {
    groups.push({ bucket: null, items: rows });
  } else {
    for (const b of BUCKET_ORDER) {
      const items = rows.filter((t) => bucketOf(t.due_date, today) === b);
      if (items.length) groups.push({ bucket: b, items });
    }
  }

  const meChip = initialsOf(admin);
  const meLabel = admin.full_name?.trim().split(/\s+/)[0] || "Me";

  return (
    <div className="dx-page">
      <ActionError error={sp.error} />
      <div className="page-head">
        <h1>Tasks</h1>
        <span className="sub2">
          {counts.all} open · {counts.overdue} overdue · {counts.waiting} waiting on others
        </span>
      </div>
      {loadError ? (
        <div className="action-err" role="alert">
          <b>TASKS DID NOT LOAD</b> {loadError.message}
        </div>
      ) : null}

      <div className="dcardx tk-add">
        <form action={addTask} className="dform">
          <input type="hidden" name="return_to" value={here} />
          <div className="dx-qadd">
            <div>
              <label htmlFor="tq-title">NEW TASK</label>
              <input id="tq-title" name="title" required maxLength={300} placeholder="What needs to happen" />
            </div>
            <div>
              <label htmlFor="tq-acct">ACCOUNT</label>
              <select id="tq-acct" name="account_id" defaultValue={acctOk}>
                <option value="">No account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="tq-prio">PRIORITY</label>
              <select id="tq-prio" name="priority" defaultValue="normal">
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label htmlFor="tq-due">DUE</label>
              <input id="tq-due" name="due_date" type="date" />
            </div>
            <div>
              <label htmlFor="tq-owner">OWNER</label>
              <select id="tq-owner" name="owner_id" defaultValue="me">
                <option value="me">{meLabel}</option>
                <option value="none">Unassigned</option>
              </select>
            </div>
            <button className="dbtn dbtn-green dbtn-sm" type="submit">
              Add
            </button>
          </div>
        </form>
      </div>

      <nav className="dx-tabs" aria-label="Task lists">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={qs({ tab: t.key })}
            className={`fchip2${tab === t.key ? " on" : ""}`}
            aria-current={tab === t.key ? "page" : undefined}
          >
            {t.label}
            {t.key !== "done" ? <em>{counts[t.key]}</em> : null}
          </Link>
        ))}
      </nav>
      <SavedViews surface="tasks" current={sp} />

      <div className="dcardx" id="dx-tasklist">
        <form id="tk-filters" method="get" action="/crm/tasks" className="dform dx-taskfilters">
          <AutoSubmit formId="tk-filters" />
          {tab !== "mine" ? <input type="hidden" name="tab" value={tab} /> : null}
          <div>
            <label htmlFor="tf-acct">ACCOUNT</label>
            <select id="tf-acct" name="account" defaultValue={acctOk}>
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tf-owner">OWNER</label>
            <select id="tf-owner" name="owner" defaultValue={ownerOk}>
              <option value="">Anyone</option>
              <option value="me">Me</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </div>
          <div>
            <label htmlFor="tf-prio">PRIORITY</label>
            <select id="tf-prio" name="priority" defaultValue={prioOk}>
              <option value="">Any</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>
          <button className="dbtn dbtn-line dbtn-sm" type="submit">
            Filter
          </button>
          {acctOk || ownerOk || prioOk ? (
            <Link className="dx-clear" href={qs({ account: "", owner: "", priority: "" })}>
              Clear
            </Link>
          ) : null}
        </form>

        {rows.length === 0 ? <EmptyState title={EMPTY[tab]} compact /> : null}
        {groups.map((g) => (
          <section key={g.bucket ?? "flat"} aria-label={g.bucket ? BUCKET_LABELS[g.bucket] : undefined}>
            {g.bucket ? (
              <div className={`dx-bucket ${g.bucket}`}>
                {BUCKET_LABELS[g.bucket].toUpperCase()} · {g.items.length}
              </div>
            ) : null}
            {g.items.map((t) => {
              const cd = countdown(t.due_date, today);
              const isDone = !!t.completed_at;
              const wait = t.ball !== "us" && !isDone ? daysAgo(t.waiting_since, today) : null;
              const mine = t.owner_id === me;
              const acctName = t.crm_accounts?.name;
              const opp = t.crm_opportunities;
              return (
                <div key={t.id} className={`task-row dx-trow${isDone ? " donez" : ""}`}>
                  {!isDone ? <input type="checkbox" name="bulk" value={t.id} aria-label={`Select ${t.title}`} /> : null}
                  <form action={toggleTask} className="tk-inline">
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="done" value={isDone ? "true" : "false"} />
                    <input type="hidden" name="return_to" value={here} />
                    <button
                      className="iconbtn"
                      type="submit"
                      title={isDone ? "Reopen" : "Complete"}
                      aria-label={`${isDone ? "Reopen" : "Complete"} ${t.title}`}
                    >
                      {isDone ? "↺" : "✓"}
                    </button>
                  </form>
                  <span className="dx-tasktitle">
                    {t.title}
                    {t.repeat && t.repeat !== "none" ? (
                      <span className="rep" title={`Repeats ${t.repeat}`} aria-label={`Repeats ${t.repeat}`}>
                        ↻
                      </span>
                    ) : null}
                    {t.notes ? <span className="tk-notes">{t.notes}</span> : null}
                  </span>
                  <span className="who2">
                    {t.account_id ? (
                      <Link className="dx-dealchip" href={`/crm/accounts/${t.account_id}`}>
                        {acctName ?? "Account"}
                      </Link>
                    ) : null}
                    {opp?.id ? (
                      <Link className="dx-dealchip" href={`/crm/opportunities/${opp.id}`}>
                        {opp.name ?? "Opportunity"}
                        {opp.stage ? <span className="dx-muted"> · {stageLabel(opp.stage)}</span> : null}
                      </Link>
                    ) : null}
                    {t.crm_contacts?.name ? <span className="pill navy">{t.crm_contacts.name.toUpperCase()}</span> : null}
                    {t.priority && t.priority !== "normal" ? (
                      <span className={`pill ${t.priority === "high" ? "crit" : "dx-low"}`}>{PRIORITY_LABELS[t.priority]}</span>
                    ) : null}
                    {mine && meChip ? (
                      <span
                        className={`ownchip${photoClass(admin)}`}
                        style={photoStyle(admin)}
                        title={admin.full_name ?? admin.email ?? ""}
                      >
                        {meChip}
                      </span>
                    ) : t.owner_id ? (
                      <span className="pill">OTHER OWNER</span>
                    ) : null}
                    <span className={`pill ball${t.ball === "us" ? " edc" : ""}`}>{BALL_LABELS[t.ball] ?? t.ball.toUpperCase()}</span>
                    {wait !== null ? <span className={`dx-wait${wait >= 5 ? " warn" : ""}`}>waiting {wait}d</span> : null}
                    {isDone ? (
                      <span className="dx-wait">done {fmtDate(t.completed_at)}</span>
                    ) : t.due_date ? (
                      <span className={`pill ${cd.tone}`}>{cd.label.toUpperCase()}</span>
                    ) : null}
                    {!isDone ? (
                      <>
                        {[
                          [1, "+1d", "Snooze a day"],
                          [3, "+3d", "Snooze three days"],
                          [7, "+1w", "Snooze a week"],
                        ].map(([d, label, title]) => (
                          <form key={d} action={snoozeTask} className="tk-inline">
                            <input type="hidden" name="id" value={t.id} />
                            <input type="hidden" name="days" value={d} />
                            <input type="hidden" name="return_to" value={here} />
                            <button className="iconbtn" type="submit" title={String(title)} aria-label={`${title}: ${t.title}`}>
                              {label}
                            </button>
                          </form>
                        ))}
                        <details className="dx-rowmenu">
                          <summary className="iconbtn" aria-label={`Edit ${t.title}`}>
                            Edit
                          </summary>
                          <div className="dx-menu dx-menu-r">
                            <form action={updateTask} className="dform">
                              <input type="hidden" name="id" value={t.id} />
                              <input type="hidden" name="return_to" value={here} />
                              <div>
                                <label htmlFor={`tt-${t.id}`}>TITLE</label>
                                <input id={`tt-${t.id}`} name="title" required maxLength={300} defaultValue={t.title} />
                              </div>
                              <div className="frow2">
                                <div>
                                  <label htmlFor={`tp-${t.id}`}>PRIORITY</label>
                                  <select id={`tp-${t.id}`} name="priority" defaultValue={t.priority ?? "normal"}>
                                    <option value="high">High</option>
                                    <option value="normal">Normal</option>
                                    <option value="low">Low</option>
                                  </select>
                                </div>
                                <div>
                                  <label htmlFor={`td-${t.id}`}>DUE</label>
                                  <input id={`td-${t.id}`} name="due_date" type="date" defaultValue={t.due_date ?? ""} />
                                </div>
                              </div>
                              <div className="frow2">
                                <div>
                                  <label htmlFor={`tb-${t.id}`}>BALL</label>
                                  <select id={`tb-${t.id}`} name="ball" defaultValue={t.ball}>
                                    {Object.entries(BALL_NAMES).map(([k, v]) => (
                                      <option key={k} value={k}>
                                        {v}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label htmlFor={`to-${t.id}`}>OWNER</label>
                                  <select
                                    id={`to-${t.id}`}
                                    name="owner_id"
                                    defaultValue={mine ? "me" : t.owner_id ? "keep" : "none"}
                                  >
                                    {t.owner_id && !mine ? <option value="keep">Other owner</option> : null}
                                    <option value="me">{meLabel}</option>
                                    <option value="none">Unassigned</option>
                                  </select>
                                </div>
                              </div>
                              <div>
                                <label htmlFor={`tr-${t.id}`}>REPEATS</label>
                                <select id={`tr-${t.id}`} name="repeat" defaultValue={t.repeat ?? "none"}>
                                  <option value="none">Does not repeat</option>
                                  <option value="weekly">Weekly</option>
                                  <option value="monthly">Monthly</option>
                                </select>
                              </div>
                              <div>
                                <label htmlFor={`tn-${t.id}`}>NOTES</label>
                                <textarea id={`tn-${t.id}`} name="notes" rows={2} maxLength={5000} defaultValue={t.notes ?? ""} />
                              </div>
                              <button className="dbtn dbtn-line dbtn-sm" type="submit">
                                Save task
                              </button>
                            </form>
                          </div>
                        </details>
                      </>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </section>
        ))}
      </div>
      <TaskBulk scope="dx-tasklist" />
    </div>
  );
}
