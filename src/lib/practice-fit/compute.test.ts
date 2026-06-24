/**
 * PracticeFit / DSOFit scoring engine (foundations harness §2.1) — the moat.
 *
 * Two halves:
 *  - End-to-end fixtures for the gate + score: role mismatch => null, a strong
 *    clinical match scores high (clinical preserved), a thin/"open" candidate
 *    does NOT read as a false-100, a corporate match yields a DSOFit result.
 *  - The pure post-normalization helpers: coverage damp (anti-saturation),
 *    deal-breaker caps + boosters.
 *
 * Plus a symmetry guard on the corporate-function adjacency map (the source
 * file notes this assertion is expected to live in the harness).
 *
 * Fixtures use minimal factories; only the fields a given assertion depends on
 * are set, everything else is empty/null (which excludes those dims).
 *
 * Run: npm test  (or: npm run test:practice-fit)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isRoleApplicable,
  computePracticeFit,
  applyCoverageDamp,
  detectAdjustments,
  applyAdjustments,
} from "@/lib/practice-fit/compute";
import type {
  CandidateFitInputs,
  JobFitInputs,
  DsoFitInputs,
  FitInputs,
  FitDimension,
  FitDimensionKey,
} from "@/lib/practice-fit/types";
import {
  CORPORATE_FUNCTION_ADJACENCY,
  type CorporateFunctionSlug,
} from "@/lib/practice-fit/corporate-function";

/* ── fixtures ── */

function baseCandidate(over: Partial<CandidateFitInputs> = {}): CandidateFitInputs {
  return {
    desired_roles: [],
    current_title: null,
    desired_specialty: [],
    license_states: [],
    desired_locations: [],
    desired_location_points: [],
    pms_systems: [],
    certifications: [],
    skills: [],
    schedule_preferences: {},
    min_salary: null,
    salary_unit: null,
    temp_or_perm: null,
    dso_size_preference: null,
    years_experience_dental: null,
    work_pace: null,
    autonomy_pref: null,
    mentorship_pref: null,
    patient_facing_energy: null,
    practice_feel: null,
    ce_growth_importance: null,
    work_life_priority: null,
    comp_priority: null,
    comp_priorities: [],
    benefit_priorities: [],
    patient_population_pref: [],
    seniority_level: null,
    org_scale_experience: null,
    domain_background: null,
    domain_years: null,
    mgmt_span: null,
    pl_scope: null,
    work_mode_pref: null,
    travel_tolerance: null,
    ...over,
  };
}

function baseJob(over: Partial<JobFitInputs> = {}): JobFitInputs {
  return {
    role_category: "other",
    corporate_function: null,
    employment_type: "full_time",
    compensation_type: "range",
    compensation_min: null,
    compensation_max: null,
    compensation_period: "yearly",
    locations: [],
    skills: [],
    pms_required: [],
    certs_required: [],
    specialty: [],
    min_years_experience: null,
    benefits: [],
    schedule_days: [],
    schedule_evenings: false,
    schedule_weekends: false,
    seniority_target: null,
    org_scale_need: null,
    domain_preference: null,
    leadership_required: null,
    work_mode: null,
    travel_required: null,
    ...over,
  };
}

function baseDso(over: Partial<DsoFitInputs> = {}): DsoFitInputs {
  return {
    location_count: 1,
    practice_pace: null,
    autonomy_level: null,
    mentorship_offered: null,
    practice_feel: null,
    ce_support: null,
    work_life_balance: null,
    patient_populations: [],
    ...over,
  };
}

/* ── role gate ── */

test("cross-track pair is NOT applicable (clinical candidate vs admin job) => null", () => {
  const inputs: FitInputs = {
    candidate: baseCandidate({ desired_roles: ["associate_dentist"], license_states: ["TX"] }),
    job: baseJob({
      role_category: "office_manager", // admin track
      compensation_type: "range",
      compensation_min: 120000,
      compensation_max: 160000,
      locations: [{ state: "TX", city: "Austin", latitude: null, longitude: null }],
    }),
    dso: baseDso(),
  };
  assert.equal(isRoleApplicable(inputs), false);
  assert.equal(computePracticeFit(inputs), null);
});

test("strong clinical match is applicable and scores high (clinical preserved)", () => {
  const inputs: FitInputs = {
    candidate: baseCandidate({
      desired_roles: ["associate_dentist"],
      license_states: ["TX"],
      min_salary: 150000,
      salary_unit: "yearly",
      desired_locations: ["Austin, TX"],
      years_experience_dental: 8,
    }),
    job: baseJob({
      role_category: "dentist", // canonicalizes to associate_dentist => exact
      compensation_type: "range",
      compensation_min: 180000,
      compensation_max: 220000,
      compensation_period: "yearly",
      locations: [{ state: "TX", city: "Austin", latitude: null, longitude: null }],
      min_years_experience: 3,
    }),
    dso: baseDso({ location_count: 4 }),
  };
  assert.equal(isRoleApplicable(inputs), true);
  const r = computePracticeFit(inputs);
  assert.ok(r !== null);
  assert.equal(r!.dimensions.role_fit.scored, true);
  assert.equal(r!.dimensions.role_fit.raw, 100);
  assert.equal(r!.product, "practicefit");
  assert.ok(r!.score >= 70, `expected a strong clinical match to stay high, got ${r!.score}`);
  assert.ok(r!.score <= 100);
});

test("thin / 'open to anything' candidate does NOT read as a false-100", () => {
  const inputs: FitInputs = {
    candidate: baseCandidate({
      desired_roles: [], // open => role_fit unscored
      min_salary: 120000,
      salary_unit: "yearly",
      desired_locations: ["Austin, TX"],
    }),
    job: baseJob({
      role_category: "dentist",
      compensation_type: "range",
      compensation_min: 180000,
      compensation_max: 220000,
      compensation_period: "yearly",
      locations: [{ state: "TX", city: "Austin", latitude: null, longitude: null }],
    }),
    dso: baseDso(),
  };
  // Open candidates stay in the pool...
  assert.equal(isRoleApplicable(inputs), true);
  const r = computePracticeFit(inputs);
  assert.ok(r !== null);
  // ...but with no role signal, role_fit is unscored and the score is capped
  // well out of "Excellent" — two maxed generic dims can't normalize to 100.
  assert.equal(r!.dimensions.role_fit.scored, false);
  assert.ok(r!.score <= 60, `expected a capped score, got ${r!.score}`);
});

test("corporate match yields a DSOFit result", () => {
  const inputs: FitInputs = {
    candidate: baseCandidate({
      desired_roles: ["dso_corporate"],
      current_title: "VP of Operations",
      seniority_level: "vp",
      org_scale_experience: "large",
      min_salary: 200000,
      salary_unit: "yearly",
    }),
    job: baseJob({
      role_category: "other",
      corporate_function: "operations",
      compensation_type: "range",
      compensation_min: 220000,
      compensation_max: 280000,
      compensation_period: "yearly",
      seniority_target: "vp",
      org_scale_need: "large",
      leadership_required: "multi_site",
      locations: [{ state: "TX", city: "Austin", latitude: null, longitude: null }],
    }),
    dso: baseDso({ location_count: 50 }),
  };
  assert.equal(isRoleApplicable(inputs), true);
  const r = computePracticeFit(inputs);
  assert.ok(r !== null);
  assert.equal(r!.product, "dsofit");
  assert.equal(r!.dimensions.role_fit.scored, true);
  assert.ok(r!.score >= 0 && r!.score <= 100);
});

/* ── coverage damp (anti-saturation) ── */

test("applyCoverageDamp: thin coverage caps the ceiling; full coverage leaves it; upside-only", () => {
  // Full confidence (>=55% of applicable weight scored) -> untouched.
  assert.equal(applyCoverageDamp(90, 60, 100), 90);
  // Thin coverage -> ceiling slides toward the 45 anchor, capping a high score.
  assert.ok(applyCoverageDamp(90, 5, 100) < 90);
  // Upside-only: a low score is never lifted, even on thin coverage.
  assert.equal(applyCoverageDamp(30, 5, 100), 30);
  // Degenerate denominator -> no change.
  assert.equal(applyCoverageDamp(88, 0, 0), 88);
});

/* ── caps + boosters ── */

test("detectAdjustments: unscored role_fit caps at Solid; in-state license + exact role boost", () => {
  const dim = (over: Partial<FitDimension>): FitDimension => ({
    weight: 10,
    raw: 0,
    contribution: 0,
    scored: false,
    label: "x",
    detail: "",
    detail_employer: "",
    cta_href: null,
    cta_label: null,
    cta_inline: false,
    ...over,
  });

  // No role signal -> a "cap" adjustment exists.
  const capped = detectAdjustments({
    role_fit: dim({ scored: false }),
  } as unknown as Record<FitDimensionKey, FitDimension>);
  assert.ok(capped.some((a) => a.kind === "cap" && a.dimension === "role_fit"));

  // Marquee dental signals all line up -> a "boost".
  const boosted = detectAdjustments({
    role_fit: dim({ scored: true, raw: 100 }),
    pms_fluency: dim({ scored: true, raw: 90 }),
    location: dim({ scored: true, raw: 90 }),
    license_state: dim({ scored: true, raw: 100 }),
  } as unknown as Record<FitDimensionKey, FitDimension>);
  assert.ok(boosted.some((a) => a.kind === "boost"));
});

test("applyAdjustments: boost lifts toward the ceiling, a cap always wins", () => {
  // Boost lifts but never below the base.
  assert.equal(applyAdjustments(80, [{ kind: "boost", dimension: null, value: 5, reason: "" }]), 85);
  // Boost is ceilinged at 97 (never a synthetic 100).
  assert.equal(applyAdjustments(95, [{ kind: "boost", dimension: null, value: 5, reason: "" }]), 97);
  // A cap pulls the score down regardless of strength elsewhere.
  assert.equal(applyAdjustments(95, [{ kind: "cap", dimension: "license_state", value: 38, reason: "" }]), 38);
  // Cap wins over a boost.
  assert.equal(
    applyAdjustments(90, [
      { kind: "boost", dimension: null, value: 5, reason: "" },
      { kind: "cap", dimension: "seniority", value: 58, reason: "" },
    ]),
    58,
  );
});

/* ── corporate-function adjacency symmetry (source note: asserted in the harness) ── */

test("CORPORATE_FUNCTION_ADJACENCY is symmetric (A lists B => B lists A)", () => {
  const slugs = Object.keys(CORPORATE_FUNCTION_ADJACENCY) as CorporateFunctionSlug[];
  for (const a of slugs) {
    for (const b of CORPORATE_FUNCTION_ADJACENCY[a]) {
      assert.ok(
        CORPORATE_FUNCTION_ADJACENCY[b]?.includes(a),
        `${a} lists ${b} but ${b} does not list ${a}`,
      );
    }
  }
});
