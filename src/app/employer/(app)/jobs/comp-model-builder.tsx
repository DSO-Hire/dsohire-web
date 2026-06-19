"use client";

/**
 * <CompModelBuilder> — #128 dental-native comp builder.
 * Spec: Business Plan & Strategy/Compensation_Model_Redesign_2026-06-12.md
 * (LOCKED — model names, strong-nudge-never-block est. range,
 * worker_classification neutral field).
 *
 * Model picker FIRST, fields second. "Simple range" renders the
 * existing <CompensationSection> untouched via the children slot —
 * every current posting flow is byte-identical until a recruiter
 * deliberately picks a structured model. Structured models swap in
 * the dental atoms: guarantee layer, % rate + basis, basis fine-print
 * chips, mechanics, and the est. annual range (nudged via the
 * platform's existing pay-transparency assessment — jurisdiction-aware,
 * never a hard block). Classification renders for ALL models.
 *
 * Specialty pre-fills (memo appendix, research defaults, fully
 * editable): applied once when a percent model is first chosen and the
 * rate is still empty — never overwrite a typed value.
 */

import { useMemo, type ReactNode } from "react";
import { Info } from "lucide-react";
import {
  COMP_MODEL_OPTIONS,
  SPECIALTY_COMP_DEFAULTS,
  GP_PERCENT_DEFAULT,
  isPercentModel,
  type CompModel,
  type GuaranteeKind,
  type GuaranteeDuration,
  type PercentBasis,
  type LabFeePolicy,
  type PayCadence,
  type WorkerClassification,
  type DealCardInput,
} from "@/lib/comp/model";

/* ── Wizard-state shape (strings — raw input values) ── */

export interface CompModelState {
  compModel: CompModel;
  guaranteeKind: GuaranteeKind | "";
  guaranteeAmount: string;
  guaranteeDuration: GuaranteeDuration | "";
  percentRateMin: string;
  percentRateMax: string;
  percentBasis: PercentBasis | "";
  percentTiersNote: string;
  hygieneExamCredited: "" | "yes" | "no";
  hygienistWorkCredited: "" | "yes";
  labFeePolicy: LabFeePolicy | "";
  basisExclusionsNote: string;
  payCadence: PayCadence | "";
  estAnnualMin: string;
  estAnnualMax: string;
  workerClassification: WorkerClassification | "";
}

export const EMPTY_COMP_MODEL_STATE: CompModelState = {
  compModel: "simple",
  guaranteeKind: "",
  guaranteeAmount: "",
  guaranteeDuration: "",
  percentRateMin: "",
  percentRateMax: "",
  percentBasis: "",
  percentTiersNote: "",
  hygieneExamCredited: "",
  hygienistWorkCredited: "",
  labFeePolicy: "",
  basisExclusionsNote: "",
  payCadence: "",
  estAnnualMin: "",
  estAnnualMax: "",
  workerClassification: "",
};

function num(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Wizard state → formatter input (shared with the live preview). */
export function dealCardInputFromState(s: CompModelState): DealCardInput {
  return {
    compModel: s.compModel,
    guaranteeKind: s.guaranteeKind || null,
    guaranteeAmount: num(s.guaranteeAmount),
    guaranteeDuration: s.guaranteeDuration || null,
    percentRateMin: num(s.percentRateMin),
    percentRateMax: num(s.percentRateMax),
    percentBasis: s.percentBasis || null,
    percentTiersNote: s.percentTiersNote || null,
    hygieneExamCredited:
      s.hygieneExamCredited === "" ? null : s.hygieneExamCredited === "yes",
    hygienistWorkCredited: s.hygienistWorkCredited === "yes" ? true : null,
    labFeePolicy: s.labFeePolicy || null,
    basisExclusionsNote: s.basisExclusionsNote || null,
    payCadence: s.payCadence || null,
    estAnnualMin: num(s.estAnnualMin),
    estAnnualMax: num(s.estAnnualMax),
    workerClassification: s.workerClassification || null,
  };
}

/* ── Defaults applied when a percent model is first chosen ── */

function prefillFor(
  model: CompModel,
  roleCategory: string,
  specialty: ReadonlySet<string>
): Partial<CompModelState> {
  // #128 Phase D — hygienist variant: the market deal is HOURLY base +
  // % of hygiene production above a threshold (memo appendix: base is
  // the wage, not a ramp device → permanent; bonus band 20–30%).
  if (roleCategory === "dental_hygienist" && model === "guarantee_plus_percent") {
    return {
      guaranteeKind: "hourly",
      guaranteeDuration: "permanent",
      percentRateMin: "25",
      percentBasis: "production",
    };
  }
  const spec = Array.from(specialty).find((v) => SPECIALTY_COMP_DEFAULTS[v]);
  const d = spec ? SPECIALTY_COMP_DEFAULTS[spec] : null;
  const out: Partial<CompModelState> = {
    percentRateMin: String(d?.percentRate ?? GP_PERCENT_DEFAULT),
    percentBasis: d?.basis ?? "collections",
  };
  if (model === "guarantee_plus_percent" || model === "draw_against_percent") {
    out.guaranteeKind = "daily";
    // Dave (DDS/ex-DSO, 2026-06-12): day guarantees are RAMP-UP devices
    // — default the duration to an intro window instead of open-ended.
    // Fully editable; "Permanent" stays one click away.
    out.guaranteeDuration = "intro_90d";
  }
  if (model === "salary_vs_percent") out.guaranteeKind = "annual_salary";
  return out;
}

/** Market placeholder for the guarantee amount — Dave's GP band
 * ($750–1,000/day) unless the selected specialty carries its own;
 * hygienist hourly base = $42–60 market (memo appendix). */
function guaranteeAmountPlaceholder(
  kind: GuaranteeKind | "",
  specialty: ReadonlySet<string>
): string {
  if (kind === "hourly") return "e.g. 42–60 market";
  if (kind !== "daily") return "amount";
  const spec = Array.from(specialty).find(
    (v) => SPECIALTY_COMP_DEFAULTS[v]?.dailyGuarantee
  );
  const band = spec ? SPECIALTY_COMP_DEFAULTS[spec].dailyGuarantee : null;
  return band
    ? `e.g. ${band[0].toLocaleString()}–${band[1].toLocaleString()} market`
    : "e.g. 750–1,000 market";
}

/* ── Small field primitives (match wizard field styling) ── */

const LABEL = "block text-[11px] font-bold tracking-[1px] uppercase text-slate-meta mb-1";
const INPUT =
  "w-full px-3 py-2 bg-card border border-[var(--rule-strong)] text-[14px] text-ink focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage";

function Sel({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Txt({
  label,
  value,
  onChange,
  placeholder,
  prefix,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <span className="flex items-center gap-1">
        {prefix && <span className="text-[13px] text-slate-meta">{prefix}</span>}
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={INPUT}
        />
        {suffix && <span className="text-[13px] text-slate-meta">{suffix}</span>}
      </span>
    </label>
  );
}

/* ── Component ── */

export function CompModelBuilder({
  state,
  onState,
  roleCategory,
  specialty,
  payTransparency,
  children,
}: {
  state: CompModelState;
  onState: (next: CompModelState) => void;
  roleCategory: string;
  specialty: ReadonlySet<string>;
  /** The wizard's existing jurisdiction-aware assessment (Day 24 N4). */
  payTransparency: { requiresRange: boolean; coveredLabel: string } | null;
  /** The existing <CompensationSection> — rendered untouched for "Simple range". */
  children: ReactNode;
}) {
  const set = (patch: Partial<CompModelState>) =>
    onState({ ...state, ...patch });

  function pickModel(model: CompModel) {
    if (model === state.compModel) return;
    // Pre-fill ONLY when entering a percent model with an empty rate —
    // research defaults are suggestions, never overwrites.
    if (isPercentModel(model) && state.percentRateMin.trim() === "") {
      set({ compModel: model, ...prefillFor(model, roleCategory, specialty) });
    } else {
      set({ compModel: model });
    }
  }

  const percent = isPercentModel(state.compModel);
  const hasGuarantee =
    state.compModel === "guarantee_plus_percent" ||
    state.compModel === "draw_against_percent" ||
    state.compModel === "salary_vs_percent";
  const guaranteeLabel =
    state.compModel === "draw_against_percent"
      ? "Draw"
      : state.compModel === "salary_vs_percent"
        ? "Salary"
        : "Guarantee";
  const estMissing =
    percent &&
    state.estAnnualMin.trim() === "" &&
    state.estAnnualMax.trim() === "";

  const orthoSelected = specialty.has("orthodontics");
  const basisOptions = useMemo(
    () => [
      { value: "production", label: "Production" },
      { value: "adjusted_production", label: "Adjusted production" },
      { value: "collections", label: "Net collections" },
      ...(orthoSelected || state.percentBasis === "case_starts"
        ? [{ value: "case_starts", label: "Case starts (ortho)" }]
        : []),
    ],
    [orthoSelected, state.percentBasis]
  );

  return (
    <div className="space-y-5">
      {/* Model picker */}
      <div>
        <span className={LABEL}>How does this role earn?</span>
        <div className="flex flex-wrap gap-1.5">
          {COMP_MODEL_OPTIONS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => pickModel(m.value)}
              aria-pressed={state.compModel === m.value}
              className={`px-3 py-1.5 text-[11px] font-bold border transition-colors ${
                state.compModel === m.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-slate-body border-[var(--rule-strong)] hover:border-ink"
              }`}
            >
              {/* Phase D — hygienists know this deal as "hourly + production
                  %", not "daily guarantee" (same model, market-true label). */}
              {roleCategory === "dental_hygienist" &&
              m.value === "guarantee_plus_percent"
                ? "Hourly + production %"
                : m.label}
            </button>
          ))}
        </div>
        {percent && (
          <p className="mt-1.5 text-[11px] text-slate-meta leading-snug">
            Structured dental comp — candidates see the deal exactly as
            you define it. Specialty defaults are market suggestions
            (editable, not promises).
          </p>
        )}
      </div>

      {state.compModel === "simple" ? (
        children
      ) : (
        <>
          {/* Guarantee layer */}
          {hasGuarantee && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Sel
                label={`${guaranteeLabel} type`}
                value={state.guaranteeKind}
                onChange={(v) =>
                  set({ guaranteeKind: v as CompModelState["guaranteeKind"] })
                }
                placeholder="Choose…"
                options={[
                  { value: "daily", label: "Per clinical day" },
                  { value: "per_period", label: "Per pay period" },
                  { value: "annual_salary", label: "Annual salary" },
                  { value: "hourly", label: "Hourly" },
                ]}
              />
              <Txt
                label={`${guaranteeLabel} amount`}
                value={state.guaranteeAmount}
                onChange={(v) => set({ guaranteeAmount: v })}
                prefix="$"
                placeholder={guaranteeAmountPlaceholder(
                  state.guaranteeKind,
                  specialty
                )}
              />
              <Sel
                label="For how long"
                value={state.guaranteeDuration}
                onChange={(v) =>
                  set({
                    guaranteeDuration:
                      v as CompModelState["guaranteeDuration"],
                  })
                }
                placeholder="Ongoing"
                options={[
                  { value: "intro_90d", label: "First 90 days" },
                  { value: "intro_6mo", label: "First 6 months" },
                  { value: "year_1", label: "Year 1" },
                  { value: "years_1_3", label: "Years 1–3" },
                  { value: "permanent", label: "Permanent" },
                ]}
              />
            </div>
          )}
          {/* Dave's incentive-design note (BLS-nudge pattern): a rich
              PERMANENT day-rate floor against a percentage invites
              coasting on the floor. Informational only — never blocks. */}
          {hasGuarantee &&
            state.guaranteeKind === "daily" &&
            state.guaranteeDuration === "permanent" && (
              <p className="flex items-start gap-1.5 -mt-2 text-[11px] leading-snug text-slate-meta">
                <Info
                  className="h-3.5 w-3.5 shrink-0 mt-px text-heritage-deep"
                  aria-hidden
                />
                <span>
                  Most day-rate guarantees cover a ramp-up window. A
                  permanent floor above what the percentage typically
                  yields can blunt the incentive to produce — worth a
                  gut-check before posting.
                </span>
              </p>
            )}

          {/* Percent layer */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Txt
              label="Percent (from)"
              value={state.percentRateMin}
              onChange={(v) => set({ percentRateMin: v })}
              suffix="%"
              placeholder="30"
            />
            <Txt
              label="To (optional)"
              value={state.percentRateMax}
              onChange={(v) => set({ percentRateMax: v })}
              suffix="%"
              placeholder=""
            />
            <div className="sm:col-span-2">
              <Sel
                label="Of what"
                value={state.percentBasis}
                onChange={(v) =>
                  set({ percentBasis: v as CompModelState["percentBasis"] })
                }
                placeholder="Choose basis…"
                options={basisOptions}
              />
            </div>
          </div>
          <Txt
            label="Tier note (optional)"
            value={state.percentTiersNote}
            onChange={(v) => set({ percentTiersNote: v })}
            placeholder='e.g. "8% year 1 → 10% years 2–3" or "above $1,400/day production"'
          />

          {/* Basis fine print — the questions every associate asks first */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Sel
              label="Hygiene exam fees"
              value={state.hygieneExamCredited}
              onChange={(v) =>
                set({
                  hygieneExamCredited:
                    v as CompModelState["hygieneExamCredited"],
                })
              }
              placeholder="Not specified"
              options={[
                { value: "yes", label: "Credited to the doctor" },
                { value: "no", label: "Not credited" },
              ]}
            />
            <Sel
              label="Lab fees"
              value={state.labFeePolicy}
              onChange={(v) =>
                set({ labFeePolicy: v as CompModelState["labFeePolicy"] })
              }
              placeholder="Not specified"
              options={[
                { value: "practice_paid", label: "Practice pays" },
                { value: "split_50", label: "Split 50/50" },
                { value: "deducted", label: "Deducted from basis" },
                { value: "other", label: "Other / discussed" },
              ]}
            />
            <Sel
              label="Pay cadence"
              value={state.payCadence}
              onChange={(v) =>
                set({ payCadence: v as CompModelState["payCadence"] })
              }
              placeholder="Not specified"
              options={[
                { value: "weekly", label: "Weekly" },
                { value: "biweekly", label: "Bi-weekly" },
                { value: "semimonthly", label: "Semi-monthly" },
                { value: "monthly", label: "Monthly" },
              ]}
            />
          </div>
          <Txt
            label="Excluded from basis (optional)"
            value={state.basisExclusionsNote}
            onChange={(v) => set({ basisExclusionsNote: v })}
            placeholder='e.g. "Invisalign, whitening, and retail products excluded"'
          />

          {/* Est. annual range — nudged, NEVER blocks (locked decision) */}
          <div
            className={`border p-4 space-y-3 ${
              estMissing
                ? "border-warning/70 bg-warning-bg/50"
                : "border-[var(--rule)] bg-cream/40"
            }`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Txt
                label="Est. annual earnings — low"
                value={state.estAnnualMin}
                onChange={(v) => set({ estAnnualMin: v })}
                prefix="$"
                placeholder="e.g. 260000"
              />
              <Txt
                label="Est. annual earnings — high"
                value={state.estAnnualMax}
                onChange={(v) => set({ estAnnualMax: v })}
                prefix="$"
                placeholder="e.g. 310000"
              />
            </div>
            <p className="flex items-start gap-1.5 text-[11px] leading-snug text-slate-body">
              <Info className="h-3.5 w-3.5 shrink-0 mt-px text-heritage-deep" aria-hidden />
              <span>
                The range you in good faith expect a successful hire to
                earn. It's what makes a percentage deal comparable — and
                what PracticeFit matches on.
                {estMissing && payTransparency?.requiresRange && (
                  <strong className="text-warning">
                    {" "}
                    {payTransparency.coveredLabel} requires a posted pay
                    range for this posting's location(s).
                  </strong>
                )}
              </span>
            </p>
          </div>
        </>
      )}

      {/* Worker classification — all models (neutral fact, never advice) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Sel
          label="Worker classification"
          value={state.workerClassification}
          onChange={(v) =>
            set({
              workerClassification:
                v as CompModelState["workerClassification"],
            })
          }
          placeholder="Not specified"
          options={[
            { value: "w2", label: "W-2 employee" },
            { value: "c1099", label: "1099 independent contractor" },
            { value: "either_negotiable", label: "Either — negotiable" },
          ]}
        />
        <p className="self-end pb-2 text-[10px] leading-snug text-slate-meta">
          Classification is regulated and state-specific (hygienists and
          assistants under supervision are generally W-2) — confirm with
          your counsel. We display what you choose; we don't advise.
        </p>
      </div>
    </div>
  );
}
