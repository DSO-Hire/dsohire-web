/**
 * N12 offer comp guardrail — compares a structured offer base amount against
 * the job's POSTED compensation range. Pure + deterministic (the market
 * reference is shown separately by PayBenchmarkHint). Phase 1: posted-range
 * check only. Phase 2 routes an "out_of_range" result into the approval chain.
 */

export type OfferBasePeriod = "hourly" | "annual";
/** jobs.compensation_period enum. */
export type JobCompPeriod = "hourly" | "daily" | "annual";

export type GuardrailSeverity = "ok" | "out_of_range" | "no_range";

export interface GuardrailResult {
  severity: GuardrailSeverity;
  /** Plain-English explanation for the compose banner. */
  message: string | null;
  baseHourly: number | null;
  rangeLowHourly: number | null;
  rangeHighHourly: number | null;
}

const HOURS_PER_YEAR = 2080; // 40h × 52w — same basis as lib/analytics/benchmarks
const HOURS_PER_DAY = 8;

function toHourly(amount: number, period: OfferBasePeriod | JobCompPeriod): number {
  if (period === "annual") return amount / HOURS_PER_YEAR;
  if (period === "daily") return amount / HOURS_PER_DAY;
  return amount; // hourly
}

function fmtHourly(n: number): string {
  return `$${n.toFixed(2).replace(/\.00$/, "")}/hr`;
}

/**
 * Evaluate an offer's base against the job's posted range. Everything is
 * normalized to an hourly basis for an apples-to-apples comparison (the offer
 * and the job posting can use different periods).
 */
export function evaluateOfferGuardrail(input: {
  baseAmount: number | null;
  basePeriod: OfferBasePeriod;
  jobMin: number | null;
  jobMax: number | null;
  jobPeriod: JobCompPeriod | null;
}): GuardrailResult {
  const { baseAmount, basePeriod, jobMin, jobMax, jobPeriod } = input;

  if (baseAmount == null || !Number.isFinite(baseAmount) || baseAmount <= 0) {
    return { severity: "no_range", message: null, baseHourly: null, rangeLowHourly: null, rangeHighHourly: null };
  }
  const baseHourly = toHourly(baseAmount, basePeriod);

  // No posted range to check against → nothing to flag.
  if (jobMin == null && jobMax == null) {
    return { severity: "no_range", message: null, baseHourly, rangeLowHourly: null, rangeHighHourly: null };
  }
  const period = jobPeriod ?? "hourly";
  const lowHourly = jobMin != null ? toHourly(jobMin, period) : null;
  const highHourly = jobMax != null ? toHourly(jobMax, period) : null;

  const rangeStr =
    lowHourly != null && highHourly != null
      ? `${fmtHourly(lowHourly)}–${fmtHourly(highHourly)}`
      : lowHourly != null
        ? `at least ${fmtHourly(lowHourly)}`
        : `at most ${fmtHourly(highHourly!)}`;

  const below = lowHourly != null && baseHourly < lowHourly - 0.005;
  const above = highHourly != null && baseHourly > highHourly + 0.005;

  if (below || above) {
    const dir = below ? "below" : "above";
    return {
      severity: "out_of_range",
      message: `This base (${fmtHourly(baseHourly)}) is ${dir} the job's posted range (${rangeStr}).`,
      baseHourly,
      rangeLowHourly: lowHourly,
      rangeHighHourly: highHourly,
    };
  }

  return {
    severity: "ok",
    message: `In your posted range (${rangeStr}).`,
    baseHourly,
    rangeLowHourly: lowHourly,
    rangeHighHourly: highHourly,
  };
}
