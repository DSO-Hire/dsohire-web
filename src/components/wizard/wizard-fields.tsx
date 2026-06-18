"use client";

/**
 * Shared wizard field primitives — the assessment's tap/chip/slider visual
 * language, generalized into controlled, presentational components every wizard
 * can reuse. Each is value + onChange only: the host wizard owns the state.
 *
 * Extracted/generalized from assessment-wizard.tsx's QuestionField. Adds the
 * field types the application + job-creation wizards need that the assessment
 * didn't have (text, number, select, file, checkbox-card).
 */

import type { ReactNode } from "react";
import { Check, UploadCloud } from "lucide-react";

export interface FieldOption {
  value: string;
  label: string;
  /** Optional helper line under the label (option-cards only). */
  hint?: string;
}

/* ──────────────────────────────────────────────────────────────
 * FieldShell — the legend + help wrapper every field uses.
 * ─────────────────────────────────────────────────────────── */

export function FieldShell({
  label,
  help,
  optional,
  error,
  children,
}: {
  label: ReactNode;
  help?: ReactNode;
  optional?: boolean;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <fieldset>
      <legend className="text-[16px] font-bold text-ink">
        {label}
        {optional && (
          <span className="ml-2 text-[13px] font-medium text-slate-meta">optional</span>
        )}
      </legend>
      {help && (
        <p className="mt-1 text-[14px] leading-relaxed text-slate-meta">{help}</p>
      )}
      <div className="mt-3">{children}</div>
      {error && <p className="mt-2 text-[12px] font-semibold text-red-700">{error}</p>}
    </fieldset>
  );
}

/* ──────────────────────────────────────────────────────────────
 * OptionCards — single-select, full-width tap rows (assessment "single").
 * Also covers yes/no by passing two options.
 * ─────────────────────────────────────────────────────────── */

export function OptionCards({
  value,
  onChange,
  options,
  columns = 1,
}: {
  value: string | null | undefined;
  onChange: (value: string) => void;
  options: FieldOption[];
  /** 1 (default, stacked) or 2 (side-by-side, good for yes/no). */
  columns?: 1 | 2;
}) {
  return (
    <div className={columns === 2 ? "grid grid-cols-2 gap-2" : "space-y-2"}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={
              "flex w-full items-center justify-between gap-3 border px-4 py-3 text-left text-[15px] transition-colors " +
              (active
                ? "border-heritage-deep bg-heritage/10 font-semibold text-ink"
                : "border-[var(--rule)] bg-white text-slate-body hover:border-heritage-deep")
            }
          >
            <span>
              {opt.label}
              {opt.hint && (
                <span className="mt-0.5 block text-[13px] font-normal text-slate-meta">
                  {opt.hint}
                </span>
              )}
            </span>
            {active && <Check className="h-4 w-4 flex-shrink-0 text-heritage-deep" />}
          </button>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
 * MultiChips — multi-select chips (assessment "multi").
 * ─────────────────────────────────────────────────────────── */

export function MultiChips({
  value,
  onChange,
  options,
  emptyHint = "No options — skip ahead.",
}: {
  value: string[] | null | undefined;
  onChange: (value: string[]) => void;
  options: FieldOption[];
  emptyHint?: string;
}) {
  const arr = value ?? [];
  if (options.length === 0) {
    return <p className="text-[13px] italic text-slate-meta">{emptyHint}</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = arr.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() =>
              onChange(
                active ? arr.filter((v) => v !== opt.value) : [...arr, opt.value]
              )
            }
            className={
              "rounded-full border px-4 py-2 text-[14px] font-semibold transition-colors " +
              (active
                ? "border-heritage-deep bg-heritage-deep text-ivory"
                : "border-[var(--rule)] text-slate-body hover:border-heritage-deep")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
 * RankCards — tap-to-rank up to N (assessment "rank").
 * ─────────────────────────────────────────────────────────── */

export function RankCards({
  value,
  onChange,
  options,
  max = 3,
}: {
  value: string[] | null | undefined;
  onChange: (value: string[]) => void;
  options: FieldOption[];
  max?: number;
}) {
  const arr = value ?? [];
  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const rank = arr.indexOf(opt.value);
        const active = rank >= 0;
        const full = arr.length >= max && !active;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={full}
            aria-pressed={active}
            onClick={() =>
              onChange(
                active
                  ? arr.filter((v) => v !== opt.value)
                  : arr.length < max
                    ? [...arr, opt.value]
                    : arr
              )
            }
            className={
              "flex w-full items-center justify-between gap-3 border px-4 py-3 text-left text-[15px] transition-colors " +
              (active
                ? "border-heritage-deep bg-heritage/10 font-semibold text-ink"
                : full
                  ? "cursor-not-allowed border-[var(--rule)] bg-cream/40 text-slate-meta"
                  : "border-[var(--rule)] bg-white text-slate-body hover:border-heritage-deep")
            }
          >
            <span>{opt.label}</span>
            {active && (
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-heritage-deep text-[12px] font-bold text-ivory">
                {rank + 1}
              </span>
            )}
          </button>
        );
      })}
      <p className="text-[13px] text-slate-meta">
        Tap up to {max} in priority order — tap again to remove.
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
 * ScaleSlider — 1–5 range with low/high labels (assessment "slider").
 * ─────────────────────────────────────────────────────────── */

export function ScaleSlider({
  value,
  onChange,
  low,
  high,
  min = 1,
  max = 5,
  variant = "dsohire",
}: {
  value: number | null | undefined;
  onChange: (value: number) => void;
  low: string;
  high: string;
  min?: number;
  max?: number;
  /**
   * Branded thumb/track. "dsohire" (default) = heritage track + D-mark thumb,
   * for the apply + job-creation wizards. "practicefit" = navy track + sparkle
   * thumb, reserved for PracticeFit surfaces (the assessment).
   */
  variant?: "dsohire" | "practicefit";
}) {
  const mid = Math.round((min + max) / 2);
  // #101 (Day 28) — show the selected number + labeled ticks so dragging isn't
  // vague. `current` stays null until the user actually moves the slider, so we
  // prompt "drag to choose" instead of echoing a value they never picked.
  const current = typeof value === "number" ? value : null;
  const ticks = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div className="space-y-2">
      {/* Mobile sweep 2026-06-18 — on mobile both labels sit on ONE row above a
          full-width track (the flanked w-28 labels crushed it); flanked
          low | slider | high layout returns from sm up. */}
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px] text-slate-meta sm:hidden">
          <span>{low}</span>
          <span className="text-right">{high}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden w-28 text-right text-[13px] text-slate-meta sm:inline">{low}</span>
          <div className="w-full sm:flex-1">
            <input
              type="range"
              min={min}
              max={max}
              step={1}
              value={current ?? mid}
              onChange={(e) => onChange(Number(e.target.value))}
              className={
                (variant === "practicefit" ? "pf-slider" : "dso-slider") + " w-full"
              }
            />
            <div className="mt-1 flex justify-between px-0.5" aria-hidden>
              {ticks.map((t) => (
                <span
                  key={t}
                  className={
                    "text-[11px] tabular-nums " +
                    (current === t ? "font-bold text-ink" : "text-slate-meta")
                  }
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          <span className="hidden w-28 text-[13px] text-slate-meta sm:inline">{high}</span>
        </div>
      </div>
      <p className="text-center text-[12px] font-semibold text-slate-body">
        {current !== null
          ? `Your answer: ${current} of ${max}`
          : `Drag to choose — ${min} (${low}) to ${max} (${high})`}
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
 * TextField — single-line text/number with optional prefix/suffix adornment.
 * ─────────────────────────────────────────────────────────── */

export function TextField({
  value,
  onChange,
  type = "text",
  placeholder,
  prefix,
  suffix,
  inputMode,
  maxLength,
  widthClass = "w-full",
}: {
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number" | "email" | "tel" | "url";
  placeholder?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  inputMode?: "text" | "numeric" | "decimal" | "email" | "tel" | "url";
  maxLength?: number;
  widthClass?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {prefix != null && <span className="text-[15px] font-bold text-ink">{prefix}</span>}
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={
          widthClass +
          " border border-[var(--rule)] bg-white px-3 py-2 text-[15px] text-ink focus:border-heritage focus:outline-none"
        }
      />
      {suffix != null && <span className="text-[13px] text-slate-meta">{suffix}</span>}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
 * TextAreaField — multi-line (assessment "text" + cover letters).
 * ─────────────────────────────────────────────────────────── */

export function TextAreaField({
  value,
  onChange,
  rows = 3,
  maxLength,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      maxLength={maxLength}
      placeholder={placeholder}
      className="w-full border border-[var(--rule)] bg-white px-3 py-2 text-[15px] text-ink focus:border-heritage focus:outline-none"
    />
  );
}

/* ──────────────────────────────────────────────────────────────
 * SelectField — styled native select.
 * ─────────────────────────────────────────────────────────── */

export function SelectField({
  value,
  onChange,
  options,
  placeholder,
  widthClass = "w-full max-w-[420px]",
}: {
  value: string;
  onChange: (value: string) => void;
  options: FieldOption[];
  placeholder?: string;
  widthClass?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        widthClass +
        " border border-[var(--rule)] bg-white px-3 py-2 text-[15px] text-ink focus:border-heritage focus:outline-none"
      }
    >
      {placeholder != null && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ──────────────────────────────────────────────────────────────
 * CheckCard — a single checkbox styled as a tappable card (attestations,
 * enable-this-section toggles).
 * ─────────────────────────────────────────────────────────── */

export function CheckCard({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={
        "flex w-full items-start gap-3 border px-4 py-3 text-left text-[15px] transition-colors disabled:opacity-50 " +
        (checked
          ? "border-heritage-deep bg-heritage/10 text-ink"
          : "border-[var(--rule)] bg-white text-slate-body hover:border-heritage-deep")
      }
    >
      <span
        className={
          "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors " +
          (checked
            ? "border-heritage-deep bg-heritage-deep text-ivory"
            : "border-[var(--rule)] bg-white")
        }
      >
        {checked && <Check className="h-3.5 w-3.5" />}
      </span>
      <span>
        <span className="font-semibold text-ink">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[14px] font-normal text-slate-meta">
            {description}
          </span>
        )}
      </span>
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────
 * FileField — styled file picker (résumé upload).
 * ─────────────────────────────────────────────────────────── */

export function FileField({
  file,
  onFile,
  accept,
  hint,
  currentName,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  accept?: string;
  hint?: ReactNode;
  /** Name of an already-uploaded file to show when no new file is picked. */
  currentName?: string | null;
}) {
  const shownName = file?.name ?? currentName ?? null;
  return (
    <div>
      <label
        className={
          "flex cursor-pointer items-center gap-3 border border-dashed px-4 py-4 text-[15px] transition-colors " +
          (shownName
            ? "border-heritage-deep bg-heritage/5 text-ink"
            : "border-[var(--rule)] bg-white text-slate-body hover:border-heritage-deep")
        }
      >
        <UploadCloud className="h-5 w-5 flex-shrink-0 text-heritage-deep" />
        <span className="min-w-0 flex-1">
          {shownName ? (
            <span className="block truncate font-semibold text-ink">{shownName}</span>
          ) : (
            <span className="font-semibold">Choose a file…</span>
          )}
          {hint && (
            <span className="mt-0.5 block text-[13px] font-normal text-slate-meta">
              {hint}
            </span>
          )}
        </span>
        <input
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
      </label>
    </div>
  );
}
