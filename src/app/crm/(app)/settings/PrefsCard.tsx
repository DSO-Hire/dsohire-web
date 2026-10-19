"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { CRM_PREFS_DEFAULT, readPrefs, savePrefs as saveLocalPrefs, type CrmPrefValues } from "../CrmPrefs";
import { savePrefs as savePrefsAction, type PrefsPatch } from "../_workspace/actions";

export type ServerPrefs = {
  density: "comfortable" | "compact";
  motion: "full" | "reduced";
  today_scope: "mine" | "all";
  quiet_after_days: number;
};

/* density and motion are null on the account until someone picks them. */
export type InitialPrefs = Omit<ServerPrefs, "density" | "motion"> & {
  density: ServerPrefs["density"] | null;
  motion: ServerPrefs["motion"] | null;
};

const QUIET_OPTIONS = [3, 5, 7, 10, 14, 21];

function Toggle({
  on,
  onChange,
  label,
  desc,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      className={`setrow${on ? " on" : ""}`}
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
    >
      <span className="settext">
        <b>{label}</b>
        <span>{desc}</span>
      </span>
      <span className="switch" aria-hidden="true">
        <span className="knob" />
      </span>
    </button>
  );
}

/*
 * Per-person preferences. Saved to the account (crm_user_prefs) so they
 * follow you across browsers; density and motion also write to
 * localStorage so the shell applies them instantly with no flash. When the
 * workspace migration is not live yet (synced = false), display prefs still
 * work per browser and the account-only rows say so.
 */
export default function PrefsCard({ initial, synced }: { initial: InitialPrefs; synced: boolean }) {
  const [prefs, setPrefs] = useState<ServerPrefs>({
    ...initial,
    density: initial.density ?? CRM_PREFS_DEFAULT.density,
    motion: initial.motion ?? CRM_PREFS_DEFAULT.motion,
  });
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const quietId = useId();

  /* before the migration, or before density/motion were ever chosen on the
     account, the browser copy is the one the shell applies: show that */
  const needLocal = !synced || initial.density === null || initial.motion === null;
  useEffect(() => {
    if (!needLocal) return;
    const t = requestAnimationFrame(() => {
      const local = readPrefs();
      setPrefs((p) => ({
        ...p,
        density: synced && initial.density !== null ? initial.density : local.density,
        motion: synced && initial.motion !== null ? initial.motion : local.motion,
      }));
    });
    return () => cancelAnimationFrame(t);
  }, [needLocal, synced, initial.density, initial.motion]);

  function update(patch: Partial<ServerPrefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    if (patch.density || patch.motion) {
      const display: CrmPrefValues = { density: next.density, motion: next.motion };
      saveLocalPrefs(display);
    }
    if (!synced) {
      setStatus(
        patch.density || patch.motion
          ? { ok: true, text: "Saved in this browser." }
          : { ok: false, text: "Saving to your account needs the workspace migration." },
      );
      return;
    }
    setStatus(null);
    startTransition(async () => {
      /* a display change saves both display fields, so the account row
         holds a complete pair the layout can sync to other browsers */
      const body: PrefsPatch =
        patch.density || patch.motion ? { ...patch, density: next.density, motion: next.motion } : patch;
      const res = await savePrefsAction(body);
      setStatus(res.error ? { ok: false, text: res.error } : { ok: true, text: "Saved to your account." });
    });
  }

  return (
    <section className="dcardx" style={{ maxWidth: 640 }} aria-labelledby="ws-prefs-h">
      <div className="ch">
        <h3 id="ws-prefs-h">Preferences</h3>
        <span className="mini">{synced ? "SAVED TO YOUR ACCOUNT" : "THIS BROWSER ONLY"}</span>
      </div>
      <Toggle
        on={prefs.density === "compact"}
        onChange={(v) => update({ density: v ? "compact" : "comfortable" })}
        label="Compact density"
        desc="Tighter rows and cards. More pipeline on one screen."
      />
      <Toggle
        on={prefs.motion === "reduced"}
        onChange={(v) => update({ motion: v ? "reduced" : "full" })}
        label="Reduce motion"
        desc="Turns off entrance animations and hover movement in the CRM."
      />
      <div className="ws-set-row">
        <span className="lbl2" id={`${quietId}-scope`}>
          Today opens on
          <span>Which tasks the morning brief shows first.</span>
        </span>
        <span className="ws-seg" role="radiogroup" aria-labelledby={`${quietId}-scope`}>
          <button
            type="button"
            role="radio"
            aria-checked={prefs.today_scope === "mine"}
            onClick={() => update({ today_scope: "mine" })}
          >
            My work
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={prefs.today_scope === "all"}
            onClick={() => update({ today_scope: "all" })}
          >
            Everyone
          </button>
        </span>
      </div>
      <div className="ws-set-row">
        <label htmlFor={quietId}>
          Flag an opportunity as quiet after
          <span>No email, call, meeting, LinkedIn touch or stage move for this long.</span>
        </label>
        <select
          id={quietId}
          value={QUIET_OPTIONS.includes(prefs.quiet_after_days) ? prefs.quiet_after_days : 7}
          onChange={(e) => update({ quiet_after_days: Number(e.target.value) })}
        >
          {QUIET_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
      </div>
      <div className="ws-formfoot" aria-live="polite">
        {pending ? <span>Saving…</span> : status ? <span className={status.ok ? "ok" : "err"}>{status.text}</span> : null}
      </div>
    </section>
  );
}
