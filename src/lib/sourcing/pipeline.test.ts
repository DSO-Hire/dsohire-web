/**
 * Prospect pipeline stage integrity (foundations harness §2.6).
 *
 * Pure constants/guards for the sourcing kanban-lite board: stage validation,
 * label coverage, and the on-board stage set (archived is off-board).
 *
 * Run: npm test  (or: npm run test:sourcing-pipeline)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PROSPECT_STAGE_LABELS,
  PROSPECT_BOARD_STAGES,
  isValidProspectStage,
  type ProspectStage,
} from "@/lib/sourcing/pipeline";

const ALL_STAGES: ProspectStage[] = [
  "sourced",
  "contacted",
  "responded",
  "nurturing",
  "converted",
  "archived",
];

test("isValidProspectStage accepts every real stage and rejects junk", () => {
  for (const s of ALL_STAGES) {
    assert.ok(isValidProspectStage(s), `${s} should be valid`);
  }
  for (const j of ["", "SOURCED", "won", "lead", "deleted"]) {
    assert.equal(isValidProspectStage(j), false, `${j} should be invalid`);
  }
});

test("PROSPECT_STAGE_LABELS covers every stage exactly", () => {
  for (const s of ALL_STAGES) {
    assert.ok(PROSPECT_STAGE_LABELS[s], `label missing for ${s}`);
  }
  assert.equal(Object.keys(PROSPECT_STAGE_LABELS).length, ALL_STAGES.length);
});

test("board stages are the five active ones (archived is off-board)", () => {
  assert.deepEqual(PROSPECT_BOARD_STAGES, [
    "sourced",
    "contacted",
    "responded",
    "nurturing",
    "converted",
  ]);
  assert.ok(!PROSPECT_BOARD_STAGES.includes("archived"));
});
