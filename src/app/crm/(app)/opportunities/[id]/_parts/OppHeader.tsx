import Link from "next/link";
import { photoClass, photoStyle } from "../../../avatars";
import { LOST_REASONS, PLAN_LABELS, effectiveStages, stageLabel } from "../../../format";
import {
  markOpportunityLost,
  markOpportunityWon,
  moveOpportunityStage,
  setOpportunityStageForm,
  updateOpportunityOwner,
} from "../../actions";
import type { Health } from "../../_lib/health";
import { initials } from "../../_lib/labels";
import type { AccountRow, Admin, OppRow } from "./types";

/* Ported from the EDC DealHeader: name, stage and health pills, the owner
   chip, the account line, back / advance buttons, and a More menu with the
   stage selector, mark won, mark lost (with a reason), and owner + name. */
export default function OppHeader({
  opp,
  account,
  health,
  admins,
}: {
  opp: OppRow;
  account: AccountRow;
  health: Health | null;
  admins: Admin[];
}) {
  const byId = new Map(admins.map((a) => [a.id, a]));
  const owner = opp.owner_id ? byId.get(opp.owner_id) : undefined;
  const lost = opp.stage === "lost";
  const won = opp.stage === "won";
  const back = `/crm/opportunities/${opp.id}`;
  const stages = effectiveStages(opp.custom_stages);

  return (
    <div className="deal-head dx-head" id="dx-head">
      <h1>{opp.name}</h1>
      <span className={`pill ${lost ? "crit" : won ? "good" : "navy"}`}>{stageLabel(opp.stage).toUpperCase()}</span>
      {opp.plan_tier ? (
        <span className="pill good">
          {(PLAN_LABELS[opp.plan_tier] ?? opp.plan_tier).toUpperCase()}
          {opp.billing ? ` · ${opp.billing.toUpperCase()}` : ""}
        </span>
      ) : null}
      {health ? (
        <span
          className={`pill ${health.level}`}
          title={health.reasons.length ? health.reasons.map((r) => r.text).join(" · ") : "Nothing flagged"}
        >
          <span className={`dx-dot ${health.level}`} aria-hidden="true" />
          {health.label}
        </span>
      ) : null}
      <span className="dx-owners">
        <span className="dx-ownlab">OWNER</span>
        <span
          className={`ownchip${photoClass(owner)}`}
          style={photoStyle(owner)}
          title={owner?.email ?? (opp.owner_id ? "Another founder" : "No owner set")}
        >
          {initials(owner) ?? "?"}
        </span>
      </span>
      <span className="sub2 dx-sellerline">
        {account ? (
          <Link href={`/crm/accounts/${account.id}`}>
            {account.name}
            {account.locations ? ` · ${account.locations} locations` : ""}
            {account.hq_state ? ` · ${account.hq_state}` : ""}
            {account.current_tool ? ` · uses ${account.current_tool}` : ""}
          </Link>
        ) : (
          "no account linked"
        )}
      </span>
      <div className="right dx-headbtns">
        {!lost ? (
          <>
            <form action={moveOpportunityStage}>
              <input type="hidden" name="return_to" value={back} />
              <input type="hidden" name="id" value={opp.id} />
              <input type="hidden" name="dir" value="back" />
              <button className="dbtn dbtn-line dbtn-sm" type="submit" disabled={stages.indexOf(opp.stage) <= 0}>
                ← Back a stage
              </button>
            </form>
            {!won ? (
              <form action={moveOpportunityStage}>
                <input type="hidden" name="return_to" value={back} />
                <input type="hidden" name="id" value={opp.id} />
                <input type="hidden" name="dir" value="fwd" />
                <button className="dbtn dbtn-green" type="submit">
                  Advance stage →
                </button>
              </form>
            ) : null}
          </>
        ) : null}
        <details className="dx-more">
          <summary className="dbtn dbtn-line dbtn-sm">More</summary>
          <div className="dx-menu">
            {!lost ? (
              <form action={setOpportunityStageForm} className="dform">
                <input type="hidden" name="id" value={opp.id} />
                <input type="hidden" name="return_to" value={back} />
                <div>
                  <label htmlFor="dx-stage-sel">SET STAGE</label>
                  <select id="dx-stage-sel" name="stage" defaultValue={opp.stage}>
                    {stages.map((s) => (
                      <option key={s} value={s}>
                        {stageLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="dbtn dbtn-line dbtn-sm" type="submit">
                  Move
                </button>
              </form>
            ) : null}
            {!lost && !won && stages.includes("won") ? (
              <form action={markOpportunityWon} className="dform">
                <input type="hidden" name="id" value={opp.id} />
                <input type="hidden" name="return_to" value={back} />
                <p className="dx-help">Marks the opportunity won and the account a customer.</p>
                <button className="dbtn dbtn-green dbtn-sm" type="submit">
                  Mark won
                </button>
              </form>
            ) : null}
            {!lost ? (
              <form action={markOpportunityLost} className="dform">
                <input type="hidden" name="id" value={opp.id} />
                <input type="hidden" name="return_to" value={back} />
                <div>
                  <label htmlFor="dx-lost-reason">MARK LOST: REASON</label>
                  <select id="dx-lost-reason" name="lost_reason" required defaultValue="">
                    <option value="" disabled>
                      choose…
                    </option>
                    {Object.entries(LOST_REASONS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="dx-lost-note">NOTE (OPTIONAL)</label>
                  <textarea id="dx-lost-note" name="lost_note" rows={2} maxLength={2000} />
                </div>
                <button className="dbtn dbtn-line dbtn-sm dx-danger" type="submit">
                  Mark lost
                </button>
              </form>
            ) : null}
            <form action={updateOpportunityOwner} className="dform">
              <input type="hidden" name="id" value={opp.id} />
              <div>
                <label htmlFor="dx-name">NAME</label>
                <input id="dx-name" name="name" required maxLength={160} defaultValue={opp.name} />
              </div>
              <div>
                <label htmlFor="dx-owner">OWNER</label>
                <select id="dx-owner" name="owner_id" defaultValue={opp.owner_id ?? ""}>
                  <option value="">not set</option>
                  {admins.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.full_name ?? a.email}
                    </option>
                  ))}
                  {opp.owner_id && !owner ? <option value={opp.owner_id}>Another founder</option> : null}
                </select>
              </div>
              <button className="dbtn dbtn-line dbtn-sm" type="submit">
                Save
              </button>
            </form>
          </div>
        </details>
      </div>
    </div>
  );
}
