import Link from "next/link";
import type { Metadata } from "next";
import { crmPageGate } from "@/lib/crm/auth";
import { loadPeople, type PersonKind, type PersonRow } from "@/lib/crm/people";
import AutoSubmit from "../AutoSubmit";
import EmptyState from "../EmptyState";
import { fmtDate, nowMs, relTime } from "../format";
import "../accounts/accounts.css";

/*
 * People (2026-10-28): everyone who has signed up on dsohire.com plus the
 * job-alert list, one row per person (merged by email). Read-only; the
 * same roster /admin/accounts shows, minus admins and demo seed data.
 */

export const metadata: Metadata = { title: "People" };

type SP = { tab?: string; q?: string };

const TABS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "candidates", label: "Candidates" },
  { key: "employers", label: "Employers" },
  { key: "alerts", label: "Job alerts" },
  { key: "unfinished", label: "No profile" },
];

const KIND_LABELS: Record<PersonKind, string> = {
  candidate: "CANDIDATE",
  employer: "EMPLOYER",
  no_profile: "NO PROFILE",
  alert_only: "ALERTS ONLY",
};
const KIND_TONE: Record<PersonKind, string> = {
  candidate: "good",
  employer: "navy",
  no_profile: "",
  alert_only: "warn",
};

const TAB_FILTER: Record<string, (r: PersonRow) => boolean> = {
  all: () => true,
  candidates: (r) => r.kind === "candidate",
  employers: (r) => r.kind === "employer",
  alerts: (r) => r.alerts.some((a) => a.active),
  unfinished: (r) => r.kind === "no_profile",
};

const EMPTY: Record<string, string> = {
  all: "Nobody has signed up yet.",
  candidates: "No candidate accounts yet.",
  employers: "No employer seats yet.",
  alerts: "Nobody is on a job alert yet.",
  unfinished: "Everyone who signed up finished a profile.",
};

const LIMIT = 500;

export default async function PeoplePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const gate = await crmPageGate("/crm/people");
  if (typeof gate === "string") return null;

  const tab = sp.tab && sp.tab in TAB_FILTER ? sp.tab : "all";
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 100);

  let all: PersonRow[] = [];
  let loadError: string | null = null;
  try {
    all = await loadPeople();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Unknown error";
  }

  const now = nowMs();
  const since = (days: number) => new Date(now - days * 86_400_000).toISOString();
  const s7 = since(7);
  const s30 = since(30);
  /* Job-alert recency counts the alert's own date, not the account's. */
  const firstAlert = (r: PersonRow) => r.alerts.reduce((m, a) => (a.createdAt < m ? a.createdAt : m), r.alerts[0]?.createdAt ?? "");
  const stat = (filter: (r: PersonRow) => boolean, dateOf: (r: PersonRow) => string = (r) => r.createdAt) => {
    const list = all.filter(filter);
    return {
      total: list.length,
      d7: list.filter((r) => dateOf(r) >= s7).length,
      d30: list.filter((r) => dateOf(r) >= s30).length,
    };
  };
  const kpis = [
    { label: "EVERYONE", ...stat(TAB_FILTER.all), tab: "all" },
    { label: "CANDIDATES", ...stat(TAB_FILTER.candidates), tab: "candidates" },
    { label: "EMPLOYER SEATS", ...stat(TAB_FILTER.employers), tab: "employers" },
    { label: "ON JOB ALERTS", ...stat(TAB_FILTER.alerts, firstAlert), tab: "alerts" },
    { label: "NO PROFILE YET", ...stat(TAB_FILTER.unfinished), tab: "unfinished" },
  ];

  const matched = all
    .filter(TAB_FILTER[tab])
    .filter((r) => !q || r.email.toLowerCase().includes(q) || (r.name ?? "").toLowerCase().includes(q));
  const rows = matched.slice(0, LIMIT);

  const href = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    const next = { tab, q: sp.q ?? "", ...patch };
    if (next.tab && next.tab !== "all") p.set("tab", next.tab);
    if (next.q) p.set("q", next.q);
    const s = p.toString();
    return `/crm/people${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <div className="page-head">
        <h1>People</h1>
        <span className="sub2">Everyone who signed up on dsohire.com or joined a job alert, newest first</span>
      </div>

      {loadError ? (
        <div className="sl-banner" role="alert">
          The roster did not load: {loadError}
        </div>
      ) : (
        <div className="kpis sl-kpis5">
          {kpis.map((k) => (
            <Link key={k.label} className="kpi rowlink" href={href({ tab: k.tab })}>
              <div className="kl">{k.label}</div>
              <div className="kv">{k.total}</div>
              <div className="kd">
                +{k.d7} this week · +{k.d30} in 30 days
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="dcardx">
        <div className="sl-chips">
          <span className="sl-chips-l">SHOW</span>
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={href({ tab: t.key })}
              className={`fchip2${tab === t.key ? " on" : ""}`}
              aria-current={tab === t.key ? "page" : undefined}
            >
              {t.label}
              <em>{all.filter(TAB_FILTER[t.key]).length}</em>
            </Link>
          ))}
        </div>
        <form className="sl-filters" id="pp-filters" method="get" action="/crm/people">
          <AutoSubmit formId="pp-filters" />
          {tab !== "all" ? <input type="hidden" name="tab" value={tab} /> : null}
          <div>
            <label htmlFor="pp-q">SEARCH</label>
            <input id="pp-q" type="search" name="q" defaultValue={sp.q ?? ""} maxLength={100} placeholder="Name or email" />
          </div>
          <div className="sl-actions">
            <button className="dbtn dbtn-green dbtn-sm" type="submit">
              Search
            </button>
            {q ? (
              <Link className="sl-clear" href={href({ q: "" })}>
                Clear
              </Link>
            ) : null}
          </div>
        </form>

        {rows.length === 0 ? (
          <EmptyState title={q ? "Nobody matches that search." : EMPTY[tab]} compact />
        ) : (
          <div className="sl-tablewrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>PERSON</th>
                  <th>TYPE</th>
                  <th>DETAIL</th>
                  <th>JOB ALERTS</th>
                  <th className="r">SIGNED UP</th>
                  <th className="r">LAST SIGN-IN</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>
                      <b>{r.name ?? r.email}</b>
                      {r.name && r.email ? (
                        <>
                          <br />
                          <span className="sl-sub">{r.email}</span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      <span className={`pill ${KIND_TONE[r.kind]}`}>{KIND_LABELS[r.kind]}</span>
                      {r.isGuest ? (
                        <>
                          {" "}
                          <span className="pill" title="Applied as a guest without a full account">
                            GUEST
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      {r.crmAccountId ? (
                        <Link className="rowlink" href={`/crm/accounts/${r.crmAccountId}`}>
                          {r.detail}
                        </Link>
                      ) : (
                        r.detail
                      )}
                    </td>
                    <td>
                      {r.alerts.length ? (
                        r.alerts.map((a, i) => (
                          <span key={i} className="sl-sub" style={{ display: "block" }}>
                            {a.label}
                            {a.active ? null : <span className="sl-dim"> (unsubscribed)</span>}
                          </span>
                        ))
                      ) : (
                        <span className="sl-dim">None</span>
                      )}
                    </td>
                    <td className="r sl-num" title={fmtDate(r.createdAt)}>
                      {fmtDate(r.createdAt)}
                    </td>
                    <td className="r sl-num">
                      {r.lastSignInAt ? relTime(r.lastSignInAt) : <span className="sl-dim">Never</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {matched.length > LIMIT ? (
              <div className="sl-sub" style={{ padding: "0.75rem 1.125rem" }}>
                Showing the newest {LIMIT} of {matched.length}. Search to narrow it down.
              </div>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}
