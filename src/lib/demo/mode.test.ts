/**
 * Demo Mode structural prod-safety (spec risk #2): demo mode must be
 * IMPOSSIBLE to engage without the DEMO_MODE env flag, which exists only
 * on the dsohire-demo Vercel project — a prod build with prod env can
 * never enter demo mode, regardless of what a user or JWT claims.
 */

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_BLOCK_MESSAGE,
  isDemoDeployment,
  isDemoViewerUser,
  demoWriteBlockError,
} from "./mode";
import type { User } from "@supabase/supabase-js";

const originalDemoMode = process.env.DEMO_MODE;

beforeEach(() => {
  delete process.env.DEMO_MODE;
});

afterEach(() => {
  if (originalDemoMode === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = originalDemoMode;
});

function fakeUser(appMetadata: Record<string, unknown>): User {
  return { app_metadata: appMetadata } as unknown as User;
}

function fakeClient(user: User | null) {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
  } as unknown as Parameters<typeof demoWriteBlockError>[0];
}

test("prod safety: without DEMO_MODE env, demo mode never engages — even for a marked user", async () => {
  assert.equal(isDemoDeployment(), false);
  const marked = fakeUser({ demo_viewer: true });
  assert.equal(await demoWriteBlockError(fakeClient(marked)), null);
});

test("prod safety: DEMO_MODE must be exactly '1'", () => {
  process.env.DEMO_MODE = "true";
  assert.equal(isDemoDeployment(), false);
  process.env.DEMO_MODE = "";
  assert.equal(isDemoDeployment(), false);
  process.env.DEMO_MODE = "1";
  assert.equal(isDemoDeployment(), true);
});

test("demo deployment: only the marked viewer is blocked", async () => {
  process.env.DEMO_MODE = "1";
  const viewer = fakeUser({ demo_viewer: true });
  assert.equal(await demoWriteBlockError(fakeClient(viewer)), DEMO_BLOCK_MESSAGE);
  // Cam driving a live call as bridgeway.owner keeps full write access.
  const owner = fakeUser({});
  assert.equal(await demoWriteBlockError(fakeClient(owner)), null);
  // Signed-out requests are not demo-blocked (auth handles them).
  assert.equal(await demoWriteBlockError(fakeClient(null)), null);
});

test("viewer mark requires app_metadata.demo_viewer === true exactly", () => {
  assert.equal(isDemoViewerUser(fakeUser({ demo_viewer: true })), true);
  assert.equal(isDemoViewerUser(fakeUser({ demo_viewer: "true" })), false);
  assert.equal(isDemoViewerUser(fakeUser({ demo_viewer: 1 })), false);
  assert.equal(isDemoViewerUser(fakeUser({})), false);
  assert.equal(isDemoViewerUser(null), false);
});
