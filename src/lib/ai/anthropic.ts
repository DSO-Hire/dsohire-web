/**
 * Anthropic SDK wrapper — single shared client + cost helpers.
 *
 * This is the foundation for every LLM-driven feature on DSO Hire. The first
 * consumer is the Phase 5D job-description generator; future features (rejection
 * suggester, candidate matching, AI screening summaries) reuse the same client
 * + cost estimator.
 *
 * Server-only — never import from a "use client" file. The API key never leaves
 * the server.
 */

import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to Vercel env vars (production + preview)."
    );
  }
  _client = new Anthropic({ apiKey: key });
  return _client;
}

// Claude Haiku 4.5 pricing (as of 2026-05-04):
//   $1 / 1M input tokens
//   $5 / 1M output tokens
// Future: read from a config so price-list updates don't require code changes.
const HAIKU_INPUT_USD_PER_1M = 1.0;
const HAIKU_OUTPUT_USD_PER_1M = 5.0;

export const HAIKU_MODEL = "claude-haiku-4-5-20251001" as const;

export function estimateHaikuCostUsd(input: number, output: number): number {
  return (
    (input / 1_000_000) * HAIKU_INPUT_USD_PER_1M +
    (output / 1_000_000) * HAIKU_OUTPUT_USD_PER_1M
  );
}
