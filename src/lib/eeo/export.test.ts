import { test } from "node:test";
import assert from "node:assert/strict";
import {
  eeoExportLabel,
  adverseImpactTable,
  EEO_DECLINED_LABEL,
  EEO_NOT_PROVIDED_LABEL,
  EEO_SMALL_CELL_THRESHOLD,
} from "./export";

// ── Voluntariness semantics (spec §1) ────────────────────────────────

test("explicit decline exports as 'Declined', never blank", () => {
  assert.equal(eeoExportLabel("gender", "decline"), EEO_DECLINED_LABEL);
  assert.equal(eeoExportLabel("race_ethnicity", "decline"), EEO_DECLINED_LABEL);
  assert.equal(eeoExportLabel("veteran_status", "decline"), EEO_DECLINED_LABEL);
  assert.equal(
    eeoExportLabel("disability_status", "decline"),
    EEO_DECLINED_LABEL
  );
});

test("missing answers export as 'Not provided' — distinct from Declined", () => {
  assert.equal(eeoExportLabel("gender", null), EEO_NOT_PROVIDED_LABEL);
  assert.equal(eeoExportLabel("gender", undefined), EEO_NOT_PROVIDED_LABEL);
  assert.equal(eeoExportLabel("gender", ""), EEO_NOT_PROVIDED_LABEL);
  assert.notEqual(EEO_NOT_PROVIDED_LABEL, EEO_DECLINED_LABEL);
});

test("known slugs map to their option labels; unknown slugs pass through", () => {
  assert.equal(eeoExportLabel("race_ethnicity", "asian"), "Asian");
  assert.equal(
    eeoExportLabel("veteran_status", "not_protected_veteran"),
    "I am not a protected veteran"
  );
  assert.equal(eeoExportLabel("gender", "mystery_slug"), "mystery_slug");
});

// ── Small-cell suppression (spec §4) ─────────────────────────────────

test("groups under the threshold are suppressed; larger groups compute rates", () => {
  const applicants = [
    // 6 female applicants, 3 hired → visible, rate 0.5
    ...Array.from({ length: 6 }, (_, i) => ({
      value: "female",
      hired: i < 3,
    })),
    // 2 male applicants → suppressed (below threshold of 5)
    { value: "male", hired: true },
    { value: "male", hired: false },
  ];
  const rows = adverseImpactTable("gender", applicants);

  const female = rows.find((r) => r.group === "Female");
  assert.ok(female);
  assert.equal(female.suppressed, false);
  assert.equal(female.applicants, 6);
  assert.equal(female.hired, 3);
  assert.equal(female.selectionRate, 0.5);

  const male = rows.find((r) => r.group === "Male");
  assert.ok(male, "suppressed group still appears as a row");
  assert.equal(male.suppressed, true);
  assert.equal(male.applicants, null);
  assert.equal(male.hired, null);
  assert.equal(male.selectionRate, null);

  assert.ok(EEO_SMALL_CELL_THRESHOLD >= 5, "threshold honors the migration's <5 rule");
});

test("Declined and Not provided count as their own groups (denominator context)", () => {
  const applicants = [
    ...Array.from({ length: 5 }, () => ({ value: "decline", hired: false })),
    ...Array.from({ length: 5 }, () => ({ value: null, hired: false })),
  ];
  const rows = adverseImpactTable("race_ethnicity", applicants);
  assert.deepEqual(
    rows.map((r) => r.group),
    [EEO_DECLINED_LABEL, EEO_NOT_PROVIDED_LABEL]
  );
  assert.ok(rows.every((r) => !r.suppressed && r.applicants === 5));
});
