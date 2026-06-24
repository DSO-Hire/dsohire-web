/**
 * Dental comp model — deal-card formatter (foundations harness §2.2).
 *
 * NOTE: model.ts does NOT compute the estimated annual range; it FORMATS the
 * deal card (headline + est-range string + fine-print chips) from values passed
 * in (estAnnualMin/Max are computed upstream). Its stated purpose is the
 * "one source of truth" so the wizard preview and the public job page can never
 * disagree. So this suite covers the formatter, model classification, and the
 * locked vocabulary — and that worker classification is shown neutrally (no
 * scoring effect).
 *
 * Run: npm test  (or: npm run test:comp)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formatDealCard,
  isPercentModel,
  COMP_MODEL_OPTIONS,
  PERCENT_BASIS_LABELS,
  LAB_FEE_LABELS,
  CLASSIFICATION_LABELS,
  GP_PERCENT_DEFAULT,
  type CompModel,
} from "@/lib/comp/model";

test("isPercentModel: true for percentage-bearing models, false for simple/null", () => {
  for (const m of [
    "percent_only",
    "guarantee_plus_percent",
    "draw_against_percent",
    "salary_vs_percent",
  ] as CompModel[]) {
    assert.equal(isPercentModel(m), true, m);
  }
  assert.equal(isPercentModel("simple"), false);
  assert.equal(isPercentModel(null), false);
  assert.equal(isPercentModel(undefined), false);
});

test("simple model: no headline (keeps the range display), est range from est annual", () => {
  const card = formatDealCard({
    compModel: "simple",
    estAnnualMin: 180000,
    estAnnualMax: 220000,
  });
  assert.equal(card.headline, null);
  assert.equal(card.estRange, "Est. $180K–$220K/yr");
});

test("percent_only headline = rate of basis", () => {
  const card = formatDealCard({
    compModel: "percent_only",
    percentRateMin: 30,
    percentBasis: "collections",
  });
  assert.equal(card.headline, "30% of net collections");
});

test("guarantee_plus_percent: daily guarantee (with duration) + percentage", () => {
  const card = formatDealCard({
    compModel: "guarantee_plus_percent",
    guaranteeKind: "daily",
    guaranteeAmount: 1100,
    guaranteeDuration: "intro_90d",
    percentRateMin: 30,
    percentBasis: "production",
  });
  assert.equal(card.headline, "$1,100/day guarantee (first 90 days) + 30% of production");
});

test("draw_against_percent leads with the percentage (the draw is internal accounting)", () => {
  const card = formatDealCard({
    compModel: "draw_against_percent",
    guaranteeKind: "daily",
    guaranteeAmount: 1100,
    percentRateMin: 32,
    percentBasis: "collections",
  });
  assert.match(card.headline ?? "", /^32% of net collections/);
  assert.match(card.headline ?? "", /\$1,100\/day advance/);
});

test("salary_vs_percent: greater-of phrasing", () => {
  const card = formatDealCard({
    compModel: "salary_vs_percent",
    guaranteeKind: "annual_salary",
    guaranteeAmount: 160000,
    percentRateMin: 30,
    percentBasis: "production",
  });
  assert.equal(card.headline, "Greater of $160K/yr or 30% of production");
});

test("est range: single-sided + abbreviation + absent", () => {
  assert.equal(
    formatDealCard({ compModel: "simple", estAnnualMin: 200000 }).estRange,
    "Est. $200K/yr",
  );
  assert.equal(formatDealCard({ compModel: "simple" }).estRange, null);
});

test("chips: only entered facts; worker classification shown neutrally", () => {
  const card = formatDealCard({
    compModel: "percent_only",
    percentRateMin: 30,
    percentBasis: "production",
    hygieneExamCredited: true,
    labFeePolicy: "practice_paid",
    workerClassification: "w2",
    payCadence: "biweekly",
  });
  assert.ok(card.chips.includes("Hygiene exams credited"));
  assert.ok(card.chips.includes(LAB_FEE_LABELS.practice_paid)); // "Labs practice-paid"
  assert.ok(card.chips.includes("W-2")); // neutral classification chip
  assert.ok(card.chips.includes("Paid bi-weekly"));

  // A card with no fine-print facts has no chips.
  const bare = formatDealCard({ compModel: "percent_only", percentRateMin: 30, percentBasis: "production" });
  assert.equal(bare.chips.length, 0);
});

test("locked vocabulary is present", () => {
  assert.equal(COMP_MODEL_OPTIONS.length, 5);
  assert.equal(GP_PERCENT_DEFAULT, 30);
  assert.equal(PERCENT_BASIS_LABELS.collections, "net collections");
  assert.equal(CLASSIFICATION_LABELS.w2, "W-2");
});
