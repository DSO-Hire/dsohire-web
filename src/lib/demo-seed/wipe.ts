/**
 * Demo-seed teardown — the reversibility guarantee.
 *
 * Two entry points, both scoped so they can ONLY touch demo-owned rows:
 *
 *   • wipeDemoSeed(supa) — deletes EXACTLY the rows stamped
 *     seed_batch='demo_v1' (dsos + candidates) and everything that hangs off
 *     them. Asserts the scope before deleting. This is what the founder-gated
 *     /admin "Reset demo data" button calls (via runDemoSeed), so a reset can
 *     never reach a real row.
 *
 *   • cleanupLegacyDemoData(supa) — the ONE-TIME purge of the pre-existing
 *     junk on this project (every old DSO is is_demo=true, so is_demo can't
 *     scope anything). Deletes all UNMARKED dsos + unmarked candidates EXCEPT a
 *     hardcoded protect-list (the founder's admin-linked + personal records).
 *     Idempotent: after the first seed there's nothing unmarked left to purge.
 *
 * Cascade map (verified against the live FK graph 2026-06-29): deleting a
 * `dsos` row cascades jobs → applications → every application child, plus
 * locations / subscriptions / stages / sourcing / automation. Deleting a
 * `candidates` row cascades its applications + candidate children + scores +
 * sourcing. The ONLY RESTRICT edges are dso_users ← application_{comments,
 * messages,scorecards}. So we delete target applications FIRST (clears those
 * refs), then dso_users, then the dsos, then the candidates. Auth users are
 * never cascade-deleted — demo logins stay stable across resets.
 */

import { SEED_BATCH, type Supa } from "./constants";

/** The founder's email — its candidate row is never purged by legacy cleanup. */
const PROTECTED_CANDIDATE_EMAIL = "cameron@eslingerdental.com";

const ID_CHUNK = 150;

/** Ids of rows in `table` stamped seed_batch='demo_v1'. */
async function demoMarkedIds(supa: Supa, table: string): Promise<string[]> {
  const { data, error } = await supa.from(table).select("id").eq("seed_batch", SEED_BATCH);
  if (error) throw new Error(`[demo-seed] select demo ids from ${table} failed: ${error.message}`);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

async function deleteIn(
  supa: Supa,
  table: string,
  column: string,
  ids: string[]
): Promise<void> {
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const slice = ids.slice(i, i + ID_CHUNK);
    const { error } = await supa.from(table).delete().in(column, slice);
    if (error) {
      throw new Error(`[demo-seed] delete from ${table} where ${column} in (...) failed: ${error.message}`);
    }
  }
}

/** Collect job ids for a set of DSO ids. */
async function jobIdsForDsos(supa: Supa, dsoIds: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < dsoIds.length; i += ID_CHUNK) {
    const slice = dsoIds.slice(i, i + ID_CHUNK);
    const { data, error } = await supa.from("jobs").select("id").in("dso_id", slice);
    if (error) throw new Error(`[demo-seed] select jobs for dsos failed: ${error.message}`);
    for (const r of (data ?? []) as { id: string }[]) out.push(r.id);
  }
  return out;
}

/**
 * Ordered delete for a set of DSO ids + candidate ids. Safe against the
 * dso_users RESTRICT edges (apps deleted first). Both id sets may be empty.
 */
async function purgeByIds(
  supa: Supa,
  dsoIds: string[],
  candidateIds: string[]
): Promise<void> {
  // 1. Applications first — clears the RESTRICT refs from app_comments /
  //    app_messages / app_scorecards onto dso_users, and cascades every other
  //    application child. Cover both the candidate side and the job side.
  if (candidateIds.length > 0) {
    await deleteIn(supa, "applications", "candidate_id", candidateIds);
  }
  if (dsoIds.length > 0) {
    const jobIds = await jobIdsForDsos(supa, dsoIds);
    await deleteIn(supa, "applications", "job_id", jobIds);
    // 2. dso_users next (no longer referenced by RESTRICT children).
    await deleteIn(supa, "dso_users", "dso_id", dsoIds);
    // 3. The DSOs — cascades jobs, locations, subscriptions, stages, sourcing,
    //    automation, prospect threads, talent pool, photos, templates…
    await deleteIn(supa, "dsos", "id", dsoIds);
  }
  // 4. The candidates — cascades remaining candidate children + scores +
  //    sourcing rows that referenced them.
  if (candidateIds.length > 0) {
    await deleteIn(supa, "candidates", "id", candidateIds);
  }
}

/**
 * Wipe EXACTLY the seed_batch='demo_v1' set. Asserts the scope (defense in
 * depth): re-counts that no unmarked row sneaks into the delete set.
 * Idempotent — a no-op when nothing is marked yet.
 */
export async function wipeDemoSeed(supa: Supa): Promise<{ dsos: number; candidates: number }> {
  const dsoIds = await demoMarkedIds(supa, "dsos");
  const candidateIds = await demoMarkedIds(supa, "candidates");

  // ── Scope assertion: every id we're about to touch MUST be demo_v1. ──
  await assertAllMarked(supa, "dsos", dsoIds);
  await assertAllMarked(supa, "candidates", candidateIds);

  // Also delete demo-batch analytics events (props.seed_batch marker) — these
  // don't hang off dsos/candidates via FK, so they need their own scoped wipe.
  await wipeDemoAnalytics(supa);

  await purgeByIds(supa, dsoIds, candidateIds);
  return { dsos: dsoIds.length, candidates: candidateIds.length };
}

/** Verify every id in the set is stamped seed_batch='demo_v1'. Throws if not. */
async function assertAllMarked(supa: Supa, table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const slice = ids.slice(i, i + ID_CHUNK);
    const { data, error } = await supa
      .from(table)
      .select("id, seed_batch")
      .in("id", slice);
    if (error) throw new Error(`[demo-seed] assert scope on ${table} failed: ${error.message}`);
    const bad = ((data ?? []) as { id: string; seed_batch: string | null }[]).filter(
      (r) => r.seed_batch !== SEED_BATCH
    );
    if (bad.length > 0) {
      throw new Error(
        `[demo-seed] SCOPE VIOLATION: ${bad.length} ${table} row(s) in the delete set are not seed_batch='${SEED_BATCH}'. Aborting.`
      );
    }
  }
}

/** Delete only the demo-marked analytics.events (via the scoped SECURITY
 *  DEFINER RPC — the analytics schema isn't exposed to PostgREST). */
async function wipeDemoAnalytics(supa: Supa): Promise<void> {
  const { error } = await supa.rpc("demo_seed_delete_events");
  if (error) {
    throw new Error(`[demo-seed] wipe analytics.events failed: ${error.message}`);
  }
  // job_view_events + application_starts hang off jobs (CASCADE), so they're
  // removed when the demo DSOs/jobs are deleted — no separate wipe needed.
}

/**
 * ONE-TIME legacy purge. Every pre-existing DSO on this project is is_demo=true
 * junk; remove them all (and their cascade) plus the old fictional test
 * candidates, EXCEPT the founder's protected records. Idempotent.
 */
export async function cleanupLegacyDemoData(
  supa: Supa
): Promise<{ dsos: number; candidates: number }> {
  // Protect: any candidate auth-linked to an admin_users row + the founder's
  // own candidate row by email.
  const { data: adminRows, error: adminErr } = await supa
    .from("admin_users")
    .select("auth_user_id");
  if (adminErr) throw new Error(`[demo-seed] read admin_users failed: ${adminErr.message}`);
  const protectedAuthIds = new Set(
    ((adminRows ?? []) as { auth_user_id: string }[]).map((r) => r.auth_user_id)
  );

  // All UNMARKED dsos (= everything that isn't already our demo_v1 set).
  const { data: dsoRows, error: dsoErr } = await supa
    .from("dsos")
    .select("id, seed_batch");
  if (dsoErr) throw new Error(`[demo-seed] read dsos failed: ${dsoErr.message}`);
  const legacyDsoIds = ((dsoRows ?? []) as { id: string; seed_batch: string | null }[])
    .filter((r) => r.seed_batch !== SEED_BATCH)
    .map((r) => r.id);

  // All UNMARKED candidates except protected ones.
  const { data: candRows, error: candErr } = await supa
    .from("candidates")
    .select("id, seed_batch, auth_user_id, email");
  if (candErr) throw new Error(`[demo-seed] read candidates failed: ${candErr.message}`);
  const legacyCandidateIds = (
    (candRows ?? []) as {
      id: string;
      seed_batch: string | null;
      auth_user_id: string | null;
      email: string | null;
    }[]
  )
    .filter((r) => r.seed_batch !== SEED_BATCH)
    .filter((r) => !(r.auth_user_id && protectedAuthIds.has(r.auth_user_id)))
    .filter((r) => (r.email ?? "").toLowerCase() !== PROTECTED_CANDIDATE_EMAIL)
    .map((r) => r.id);

  await purgeByIds(supa, legacyDsoIds, legacyCandidateIds);
  return { dsos: legacyDsoIds.length, candidates: legacyCandidateIds.length };
}
