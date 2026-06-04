/**
 * On-Target Earnings (OTE) computation — composable compensation model.
 *
 * Pure logic, no React, no DB. Shared by the `<CompensationSection>` wizard
 * component (live note as the recruiter types) and the public job page (the
 * displayed OTE on a live listing), so the two never disagree.
 *
 * Model: base compensation + optional variable component + optional bonus
 * component. Equity is non-cash and deliberately NOT part of OTE.
 *
 * Schema: jobs.compensation_{type,min,max} (base) + jobs.variable_comp_{enabled,
 * target} + jobs.bonus_{enabled,target} (migration 20260514000002).
 */

export type CompensationType =
  | "range"
  | "starting_at"
  | "up_to"
  | "exact"
  | "doe";

export interface OteInputs {
  compensationType: CompensationType | null;
  compensationMin: number | null;
  compensationMax: number | null;
  /**
   * The base's pay period (jobs.compensation_period: hourly / daily / annual /
   * per_visit / …). REQUIRED for a correct OTE: the variable + bonus targets are
   * annual dollar figures, so an hourly/daily base must be annualized before
   * it's summed with them. Omitting it (or "annual") treats the base as already
   * yearly. Without this, an hourly base + annual variable produced nonsense
   * (e.g. $23.50/hr + $6,000 → "$6,024 OTE/yr").
   */
  compensationPeriod?: string | null;
  variableCompEnabled: boolean;
  variableCompTarget: number | null;
  bonusEnabled: boolean;
  bonusTarget: number | null;
}

export interface OteResult {
  /**
   * The single base figure used in the OTE math. Null when base can't be
   * pinned to one number — i.e. DOE, or no base entered yet. A range
   * collapses to its midpoint.
   */
  base: number | null;
  /** Sum of the enabled variable components' annual targets. */
  variable: number;
  /** base + variable. Null when `base` is null (can't total an unknown base). */
  ote: number | null;
  /** True when at least one variable component is enabled AND has a target. */
  hasVariable: boolean;
}

/**
 * Resolve the base compensation to a single number for the OTE calc.
 *   range       → midpoint of min/max (or whichever single bound is set)
 *   starting_at → the floor (min)
 *   up_to       → the ceiling (max)
 *   exact       → the single value (the wizard stores it in min)
 *   doe / null  → null (no number to anchor to)
 */
export function resolveBaseForOte(
  type: CompensationType | null,
  min: number | null,
  max: number | null
): number | null {
  switch (type) {
    case "range": {
      if (min != null && max != null) return (min + max) / 2;
      return min ?? max ?? null;
    }
    case "starting_at":
      return min ?? null;
    case "up_to":
      return max ?? null;
    case "exact":
      return min ?? max ?? null;
    case "doe":
    case null:
    case undefined:
    default:
      return null;
  }
}

/**
 * Factors to annualize a base figure so it can be summed with the (annual)
 * variable + bonus targets. per_visit is intentionally absent — it can't be
 * annualized without a visit count, so OTE isn't computed for it.
 */
const ANNUALIZATION_FACTOR: Record<string, number> = {
  hourly: 2080, // 40 hrs/wk × 52
  daily: 260, // 5 days/wk × 52
  per_day: 260,
  weekly: 52,
  monthly: 12,
  annual: 1,
  yearly: 1,
};

/**
 * Annualize the base so it shares the variable's annual unit. Returns null when
 * the period can't be annualized (per_visit / unknown) so the caller shows no
 * combined OTE rather than a nonsensical number. A null/absent period is
 * treated as already-annual (the salaried default).
 */
function annualizeBase(
  base: number,
  period: string | null | undefined
): number | null {
  if (!period) return base;
  const factor = ANNUALIZATION_FACTOR[period.toLowerCase()];
  return factor == null ? null : base * factor;
}

export function computeOte(input: OteInputs): OteResult {
  const base = resolveBaseForOte(
    input.compensationType,
    input.compensationMin,
    input.compensationMax
  );

  const variablePart =
    input.variableCompEnabled && input.variableCompTarget != null
      ? input.variableCompTarget
      : 0;
  const bonusPart =
    input.bonusEnabled && input.bonusTarget != null ? input.bonusTarget : 0;
  const variable = variablePart + bonusPart;

  const hasVariable =
    (input.variableCompEnabled && input.variableCompTarget != null) ||
    (input.bonusEnabled && input.bonusTarget != null);

  // Annualize the base before summing with the annual variable. `base` stays in
  // its native period (callers display it as "$X/hr"); only the OTE total is
  // annualized. per_visit/unknown → annualBase null → no combined OTE.
  const annualBase = base != null ? annualizeBase(base, input.compensationPeriod) : null;

  return {
    base,
    variable,
    ote: annualBase != null ? annualBase + variable : null,
    hasVariable,
  };
}

/** "$280,000" — whole-dollar USD, no cents. For OTE notes + comp display. */
export function formatUsd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
