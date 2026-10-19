import { PLAN_LABELS, fmtMoney, oppAcv, oppMrr, planMonthly } from "../../../format";
import { updateOpportunityEconomics } from "../../actions";
import { BILLING_LABELS, n } from "../../_lib/labels";
import EconLivePreview from "./EconLivePreview";
import type { OppRow } from "./types";

/* Ported from the EDC EconStrip: six tiles across the record, then an
   "Edit economics" form with live math. Deal economics (EBITDA, multiple,
   value, fee) become subscription economics (plan, list price, MRR, ACV,
   probability, weighted ACV). */
export default function EconStrip({
  opp,
  prob,
  stageDefaultPct,
  suggestedPlan,
}: {
  opp: OppRow;
  prob: { value: number; source: "set" | "stage" };
  stageDefaultPct: number;
  suggestedPlan: string | null;
}) {
  const list = planMonthly(opp.plan_tier, opp.billing);
  const mrrSet = n(opp.mrr);
  const mrr = oppMrr(opp);
  const acv = oppAcv(opp);
  const weighted = (acv * prob.value) / 100;
  const discount = list && mrrSet !== null && mrrSet < list ? Math.round((1 - mrrSet / list) * 100) : null;

  /* list prices for the live preview, straight from prices.ts via format.ts */
  const prices: Record<string, { monthly: number | null; annual: number | null }> = {};
  for (const k of Object.keys(PLAN_LABELS)) prices[k] = { monthly: planMonthly(k, "monthly"), annual: planMonthly(k, "annual") };

  return (
    <section id="dx-econ" className="dx-econwrap" aria-label="Opportunity economics">
      <div className="econ dx-econ6">
        <div className="etile lite">
          <div className="el">PLAN</div>
          <div className={`ev num${opp.plan_tier ? "" : " dx-muted-ev"}`}>
            {opp.plan_tier ? (PLAN_LABELS[opp.plan_tier] ?? opp.plan_tier) : "not set"}
          </div>
          <div className="es">
            {opp.billing
              ? `${BILLING_LABELS[opp.billing] ?? opp.billing} billing`
              : suggestedPlan && !opp.plan_tier
                ? `locations suggest ${PLAN_LABELS[suggestedPlan] ?? suggestedPlan}`
                : "billing not set"}
          </div>
        </div>
        <div className="etile lite">
          <div className="el">LIST PRICE</div>
          <div className={`ev num${list === null ? " dx-muted-ev" : ""}`}>{list === null ? "n/a" : fmtMoney(list)}</div>
          <div className="es">{list === null ? "pick a plan" : `per month, ${opp.billing === "annual" ? "annual" : "monthly"} rate`}</div>
        </div>
        <div className="etile lite">
          <div className="el">MRR</div>
          <div className={`ev num${mrr > 0 ? "" : " dx-muted-ev"}`}>{mrr > 0 ? fmtMoney(mrr) : "n/a"}</div>
          <div className="es">
            {mrrSet !== null ? (
              <>
                <span className="dx-src">SET ON OPPORTUNITY</span>
                {discount ? ` · ${discount}% under list` : ""}
              </>
            ) : list !== null ? (
              "plan list price"
            ) : (
              "set a plan or a monthly value"
            )}
          </div>
        </div>
        <div className="etile dx-feetile">
          <div className="el">ACV</div>
          <div className="ev num">{acv > 0 ? fmtMoney(acv) : "n/a"}</div>
          <div className="es">annual contract value · MRR × 12</div>
        </div>
        <div className="etile lite">
          <div className="el">CLOSE PROBABILITY</div>
          <div className="ev num">{prob.value}%</div>
          <div className="es">{prob.source === "set" ? "set on opportunity" : "stage weight, indicative"}</div>
          <div className="dx-probbar" aria-hidden="true">
            <span style={{ width: `${Math.max(0, Math.min(100, prob.value))}%` }} />
          </div>
        </div>
        <div className="etile lite">
          <div className="el">WEIGHTED ACV</div>
          <div className="ev num">{acv > 0 ? fmtMoney(weighted) : "n/a"}</div>
          <div className="es">ACV × probability · indicative weights</div>
        </div>
      </div>

      <details className="dx-edit">
        <summary>Edit economics</summary>
        <form action={updateOpportunityEconomics} className="dform">
          <input type="hidden" name="id" value={opp.id} />
          <div className="dx-formgrid">
            <div>
              <label htmlFor="ec-plan">PLAN</label>
              <select id="ec-plan" name="plan_tier" defaultValue={opp.plan_tier ?? ""}>
                <option value="">not set</option>
                {Object.entries(PLAN_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ec-billing">BILLING</label>
              <select id="ec-billing" name="billing" defaultValue={opp.billing ?? ""}>
                <option value="">not set</option>
                {Object.entries(BILLING_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ec-mrr">MONTHLY VALUE ($)</label>
              <input
                id="ec-mrr"
                name="mrr"
                type="number"
                min="0"
                step="0.01"
                defaultValue={mrrSet ?? ""}
                placeholder={list !== null ? `${list} (list price)` : ""}
              />
            </div>
            <div>
              <label htmlFor="ec-prob">CLOSE PROBABILITY (%)</label>
              <input
                id="ec-prob"
                name="close_probability"
                type="number"
                min="0"
                max="100"
                step="1"
                defaultValue={opp.close_probability ?? ""}
                placeholder={`${stageDefaultPct} (stage weight)`}
              />
            </div>
          </div>
          <EconLivePreview prices={prices} stageProbability={stageDefaultPct} />
          <p className="dx-help">
            Pick a plan and billing and leave the rest empty: MRR is the plan&apos;s list price and probability is the
            stage weight. Type a monthly value for a negotiated price (annual plans: the monthly equivalent). Internal
            planning figures, indicative weights.
          </p>
          <div>
            <button className="dbtn dbtn-green dbtn-sm" type="submit">
              Save economics
            </button>
          </div>
        </form>
      </details>
    </section>
  );
}
