/**
 * Billing cap guardrails (foundations harness §2.3).
 *
 * #88 governing principle: the advertised number === the enforced number.
 * These cover the PURE resolution + evaluation logic (no DB): tier caps,
 * seat-pack math, and the nudge/block thresholds.
 *
 * Run: npm test  (or: npm run test:caps)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveCaps, evaluateCap, NUDGE_THRESHOLD } from "@/lib/billing/caps";

test("resolveCaps returns the advertised caps per tier", () => {
  assert.deepEqual(resolveCaps("solo"), { maxActiveJobs: 5, maxSeats: 5 });
  assert.deepEqual(resolveCaps("growth"), { maxActiveJobs: 20, maxSeats: 15 });
  assert.deepEqual(resolveCaps("scale"), { maxActiveJobs: 100, maxSeats: 50 });
  assert.deepEqual(resolveCaps("enterprise"), { maxActiveJobs: null, maxSeats: null });
});

test("resolveCaps falls back to the most restrictive (Solo) for unknown/missing tier", () => {
  // An unsubscribed / edge account must not be able to bypass the gate.
  assert.deepEqual(resolveCaps(null), { maxActiveJobs: 5, maxSeats: 5 });
  assert.deepEqual(resolveCaps(undefined), { maxActiveJobs: 5, maxSeats: 5 });
  assert.deepEqual(resolveCaps("bogus"), { maxActiveJobs: 5, maxSeats: 5 });
});

test("seat packs raise ONLY the seat cap (+3 each); jobs unaffected; unlimited stays unlimited", () => {
  // Growth: 15 seats + 2 packs × 3 = 21; jobs unchanged at 20.
  assert.deepEqual(resolveCaps("growth", 2), { maxActiveJobs: 20, maxSeats: 21 });
  // Enterprise seats stay unlimited regardless of packs.
  assert.deepEqual(resolveCaps("enterprise", 5), { maxActiveJobs: null, maxSeats: null });
  // Zero / negative qty is a no-op.
  assert.deepEqual(resolveCaps("solo", 0), { maxActiveJobs: 5, maxSeats: 5 });
  assert.deepEqual(resolveCaps("solo", -3), { maxActiveJobs: 5, maxSeats: 5 });
});

test("evaluateCap: ok below threshold, nearLimit at >=80%, block only when over cap", () => {
  // Below threshold: cap 10, used 5, +1 -> wouldBe 6, ok, not near.
  let c = evaluateCap(10, 5, 1);
  assert.equal(c.ok, true);
  assert.equal(c.nearLimit, false);
  assert.equal(c.remaining, 5);
  assert.equal(c.wouldBe, 6);

  // Nudge zone: wouldBe 8 == ceil(10 * 0.8) -> nearLimit, still ok.
  c = evaluateCap(10, 7, 1);
  assert.equal(c.ok, true);
  assert.equal(c.nearLimit, true);

  // Last slot: wouldBe 10 == cap -> still ok (not a block), nearLimit.
  c = evaluateCap(10, 9, 1);
  assert.equal(c.ok, true);
  assert.equal(c.nearLimit, true);

  // Over cap: wouldBe 11 > 10 -> block.
  c = evaluateCap(10, 10, 1);
  assert.equal(c.ok, false);

  // Unlimited cap (null): always ok, never near, remaining null.
  c = evaluateCap(null, 9999, 5);
  assert.equal(c.ok, true);
  assert.equal(c.nearLimit, false);
  assert.equal(c.remaining, null);
});

test("NUDGE_THRESHOLD is 0.8", () => {
  assert.equal(NUDGE_THRESHOLD, 0.8);
});
