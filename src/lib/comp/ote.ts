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

  return {
    base,
    variable,
    ote: base != null ? base + variable : null,
    hasVariable,
  };
}

/** "$280,000" — whole-dollar USD, no cents. For OTE notes + comp display. */
export function formatUsd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
