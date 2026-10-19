"use client";

import Link from "next/link";
import { photoClass, photoStyle } from "../avatars";
import { useState } from "react";
import { PLAN_LABELS, fmtMoney, stageLabel } from "../format";
import { countdown } from "../opportunities/_lib/dates";
import { initials } from "../opportunities/_lib/labels";
import type { PipelineOpp } from "./_lib/load";
import { staleTone } from "./_lib/tone";

type Admin = { id: string; email: string | null; full_name: string | null };
type Key =
  | "opp"
  | "account"
  | "stage"
  | "health"
  | "owner"
  | "plan"
  | "mrr"
  | "acv"
  | "prob"
  | "weighted"
  | "target"
  | "days"
  | "activity"
  | "next";

const HEALTH_RANK: Record<string, number> = { crit: 0, warn: 1, good: 2 };
const PLAN_RANK: Record<string, number> = { solo: 1, growth: 2, scale: 3, enterprise: 4 };

export default function PipelineTable({ opps, admins }: { opps: PipelineOpp[]; admins: Admin[] }) {
  const [sort, setSort] = useState<{ key: Key; dir: "asc" | "desc" }>({ key: "weighted", dir: "desc" });
  const adminById = new Map(admins.map((a) => [a.id, a]));

  const val = (d: PipelineOpp, k: Key): string | number | null => {
    switch (k) {
      case "opp":
        return d.name.toLowerCase();
      case "account":
        return (d.account?.name ?? "").toLowerCase() || null;
      case "stage":
        return d.probability;
      case "health":
        return HEALTH_RANK[d.health?.level ?? "good"];
      case "owner":
        return d.owner_id ? (initials(adminById.get(d.owner_id)) ?? "?") : null;
      case "plan":
        return d.plan_tier ? (PLAN_RANK[d.plan_tier] ?? 0) : null;
      case "mrr":
        return d.mrr || null;
      case "acv":
        return d.acv || null;
      case "prob":
        return d.probability;
      case "weighted":
        return d.weighted;
      case "target":
        return d.target_close;
      case "days":
        return d.daysInStage;
      case "activity":
        return d.lastActivityDays;
      case "next":
        return d.next_step_due ?? (d.next_step ? "9999" : null);
    }
  };

  const rows = [...opps].sort((a, b) => {
    const va = val(a, sort.key);
    const vb = val(b, sort.key);
    if (va === vb) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    const c = va < vb ? -1 : 1;
    return sort.dir === "asc" ? c : -c;
  });

  const totals = {
    mrr: opps.reduce((s, d) => s + d.mrr, 0),
    acv: opps.reduce((s, d) => s + d.acv, 0),
    weighted: opps.reduce((s, d) => s + d.weighted, 0),
  };

  const cols: { key: Key; label: string; num?: boolean }[] = [
    { key: "opp", label: "OPPORTUNITY" },
    { key: "account", label: "ACCOUNT" },
    { key: "stage", label: "STAGE" },
    { key: "health", label: "HEALTH" },
    { key: "owner", label: "OWNER" },
    { key: "plan", label: "PLAN" },
    { key: "mrr", label: "MRR", num: true },
    { key: "acv", label: "ACV", num: true },
    { key: "prob", label: "PROB", num: true },
    { key: "weighted", label: "WEIGHTED ACV", num: true },
    { key: "target", label: "TARGET CLOSE" },
    { key: "days", label: "DAYS IN STAGE", num: true },
    { key: "activity", label: "LAST TOUCH", num: true },
    { key: "next", label: "NEXT STEP" },
  ];

  return (
    <div className="dcardx">
      <div className="dx-scroll">
        <table className="tbl dx-ptable">
          <thead>
            <tr>
              {cols.map((c) => {
                const active = sort.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={c.num ? "r" : undefined}
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <button
                      type="button"
                      className="dx-sortbtn"
                      onClick={() =>
                        setSort((s) => ({
                          key: c.key,
                          dir: s.key === c.key ? (s.dir === "asc" ? "desc" : "asc") : c.num ? "desc" : "asc",
                        }))
                      }
                    >
                      {c.label}
                      <span aria-hidden="true">{active ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="dx-muted">
                  No opportunities match these filters.
                </td>
              </tr>
            ) : null}
            {rows.map((d) => {
              const tone = staleTone(d);
              const owner = d.owner_id ? adminById.get(d.owner_id) : undefined;
              const tc = countdown(d.target_close);
              return (
                <tr key={d.id}>
                  <td>
                    <Link href={`/crm/opportunities/${d.id}`}>
                      <b>{d.name}</b>
                    </Link>
                  </td>
                  <td>
                    {d.account?.name ? (
                      <Link href={`/crm/accounts/${d.account_id}`}>{d.account.name}</Link>
                    ) : (
                      <span className="dx-muted">n/a</span>
                    )}
                  </td>
                  <td>
                    <span className="pill navy">{stageLabel(d.stage)}</span>
                  </td>
                  <td>
                    <span className="dx-hcell">
                      <span className={`dx-dot ${tone}`} aria-hidden="true" />
                      {d.stage === "won" ? "WON" : (d.health?.label ?? "ON TRACK")}
                    </span>
                  </td>
                  <td>
                    {owner ? (
                      <span className={`ownchip${photoClass(owner)}`} style={photoStyle(owner)}>
                        {initials(owner)}
                      </span>
                    ) : d.owner_id ? (
                      <span className="ownchip" title="Another founder">
                        ?
                      </span>
                    ) : (
                      <span className="dx-muted">none</span>
                    )}
                  </td>
                  <td>
                    {d.plan_tier ? (
                      <>
                        {PLAN_LABELS[d.plan_tier] ?? d.plan_tier}
                        {d.billing ? <div className="dx-src2">{d.billing}</div> : null}
                      </>
                    ) : (
                      <span className="dx-muted">not set</span>
                    )}
                  </td>
                  <td className="r">
                    {d.mrr > 0 ? fmtMoney(d.mrr) : "n/a"}
                    {d.mrr > 0 && !d.mrrSet ? <div className="dx-src2">list price</div> : null}
                  </td>
                  <td className="r">{d.acv > 0 ? fmtMoney(d.acv) : "n/a"}</td>
                  <td className="r">{d.probability}%</td>
                  <td className="r">
                    <b>{d.weighted > 0 ? fmtMoney(d.weighted) : "n/a"}</b>
                  </td>
                  <td>
                    {d.target_close ? (
                      <span className={`pill ${tc.tone === "muted" ? "navy" : tc.tone}`}>{tc.label.toUpperCase()}</span>
                    ) : (
                      <span className="dx-muted">not set</span>
                    )}
                  </td>
                  <td className="r">{d.daysInStage}d</td>
                  <td className="r">{d.lastActivityDays === null ? "never" : `${d.lastActivityDays}d ago`}</td>
                  <td className="dx-nextcell">{d.next_step ?? <span className="dx-muted">none</span>}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={6}>
                TOTAL · {opps.length} {opps.length === 1 ? "OPPORTUNITY" : "OPPORTUNITIES"} · INDICATIVE WEIGHTS
              </th>
              <td className="r">{fmtMoney(totals.mrr)}</td>
              <td className="r">{fmtMoney(totals.acv)}</td>
              <td />
              <td className="r">
                <b>{fmtMoney(totals.weighted)}</b>
              </td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
