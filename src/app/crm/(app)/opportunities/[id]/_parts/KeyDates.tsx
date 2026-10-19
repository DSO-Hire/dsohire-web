import { updateOpportunityDates } from "../../actions";
import { countdown, fmtShort } from "../../_lib/dates";
import type { OppRow } from "./types";

/* Ported from the EDC KeyDates rail. A subscription sale has fewer
   milestones than an M&A deal: opened, in stage since, target close, and
   the outcome date. Only target close is editable; the rest are stamped by
   the stage moves. */
export default function KeyDates({ opp }: { opp: OppRow }) {
  const won = opp.stage === "won";
  const lost = opp.stage === "lost";
  const tc = countdown(opp.target_close, { doneWhen: won, doneLabelDate: opp.won_at });
  const chips: { key: string; label: string; value: string | null; pill?: { label: string; tone: string } }[] = [
    { key: "opened", label: "Opened", value: opp.created_at },
    { key: "stage", label: "In stage since", value: opp.stage_changed_at },
    {
      key: "target_close",
      label: "Target close",
      value: opp.target_close,
      pill: opp.target_close && !lost ? { label: tc.label, tone: tc.tone === "muted" ? "navy" : tc.tone } : undefined,
    },
  ];
  if (won) chips.push({ key: "won", label: "Won", value: opp.won_at, pill: { label: "won", tone: "good" } });
  if (lost) chips.push({ key: "lost", label: "Lost", value: opp.lost_at, pill: { label: "lost", tone: "crit" } });

  return (
    <section className="dx-dates" id="dx-dates" aria-label="Key dates">
      <div className="dx-daterail">
        {chips.map((c) => (
          <div key={c.key} className={`dx-datechip${c.value ? "" : " unset"}`}>
            <span className="dx-dlab">{c.label.toUpperCase()}</span>
            <span className="dx-dval num">{c.value ? fmtShort(c.value) : "not set"}</span>
            {c.pill ? <span className={`pill ${c.pill.tone}`}>{c.pill.label.toUpperCase()}</span> : null}
          </div>
        ))}
        <details className="dx-edit dx-dateedit">
          <summary>Edit dates</summary>
          <form action={updateOpportunityDates} className="dform">
            <input type="hidden" name="id" value={opp.id} />
            <div className="dx-formgrid">
              <div>
                <label htmlFor="kd-target_close">TARGET CLOSE</label>
                <input id="kd-target_close" name="target_close" type="date" defaultValue={opp.target_close ?? ""} />
              </div>
            </div>
            <div>
              <button className="dbtn dbtn-green dbtn-sm" type="submit">
                Save dates
              </button>
            </div>
          </form>
        </details>
      </div>
    </section>
  );
}
