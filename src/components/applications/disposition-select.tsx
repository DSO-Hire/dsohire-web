"use client";

/**
 * <DispositionSelect> — internal, compliance-only reason picker shown in the
 * reject / withdraw confirmation dialogs (#8). Options come from the single
 * taxonomy in disposition-reasons.ts, filtered to the terminal `kind`.
 *
 * Required on rejections (the caller passes required + disables Confirm until a
 * value is set); offered-but-optional on withdrawals.
 */

import {
  dispositionsFor,
  getDisposition,
  type DispositionKind,
} from "@/lib/applications/disposition-reasons";

export function DispositionSelect({
  kind,
  value,
  onChange,
  required = false,
  id = "disposition-code",
}: {
  kind: DispositionKind;
  value: string;
  onChange: (code: string) => void;
  required?: boolean;
  id?: string;
}) {
  const options = dispositionsFor(kind);
  const selected = getDisposition(value);

  return (
    <div className="grid gap-2">
      <label
        htmlFor={id}
        className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-body"
      >
        {kind === "rejected" ? "Rejection reason" : "Reason"}
        {required ? <span className="text-red-700"> *</span> : " (optional)"}
      </label>
      <select
        id={id}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-[var(--rule-strong)] bg-white px-3 py-2 text-[14px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage"
      >
        <option value="">Select a reason…</option>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.label}
          </option>
        ))}
      </select>
      <p className="text-[12px] text-slate-meta">
        {selected?.requiresNote
          ? "Add a short note below — required for this reason."
          : "Internal compliance record. The candidate never sees this code."}
      </p>
    </div>
  );
}
