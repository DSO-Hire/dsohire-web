/* Small server-rendered view pieces shared by the accounts list and the
   account profile (ported from the EDC CRM's sellers/ui.tsx), plus the
   compact labelled inputs the profile forms use (from sellers/[id]/sections/fields.tsx). */

import type { ReactNode } from "react";
import { stageLabel } from "../format";
import { FIT_TONE, STATUS_TONE, statusLabel, type OppLite } from "./lib";

export function StatusPill({ status, topOpp }: { status: string | null | undefined; topOpp?: Pick<OppLite, "stage"> | null }) {
  const s = status || "target";
  const label = statusLabel(s).toUpperCase();
  return (
    <span className={`pill ${STATUS_TONE[s] ?? ""}`}>
      {topOpp ? `${label} · ${stageLabel(topOpp.stage).toUpperCase()}` : label}
    </span>
  );
}

export function FitPill({ tier }: { tier: string | null | undefined }) {
  if (!tier) return null;
  return <span className={`pill ${FIT_TONE[tier] ?? ""}`}>{`FIT ${tier}`}</span>;
}

/* Warmth 1 to 5 as five squares; the number is in the label for screen
   readers and the hover title. */
export function Warmth({ value }: { value: number | null | undefined }) {
  if (!value) return <span className="sl-dim">n/a</span>;
  return (
    <span className="ac-warm" title={`Warmth ${value} of 5`} aria-label={`Warmth ${value} of 5`} role="img">
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= value ? "on" : undefined} />
      ))}
    </span>
  );
}

/* ---------------- form fields ---------------- */

type Base = { name: string; label: string; idp?: string };
const fid = (idp: string | undefined, name: string) => `${idp ?? "af"}-${name}`;

export function Txt({
  name,
  label,
  idp,
  value,
  max = 200,
  placeholder,
  type = "text",
  required,
}: Base & { value?: string | null; max?: number; placeholder?: string; type?: string; required?: boolean }) {
  return (
    <div>
      <label htmlFor={fid(idp, name)}>{label}</label>
      <input
        id={fid(idp, name)}
        name={name}
        type={type}
        defaultValue={value ?? ""}
        maxLength={max}
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
}

export function NumIn({
  name,
  label,
  idp,
  value,
  min,
  max,
  placeholder,
}: Base & { value?: number | string | null; min?: number; max?: number; placeholder?: string }) {
  return (
    <div>
      <label htmlFor={fid(idp, name)}>{label}</label>
      <input
        id={fid(idp, name)}
        name={name}
        type="number"
        inputMode="numeric"
        defaultValue={value === null || value === undefined ? "" : String(value)}
        min={min}
        max={max}
        step={1}
        placeholder={placeholder}
      />
    </div>
  );
}

export function DateIn({ name, label, idp, value }: Base & { value?: string | null }) {
  return (
    <div>
      <label htmlFor={fid(idp, name)}>{label}</label>
      <input id={fid(idp, name)} name={name} type="date" defaultValue={value ? String(value).slice(0, 10) : ""} />
    </div>
  );
}

export function Sel({
  name,
  label,
  idp,
  value,
  opts,
  empty = "Not set",
}: Base & { value?: string | null; opts: Record<string, string> | [string, string][]; empty?: string | null }) {
  const entries = Array.isArray(opts) ? opts : Object.entries(opts);
  return (
    <div>
      <label htmlFor={fid(idp, name)}>{label}</label>
      <select id={fid(idp, name)} name={name} defaultValue={value ?? ""}>
        {empty !== null ? <option value="">{empty}</option> : null}
        {entries.map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Area({
  name,
  label,
  idp,
  value,
  rows = 3,
  max = 4000,
  placeholder,
  help,
}: Base & { value?: string | null; rows?: number; max?: number; placeholder?: string; help?: string }) {
  return (
    <div>
      <label htmlFor={fid(idp, name)}>{label}</label>
      <textarea
        id={fid(idp, name)}
        name={name}
        rows={rows}
        maxLength={max}
        defaultValue={value ?? ""}
        placeholder={placeholder}
      />
      {help ? <div className="sl-help">{help}</div> : null}
    </div>
  );
}

export function Hidden({ values }: { values: Record<string, string> }) {
  return (
    <>
      {Object.entries(values).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );
}

export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="kvrow">
      <span className="k2">{k}</span>
      <span className="v2">{v === null || v === undefined || v === "" ? <span className="sl-dim">Not set</span> : v}</span>
    </div>
  );
}
