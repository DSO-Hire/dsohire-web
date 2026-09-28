import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeForLabel, forKey } from "./demo";

test("sanitizeForLabel: keeps names, normalizes separators", () => {
  assert.equal(sanitizeForLabel("Bridgeway+Dental"), "Bridgeway Dental");
  assert.equal(sanitizeForLabel("  Smile_Partners   DSO "), "Smile Partners DSO");
  assert.equal(sanitizeForLabel("O'Neil & Sons, P.C."), "O'Neil & Sons, P.C.");
});

test("sanitizeForLabel: strips markup and junk, rejects empties", () => {
  assert.equal(sanitizeForLabel("<script>alert(1)</script>"), "scriptalert1script");
  assert.equal(sanitizeForLabel("<>{}"), null);
  assert.equal(sanitizeForLabel(""), null);
  assert.equal(sanitizeForLabel(null), null);
  assert.equal(sanitizeForLabel("x".repeat(90))?.length, 60);
});

test("forKey: case and punctuation insensitive", () => {
  assert.equal(forKey("Bridgeway Dental"), "bridgeway-dental");
  assert.equal(forKey("bridgeway-dental"), "bridgeway-dental");
  assert.equal(forKey("  Bridgeway, Dental! "), "bridgeway-dental");
});
