"use client";

import { useState, useTransition } from "react";
import { saveStageWeights } from "../_workspace/actions";
import { stageLabel } from "../format";

/*
 * Shared pipeline weights (one workspace row). Whole percents per template
 * stage, non-decreasing from target to negotiation (won is always 100%); validated again
 * on the server. Indicative only: used for the weighted pipeline on Today
 * and Reports, never a forecast.
 */
export default function WeightsCard({
  stages,
  initial,
  lastChanged,
  available,
}: {
  stages: string[];
  initial: Record<string, number>;
  lastChanged: string | null;
  available: boolean;
}) {
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    let prev = -1;
    for (const s of stages) {
      const n = Number(fd.get(`w_${s}`));
      if (!Number.isInteger(n) || n < 0 || n > 100) {
        setStatus({ ok: false, text: `${stageLabel(s)}: use a whole percent from 0 to 100.` });
        return;
      }
      if (n < prev) {
        setStatus({ ok: false, text: `${stageLabel(s)} is lower than the stage before it. Weights must not go down.` });
        return;
      }
      prev = n;
    }
    setStatus(null);
    startTransition(async () => {
      const res = await saveStageWeights(fd);
      setStatus(res.error ? { ok: false, text: res.error } : { ok: true, text: "Saved" });
    });
  }

  return (
    <section className="dcardx ws-set" id="weights" aria-labelledby="ws-weights-h">
      <div className="ch">
        <h3 id="ws-weights-h">Pipeline weights</h3>
        <span className="mini">WORKSPACE-WIDE</span>
      </div>
      <form onSubmit={onSubmit} noValidate>
        <div className="ws-weights">
          {stages.map((s) => (
            <label key={s} htmlFor={`w_${s}`}>
              {stageLabel(s).toUpperCase()}
              <span className="pct">
                <input
                  id={`w_${s}`}
                  name={`w_${s}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  step={1}
                  defaultValue={Math.round((initial[s] ?? 0) * 100)}
                  disabled={!available}
                />
                %
              </span>
            </label>
          ))}
        </div>
        <div className="ws-formfoot">
          <button type="submit" className="dbtn dbtn-green dbtn-sm" disabled={pending || !available}>
            {pending ? "Saving…" : "Save weights"}
          </button>
          <span aria-live="polite">
            {status ? <span className={status.ok ? "ok" : "err"}>{status.text}</span> : null}
          </span>
          <span style={{ flexBasis: "100%" }}>
            Indicative only. Applied to annual contract value for the weighted pipeline on Today and Reports.
            {available ? (lastChanged ? ` ${lastChanged}` : " Showing the defaults.") : " Editing needs the workspace migration; showing the defaults."}
          </span>
        </div>
      </form>
    </section>
  );
}
