import Link from "next/link";
import { crmPageGate } from "@/lib/crm/auth";
import ActionError from "../ActionError";
import EmptyState from "../EmptyState";
import { LOST_REASONS, PLAN_LABELS, fmtMoney, nowMs, todayIso } from "../format";
import { reopenOpportunity } from "../opportunities/actions";
import { fmtShort } from "../opportunities/_lib/dates";
import { adminsOf } from "../opportunities/_lib/server";
import { createOpportunity } from "./actions";
import FilterBar, { pipelineHref, type PipelineParams } from "./FilterBar";
import PipelineBoard from "./PipelineBoard";
import PipelineTable from "./PipelineTable";
import ViewMemory from "./ViewMemory";
import { applyFilters, loadPipeline } from "./_lib/load";
import "../opportunities/opportunities.css";
import "./pipeline.css";

export const metadata = { title: "Pipeline" };

type SP = {
  error?: string;
  view?: string;
  owner?: string;
  group?: string;
  plan?: string;
  stale?: string;
  lost?: string;
};

const pick = (v: string | undefined, allowed: string[], fallback: string) => (v && allowed.includes(v) ? v : fallback);

export default async function Pipeline({ searchParams }: { searchParams: Promise<SP> }) {
  const gate = await crmPageGate("/crm/pipeline");
  if (gate === "denied" || gate === "needs_mfa") return null;
  const sp = await searchParams;
  const { supabase, me } = gate;
  const today = todayIso();
  const admins = adminsOf(gate);
  const [{ opps: all, overdueTotal, error: loadError }, accountsRes] = await Promise.all([
    loadPipeline(supabase, today, nowMs()),
    supabase.from("crm_accounts").select("id, name").is("archived_at", null).order("name").limit(2000),
  ]);
  const accounts = (accountsRes.data ?? []) as { id: string; name: string }[];

  const view = pick(sp.view, ["board", "compact", "table"], "board");
  const adminIds = admins.map((a) => a.id);
  const params: PipelineParams = {
    view,
    owner: sp.owner === "me" || (sp.owner && adminIds.includes(sp.owner)) ? sp.owner : "all",
    group: pick(sp.group, ["all", "early", "active", "late", "won"], "all"),
    plan: pick(sp.plan, ["all", "solo", "growth", "scale", "enterprise", "none"], "all"),
    stale: sp.stale === "1" ? "1" : "",
    lost: sp.lost === "1" ? "1" : "",
  };
  const opps = applyFilters(
    all,
    { owner: params.owner, group: params.group, plan: params.plan, stale: params.stale === "1" },
    me,
  );
  const lostOpps = params.lost === "1" ? all.filter((d) => d.stage === "lost") : [];

  const open = opps.filter((d) => d.stage !== "won");
  const won = opps.filter((d) => d.stage === "won");
  const sum = (k: "mrr" | "acv" | "weighted") => open.reduce((s, d) => s + (d[k] ?? 0), 0);
  const stalled = opps.filter((d) => d.health?.level === "crit").length;
  const noneAtAll = all.length === 0;

  return (
    <div className="dx-page">
      <ViewMemory view={view} explicit={!!sp.view} />
      <ActionError error={sp.error ?? (loadError ? `The pipeline did not load: ${loadError}` : undefined)} />
      <div className="page-head">
        <h1>Pipeline</h1>
        <span className="sub2">
          {opps.length} {opps.length === 1 ? "opportunity" : "opportunities"}
          {view !== "table" ? " · drag a card, or focus it and use Shift + arrows" : ""}
        </span>
        <div className="right">
          <nav className="dx-seg" aria-label="Pipeline view">
            {(["board", "compact", "table"] as const).map((v) => (
              <Link
                key={v}
                href={pipelineHref(params, { view: v })}
                className={view === v ? "on" : undefined}
                aria-current={view === v ? "page" : undefined}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </Link>
            ))}
            <Link href="/crm/tasks">
              Tasks{overdueTotal > 0 ? <span className="dx-segbadge">{overdueTotal} overdue</span> : null}
            </Link>
          </nav>
          <details className="dx-newdeal" id="new">
            <summary className="dbtn dbtn-green dbtn-sm">+ New opportunity</summary>
            <div className="dx-menu dx-newpanel">
              <div className="ch dx-newhead">
                <h3>New opportunity</h3>
                <span className="mini">ONE SUBSCRIPTION SALE TO ONE GROUP</span>
              </div>
              <form className="dform" action={createOpportunity}>
                <div className="frow2">
                  <div>
                    <label htmlFor="no-account">ACCOUNT</label>
                    <select id="no-account" name="account_id" defaultValue="">
                      <option value="">new account (type below)</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="no-newacct">OR NEW ACCOUNT NAME</label>
                    <input id="no-newacct" name="new_account" maxLength={160} placeholder="Dental group name" />
                  </div>
                </div>
                <div className="frow2">
                  <div>
                    <label htmlFor="no-name">OPPORTUNITY NAME (OPTIONAL)</label>
                    <input id="no-name" name="name" maxLength={160} placeholder="Defaults to the account name" />
                  </div>
                  <div>
                    <label htmlFor="no-owner">OWNER</label>
                    <select id="no-owner" name="owner_id" defaultValue={me}>
                      {admins.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.full_name ?? a.email}
                        </option>
                      ))}
                      <option value="">not set</option>
                    </select>
                  </div>
                </div>
                <div className="frow2">
                  <div>
                    <label htmlFor="no-plan">PLAN</label>
                    <select id="no-plan" name="plan_tier" defaultValue="">
                      <option value="">not set</option>
                      {Object.entries(PLAN_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="no-billing">BILLING</label>
                    <select id="no-billing" name="billing" defaultValue="">
                      <option value="">not set</option>
                      <option value="monthly">Monthly</option>
                      <option value="annual">Annual</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="no-mrr">MONTHLY VALUE ($, OPTIONAL)</label>
                    <input id="no-mrr" name="mrr" type="number" min="0" step="0.01" placeholder="plan list price" />
                  </div>
                </div>
                <div className="frow2">
                  <div>
                    <label htmlFor="no-tc">TARGET CLOSE</label>
                    <input id="no-tc" name="target_close" type="date" />
                  </div>
                </div>
                <div>
                  <label htmlFor="no-notes">NOTES</label>
                  <textarea id="no-notes" name="notes" rows={2} maxLength={20000} />
                </div>
                <div>
                  <button className="dbtn dbtn-green" type="submit">
                    Create opportunity
                  </button>
                </div>
              </form>
            </div>
          </details>
        </div>
      </div>

      <FilterBar params={params} admins={admins} />

      <div className="kpis dx-kpis">
        <div className="kpi">
          <div className="kl">OPEN OPPORTUNITIES</div>
          <div className="kv num">{open.length}</div>
          <div className="kd">
            {stalled} stalled · {overdueTotal} overdue tasks · {won.length} won
          </div>
        </div>
        <div className="kpi">
          <div className="kl">PIPELINE MRR</div>
          <div className="kv num">{fmtMoney(sum("mrr"))}</div>
          <div className="kd">monthly value, open opportunities, unweighted</div>
        </div>
        <div className="kpi">
          <div className="kl">PIPELINE ACV</div>
          <div className="kv num">{fmtMoney(sum("acv"))}</div>
          <div className="kd">MRR × 12, unweighted</div>
        </div>
        <div className="kpi">
          <div className="kl">WEIGHTED ACV</div>
          <div className="kv num">{fmtMoney(sum("weighted"))}</div>
          <div className="kd">ACV × close probability · indicative weights</div>
        </div>
      </div>

      {noneAtAll ? (
        <EmptyState
          card
          title="No opportunities yet"
          body="Open one from an account, or use New opportunity above. Each one is a subscription sale to one dental group."
          action={{ href: "/crm/pipeline#new", label: "New opportunity" }}
        />
      ) : view === "table" ? (
        <PipelineTable opps={opps} admins={admins} />
      ) : (
        <>
          <PipelineBoard opps={opps} admins={admins} compact={view === "compact"} />
          <p className="dx-legend">
            <span className="dx-dot good" aria-hidden="true" /> touched this week{" "}
            <span className="dx-dot warn" aria-hidden="true" /> quiet 5+ days{" "}
            <span className="dx-dot crit" aria-hidden="true" /> stalled, needs a nudge. Column totals are annual contract
            value; wtd is ACV weighted by stage, indicative weights.
          </p>
        </>
      )}

      {params.lost === "1" ? (
        <details className="dx-earlier dcardx dx-loststrip" open={lostOpps.length > 0 && lostOpps.length <= 5}>
          <summary>Lost ({lostOpps.length})</summary>
          {lostOpps.length === 0 ? (
            <div className="empty-note">No lost opportunities.</div>
          ) : (
            <ul>
              {lostOpps.map((d) => (
                <li key={d.id}>
                  <Link href={`/crm/opportunities/${d.id}`}>
                    <b>{d.name}</b>
                  </Link>
                  <span className="dx-muted">
                    {d.lost_reason ? (LOST_REASONS[d.lost_reason] ?? d.lost_reason) : "no reason logged"}
                    {d.lost_note ? `: ${d.lost_note}` : ""}
                    {d.lost_at ? ` · lost ${fmtShort(d.lost_at)}` : ""}
                  </span>
                  <form action={reopenOpportunity}>
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="return_to" value={pipelineHref(params, {})} />
                    <button className="iconbtn" type="submit">
                      Reopen
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </details>
      ) : null}
    </div>
  );
}
