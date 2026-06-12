/**
 * #128 — dental-native compensation model (pure, client-safe).
 * Spec: Business Plan & Strategy/Compensation_Model_Redesign_2026-06-12.md
 * (LOCKED — model names, nudge-never-block, engine-scores-est-range-only).
 *
 * One module owns the comp vocabulary: enum unions mirroring the DB
 * types, the locked display names, specialty pre-fill defaults (memo
 * appendix — research-sourced, editable, not promises), the
 * range-mandate state list, and the deal-card formatter shared by the
 * wizard preview and the public job page so they can never disagree
 * (the formatComp precedent, done right this time — one source).
 */

export type CompModel =
  | "simple"
  | "guarantee_plus_percent"
  | "percent_only"
  | "draw_against_percent"
  | "salary_vs_percent";

export type GuaranteeKind =
  | "none"
  | "hourly"
  | "daily"
  | "per_period"
  | "annual_salary";

export type GuaranteeDuration =
  | "permanent"
  | "intro_90d"
  | "intro_6mo"
  | "year_1"
  | "years_1_3"
  | "custom";

export type PercentBasis =
  | "production"
  | "adjusted_production"
  | "collections"
  | "case_starts";

export type LabFeePolicy = "practice_paid" | "split_50" | "deducted" | "other";
export type Reconciliation = "greater_of" | "draw_against" | "additive";
export type PayCadence = "weekly" | "biweekly" | "semimonthly" | "monthly";
export type WorkerClassification = "w2" | "c1099" | "either_negotiable";

/* ── Locked display names (Cam approved as proposed) ── */

export const COMP_MODEL_OPTIONS: Array<{ value: CompModel; label: string }> = [
  { value: "simple", label: "Simple range" },
  { value: "percent_only", label: "Straight percentage" },
  { value: "guarantee_plus_percent", label: "Daily guarantee + %" },
  { value: "draw_against_percent", label: "Draw against %" },
  { value: "salary_vs_percent", label: "Salary vs % (greater of)" },
];

export const PERCENT_BASIS_LABELS: Record<PercentBasis, string> = {
  production: "production",
  adjusted_production: "adjusted production",
  collections: "net collections",
  case_starts: "case starts",
};

export const LAB_FEE_LABELS: Record<LabFeePolicy, string> = {
  practice_paid: "Labs practice-paid",
  split_50: "Labs split 50/50",
  deducted: "Lab fees deducted",
  other: "Lab policy — ask",
};

export const CADENCE_LABELS: Record<PayCadence, string> = {
  weekly: "Paid weekly",
  biweekly: "Paid bi-weekly",
  semimonthly: "Paid semi-monthly",
  monthly: "Paid monthly",
};

export const DURATION_LABELS: Record<GuaranteeDuration, string> = {
  permanent: "",
  intro_90d: "first 90 days",
  intro_6mo: "first 6 months",
  year_1: "year 1",
  years_1_3: "years 1–3",
  custom: "",
};

export const CLASSIFICATION_LABELS: Record<WorkerClassification, string> = {
  w2: "W-2",
  c1099: "1099",
  either_negotiable: "W-2 or 1099",
};

/* ── Specialty pre-fills (memo appendix — research defaults, EDITABLE;
 *    keyed by the wizard's specialty values) ── */

export interface SpecialtyCompDefault {
  percentRate: number;
  basis: PercentBasis;
  /** Daily guarantee band where the market quotes one. */
  dailyGuarantee?: [number, number];
}

export const SPECIALTY_COMP_DEFAULTS: Record<string, SpecialtyCompDefault> = {
  // Keys = the job wizard's SPECIALTY_OPTIONS values.
  endodontics: { percentRate: 40, basis: "collections" },
  periodontics: { percentRate: 37, basis: "collections" },
  oral_surgery: { percentRate: 37, basis: "collections" },
  orthodontics: {
    percentRate: 9,
    basis: "case_starts",
    dailyGuarantee: [1200, 1400],
  },
  pediatric_dentistry: {
    percentRate: 30,
    basis: "collections",
    dailyGuarantee: [1100, 1300],
  },
};

/** GP / unspecified-specialty default (memo: 30–32% band). */
export const GP_PERCENT_DEFAULT = 30;

/* ── Pay-transparency awareness: the memo planned a RANGE_MANDATE_STATES
 *    constant here, but the platform already maintains a richer,
 *    city/county-aware source — lib/compliance/pay-transparency.ts
 *    (Day 24 gap N4), which the wizard already assesses per selected
 *    location. The est-range nudge rides THAT assessment (one source
 *    of truth); nothing comp-specific to maintain here. ── */

/* ── Deal-card formatting (shared: wizard preview + public job page) ── */

export interface DealCardInput {
  compModel: CompModel;
  guaranteeKind?: GuaranteeKind | null;
  guaranteeAmount?: number | null;
  guaranteeDuration?: GuaranteeDuration | null;
  percentRateMin?: number | null;
  percentRateMax?: number | null;
  percentBasis?: PercentBasis | null;
  percentTiersNote?: string | null;
  hygieneExamCredited?: boolean | null;
  hygienistWorkCredited?: boolean | null;
  labFeePolicy?: LabFeePolicy | null;
  basisExclusionsNote?: string | null;
  reconciliation?: Reconciliation | null;
  payCadence?: PayCadence | null;
  estAnnualMin?: number | null;
  estAnnualMax?: number | null;
  workerClassification?: WorkerClassification | null;
}

export interface DealCard {
  /** "​$1,100/day draw → 30% of net collections" — null when the model's
   * required figures aren't entered yet (preview shows placeholder). */
  headline: string | null;
  /** "Est. $260K–$310K/yr" — separate so surfaces can emphasize it. */
  estRange: string | null;
  /** Fine-print facts, only the ones actually entered. */
  chips: string[];
}

const usd = new Intl.NumberFormat("en-US");

function money(n: number): string {
  return `$${usd.format(n)}`;
}

/** Annual figures read better abbreviated ($250K), sub-annual raw. */
function annualMoney(n: number): string {
  return n >= 1000 ? `$${Math.round(n / 1000)}K` : money(n);
}

function pct(min?: number | null, max?: number | null): string | null {
  const lo = min ?? null;
  const hi = max ?? null;
  if (lo !== null && hi !== null && hi !== lo) return `${lo}–${hi}%`;
  if (lo !== null) return `${lo}%`;
  if (hi !== null) return `${hi}%`;
  return null;
}

function guaranteeText(
  kind: GuaranteeKind | null | undefined,
  amount: number | null | undefined
): string | null {
  if (!kind || kind === "none" || amount == null || amount <= 0) return null;
  switch (kind) {
    case "hourly":
      return `${money(amount)}/hr`;
    case "daily":
      return `${money(amount)}/day`;
    case "per_period":
      return `${money(amount)}/pay period`;
    case "annual_salary":
      return `${annualMoney(amount)}/yr`;
    default:
      return null;
  }
}

export function isPercentModel(model: CompModel | null | undefined): boolean {
  return (
    model === "percent_only" ||
    model === "guarantee_plus_percent" ||
    model === "draw_against_percent" ||
    model === "salary_vs_percent"
  );
}

export function formatDealCard(input: DealCardInput): DealCard {
  const rate = pct(input.percentRateMin, input.percentRateMax);
  const basis = input.percentBasis
    ? PERCENT_BASIS_LABELS[input.percentBasis]
    : null;
  const percentText = rate && basis ? `${rate} of ${basis}` : null;
  const guarantee = guaranteeText(
    input.guaranteeKind,
    input.guaranteeAmount
  );
  const durationNote =
    input.guaranteeDuration && DURATION_LABELS[input.guaranteeDuration]
      ? ` (${DURATION_LABELS[input.guaranteeDuration]})`
      : "";

  let headline: string | null = null;
  switch (input.compModel) {
    case "percent_only":
      headline = percentText;
      break;
    case "guarantee_plus_percent":
      headline =
        guarantee && percentText
          ? `${guarantee} guarantee${durationNote} + ${percentText}`
          : guarantee
            ? `${guarantee} guarantee${durationNote}`
            : percentText;
      break;
    case "draw_against_percent":
      headline =
        guarantee && percentText
          ? `${guarantee} draw → ${percentText}`
          : percentText;
      break;
    case "salary_vs_percent":
      headline =
        guarantee && percentText
          ? `Greater of ${guarantee} or ${percentText}`
          : percentText;
      break;
    case "simple":
    default:
      headline = null; // simple model keeps the existing range display
  }

  const estRange =
    input.estAnnualMin != null || input.estAnnualMax != null
      ? input.estAnnualMin != null && input.estAnnualMax != null
        ? `Est. ${annualMoney(input.estAnnualMin)}–${annualMoney(input.estAnnualMax)}/yr`
        : `Est. ${annualMoney((input.estAnnualMin ?? input.estAnnualMax)!)}/yr`
      : null;

  const chips: string[] = [];
  if (input.percentTiersNote?.trim()) chips.push(input.percentTiersNote.trim());
  if (input.hygieneExamCredited === true) chips.push("Hygiene exams credited");
  if (input.hygieneExamCredited === false) chips.push("Hygiene exams excluded");
  if (input.hygienistWorkCredited === true)
    chips.push("Hygienist work credited on your exam days");
  if (input.labFeePolicy) chips.push(LAB_FEE_LABELS[input.labFeePolicy]);
  if (input.basisExclusionsNote?.trim())
    chips.push(input.basisExclusionsNote.trim());
  if (input.workerClassification)
    chips.push(CLASSIFICATION_LABELS[input.workerClassification]);
  if (input.payCadence) chips.push(CADENCE_LABELS[input.payCadence]);

  return { headline, estRange, chips };
}
