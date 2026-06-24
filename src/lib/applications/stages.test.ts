/**
 * Pipeline stage integrity (foundations harness §2.5).
 *
 * Pure constants/helpers — guards that the StageKind set, its labels, and the
 * kanban/terminal partition can't silently drift (a missing label or a kind
 * that's neither kanban nor terminal would break the board + candidate views).
 *
 * Run: npm test  (or: npm run test:stages)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  STAGE_KINDS,
  KANBAN_KINDS,
  TERMINAL_KINDS,
  isTerminalKind,
  KIND_DEFAULT_LABELS,
  CANDIDATE_KIND_LABELS,
  type StageKind,
} from "@/lib/applications/stages";

test("isTerminalKind: rejected + withdrawn are terminal, active kinds are not", () => {
  assert.equal(isTerminalKind("rejected"), true);
  assert.equal(isTerminalKind("withdrawn"), true);
  for (const k of ["open", "screen", "interview", "offer", "hired"] as StageKind[]) {
    assert.equal(isTerminalKind(k), false, `${k} should not be terminal`);
  }
});

test("KIND_DEFAULT_LABELS + CANDIDATE_KIND_LABELS cover every StageKind exactly", () => {
  for (const k of STAGE_KINDS) {
    assert.ok(KIND_DEFAULT_LABELS[k], `default label missing for ${k}`);
    assert.ok(CANDIDATE_KIND_LABELS[k], `candidate label missing for ${k}`);
  }
  assert.equal(Object.keys(KIND_DEFAULT_LABELS).length, STAGE_KINDS.length);
  assert.equal(Object.keys(CANDIDATE_KIND_LABELS).length, STAGE_KINDS.length);
});

test("KANBAN_KINDS + TERMINAL_KINDS partition STAGE_KINDS (no overlap, full cover)", () => {
  const kanban = new Set<StageKind>(KANBAN_KINDS);
  const terminal = new Set<StageKind>(TERMINAL_KINDS);

  for (const k of kanban) {
    assert.ok(!terminal.has(k), `${k} cannot be both kanban and terminal`);
  }
  assert.equal(kanban.size + terminal.size, STAGE_KINDS.length);
  for (const k of STAGE_KINDS) {
    assert.ok(kanban.has(k) || terminal.has(k), `${k} is neither kanban nor terminal`);
  }
  assert.deepEqual([...terminal].sort(), ["rejected", "withdrawn"]);
});
