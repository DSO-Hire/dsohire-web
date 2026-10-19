import { photoClass, photoStyle } from "../../../avatars";
import { setOpportunityNextStep } from "../../actions";
import { countdown } from "../../_lib/dates";
import { initials } from "../../_lib/labels";
import type { Admin, OppRow } from "./types";

export default function NextStep({ opp, admins }: { opp: OppRow; admins: Admin[] }) {
  if (opp.stage === "lost") return null;
  const owner = admins.find((a) => a.id === opp.owner_id);
  const step = (opp.next_step ?? "").trim();
  const cd = countdown(opp.next_step_due);

  const form = (
    <form action={setOpportunityNextStep} className="dx-nextform">
      <input type="hidden" name="id" value={opp.id} />
      <label className="ws-sr" htmlFor="ns-text">
        Next step
      </label>
      <input
        id="ns-text"
        name="next_step"
        maxLength={300}
        defaultValue={step}
        placeholder="What moves this opportunity forward next? Book the demo, send the proposal, follow up."
      />
      <label className="ws-sr" htmlFor="ns-due">
        Due
      </label>
      <input id="ns-due" name="next_step_due" type="date" defaultValue={opp.next_step_due ?? ""} />
      <label className="dx-check">
        <input type="checkbox" name="make_task" /> Also add as a task
      </label>
      <button className="dbtn dbtn-green dbtn-sm" type="submit">
        {step ? "Update" : "Set next step"}
      </button>
    </form>
  );

  return (
    <section className={`dx-next${step ? "" : " empty"}`} id="dx-next" aria-label="Next step">
      <span className="dx-nextlab">NEXT STEP</span>
      {step ? (
        <>
          <span className="dx-nexttext">{step}</span>
          {opp.next_step_due ? (
            <span className={`pill ${cd.tone === "muted" ? "navy" : cd.tone}`}>{cd.label.toUpperCase()}</span>
          ) : null}
          {owner ? (
            <span className={`ownchip${photoClass(owner)}`} style={photoStyle(owner)} title={owner.email ?? ""}>
              {initials(owner)}
            </span>
          ) : null}
          <details className="dx-edit dx-nextedit">
            <summary>Edit</summary>
            {form}
          </details>
        </>
      ) : (
        form
      )}
    </section>
  );
}
