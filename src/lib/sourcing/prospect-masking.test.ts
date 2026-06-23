/**
 * Sourcing CRM privacy smoke tests.
 *
 * Phase 2 invariant: when a candidate is masked, the DSO-visible message body
 * contains NO real name and NO stray merge token. The send action applies
 * stripCandidateNameTokens (masked) then resolveMergeFields with the candidate
 * name nulled; this asserts that composition.
 *
 * Run: npm run test:sourcing
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMergeFields } from "@/lib/outreach/merge-fields";
import { stripCandidateNameTokens } from "@/lib/sourcing/merge-masking";

const TEMPLATE =
  "Hi {{candidate.first_name}}, we'd love to chat — {{sender.full_name}} at {{dso.name}}.";

test("masked: no real name, no stray token, DSO identity still shown", () => {
  // Mirrors the action's masked path.
  const safe = stripCandidateNameTokens(TEMPLATE);
  const out = resolveMergeFields(safe, {
    candidate: { first_name: null, full_name: null },
    sender: { full_name: "Dr. Cam" },
    dso: { name: "Bridgeway Dental" },
  });
  assert.doesNotMatch(out, /Jane/, "no real candidate name");
  assert.ok(!out.includes("{{"), "no stray merge tokens");
  assert.match(out, /Hi there,/, "neutral greeting");
  assert.match(out, /Dr\. Cam/, "sender identity ok to show");
  assert.match(out, /Bridgeway Dental/, "DSO identity ok to show");
});

test("unmasked: real name resolves (applied/revealed path)", () => {
  const out = resolveMergeFields(TEMPLATE, {
    candidate: { first_name: "Jane", full_name: "Jane Doe" },
    sender: { full_name: "Dr. Cam" },
    dso: { name: "Bridgeway Dental" },
  });
  assert.match(out, /Hi Jane,/);
});

test("stripCandidateNameTokens leaves non-candidate tokens intact", () => {
  const out = stripCandidateNameTokens(
    "{{candidate.full_name}} / {{dso.name}} / {{sender.name}}",
  );
  assert.ok(!out.includes("candidate."), "candidate tokens removed");
  assert.match(out, /\{\{\s*dso\.name\s*\}\}/);
  assert.match(out, /\{\{\s*sender\.name\s*\}\}/);
});
