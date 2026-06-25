/**
 * Consent-based candidate privacy (Option 3) — first-run visibility choice map.
 *
 * Guards the invariants the privacy model depends on: exactly one choice is
 * private, anonymous is discoverable-but-masked, and the discoverable choices
 * never silently boost the candidate to 'open_to_work'.
 *
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  VISIBILITY_CHOICE_MAP,
  mapVisibilityChoice,
  type VisibilityChoice,
} from "@/lib/candidate/visibility-choice";

test("only 'private' yields a hidden (non-discoverable) row", () => {
  const hidden = (
    Object.entries(VISIBILITY_CHOICE_MAP) as Array<
      [VisibilityChoice, { cv_visibility: string }]
    >
  )
    .filter(([, v]) => v.cv_visibility === "hidden")
    .map(([k]) => k);
  assert.deepEqual(hidden, ["private"]);
});

test("'discoverable' is findable with name, not anonymous, not boosted", () => {
  assert.deepEqual(mapVisibilityChoice("discoverable"), {
    cv_visibility: "recruiters_only",
    anonymous_mode: false,
  });
});

test("'anonymous' is discoverable but masked", () => {
  assert.deepEqual(mapVisibilityChoice("anonymous"), {
    cv_visibility: "recruiters_only",
    anonymous_mode: true,
  });
});

test("no choice ever maps to 'open_to_work' (that's a later explicit upgrade)", () => {
  for (const v of Object.values(VISIBILITY_CHOICE_MAP)) {
    assert.notEqual(v.cv_visibility, "open_to_work");
  }
});

test("unknown choices are rejected (null), not silently discoverable", () => {
  assert.equal(mapVisibilityChoice("open_to_work"), null);
  assert.equal(mapVisibilityChoice(""), null);
  assert.equal(mapVisibilityChoice("DISCOVERABLE"), null);
});
