import Link from "next/link";
import type { Metadata } from "next";
import { crmPageGate } from "@/lib/crm/auth";
import ActionError from "../ActionError";
import AutoSubmit from "../AutoSubmit";
import EmptyState from "../EmptyState";
import { photoClass, photoStyle } from "../avatars";
import {
  ACCOUNT_STATUS_LABELS,
  PLAN_LABELS,
  SOURCE_LABELS,
  TEMPLATE_STAGES,
  fmtDate,
  fmtMoney,
  initialsOf,
  isoPlusDays,
  relTime,
  stageLabel,
  suggestPlan,
  todayIso,
} from "../format";
import { bulkAccounts, createAccount } from "./actions";
import {
  FIT_LABELS,
  FILTER_KEYS,
  SORTS,
  VIEWS,
  enrichAccounts,
  filterAccounts,
  filtersFrom,
  hostOf,
  listQs,
  openMrr,
  sortAccounts,
  type AccountLite,
  type DemoVisit,
  type OppLite,
} from "./lib";
import SavedViews from "../_views/SavedViews";
import SelectAll from "./SelectAll";
import { FitPill, StatusPill, Warmth } from "./ui";
import "./accounts.css";

export const metadata: Metadata = { title: "Accounts" };

type SP = Record<string, string | undefined>;

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const sp: SP = {};
  for (const [k, v] of Object.entries(raw)) sp[k] = (Array.isArray(v) ? v[0] : v)?.slice(0, 100);

  const gate = await crmPageGate("/crm/accounts");
  if (gate === "denied" || gate === "needs_mfa") return null;
  const { supabase, me, admin } = gate;

  const archivedView = sp.archived === "1";
  let acctQ = supabase.from("crm_accounts").select("*").order("created_at", { ascending: false }).limit(3000);
  acctQ = archivedView ? acctQ.not("archived_at", "is", null) : acctQ.is("archived_at", null);
  const [acctRes, oppRes, visitRes] = await Promise.all([
    acctQ,
    supabase
      .from("crm_opportunities")
      .select("id, account_id, name, stage, plan_tier, billing, mrr, updated_at")
      .limit(5000),
    supabase
      .from("demo_visits")
      .select("for_key, for_label, visits, last_seen_at")
      .not("for_key", "is", null)
      .limit(5000),
  ]);

  const all = enrichAccounts(
    (acctRes.data ?? []) as AccountLite[],
    (oppRes.data ?? []) as OppLite[],
    (visitRes.data ?? []) as DemoVisit[],
  );
  const today = todayIso();
  const weekEnd = isoPlusDays(today, 7);
  const rows = sortAccounts(
    filterAccounts(all, filtersFrom((k) => sp[k]), { me, today }),
    sp.sort,
    sp.dir,
  );
  const anyFilter = FILTER_KEYS.some((k) => k !== "sort" && k !== "dir" && k !== "archived" && sp[k]);
  const sortKey = SORTS[sp.sort ?? ""] ? (sp.sort as string) : "next_step";

  const overdue = all.filter((r) => r.next_step_due && String(r.next_step_due) < today).length;
  const dueWeek = all.filter(
    (r) => r.next_step_due && String(r.next_step_due) >= today && String(r.next_step_due) <= weekEnd,
  ).length;
  const inPipeline = all.filter((r) => r.openOpps.length).length;
  const pipeMrr = openMrr(all);
  const states = [
    ...new Set(
      all.flatMap((r) => [r.hq_state, ...(r.states ?? [])]).map((s) => String(s ?? "").trim().toUpperCase()).filter(Boolean),
    ),
  ].sort();
  const returnQs = listQs(sp);
  const base = archivedView ? "/crm/accounts?archived=1" : "/crm/accounts";
  const href = (over: Parameters<typeof listQs>[1]) => `/crm/accounts${listQs(sp, over)}`;
  const viewHref = (params: Record<string, string>, key: string) => {
    const p = new URLSearchParams({ ...params, view: key });
    return `/crm/accounts?${p.toString()}`;
  };
  const showNew = sp.new === "1" || (!all.length && !archivedView && !acctRes.error);

  return (
    <>
      <ActionError error={sp.error} />
      <div className="page-head">
        <h1>{archivedView ? "Archived accounts" : "Accounts"}</h1>
        <span className="sub2">
          {archivedView
            ? "Groups taken off the list. Open one to restore it."
            : "Every dental group we sell to, how warm they are, and the next step"}
        </span>
        <div className="right">
          <a className="dbtn dbtn-line dbtn-sm" href={`/crm/accounts/export${listQs(sp)}`}>
            Export CSV
          </a>
          {archivedView ? (
            <Link className="dbtn dbtn-line dbtn-sm" href="/crm/accounts">
              Back to live accounts
            </Link>
          ) : (
            <Link className="dbtn dbtn-green dbtn-sm" href="/crm/accounts?new=1#new-account">
              + New account
            </Link>
          )}
        </div>
      </div>

      {sp.archived_one === "1" ? (
        <div className="sl-banner">
          Account archived. It is off the list and the pipeline views; find it under{" "}
          <Link href="/crm/accounts?archived=1">Archived</Link> to restore it.
        </div>
      ) : null}
      {acctRes.error ? (
        <div className="sl-banner">The accounts did not load: {acctRes.error.message}</div>
      ) : null}

      {!archivedView ? (
        <div className="kpis sl-kpis5">
          <div className="kpi">
            <div className="kl">ON FILE</div>
            <div className="kv">{all.length}</div>
          </div>
          <Link className="kpi rowlink" href={href({ due: "overdue", view: null })}>
            <div className="kl">NEXT STEPS OVERDUE</div>
            <div className={`kv${overdue ? " sl-crit" : ""}`}>{overdue}</div>
          </Link>
          <Link className="kpi rowlink" href={href({ due: "week", view: null })}>
            <div className="kl">DUE THIS WEEK</div>
            <div className="kv">{dueWeek}</div>
          </Link>
          <Link className="kpi rowlink" href={href({ opp: "open", view: null })}>
            <div className="kl">IN ACTIVE PIPELINE</div>
            <div className="kv">{inPipeline}</div>
          </Link>
          <div className="kpi" title="Open opportunities at their set MRR, else their plan's list price">
            <div className="kl">OPEN PIPELINE / MO</div>
            {pipeMrr > 0 ? (
              <div className="kv">{fmtMoney(pipeMrr)}</div>
            ) : (
              <div className="kv sl-kv-sm sl-dim">None open</div>
            )}
          </div>
        </div>
      ) : null}

      {showNew ? (
        <div className="sl-newwrap">
          <div className="dcardx">
            <details className="sl-formcard" id="new-account" open>
              <summary className="ch">
                <h3>New account</h3>
                <span className="mini">CHECKS FOR DUPLICATES</span>
                {all.length ? (
                  <Link className="mini sl-cancel" href="/crm/accounts">
                    CANCEL ✕
                  </Link>
                ) : null}
              </summary>
              <form className="dform" action={createAccount}>
                <div className="frow2">
                  <div>
                    <label htmlFor="na-name">GROUP NAME</label>
                    <input id="na-name" name="name" required maxLength={160} placeholder="Bright Direction Dental" />
                  </div>
                  <div>
                    <label htmlFor="na-web">WEBSITE</label>
                    <input id="na-web" name="website" maxLength={300} placeholder="brightdirectiondental.com" />
                  </div>
                </div>
                <div className="sl-frow3">
                  <div>
                    <label htmlFor="na-state">HQ STATE</label>
                    <input id="na-state" name="hq_state" maxLength={40} placeholder="TX" />
                  </div>
                  <div>
                    <label htmlFor="na-loc">LOCATIONS</label>
                    <input id="na-loc" name="locations" type="number" min={0} max={5000} step={1} />
                  </div>
                  <div>
                    <label htmlFor="na-roles">OPEN ROLES</label>
                    <input id="na-roles" name="open_roles" type="number" min={0} max={100000} step={1} />
                  </div>
                </div>
                <div className="frow2">
                  <div>
                    <label htmlFor="na-tool">CURRENT HIRING TOOL</label>
                    <input id="na-tool" name="current_tool" maxLength={200} placeholder="Indeed, an agency, an ATS" />
                  </div>
                  <div>
                    <label htmlFor="na-owner">WHO OWNS HIRING</label>
                    <input id="na-owner" name="hiring_owner_title" maxLength={200} placeholder="VP of People, COO" />
                  </div>
                </div>
                <div className="sl-frow3">
                  <div>
                    <label htmlFor="na-status">STATUS</label>
                    <select id="na-status" name="status" defaultValue="target">
                      {Object.entries(ACCOUNT_STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="na-fit">FIT TIER</label>
                    <select id="na-fit" name="fit_tier" defaultValue="">
                      <option value="">Not set</option>
                      {Object.entries(FIT_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="na-source">SOURCE</label>
                    <select id="na-source" name="source" defaultValue="research">
                      {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="frow2">
                  <div>
                    <label htmlFor="na-next">NEXT STEP</label>
                    <input id="na-next" name="next_step" maxLength={300} placeholder="Send the personalized demo link" />
                  </div>
                  <div>
                    <label htmlFor="na-due">NEXT STEP DUE</label>
                    <input id="na-due" name="next_step_due" type="date" />
                  </div>
                </div>
                <fieldset className="ac-fieldset">
                  <legend className="sl-legend">FIRST CONTACT (OPTIONAL)</legend>
                  <div className="frow2">
                    <div>
                      <label htmlFor="na-cname">NAME</label>
                      <input id="na-cname" name="contact_name" maxLength={160} />
                    </div>
                    <div>
                      <label htmlFor="na-ctitle">TITLE</label>
                      <input id="na-ctitle" name="contact_title" maxLength={160} placeholder="Director of Recruiting" />
                    </div>
                  </div>
                  <div className="frow2">
                    <div>
                      <label htmlFor="na-cemail">EMAIL</label>
                      <input id="na-cemail" name="contact_email" type="email" maxLength={320} />
                    </div>
                    <div>
                      <label htmlFor="na-crole">ROLE</label>
                      <select id="na-crole" name="contact_role" defaultValue="other">
                        <option value="decision_maker">Decision maker</option>
                        <option value="champion">Champion</option>
                        <option value="connector">Connector</option>
                        <option value="recruiter">Recruiter</option>
                        <option value="user">User</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                </fieldset>
                <div>
                  <label htmlFor="na-notes">NOTES</label>
                  <textarea id="na-notes" name="notes" rows={3} maxLength={20000} />
                </div>
                <div className="sl-check">
                  <label>
                    <input type="checkbox" name="allow_dup" /> Add anyway, even if the website matches an account on file
                  </label>
                </div>
                <div>
                  <button className="dbtn dbtn-green" type="submit">
                    Add account
                  </button>
                </div>
              </form>
            </details>
          </div>
        </div>
      ) : null}

      <div className="dcardx">
        <div className="ch">
          <h3>{archivedView ? "Archived" : "Account records"}</h3>
          <span className="mini">
            {rows.length} OF {all.length} · SORTED BY {(SORTS[sortKey] ?? "Next step due").toUpperCase()}
          </span>
        </div>
        {!archivedView ? (
          <div className="sl-chips">
            <span className="sl-chips-l">VIEWS</span>
            <Link className={`fchip2${!anyFilter ? " on" : ""}`} href="/crm/accounts">
              Everything
            </Link>
            {VIEWS.map((v) => (
              <Link
                key={v.key}
                className={`fchip2${sp.view === v.key ? " on" : ""}`}
                href={sp.view === v.key ? "/crm/accounts" : viewHref(v.params, v.key)}
                title={v.hint}
              >
                {v.label}
              </Link>
            ))}
          </div>
        ) : null}
        {!archivedView ? <SavedViews surface="accounts" current={returnQs} /> : null}
        <form className="sl-filters" id="ac-filters" method="get" action="/crm/accounts">
          <AutoSubmit formId="ac-filters" />
          {archivedView ? <input type="hidden" name="archived" value="1" /> : null}
          <div>
            <label htmlFor="ac-q">SEARCH</label>
            <input
              id="ac-q"
              type="search"
              name="q"
              defaultValue={sp.q ?? ""}
              maxLength={100}
              placeholder="Name, website, state, tool, next step"
            />
          </div>
          <div>
            <label htmlFor="ac-fit">FIT</label>
            <select id="ac-fit" name="fit" defaultValue={sp.fit ?? ""}>
              <option value="">Any</option>
              {Object.entries(FIT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
              <option value="none">Not tiered</option>
            </select>
          </div>
          <div>
            <label htmlFor="ac-warm">WARMTH</label>
            <select id="ac-warm" name="warmth" defaultValue={sp.warmth ?? ""}>
              <option value="">Any</option>
              {[2, 3, 4, 5].map((n) => (
                <option key={n} value={String(n)}>
                  {n} or warmer
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ac-state">STATE</label>
            <select id="ac-state" name="state" defaultValue={sp.state ?? ""}>
              <option value="">All</option>
              {states.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ac-opp">PIPELINE</label>
            <select id="ac-opp" name="opp" defaultValue={sp.opp ?? ""}>
              <option value="">Any</option>
              <option value="open">Has an open opportunity</option>
              <option value="none">No open opportunity</option>
              {TEMPLATE_STAGES.filter((s) => s !== "won").map((s) => (
                <option key={s} value={s}>
                  {stageLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ac-source">SOURCE</label>
            <select id="ac-source" name="source" defaultValue={sp.source ?? ""}>
              <option value="">Any</option>
              {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ac-owner">OWNER</label>
            <select id="ac-owner" name="owner" defaultValue={sp.owner ?? ""}>
              <option value="">Anyone</option>
              <option value="me">Me</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </div>
          <div>
            <label htmlFor="ac-sort">SORT</label>
            <select id="ac-sort" name="sort" defaultValue={sortKey}>
              {Object.entries(SORTS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ac-dir">ORDER</label>
            <select id="ac-dir" name="dir" defaultValue={sp.dir ?? ""}>
              <option value="">Default</option>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
          {(["status", "due", "quiet", "demo", "view"] as const).map((k) =>
            sp[k] ? <input key={k} type="hidden" name={k} value={sp[k]} /> : null,
          )}
          <div className="sl-actions">
            <button className="dbtn dbtn-green dbtn-sm" type="submit">
              Apply
            </button>
            {anyFilter ? (
              <Link className="sl-clear" href={base}>
                Clear
              </Link>
            ) : null}
          </div>
        </form>
        <div className="sl-chips">
          <span className="sl-chips-l">STATUS</span>
          <Link className={`fchip2${!sp.status ? " on" : ""}`} href={href({ status: null, view: null })}>
            All
          </Link>
          {Object.entries(ACCOUNT_STATUS_LABELS).map(([k, v]) => (
            <Link
              key={k}
              className={`fchip2${sp.status === k ? " on" : ""}`}
              href={href({ status: sp.status === k ? null : k, view: null })}
            >
              {v}
            </Link>
          ))}
          <span className="sl-chips-l ac-chips-gap">NEXT STEP</span>
          {[
            ["overdue", "Overdue"],
            ["week", "This week"],
            ["none", "None set"],
          ].map(([k, v]) => (
            <Link
              key={k}
              className={`fchip2${sp.due === k ? " on" : ""}`}
              href={href({ due: sp.due === k ? null : k, view: null })}
            >
              {v}
            </Link>
          ))}
        </div>

        {!archivedView && rows.length ? (
          <form id="ac-bulk" action={bulkAccounts} className="bulkbar sl-bulk">
            <input type="hidden" name="return_qs" value={returnQs} />
            <SelectAll formId="ac-bulk" />
            <span className="bgroup">
              <select name="status" defaultValue="" aria-label="Set status">
                <option value="">Status unchanged</option>
                {Object.entries(ACCOUNT_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select name="fit_tier" defaultValue="" aria-label="Set fit tier">
                <option value="">Fit unchanged</option>
                {Object.entries(FIT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
                <option value="none">Clear fit tier</option>
              </select>
              <select name="owner" defaultValue="" aria-label="Set owner">
                <option value="">Owner unchanged</option>
                <option value="me">Assign to me</option>
                <option value="none">Unassign</option>
              </select>
              <label className="ac-bulk-arch">
                <input type="checkbox" name="archive" value="1" /> Archive
              </label>
              <button className="dbtn dbtn-line dbtn-sm" type="submit">
                Apply to selected
              </button>
            </span>
          </form>
        ) : null}

        {!all.length ? (
          archivedView ? (
            <EmptyState title="Nothing archived" body="Archived accounts land here and can be restored from their profile." />
          ) : (
            <EmptyState
              title="No accounts yet"
              body="Add a dental group with the form above, or convert a website lead from the Inbox."
              action={{ href: "/crm/inbox", label: "Open the Inbox" }}
            />
          )
        ) : !rows.length ? (
          <EmptyState
            title="No account matches these filters"
            body="Loosen a filter or clear them all."
            action={{ href: base, label: "Clear filters" }}
          />
        ) : (
          <div className="sl-tablewrap">
            <table className="tbl ac-table">
              <thead>
                <tr>
                  {!archivedView ? (
                    <th className="ac-cb">
                      <span className="ws-sr">Select</span>
                    </th>
                  ) : null}
                  <th>ACCOUNT</th>
                  <th>PROFILE</th>
                  <th>STATUS</th>
                  <th>PIPELINE</th>
                  <th>WARMTH</th>
                  <th className="r">LAST TOUCH</th>
                  <th>NEXT STEP</th>
                  <th>OWNER</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const due = a.next_step_due ? String(a.next_step_due).slice(0, 10) : null;
                  const plan = suggestPlan(a.locations);
                  const host = hostOf(a.website);
                  return (
                    <tr key={a.id}>
                      {!archivedView ? (
                        <td className="ac-cb">
                          <input type="checkbox" name="ids" value={a.id} form="ac-bulk" aria-label={`Select ${a.name}`} />
                        </td>
                      ) : null}
                      <td>
                        <Link className="rowlink" href={`/crm/accounts/${a.id}`}>
                          <b>{a.name}</b>
                        </Link>
                        <br />
                        <span className="sl-sub">
                          {[host, a.hq_state].filter(Boolean).join(" · ") || "No website on file"}
                        </span>
                        {a.demo ? (
                          <>
                            {" "}
                            <span className="pill navy ac-demo-pill" title={`Last opened ${fmtDate(a.demo.last_seen_at)}`}>
                              {`DEMO ×${a.demo.visits}`}
                            </span>
                          </>
                        ) : null}
                      </td>
                      <td>
                        {[
                          a.locations ? `${a.locations} ${a.locations === 1 ? "location" : "locations"}` : null,
                          a.open_roles !== null && a.open_roles !== undefined ? `${a.open_roles} open roles` : null,
                          a.current_tool,
                        ]
                          .filter(Boolean)
                          .join(" · ") || <span className="sl-dim">n/a</span>}
                        {plan ? (
                          <>
                            <br />
                            <span className="sl-sub">Fits {PLAN_LABELS[plan]}</span>
                          </>
                        ) : null}
                      </td>
                      <td>
                        <span className="ac-pills">
                          <StatusPill status={a.status} />
                          <FitPill tier={a.fit_tier} />
                        </span>
                      </td>
                      <td>
                        {a.topOpp ? (
                          <Link className="rowlink" href={`/crm/opportunities/${a.topOpp.id}`}>
                            {stageLabel(a.topOpp.stage)}
                            {a.openOpps.length > 1 ? ` +${a.openOpps.length - 1}` : ""}
                          </Link>
                        ) : a.won ? (
                          <span className="pill good">WON</span>
                        ) : (
                          <span className="sl-dim">n/a</span>
                        )}
                      </td>
                      <td>
                        <Warmth value={a.warmth} />
                      </td>
                      <td className="r sl-num">
                        {a.last_touch_at ? relTime(a.last_touch_at) : <span className="sl-dim">Never</span>}
                      </td>
                      <td className="ac-next">
                        {due ? (
                          <span className={due < today ? "sl-crit" : due <= weekEnd ? "sl-warn" : undefined}>
                            {fmtDate(due).toUpperCase()}
                            {due < today ? " · OVERDUE" : ""}
                          </span>
                        ) : null}
                        {a.next_step ? (
                          <>
                            {due ? <br /> : null}
                            <span className="sl-sub">{a.next_step}</span>
                          </>
                        ) : !due ? (
                          <span className="sl-dim">None set</span>
                        ) : null}
                      </td>
                      <td>
                        {a.owner_id === me ? (
                          <span className={`ownchip${photoClass(admin)}`} style={photoStyle(admin)} title="You">
                            {initialsOf(admin)}
                          </span>
                        ) : a.owner_id ? (
                          <span className="sl-sub" title="Owned by another CRM admin">
                            Other
                          </span>
                        ) : (
                          <span className="sl-dim">n/a</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {all.length && !archivedView ? (
          <div className="sl-note ac-foot">
            Sorted by next step due: overdue at the top and blanks last, so the list doubles as the call sheet. Demo
            counts come from each group&apos;s personalized demo link.{" "}
            <Link href="/crm/accounts?archived=1">See archived accounts</Link>.
          </div>
        ) : null}
      </div>
    </>
  );
}
