import Link from "next/link";
import { crmPageGate } from "@/lib/crm/auth";
import { UUID_RE } from "@/lib/crm/events";
import ActionError from "../ActionError";
import SavedViews from "../_views/SavedViews";
import AutoSubmit from "../AutoSubmit";
import EmptyState from "../EmptyState";
import { photoClass, photoStyle } from "../avatars";
import {
  LEAD_KIND_LABELS,
  PLAN_LABELS,
  SALES_LEAD_KINDS,
  channelOf,
  demoKeyOf,
  fmtDate,
  initialsOf,
  nowMs,
  relTime,
} from "../format";
import { assignLead, bulkTriage, convertLead, createDemoAccount, linkLeadToAccount, setLeadStatus } from "./actions";
import {
  AUDIENCE_LABELS,
  DQ_REASON,
  LEAD_SELECT,
  OPEN_TRIAGE,
  TRIAGE,
  TRIAGE_SELECT,
  TRIAGE_TONE,
  ageLabel,
  contextSentence,
  leadDemoFor,
  leadEmail,
  leadLocations,
  leadMessage,
  median,
  slaBadge,
  type Lead,
  type Triage,
} from "./lib";
import ScrollToLead from "./ScrollToLead";
import SelectAll from "./SelectAll";
import "../accounts/accounts.css";
import "./inbox.css";

/*
 * Inbox (2026-10-19): a port of the EDC CRM inbox for DSO Hire. Every sales
 * lead the marketing site catches (demo requests, calculator handoffs,
 * contact forms) lands here to be worked, qualified, and converted into an
 * account. A second tab lists who opened their personalized demo link.
 */

type SP = Record<string, string | undefined>;

type Account = { id: string; name: string; demo_for_key: string | null };
type ContactRow = { account_id: string; email: string | null };
type DemoVisit = {
  id: string;
  for_label: string | null;
  for_key: string;
  visits: number;
  created_at: string;
  last_seen_at: string;
};

const PAGE = 50;
const WINDOW = 1000;
const FILTER_KEYS = ["status", "owner", "audience", "kind", "q", "page"] as const;

function audienceKey(a: string | null): string {
  return a === "dso" || a === "candidate" ? a : "other";
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const gate = await crmPageGate("/crm/inbox");
  if (typeof gate === "string") return null;
  const tab = sp.tab === "demos" ? "demos" : "leads";

  return (
    <>
      <ActionError error={sp.error} />
      <div className="page-head">
        <h1>Inbox</h1>
        <span className="sub2">
          {tab === "demos"
            ? "Who opened their personalized demo link, matched to accounts"
            : "Every website lead: work it, qualify it, convert it"}
        </span>
      </div>
      <nav className="sl-tabs" aria-label="Inbox views">
        <Link href="/crm/inbox" className={tab === "leads" ? "on" : undefined} aria-current={tab === "leads" ? "page" : undefined}>
          Leads
        </Link>
        <Link
          href="/crm/inbox?tab=demos"
          className={tab === "demos" ? "on" : undefined}
          aria-current={tab === "demos" ? "page" : undefined}
        >
          Demo opens
        </Link>
      </nav>
      <SavedViews surface="inbox" current={sp} />
      {tab === "demos" ? <DemoOpens session={gate} sp={sp} /> : <Leads session={gate} sp={sp} />}
    </>
  );
}

/* ---------------- leads ---------------- */

async function Leads({
  session,
  sp,
}: {
  session: Exclude<Awaited<ReturnType<typeof crmPageGate>>, string>;
  sp: SP;
}) {
  const { supabase, me, admin } = session;
  const [leadsRes, triageRes, accountsRes, contactsRes] = await Promise.all([
    supabase
      .from("marketing_leads")
      .select(LEAD_SELECT, { count: "exact" })
      .in("kind", SALES_LEAD_KINDS)
      .neq("status", "spam")
      .order("created_at", { ascending: false })
      .range(0, WINDOW - 1),
    supabase.from("crm_lead_triage").select(TRIAGE_SELECT).limit(10000),
    supabase.from("crm_accounts").select("id, name, demo_for_key").is("archived_at", null).limit(5000),
    supabase.from("crm_contacts").select("account_id, email").not("email", "is", null).limit(10000),
  ]);
  const loadError = leadsRes.error ?? triageRes.error;
  const leads = (leadsRes.data ?? []) as unknown as Lead[];
  const totalCount = leadsRes.count ?? leads.length;
  const triage = new Map(((triageRes.data ?? []) as Triage[]).map((t) => [t.lead_id, t]));
  const accounts = (accountsRes.data ?? []) as Account[];
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const accountByName = new Map(accounts.map((a) => [a.name.trim().toLowerCase(), a]));
  const accountByKey = new Map(accounts.filter((a) => a.demo_for_key).map((a) => [a.demo_for_key as string, a]));
  const accountByEmail = new Map<string, Account>();
  for (const c of (contactsRes.data ?? []) as ContactRow[]) {
    const a = accountById.get(c.account_id);
    if (a && c.email) accountByEmail.set(c.email.trim().toLowerCase(), a);
  }
  const matchOf = (l: Lead): Account | null => {
    const email = leadEmail(l);
    if (email && accountByEmail.has(email)) return accountByEmail.get(email)!;
    const co = l.company?.trim().toLowerCase();
    if (co && accountByName.has(co)) return accountByName.get(co)!;
    const demoFor = leadDemoFor(l.context);
    if (demoFor) {
      const k = demoKeyOf(demoFor);
      if (accountByKey.has(k)) return accountByKey.get(k)!;
    }
    return null;
  };

  const now = nowMs();
  const rows = leads.map((l) => {
    const t = triage.get(l.id);
    return { l, t, status: t?.status ?? "new", aud: audienceKey(l.audience) };
  });

  /* KPIs over the loaded window */
  const newCount = rows.filter((r) => r.status === "new").length;
  const overSla = rows.filter((r) => r.status === "new" && now - new Date(r.l.created_at).getTime() > 24 * 3_600_000).length;
  const contacted7 = rows.filter(
    (r) => r.t?.first_contacted_at && now - new Date(r.t.first_contacted_at).getTime() <= 7 * 86_400_000,
  ).length;
  const converted30 = rows.filter(
    (r) =>
      r.status === "converted" &&
      r.t?.status_changed_at &&
      now - new Date(r.t.status_changed_at).getTime() <= 30 * 86_400_000,
  ).length;
  const responseH = rows
    .filter((r) => r.t?.first_contacted_at)
    .map((r) => (new Date(r.t!.first_contacted_at!).getTime() - new Date(r.l.created_at).getTime()) / 3_600_000)
    .filter((h) => h >= 0);

  /* filters */
  const focus = sp.lead && UUID_RE.test(sp.lead) ? sp.lead : null;
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 100);
  const applyFilters = (statusF: string, all: boolean) =>
    rows.filter((r) => {
      if (statusF === "open" ? !OPEN_TRIAGE.has(r.status) : statusF !== "all" && r.status !== statusF) return false;
      if (all) return true;
      if (sp.owner) {
        const o = r.t?.owner_id ?? null;
        if (sp.owner === "unassigned" ? !!o : sp.owner === "me" ? o !== me : false) return false;
      }
      if (sp.audience && r.aud !== sp.audience) return false;
      if (sp.kind && r.l.kind !== sp.kind) return false;
      if (q) {
        const hay = [r.l.name, r.l.company, r.l.contact, leadMessage(r.l.context), r.l.source_path]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  let statusF = sp.status ?? "open";
  let filtered = applyFilters(statusF, false);
  /* a search result link must land on its lead, whatever the filters say */
  const focusInWindow = !!focus && rows.some((r) => r.l.id === focus);
  if (focus && focusInWindow && !filtered.some((r) => r.l.id === focus)) {
    statusF = "all";
    filtered = applyFilters("all", true);
  }
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const focusIdx = focus ? filtered.findIndex((r) => r.l.id === focus) : -1;
  const pageRaw = sp.page ? Number.parseInt(sp.page, 10) : focusIdx >= 0 ? Math.floor(focusIdx / PAGE) + 1 : 1;
  const page = Math.min(pages, Math.max(1, pageRaw || 1));
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE);

  const qsObj = (over: SP = {}) => {
    const p = new URLSearchParams();
    for (const k of FILTER_KEYS) {
      const v = k in over ? over[k] : k === "status" ? (statusF === "open" ? undefined : statusF) : sp[k];
      if (v) p.set(k, v);
    }
    return p.toString();
  };
  const href = (over: SP = {}) => {
    const s = qsObj({ page: undefined, ...over });
    return s ? `/crm/inbox?${s}` : "/crm/inbox";
  };
  const returnQs = qsObj();
  const meChip = initialsOf(admin);
  const meLabel = admin.full_name?.trim().split(/\s+/)[0] || "Me";

  return (
    <>
      {focus ? <ScrollToLead id={focus} /> : null}
      {loadError ? (
        <div className="sl-banner" role="alert">
          The inbox could not load every lead: {loadError.message}
        </div>
      ) : null}

      <div className="kpis sl-kpis5">
        <Link className="kpi rowlink" href={href({ status: "new" })}>
          <div className="kl">NEW AND UNWORKED</div>
          <div className="kv">{newCount}</div>
        </Link>
        <Link className="kpi rowlink" href={href({ status: "new" })}>
          <div className="kl">OVER SLA (24H)</div>
          <div className={`kv${overSla ? " sl-crit" : ""}`}>{overSla}</div>
        </Link>
        <div className="kpi">
          <div className="kl">CONTACTED · 7 DAYS</div>
          <div className="kv">{contacted7}</div>
        </div>
        <Link className="kpi rowlink" href={href({ status: "converted" })}>
          <div className="kl">CONVERTED · 30 DAYS</div>
          <div className="kv">{converted30}</div>
        </Link>
        <div className="kpi">
          <div className="kl">MEDIAN FIRST RESPONSE</div>
          {responseH.length >= 3 ? (
            <div className="kv">
              {median(responseH) < 1 ? "<1" : Math.round(median(responseH))}
              <em>h</em>
            </div>
          ) : (
            <div className="kv sl-kv-sm sl-dim">Not enough data yet</div>
          )}
        </div>
      </div>

      <div className="dcardx">
        <div className="ch">
          <h3>Leads</h3>
          <span className="mini">
            {filtered.length} MATCH · {totalCount} TOTAL
          </span>
        </div>
        <form id="ib-filters" className="sl-filters" method="get" action="/crm/inbox">
          <AutoSubmit formId="ib-filters" />
          <div>
            <label htmlFor="ib-q">SEARCH</label>
            <input
              id="ib-q"
              type="search"
              name="q"
              defaultValue={sp.q ?? ""}
              maxLength={100}
              placeholder="Name, company, email, phone, message"
            />
          </div>
          <div>
            <label htmlFor="ib-kind">KIND</label>
            <select id="ib-kind" name="kind" defaultValue={sp.kind ?? ""}>
              <option value="">All</option>
              {SALES_LEAD_KINDS.map((k) => (
                <option key={k} value={k}>
                  {LEAD_KIND_LABELS[k] ?? k}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ib-owner">OWNER</label>
            <select id="ib-owner" name="owner" defaultValue={sp.owner ?? ""}>
              <option value="">Anyone</option>
              <option value="me">Me</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </div>
          <div>
            <label htmlFor="ib-aud">AUDIENCE</label>
            <select id="ib-aud" name="audience" defaultValue={sp.audience ?? ""}>
              <option value="">All</option>
              <option value="dso">DSOs</option>
              <option value="candidate">Candidates</option>
              <option value="other">Not stated</option>
            </select>
          </div>
          {statusF !== "open" ? <input type="hidden" name="status" value={statusF} /> : null}
          <div className="sl-actions">
            <button className="dbtn dbtn-green dbtn-sm" type="submit">
              Apply
            </button>
            {sp.q || sp.owner || sp.audience || sp.kind || sp.status || sp.lead ? (
              <Link className="sl-clear" href="/crm/inbox">
                Clear
              </Link>
            ) : null}
          </div>
        </form>
        <div className="sl-chips">
          <span className="sl-chips-l">STATUS</span>
          {[["open", "Open"], ...Object.entries(TRIAGE), ["all", "All"]].map(([k, v]) => (
            <Link
              key={k}
              className={`fchip2${statusF === k ? " on" : ""}`}
              href={href({ status: k === "open" ? undefined : k })}
            >
              {v}
            </Link>
          ))}
        </div>
        {focus && !focusInWindow ? (
          <div className="sl-note">
            That lead is not in this list. It may be marked spam, or it is older than the newest{" "}
            {WINDOW.toLocaleString()}.
          </div>
        ) : null}

        {shown.length ? (
          <form id="inbox-bulk" action={bulkTriage} className="bulkbar sl-bulk">
            <input type="hidden" name="return_qs" value={returnQs} />
            <SelectAll formId="inbox-bulk" />
            <span className="bgroup">
              <select name="status" defaultValue="" aria-label="Set status">
                <option value="">Status unchanged</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="disqualified">Disqualified</option>
              </select>
              <select name="disqualify_reason" defaultValue="" aria-label="Disqualify reason">
                <option value="">Reason (to disqualify)</option>
                {Object.entries(DQ_REASON).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select name="owner_id" defaultValue="" aria-label="Set owner">
                <option value="">Owner unchanged</option>
                <option value="me">{meLabel}</option>
                <option value="none">Unassigned</option>
              </select>
              <button className="dbtn dbtn-green dbtn-sm" type="submit">
                Apply
              </button>
            </span>
          </form>
        ) : null}

        {leads.length === 0 ? (
          <EmptyState
            title="No leads yet"
            body="Demo requests, calculator handoffs, and contact forms land here the moment the site catches one."
          />
        ) : shown.length === 0 ? (
          <EmptyState title="No lead matches these filters" action={{ href: "/crm/inbox", label: "Clear filters" }} compact />
        ) : (
          shown.map(({ l, t, status }) => {
            const ctxLine = contextSentence(l.kind, l.context);
            const message = leadMessage(l.context);
            const channel = channelOf(l.utm, l.referrer);
            const sla = slaBadge(l.created_at, status, t?.status_changed_at, now);
            const mine = t?.owner_id === me;
            const dup = status !== "converted" ? matchOf(l) : null;
            const done = status === "converted" || status === "disqualified";
            const linked = t?.account_id ? accountById.get(t.account_id) : null;
            const email = leadEmail(l);
            const demoFor = leadDemoFor(l.context);
            const locations = leadLocations(l.context);
            const tier = String(l.context?.recommended_tier ?? "").trim().toLowerCase();
            const carry = [
              locations ? `${locations} locations` : null,
              message ? "the message as account notes" : null,
              demoFor ? `demo link ${demoFor}` : null,
              tier in PLAN_LABELS ? `${PLAN_LABELS[tier]} plan on the opportunity` : null,
            ].filter(Boolean);
            const utmEntries = l.utm ? Object.entries(l.utm).slice(0, 12) : [];
            return (
              <div
                key={l.id}
                id={`lead-${l.id}`}
                className={`sl-lead${done ? " sl-done" : ""}${focus === l.id ? " ib-focus" : ""}`}
              >
                <input type="checkbox" name="ids" value={l.id} form="inbox-bulk" aria-label={`Select lead from ${l.company || l.name || l.contact}`} />
                <div>
                  <div className="sl-who">
                    <b>{l.company || l.name || "No name given"}</b>
                    {l.company && l.name ? ` · ${l.name}` : ""}
                    {" · "}
                    {email ? <a href={`mailto:${email}`}>{l.contact}</a> : <a href={`tel:${l.contact}`}>{l.contact}</a>}
                  </div>
                  <div className="sl-agerow ib-agerow">
                    <span className="sl-age" title={new Date(l.created_at).toISOString()}>
                      {fmtDate(l.created_at).toUpperCase()} · {ageLabel(l.created_at, now).toUpperCase()} AGO
                    </span>
                    <span className={`pill ${TRIAGE_TONE[status] ?? ""}`}>
                      {(TRIAGE[status] ?? status).toUpperCase()}
                      {status === "disqualified" && t?.disqualify_reason
                        ? ` · ${(DQ_REASON[t.disqualify_reason] ?? t.disqualify_reason).toUpperCase()}`
                        : ""}
                    </span>
                    {sla ? <span className={`pill ${sla.tone} sl-sla`}>{sla.label}</span> : null}
                    {mine && meChip ? (
                      <span className={`ownchip${photoClass(admin)}`} style={photoStyle(admin)} title={admin.full_name ?? admin.email ?? ""}>
                        {meChip}
                      </span>
                    ) : t?.owner_id ? (
                      <span className="pill">OTHER OWNER</span>
                    ) : null}
                    {dup ? (
                      <Link className="pill warn sl-dup" href={`/crm/accounts/${dup.id}`}>
                        {`POSSIBLE MATCH · ${dup.name.toUpperCase()}`}
                      </Link>
                    ) : null}
                  </div>
                  <div className="lead-chips">
                    <span className="pill navy">{(LEAD_KIND_LABELS[l.kind] ?? l.kind).toUpperCase()}</span>
                    {l.audience ? <span className="pill">{(AUDIENCE_LABELS[l.audience] ?? l.audience).toUpperCase()}</span> : null}
                    <span className="pill">{`VIA ${channel.toUpperCase()}`}</span>
                    {l.source_path ? <span className="pill">{`FROM ${l.source_path.slice(0, 60).toUpperCase()}`}</span> : null}
                  </div>
                  {ctxLine ? <p className="lead-ctx">{ctxLine}</p> : null}
                  {message ? <div className="sl-msg">{message}</div> : null}
                  {l.source_path || l.referrer || utmEntries.length ? (
                    <details>
                      <summary>Attribution</summary>
                      <div className="kvrow ib-kv">
                        <span className="k2">Captured on</span>
                        <span className="v2">{l.source_path ?? "Not recorded"}</span>
                      </div>
                      <div className="kvrow ib-kv">
                        <span className="k2">Referrer</span>
                        <span className="v2 ib-wrap">{l.referrer ?? "None"}</span>
                      </div>
                      {utmEntries.map(([k, v]) => (
                        <div key={k} className="kvrow ib-kv">
                          <span className="k2">{k}</span>
                          <span className="v2 ib-wrap">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                        </div>
                      ))}
                    </details>
                  ) : null}
                </div>

                <div className="sl-side">
                  {status === "converted" ? (
                    linked ? (
                      <Link className="dbtn dbtn-line dbtn-sm" href={`/crm/accounts/${linked.id}`}>
                        Open {linked.name}
                      </Link>
                    ) : (
                      <span className="pill good">CONVERTED</span>
                    )
                  ) : (
                    <>
                      <form className="sl-mini" action={setLeadStatus}>
                        <input type="hidden" name="lead_id" value={l.id} />
                        <input type="hidden" name="return_qs" value={returnQs} />
                        <select
                          name="status"
                          defaultValue={OPEN_TRIAGE.has(status) || status === "disqualified" ? status : "new"}
                          aria-label="Status"
                        >
                          {status === "disqualified" ? (
                            <option value="disqualified" disabled>
                              Disqualified
                            </option>
                          ) : null}
                          <option value="new">{status === "disqualified" ? "Reopen as New" : "New"}</option>
                          <option value="contacted">Contacted</option>
                          <option value="qualified">Qualified</option>
                        </select>
                        <button className="dbtn dbtn-line dbtn-sm" type="submit">
                          Save
                        </button>
                      </form>
                      <form className="sl-mini" action={assignLead}>
                        <input type="hidden" name="lead_id" value={l.id} />
                        <input type="hidden" name="return_qs" value={returnQs} />
                        <select name="owner_id" defaultValue={mine ? "me" : "none"} aria-label="Owner">
                          <option value="none">{t?.owner_id && !mine ? "Other owner" : "Unassigned"}</option>
                          <option value="me">{meLabel}</option>
                        </select>
                        <button className="dbtn dbtn-line dbtn-sm" type="submit">
                          Assign
                        </button>
                      </form>
                      {status !== "disqualified" ? (
                        <form className="sl-mini" action={setLeadStatus}>
                          <input type="hidden" name="lead_id" value={l.id} />
                          <input type="hidden" name="return_qs" value={returnQs} />
                          <input type="hidden" name="status" value="disqualified" />
                          <select name="disqualify_reason" defaultValue="" required aria-label="Disqualify reason">
                            <option value="" disabled>
                              Reason
                            </option>
                            {Object.entries(DQ_REASON).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                          <button className="dbtn dbtn-line dbtn-sm" type="submit">
                            Disqualify
                          </button>
                        </form>
                      ) : null}
                      {dup ? (
                        <form action={linkLeadToAccount}>
                          <input type="hidden" name="lead_id" value={l.id} />
                          <input type="hidden" name="account_id" value={dup.id} />
                          <input type="hidden" name="return_qs" value={returnQs} />
                          <button className="dbtn dbtn-line dbtn-sm ib-full" type="submit">
                            Link to {dup.name}
                          </button>
                        </form>
                      ) : null}
                      <details className="sl-convert">
                        <summary>Convert to account</summary>
                        <form className="dform" action={convertLead}>
                          <input type="hidden" name="lead_id" value={l.id} />
                          <input type="hidden" name="return_qs" value={returnQs} />
                          <div>
                            <label htmlFor={`cv-a-${l.id}`}>ACCOUNT NAME</label>
                            <input
                              id={`cv-a-${l.id}`}
                              name="account_name"
                              maxLength={160}
                              required
                              defaultValue={l.company ?? demoFor ?? ""}
                              placeholder="The dental group"
                            />
                          </div>
                          <div className="frow2">
                            <div>
                              <label htmlFor={`cv-c-${l.id}`}>CONTACT</label>
                              <input id={`cv-c-${l.id}`} name="contact_name" maxLength={160} defaultValue={l.name ?? ""} />
                            </div>
                            <div>
                              <label htmlFor={`cv-t-${l.id}`}>TITLE</label>
                              <input id={`cv-t-${l.id}`} name="contact_title" maxLength={160} placeholder="Optional" />
                            </div>
                          </div>
                          <div className="frow2">
                            <div>
                              <label htmlFor={`cv-o-${l.id}`}>OWNER</label>
                              <select id={`cv-o-${l.id}`} name="owner_id" defaultValue="me">
                                <option value="me">{meLabel}</option>
                                <option value="none">Unassigned</option>
                              </select>
                            </div>
                            <div>
                              <label htmlFor={`cv-p-${l.id}`}>OPPORTUNITY</label>
                              <input id={`cv-p-${l.id}`} name="opp_name" maxLength={160} placeholder="Optional" />
                            </div>
                          </div>
                          <div className="sl-carry">
                            Leave the opportunity blank to create the account only. With a name, an opportunity opens
                            in Engaged.
                            {carry.length ? (
                              <>
                                <br />
                                Carries over: <b>{carry.join(", ")}</b>.
                              </>
                            ) : null}
                          </div>
                          <div>
                            <button className="dbtn dbtn-green dbtn-sm" type="submit">
                              Convert
                            </button>
                          </div>
                        </form>
                      </details>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
        {pages > 1 ? (
          <div className="sl-pager">
            {page > 1 ? <Link href={`/crm/inbox?${qsObj({ page: String(page - 1) })}`}>Newer</Link> : <span />}
            <span>
              Page {page} of {pages}
            </span>
            {page < pages ? <Link href={`/crm/inbox?${qsObj({ page: String(page + 1) })}`}>Older</Link> : <span />}
          </div>
        ) : null}
        {totalCount > WINDOW ? (
          <div className="sl-note ib-last">
            Showing the newest {WINDOW.toLocaleString()} of {totalCount.toLocaleString()} leads.
          </div>
        ) : null}
      </div>
    </>
  );
}

/* ---------------- demo opens ---------------- */

async function DemoOpens({
  session,
  sp,
}: {
  session: Exclude<Awaited<ReturnType<typeof crmPageGate>>, string>;
  sp: SP;
}) {
  const { supabase } = session;
  const [visitsRes, anonRes] = await Promise.all([
    supabase
      .from("demo_visits")
      .select("id, for_label, for_key, visits, created_at, last_seen_at")
      .not("for_key", "is", null)
      .neq("for_key", "qa-probe")
      .order("last_seen_at", { ascending: false })
      .limit(500),
    supabase.from("demo_visits").select("id", { count: "exact", head: true }).is("for_key", null),
  ]);
  const visits = (visitsRes.data ?? []) as DemoVisit[];
  const keys = visits.map((v) => v.for_key);
  const { data: acctRows } = keys.length
    ? await supabase.from("crm_accounts").select("id, name, demo_for_key").in("demo_for_key", keys)
    : { data: [] as Account[] };
  const acctByKey = new Map(((acctRows ?? []) as Account[]).map((a) => [a.demo_for_key as string, a]));

  const now = nowMs();
  const opens = visits.reduce((s, v) => s + (v.visits ?? 0), 0);
  const recent7 = visits.filter((v) => now - new Date(v.last_seen_at).getTime() <= 7 * 86_400_000).length;
  const unmatched = visits.filter((v) => !acctByKey.has(v.for_key)).length;
  const show = sp.show === "unmatched" || sp.show === "matched" ? sp.show : "all";
  const shown = visits.filter((v) =>
    show === "unmatched" ? !acctByKey.has(v.for_key) : show === "matched" ? acctByKey.has(v.for_key) : true,
  );

  return (
    <>
      {visitsRes.error ? (
        <div className="sl-banner" role="alert">
          Demo opens could not load: {visitsRes.error.message}
        </div>
      ) : null}
      <div className="kpis sl-kpis5">
        <div className="kpi">
          <div className="kl">NAMED LINKS OPENED</div>
          <div className="kv">{visits.length}</div>
        </div>
        <div className="kpi">
          <div className="kl">TOTAL OPENS</div>
          <div className="kv">{opens}</div>
        </div>
        <div className="kpi">
          <div className="kl">OPENED · 7 DAYS</div>
          <div className="kv">{recent7}</div>
        </div>
        <Link className="kpi rowlink" href="/crm/inbox?tab=demos&show=unmatched">
          <div className="kl">NOT IN THE CRM YET</div>
          <div className={`kv${unmatched ? " sl-crit" : ""}`}>{unmatched}</div>
        </Link>
        <div className="kpi">
          <div className="kl">ANONYMOUS OPENS</div>
          <div className="kv">{anonRes.count ?? "n/a"}</div>
        </div>
      </div>

      <div className="dcardx">
        <div className="ch">
          <h3>Personalized demo links</h3>
          <span className="mini">{shown.length} SHOWN</span>
        </div>
        <div className="sl-chips">
          <span className="sl-chips-l">SHOW</span>
          {(
            [
              ["all", "All"],
              ["unmatched", "Not in the CRM"],
              ["matched", "Matched to an account"],
            ] as const
          ).map(([k, label]) => (
            <Link
              key={k}
              className={`fchip2${show === k ? " on" : ""}`}
              href={k === "all" ? "/crm/inbox?tab=demos" : `/crm/inbox?tab=demos&show=${k}`}
            >
              {label}
            </Link>
          ))}
        </div>
        {visits.length === 0 ? (
          <EmptyState
            title="No demo links opened yet"
            body="Send a personalized link (demo.dsohire.com/demo?for=Group) and each open shows up here."
          />
        ) : shown.length === 0 ? (
          <EmptyState title="Nothing in this view" compact />
        ) : (
          <div className="sl-tablewrap">
            <table className="tbl ib-demotbl">
              <thead>
                <tr>
                  <th>GROUP</th>
                  <th className="r">OPENS</th>
                  <th>FIRST OPENED</th>
                  <th>LAST SEEN</th>
                  <th>ACCOUNT</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((v) => {
                  const a = acctByKey.get(v.for_key);
                  const hot = now - new Date(v.last_seen_at).getTime() <= 48 * 3_600_000;
                  const seen = relTime(v.last_seen_at);
                  const seenLabel = seen === "now" ? "just now" : /^\d+[mhd]$/.test(seen) ? `${seen} ago` : seen;
                  return (
                    <tr key={v.id}>
                      <td>
                        <b>{v.for_label ?? v.for_key}</b>
                        <div className="sl-sub">?for={v.for_key}</div>
                      </td>
                      <td className="r sl-num">{v.visits}</td>
                      <td>{fmtDate(v.created_at)}</td>
                      <td>
                        <span className={hot ? "sl-warn" : undefined} title={new Date(v.last_seen_at).toISOString()}>
                          {seenLabel}
                        </span>
                      </td>
                      <td>
                        {a ? (
                          <Link className="ib-acct" href={`/crm/accounts/${a.id}`}>
                            {a.name}
                          </Link>
                        ) : (
                          <form action={createDemoAccount}>
                            <input type="hidden" name="for_key" value={v.for_key} />
                            <button className="dbtn dbtn-line dbtn-sm" type="submit">
                              Create account
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {visits.length >= 500 ? <div className="sl-note ib-last">Showing the 500 most recently opened links.</div> : null}
      </div>
    </>
  );
}
