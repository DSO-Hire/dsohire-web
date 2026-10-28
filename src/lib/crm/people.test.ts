import { test } from "node:test";
import assert from "node:assert/strict";
import { alertLabelFromPath } from "./people";

test("alertLabelFromPath defaults to all roles", () => {
  assert.equal(alertLabelFromPath(null), "All roles");
  assert.equal(alertLabelFromPath("/jobs"), "All roles");
});

test("alertLabelFromPath reads the surface and filters", () => {
  assert.equal(alertLabelFromPath("/jobs?surface=corporate"), "Corporate roles");
  assert.equal(alertLabelFromPath("/jobs?role=dental-hygienist&state=TX"), "dental hygienist · TX");
});
