/**
 * Sourcing outbound eligibility gate (foundations harness §2.6).
 *
 * The enrollment gate: manual outbound is Growth+. A tier that shouldn't reach
 * outbound (discovery-free / Solo) must not be in the set. Pure (the set);
 * the DB-backed dsoCanUseSourcingOutbound is not exercised here.
 *
 * Run: npm test  (or: npm run test:sourcing-tier)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { SOURCING_OUTBOUND_TIERS } from "@/lib/sourcing/tier";

test("outbound is gated to Growth+ (growth/scale/enterprise)", () => {
  for (const t of ["growth", "scale", "enterprise"]) {
    assert.ok(SOURCING_OUTBOUND_TIERS.has(t), `${t} should be able to use outbound`);
  }
});

test("lower / unknown tiers are excluded from outbound", () => {
  // Solo is a paid tier but discovery-only for sourcing; the rest are non-tiers.
  for (const t of ["solo", "free", "discovery", "starter", "", "GROWTH"]) {
    assert.ok(!SOURCING_OUTBOUND_TIERS.has(t), `${t} should NOT be able to use outbound`);
  }
});
