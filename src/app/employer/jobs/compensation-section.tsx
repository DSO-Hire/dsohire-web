"use client";

/**
 * CompensationSection — the composable compensation editor (Ashby-style).
 *
 * ONE shared component, mounted by BOTH wizards (job-wizard.tsx,
 * corporate-wizard.tsx) and BOTH sectioned edit pages. Built once
 * deliberately — a second copy is exactly the code-duplication trap that
 * has bitten this codebase before.
 *
 * Structure:
 *   • Base       — the existing comp-type picker (range / starting_at /
 *                  up_to / exact / DOE) + min/max/period + show-pay toggle.
 *   • Components — three independently-toggled add-ons, each revealing its
 *                  own fields: Commission / variable, Bonus, Equity.
 *   • OTE note   — live "On-Target Earnings ~$X" computed from the base
 *                  figure + the enabled variable + bonus targets
 *                  (src/lib/comp/ote.ts; equity is non-cash, excluded).
 *
 * Flat props (values + setters) rather than a state object — the wizards
 * already hold these as individual useState hooks + serialize them into
 * the localStorage draft, so flat props keep the wiring (and the blast
 * radius on the SHIPPED practice wizard) minimal.
 *
 * `accent` swaps the brand color: "heritage" (practice/clinical wizard)
 * vs "corporate" (slate-blue #3D5266, the 5G.d corporate wizard).
 */

import { useEffect } from "react";
import { computeOte, formatUsd, type CompensationType } from "@/lib/comp/ote";
import { PAY_TRANSPARENCY_DISCLAIMER } from "@/lib/compliance/pay-transparency";
import { PayBenchmarkHint } from "./pay-benchmark-hint";

/**
 * Pay-transparency enforcement, computed by the wizard from the job's
 * locality + comp. When present and not exempt, the comp UI auto-adapts:
 * the range becomes required, "Show pay publicly" force-checks + locks, and
 * the DOE option disappears. The employer can self-certify an exemption.
 */
export interface PayTransparencyEnforcement {
  requiresRange: boolean;
  requiresBenefits: boolean;
  /** "California and Colorado" — the jurisdictions driving the requirement. */
  coveredLabel: string;
  /** One-line plain-English requirement summary. */
  message: string;
  /** Remote/open posting that broad-reach states (CO/WA) could capture. */
  remoteRisk: boolean;
  remoteRiskLabel: string;
  /** Employer self-certified exemption (relaxes enforcement). */
  exempt: boolean;
  onExempt: (v: boolean) => void;
}

/* ───── Comp-type vocabulary (mirrors the SQL check on jobs.compensation_type) ───── */

const COMP_TYPE_OPTIONS: Array<{
  value: CompensationType;
  label: string;
  helper: string;
}> = [
  {
    value: "range",
    label: "Range",
    helper: "Min & max — most common, fits the broadest set of postings.",
  },
  {
    value: "starting_at",
    label: "Starting at",
    helper: "A floor only. Use when you don't want to publicly cap the top.",
  },
  {
    value: "up_to",
    label: "Up to",
    helper: "A ceiling only. Useful for capped hourly or contract roles.",
  },
  {
    value: "exact",
    label: "Exact",
    helper: "A single number.",
  },
  {
    value: "doe",
    label: "DOE / discussed",
    helper:
      "Discussed at the offer stage. With a base figure unset, OTE can't be totaled.",
  },
];

/* ───── Accent theming ───── */

type Accent = "heritage" | "corporate";

const ACCENT: Record<
  Accent,
  {
    text: string;
    activeBtn: string;
    inactiveBtn: string;
    check: string;
    ring: string;
    tintBorder: string;
    tintBg: string;
  }
> = {
  heritage: {
    text: "text-heritage-deep",
    activeBtn: "bg-heritage-deep text-ivory border-heritage-deep",
    inactiveBtn: "bg-white text-ink border-[var(--rule)] hover:border-heritage",
    check: "accent-heritage",
    ring: "focus:border-heritage focus:ring-heritage",
    tintBorder: "border-heritage/40",
    tintBg: "bg-heritage/[0.04]",
  },
  corporate: {
    text: "text-[#3D5266]",
    activeBtn: "bg-[#3D5266] text-ivory border-[#3D5266]",
    inactiveBtn: "bg-white text-ink border-[var(--rule)] hover:border-[#3D5266]",
    check: "accent-[#3D5266]",
    ring: "focus:border-[#3D5266] focus:ring-[#3D5266]",
    tintBorder: "border-[#3D5266]/40",
    tintBg: "bg-[#3D5266]/[0.04]",
  },
};

/* ───── Props ───── */

export interface CompensationSectionProps {
  accent: Accent;

  /** Day 24 — pay-transparency enforcement (omit when not applicable). */
  enforcement?: PayTransparencyEnforcement;

  /**
   * Day 24 (gap N4) — market pay benchmark context. When a benchmarkable
   * role + (optional) state are passed, a read-only BLS OEWS median line +
   * below-market nudge renders under the comp inputs. Omit to hide.
   */
  roleCategory?: string | null;
  benchmarkState?: string | null;
  /** Selected location id → metro-precise benchmark (resolved server-side). */
  benchmarkLocationId?: string | null;

  // Base
  compType: CompensationType;
  onCompType: (v: CompensationType) => void;
  compMin: string;
  onCompMin: (v: string) => void;
  compMax: string;
  onCompMax: (v: string) => void;
  compPeriod: string;
  onCompPeriod: (v: string) => void;
  compVisible: boolean;
  onCompVisible: (v: boolean) => void;

  // Variable / commission component
  variableCompEnabled: boolean;
  onVariableCompEnabled: (v: boolean) => void;
  variableCompTarget: string;
  onVariableCompTarget: (v: string) => void;
  variableCompStructure: string;
  onVariableCompStructure: (v: string) => void;

  // Bonus component
  bonusEnabled: boolean;
  onBonusEnabled: (v: boolean) => void;
  bonusTarget: string;
  onBonusTarget: (v: string) => void;
  bonusStructure: string;
  onBonusStructure: (v: string) => void;

  // Equity component (reuses jobs.equity_offered + equity_note)
  equityOffered: boolean;
  onEquityOffered: (v: boolean) => void;
  equityNote: string;
  onEquityNote: (v: string) => void;
}

/* ───── Small local field primitives (self-contained, no cross-file dep) ───── */

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-2">
      {children}
    </label>
  );
}

function MoneyInput({
  label,
  placeholder,
  value,
  onChange,
  accent,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  accent: Accent;
}) {
  // Parent state stays raw digits (so the server parser + OTE math keep
  // working); we only format the DISPLAYED value with thousands separators
  // and a $ affix. onChange strips back to digits before lifting state.
  const digits = value.replace(/[^\d]/g, "");
  const display = digits ? Number(digits).toLocaleString("en-US") : "";
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-slate-meta">
          $
        </span>
        <input
          type="text"
          inputMode="numeric"
          placeholder={placeholder}
          value={display}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
          className={`w-full h-[44px] pl-7 pr-4 bg-white border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:ring-1 transition-colors ${ACCENT[accent].ring}`}
        />
      </div>
    </div>
  );
}

/* ───── Component ───── */

export function CompensationSection(props: CompensationSectionProps) {
  const a = ACCENT[props.accent];

  const enf = props.enforcement;
  const enforcing = !!enf && !enf.exempt;
  const lockPay = enforcing && !!enf?.requiresRange;

  // Auto-adapt: a covered, non-exempt posting can't use DOE and must show pay.
  useEffect(() => {
    if (!lockPay) return;
    if (props.compType === "doe") props.onCompType("range");
    if (!props.compVisible) props.onCompVisible(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockPay, props.compType, props.compVisible]);

  const compTypeOptions = lockPay
    ? COMP_TYPE_OPTIONS.filter((o) => o.value !== "doe")
    : COMP_TYPE_OPTIONS;

  const ote = computeOte({
    compensationType: props.compType,
    compensationMin: numOrNull(props.compMin),
    compensationMax: numOrNull(props.compMax),
    compensationPeriod: props.compPeriod,
    variableCompEnabled: props.variableCompEnabled,
    variableCompTarget: numOrNull(props.variableCompTarget),
    bonusEnabled: props.bonusEnabled,
    bonusTarget: numOrNull(props.bonusTarget),
  });

  return (
    <fieldset className="border border-[var(--rule)] p-6 bg-cream/40">
      <legend
        className={`px-2 text-[13px] font-bold tracking-[2px] uppercase ${a.text}`}
      >
        Compensation
      </legend>

      {/* ── Pay-transparency banner (Day 24) ── */}
      {enf && (
        <div
          className={`mt-1 mb-5 border p-4 ${
            enforcing
              ? `${a.tintBorder} ${a.tintBg}`
              : "border-[var(--rule)] bg-cream/60"
          }`}
          aria-live="polite"
        >
          {enforcing ? (
            <>
              <div
                className={`text-[11px] font-bold tracking-[1.5px] uppercase ${a.text}`}
              >
                Pay transparency · {enf.coveredLabel}
              </div>
              <p className="mt-1 text-[13px] text-ink leading-snug">
                {enf.message} We&apos;ve made the range required and pay public
                below.
              </p>
              {enf.requiresBenefits && (
                <p className="mt-1.5 text-[12px] text-slate-body leading-snug">
                  These states also require a general description of benefits
                  and other compensation — add benefits in the next section.
                </p>
              )}
              {enf.remoteRisk && (
                <p className="mt-1.5 text-[12px] text-slate-body leading-snug">
                  <span className="font-semibold text-ink">Remote role:</span>{" "}
                  {enf.remoteRiskLabel || "Colorado and Washington"} read their
                  laws to cover any remote job performable in-state — and
                  disregard “no applicants from X” language. The safe move is to
                  post a range regardless.
                </p>
              )}
              <p className="mt-2 text-[11px] text-slate-meta leading-snug">
                {PAY_TRANSPARENCY_DISCLAIMER}
              </p>
              <label className="mt-2.5 flex items-start gap-2 text-[12px] text-slate-body cursor-pointer">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => enf.onExempt(true)}
                  className={`mt-0.5 ${a.check}`}
                />
                <span>
                  Our organization is below the size threshold for these laws —
                  mark this posting exempt.
                </span>
              </label>
            </>
          ) : (
            <p className="text-[12px] text-slate-body leading-snug">
              Marked <span className="font-semibold text-ink">exempt</span> from
              pay-transparency rules in {enf.coveredLabel}.{" "}
              <button
                type="button"
                onClick={() => enf.onExempt(false)}
                className={`underline font-semibold ${a.text}`}
              >
                Undo
              </button>
            </p>
          )}
        </div>
      )}

      {/* ── Base ── */}
      <div className="mt-1 mb-4">
        <FieldLabel>Base compensation</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {compTypeOptions.map((opt) => {
            const checked = props.compType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => props.onCompType(opt.value)}
                className={`px-3 py-1.5 text-[12px] font-medium border transition-colors ${
                  checked ? a.activeBtn : a.inactiveBtn
                }`}
                title={opt.helper}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-slate-meta leading-snug">
          {COMP_TYPE_OPTIONS.find((o) => o.value === props.compType)?.helper}
        </p>
      </div>

      {props.compType !== "doe" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {(props.compType === "range" ||
            props.compType === "starting_at" ||
            props.compType === "exact") && (
            <MoneyInput
              label={
                props.compType === "range"
                  ? "Minimum"
                  : props.compType === "starting_at"
                    ? "Starting at"
                    : "Pay"
              }
              placeholder="190,000"
              value={props.compMin}
              onChange={props.onCompMin}
              accent={props.accent}
            />
          )}
          {(props.compType === "range" || props.compType === "up_to") && (
            <MoneyInput
              label={props.compType === "range" ? "Maximum" : "Up to"}
              placeholder="240,000"
              value={props.compMax}
              onChange={props.onCompMax}
              accent={props.accent}
            />
          )}
          <div>
            <FieldLabel>Period</FieldLabel>
            <select
              value={props.compPeriod}
              onChange={(e) => props.onCompPeriod(e.target.value)}
              className={`w-full h-[44px] px-4 bg-white border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:ring-1 transition-colors ${a.ring}`}
            >
              <option value="">—</option>
              <option value="hourly">Per hour</option>
              <option value="daily">Per day</option>
              <option value="annual">Per year</option>
            </select>
          </div>
        </div>
      )}

      {/* Market pay benchmark (gap N4) — read-only guidance. */}
      {props.roleCategory && (
        <PayBenchmarkHint
          roleCategory={props.roleCategory}
          state={props.benchmarkState ?? null}
          locationId={props.benchmarkLocationId ?? null}
          compMin={props.compMin}
          compMax={props.compMax}
          compPeriod={props.compPeriod}
          accentText={a.text}
        />
      )}

      <label
        className={`mt-4 flex items-start gap-2.5 text-[14px] text-ink ${
          lockPay ? "cursor-not-allowed" : "cursor-pointer"
        }`}
      >
        <input
          type="checkbox"
          checked={lockPay ? true : props.compVisible}
          disabled={lockPay}
          onChange={(e) => props.onCompVisible(e.target.checked)}
          className={`mt-1 ${a.check} ${lockPay ? "opacity-60" : ""}`}
        />
        <span>
          {lockPay ? (
            <>
              Pay is shown publicly — required in {enf?.coveredLabel} for this
              posting.{" "}
              <span className="text-slate-meta">
                (Mark the posting exempt above to change this.)
              </span>
            </>
          ) : (
            <>
              Show pay publicly. Required in CA, CO, WA, NY, and other states
              with pay-transparency laws.
            </>
          )}
        </span>
      </label>

      {/* ── Composable components ── */}
      <div className="mt-6 pt-5 border-t border-[var(--rule)]">
        <FieldLabel>Add to this package</FieldLabel>
        <p className="mb-3 text-[11px] text-slate-meta leading-snug">
          Layer on variable pay, a bonus, or equity. Each one you turn on
          adds its own fields — and variable pay + bonus targets roll up
          into the On-Target Earnings figure below.
        </p>

        <div className="space-y-3">
          {/* Commission / variable */}
          <ComponentRow
            accent={props.accent}
            label="Commission / variable pay"
            hint="Production-based, deal commission, collections %, etc."
            enabled={props.variableCompEnabled}
            onEnabled={props.onVariableCompEnabled}
          >
            <div className="grid grid-cols-1 sm:grid-cols-[200px,1fr] gap-4">
              <MoneyInput
                label="Annual target ($)"
                placeholder="80,000"
                value={props.variableCompTarget}
                onChange={props.onVariableCompTarget}
                accent={props.accent}
              />
              <div>
                <FieldLabel>How it works</FieldLabel>
                <input
                  type="text"
                  placeholder="1.5% of closed deal value · 30% of collections above $50K/mo"
                  value={props.variableCompStructure}
                  onChange={(e) =>
                    props.onVariableCompStructure(e.target.value)
                  }
                  className={`w-full h-[44px] px-4 bg-white border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:ring-1 transition-colors ${a.ring}`}
                />
              </div>
            </div>
          </ComponentRow>

          {/* Bonus */}
          <ComponentRow
            accent={props.accent}
            label="Bonus"
            hint="Annual, performance, or sign-on bonus."
            enabled={props.bonusEnabled}
            onEnabled={props.onBonusEnabled}
          >
            <div className="grid grid-cols-1 sm:grid-cols-[200px,1fr] gap-4">
              <MoneyInput
                label="Annual target ($)"
                placeholder="20,000"
                value={props.bonusTarget}
                onChange={props.onBonusTarget}
                accent={props.accent}
              />
              <div>
                <FieldLabel>How it works</FieldLabel>
                <input
                  type="text"
                  placeholder="Annual company performance bonus · paid Q1"
                  value={props.bonusStructure}
                  onChange={(e) => props.onBonusStructure(e.target.value)}
                  className={`w-full h-[44px] px-4 bg-white border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:ring-1 transition-colors ${a.ring}`}
                />
              </div>
            </div>
          </ComponentRow>

          {/* Equity */}
          <ComponentRow
            accent={props.accent}
            label="Equity"
            hint="Ownership, partnership track, or stock — non-cash, so it's not part of OTE."
            enabled={props.equityOffered}
            onEnabled={props.onEquityOffered}
          >
            <div>
              <FieldLabel>Equity detail</FieldLabel>
              <textarea
                rows={2}
                placeholder="0.1–0.3% with a 4-year vest · partnership buy-in eligible at year 2"
                value={props.equityNote}
                onChange={(e) => props.onEquityNote(e.target.value)}
                className={`w-full px-4 py-3 bg-white border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:ring-1 transition-colors resize-vertical ${a.ring}`}
              />
            </div>
          </ComponentRow>
        </div>
      </div>

      {/* ── OTE note ── */}
      {ote.hasVariable && (
        <div
          className={`mt-5 border ${a.tintBorder} ${a.tintBg} p-4`}
          aria-live="polite"
        >
          {ote.ote != null ? (
            <>
              <div className={`text-[13px] font-bold tracking-[2px] uppercase ${a.text}`}>
                On-Target Earnings
              </div>
              <div className="mt-0.5 text-[20px] font-extrabold text-ink">
                {ote.isRange && ote.ote_low != null && ote.ote_high != null
                  ? `~${formatUsd(ote.ote_low)}–${formatUsd(ote.ote_high)}`
                  : `~${formatUsd(ote.ote)}`}
                <span className="ml-2 text-[12px] font-medium text-slate-meta">
                  / year
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-meta leading-snug">
                {formatUsd(ote.base ?? 0)} base
                {props.compType === "range" && !ote.isRange ? " (midpoint)" : ""} +{" "}
                {formatUsd(ote.variable)} target variable
                {props.equityOffered ? " · plus equity" : ""}
              </p>
            </>
          ) : (
            <p className="text-[12px] text-slate-body leading-snug">
              <span className="font-semibold text-ink">
                {formatUsd(ote.variable)}
              </span>{" "}
              in target variable pay on top of the base. Set an exact base or
              a range to show a total On-Target Earnings figure.
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}

/* ───── A single composable component row: toggle + reveal ───── */

function ComponentRow({
  accent,
  label,
  hint,
  enabled,
  onEnabled,
  children,
}: {
  accent: Accent;
  label: string;
  hint: string;
  enabled: boolean;
  onEnabled: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const a = ACCENT[accent];
  return (
    <div
      className={`border ${
        enabled ? a.tintBorder : "border-[var(--rule)]"
      } bg-white transition-colors`}
    >
      <label className="flex items-start gap-3 p-4 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabled(e.target.checked)}
          className={`mt-0.5 ${a.check}`}
        />
        <span className="min-w-0">
          <span className="block text-[13px] font-bold text-ink">{label}</span>
          <span className="block text-[11px] text-slate-meta leading-snug">
            {hint}
          </span>
        </span>
      </label>
      {enabled && (
        <div className="px-4 pb-4 pt-1 border-t border-[var(--rule)]">
          {children}
        </div>
      )}
    </div>
  );
}
