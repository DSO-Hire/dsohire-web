/**
 * Block-list fail-safe guards (foundations harness §2.6).
 *
 * Covers the PURE early-return guards only — the part that runs before any
 * Supabase call. We pass a stub client that THROWS on any access, proving the
 * guard short-circuits before touching the DB:
 *   - isBlocked: a missing dso/candidate id => treat as blocked (true), never send.
 *   - getBlockedCandidateIdsForDso: a missing dso id => empty set.
 *
 * Full DB-level enforcement of candidate_blocked_employers (the live gap where
 * the table was enforced nowhere) is an INTEGRATION test — paired with the
 * prospect-thread RLS tightening — and is out of scope for this unit net (no
 * Supabase mocking, per the harness rule).
 *
 * Run: npm test  (or: npm run test:sourcing-blocklist)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { isBlocked, getBlockedCandidateIdsForDso } from "@/lib/sourcing/blocklist";

// A client that explodes if any property/method is reached — proves the
// fail-safe guard returns before any DB access.
const explodingClient = new Proxy(
  {},
  {
    get() {
      throw new Error("DB must not be touched on the fail-safe guard path");
    },
  },
) as never;

test("isBlocked fail-safe: a missing dso or candidate id returns true with no DB hit", async () => {
  assert.equal(await isBlocked(explodingClient, "", "cand-1"), true);
  assert.equal(await isBlocked(explodingClient, "dso-1", ""), true);
  assert.equal(await isBlocked(explodingClient, "", ""), true);
});

test("getBlockedCandidateIdsForDso: a missing dso id returns an empty set with no DB hit", async () => {
  const out = await getBlockedCandidateIdsForDso(explodingClient, "");
  assert.ok(out instanceof Set);
  assert.equal(out.size, 0);
});
