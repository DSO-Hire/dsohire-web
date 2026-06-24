/**
 * Team-permission capability model (foundations harness §2.4) — security-critical.
 *
 * Guards the locked role matrix and the compliance floor: an override must
 * never elevate an admin-only capability (billing / team / EEO) for a
 * recruiter or hiring manager. This is part of what protects the EEO firewall.
 *
 * Run: npm test  (or: npm run test:capabilities)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ROLE_DEFAULTS,
  ADMIN_ONLY_CAPABILITIES,
  effectivePermissions,
  parsePermissionOverrides,
  can,
  isCapability,
} from "@/lib/permissions/capabilities";

test("ROLE_DEFAULTS match the locked matrix", () => {
  // Hiring managers cannot draft offers; recruiters can.
  assert.equal(ROLE_DEFAULTS.hiring_manager["offers.draft"], false);
  assert.equal(ROLE_DEFAULTS.recruiter["offers.draft"], true);
  // Recruiters can message candidates (custom email); hiring managers cannot.
  assert.equal(ROLE_DEFAULTS.recruiter["apps.message"], true);
  assert.equal(ROLE_DEFAULTS.hiring_manager["apps.message"], false);
  // Owner has everything; EEO is off by default even for admin.
  assert.equal(ROLE_DEFAULTS.owner["eeo.view"], true);
  assert.equal(ROLE_DEFAULTS.owner["billing.manage"], true);
  assert.equal(ROLE_DEFAULTS.admin["eeo.view"], false);
});

test("ADMIN_ONLY caps are exactly team/billing/eeo and are never grantable to recruiter/HM", () => {
  assert.deepEqual(
    [...ADMIN_ONLY_CAPABILITIES].sort(),
    ["billing.manage", "eeo.view", "team.manage"],
  );
  for (const role of ["recruiter", "hiring_manager"] as const) {
    const eff = effectivePermissions(role, {
      "eeo.view": true,
      "team.manage": true,
      "billing.manage": true,
    });
    assert.equal(eff["eeo.view"], false, `${role} must not be granted eeo.view`);
    assert.equal(eff["team.manage"], false, `${role} must not be granted team.manage`);
    assert.equal(eff["billing.manage"], false, `${role} must not be granted billing.manage`);
  }
});

test("admin CAN be granted eeo.view via an explicit override (the grant path)", () => {
  const eff = effectivePermissions("admin", { "eeo.view": true });
  assert.equal(eff["eeo.view"], true);
});

test("parsePermissionOverrides ignores unknown keys and non-boolean values", () => {
  assert.deepEqual(parsePermissionOverrides(null), {});
  assert.deepEqual(parsePermissionOverrides("nope"), {});
  assert.deepEqual(
    parsePermissionOverrides({
      "jobs.edit": true,
      "jobs.delete": "yes", // non-boolean -> ignored
      bogus: true, // unknown capability -> ignored
      "comp.view": false,
    }),
    { "jobs.edit": true, "comp.view": false },
  );
});

test("effectivePermissions applies a valid override and ignores an illegal admin-only one", () => {
  const eff = effectivePermissions("recruiter", {
    "jobs.delete": true, // valid grant
    "eeo.view": true, // illegal (admin-only) for a recruiter
  });
  assert.equal(eff["jobs.delete"], true);
  assert.equal(eff["eeo.view"], false);
});

test("unknown / null role falls back to the most restrictive hiring_manager preset", () => {
  assert.deepEqual(effectivePermissions("garbage", null), ROLE_DEFAULTS.hiring_manager);
  assert.deepEqual(effectivePermissions(null, null), ROLE_DEFAULTS.hiring_manager);
});

test("can() reflects effectivePermissions", () => {
  assert.equal(can("hiring_manager", null, "offers.draft"), false);
  assert.equal(can("owner", null, "billing.manage"), true);
  assert.equal(can("recruiter", null, "apps.message"), true);
});

test("isCapability guards junk values", () => {
  assert.equal(isCapability("jobs.edit"), true);
  assert.equal(isCapability("nope"), false);
  assert.equal(isCapability(42), false);
});
