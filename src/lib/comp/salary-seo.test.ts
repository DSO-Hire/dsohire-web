import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalRoleSlug,
  isDuplicateRole,
  metroPrincipalStateSlug,
  stateSalaryInSitemap,
} from "./salary-seo";

test("practice administrators canonicalize to office managers", () => {
  assert.equal(canonicalRoleSlug("practice-administrators"), "office-managers");
  assert.equal(canonicalRoleSlug("hygienists"), "hygienists");
  assert.equal(isDuplicateRole("practice-administrators"), true);
  assert.equal(isDuplicateRole("office-managers"), false);
});

test("cross-state metros resolve to the first listed state", () => {
  assert.equal(metroPrincipalStateSlug("New York-Newark-Jersey City, NY-NJ"), "new-york");
  assert.equal(metroPrincipalStateSlug("Kansas City, MO-KS"), "missouri");
  assert.equal(metroPrincipalStateSlug("Austin-Round Rock-San Marcos, TX"), "texas");
  assert.equal(metroPrincipalStateSlug("No suffix here"), null);
});

test("sitemap keeps state pages that have their own data", () => {
  assert.equal(stateSalaryInSitemap({ slug: "hygienists", soc: "29-1292" }, "TX"), true);
  assert.equal(stateSalaryInSitemap({ slug: "practice-administrators", soc: "11-9111" }, "TX"), false);
});
