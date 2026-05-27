/**
 * Anthropic pricing constants for cost tracking.
 *
 * Costs in DOLLARS per million tokens. Verified against
 * anthropic.com/pricing at spec-lock time (2026-05-27 — pricing
 * may shift; treat as a snapshot, re-verify on major price changes).
 *
 * Used by claude-usage.computeCostCents() to convert (model + tokens)
 * → dollar cost at log time, so the claude_usage_log row carries a
 * stable cost figure even if pricing changes later.
 */

export interface ModelPricing {
  /** $/M input tokens (uncached) */
  input: number;
  /** $/M output tokens */
  output: number;
  /** $/M cached input tokens (Anthropic prompt caching). */
  cachedInput: number;
}

/**
 * Pricing per model. Keys MUST match the `model` string passed to the
 * Anthropic SDK so logUsage() can look up by the same identifier.
 *
 * Haiku 4.5 is the workhorse for Tier 2 v1 (per the spec, all questions
 * default to Haiku; Sonnet escalation is post-launch). Sonnet + Opus
 * kept here so the cost calc still works if we ever route to them
 * accidentally (better to log a non-zero cost than $0).
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-haiku-4-5-20251001": { input: 1, output: 5, cachedInput: 0.1 },
  "claude-haiku-4-5": { input: 1, output: 5, cachedInput: 0.1 },
  "claude-sonnet-4-6": { input: 3, output: 15, cachedInput: 0.3 },
  "claude-opus-4-6": { input: 15, output: 75, cachedInput: 1.5 },
};

/**
 * Convert (model + input_tokens + output_tokens + cached_input_tokens)
 * to a cost in cents. Returns 0 for unknown models (logged as a
 * console warning so we notice we're routing to something untracked).
 */
export function computeCostCents(args: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}): number {
  const pricing = MODEL_PRICING[args.model];
  if (!pricing) {
    console.warn(
      `[claude-usage] no pricing for model "${args.model}" — logging cost as 0. ` +
        `Add to MODEL_PRICING in src/lib/support/pricing.ts.`
    );
    return 0;
  }
  // Costs are $/M tokens. Convert to cents: ($/M tokens × tokens × 100¢/$ ÷ 1_000_000)
  // = ($/M × tokens) / 10_000.
  const inputCost = (pricing.input * args.inputTokens) / 10_000;
  const cachedCost = (pricing.cachedInput * (args.cachedInputTokens ?? 0)) / 10_000;
  const outputCost = (pricing.output * args.outputTokens) / 10_000;
  // Round to 4 decimal places to match the numeric(10,4) cost_cents column.
  return Math.round((inputCost + cachedCost + outputCost) * 10_000) / 10_000;
}
