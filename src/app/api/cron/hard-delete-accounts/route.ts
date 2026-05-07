/**
 * /api/cron/hard-delete-accounts — daily sweep (Phase 4.5.g).
 *
 * Scheduled in vercel.json. Hits this route once a day at 09:00 UTC
 * (≈3am US Central). Vercel adds an `Authorization: Bearer ${CRON_SECRET}`
 * header to all cron requests; we reject anything without it.
 *
 * For each candidate WHERE deleted_at < now() - 30 days:
 *   1. Delete storage files (avatar, resume, ce_certificates/<user>/*)
 *   2. Delete candidate row (FK CASCADE drops every child)
 *   3. Delete auth.users row if this user has no other DSO membership
 *
 * For each DSO WHERE deleted_at < now() - 30 days:
 *   1. Cancel Stripe subscription IMMEDIATELY (vs cancel-at-period-end)
 *   2. Delete storage files (dso-logos, location-logos, dso-photos)
 *   3. Delete dso row (cascades to jobs, applications, locations,
 *      photos, dso_users, etc.)
 *   4. For each ex-team-member: if their auth.uid() has no remaining
 *      candidates row AND no remaining dso_users row, delete the auth
 *      account via admin.
 *
 * Idempotent: if a sweep is interrupted mid-DSO, the next run re-finds
 * the same row (deleted_at still set) and retries. The Stripe call is
 * the one non-idempotent step; subscription.cancel() on an already-
 * canceled sub is a no-op error we swallow.
 *
 * Errors per row are logged + skipped — we never let one bad row break
 * the whole sweep.
 */

import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SweepReport {
  candidates_swept: number;
  candidates_failed: number;
  dsos_swept: number;
  dsos_failed: number;
  errors: string[];
}

export async function GET(request: Request) {
  // Vercel cron auth: header pattern. Reject anything without the secret.
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseServiceRoleClient();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const report: SweepReport = {
    candidates_swept: 0,
    candidates_failed: 0,
    dsos_swept: 0,
    dsos_failed: 0,
    errors: [],
  };

  // ── Candidates ──
  const { data: candidatesToDelete, error: candidatesQueryError } = await admin
    .from("candidates")
    .select("id, auth_user_id, avatar_url, resume_url")
    .lt("deleted_at", cutoff)
    .not("deleted_at", "is", null);

  if (candidatesQueryError) {
    report.errors.push(`candidates query: ${candidatesQueryError.message}`);
  }

  for (const c of (candidatesToDelete ?? []) as Array<Record<string, unknown>>) {
    try {
      const candidateId = c.id as string;
      const authUserId = c.auth_user_id as string;

      // 1. Storage cleanup. Each candidate's files live under
      //    <auth_user_id>/* in their respective buckets.
      await purgeCandidateStorage(admin, authUserId);

      // 2. Delete the candidates row — FK CASCADE drops every child.
      const { error: delError } = await admin
        .from("candidates")
        .delete()
        .eq("id", candidateId);
      if (delError) throw new Error(`candidate row: ${delError.message}`);

      // 3. Delete the auth.users row if this user has no remaining
      //    DSO membership (don't nuke an auth account that's also the
      //    owner of an active DSO).
      const { count: dsoMembershipCount } = await admin
        .from("dso_users")
        .select("id", { count: "exact", head: true })
        .eq("auth_user_id", authUserId);
      if ((dsoMembershipCount ?? 0) === 0) {
        await admin.auth.admin.deleteUser(authUserId).catch((err) => {
          report.errors.push(
            `auth.users delete for ${authUserId}: ${err?.message ?? String(err)}`
          );
        });
      }

      report.candidates_swept += 1;
    } catch (err) {
      report.candidates_failed += 1;
      report.errors.push(
        `candidate ${c.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // ── DSOs ──
  const { data: dsosToDelete, error: dsosQueryError } = await admin
    .from("dsos")
    .select("id, name, logo_url, stripe_customer_id")
    .lt("deleted_at", cutoff)
    .not("deleted_at", "is", null);

  if (dsosQueryError) {
    report.errors.push(`dsos query: ${dsosQueryError.message}`);
  }

  for (const d of (dsosToDelete ?? []) as Array<Record<string, unknown>>) {
    try {
      const dsoId = d.id as string;

      // 1. Cancel Stripe subscription IMMEDIATELY
      const { data: subRow } = await admin
        .from("subscriptions")
        .select("stripe_subscription_id")
        .eq("dso_id", dsoId)
        .maybeSingle();
      const subId = (subRow as Record<string, unknown> | null)
        ?.stripe_subscription_id as string | null;
      if (subId && process.env.STRIPE_SECRET_KEY) {
        try {
          const stripe = getStripe();
          await stripe.subscriptions.cancel(subId);
        } catch (err) {
          // Already canceled / expired — non-fatal.
          console.warn(
            `[cron] stripe cancel for ${subId}:`,
            err instanceof Error ? err.message : err
          );
        }
      }

      // 2. Snapshot ex-team-member auth user ids BEFORE the cascade
      //    drops the dso_users rows.
      const { data: teamRows } = await admin
        .from("dso_users")
        .select("auth_user_id")
        .eq("dso_id", dsoId);
      const exMemberIds = (teamRows ?? []).map(
        (r) => (r as Record<string, unknown>).auth_user_id as string
      );

      // 3. Storage cleanup.
      await purgeOrgStorage(admin, dsoId);

      // 4. Delete the dso row — FK CASCADE drops jobs, applications,
      //    locations, photos, team rows, etc.
      const { error: delError } = await admin
        .from("dsos")
        .delete()
        .eq("id", dsoId);
      if (delError) throw new Error(`dso row: ${delError.message}`);

      // 5. For each ex-team member, delete the auth account if they
      //    have nothing else tying them to DSO Hire.
      for (const authUserId of exMemberIds) {
        const [{ count: candidateCount }, { count: otherDsoCount }] =
          await Promise.all([
            admin
              .from("candidates")
              .select("id", { count: "exact", head: true })
              .eq("auth_user_id", authUserId),
            admin
              .from("dso_users")
              .select("id", { count: "exact", head: true })
              .eq("auth_user_id", authUserId),
          ]);
        if ((candidateCount ?? 0) === 0 && (otherDsoCount ?? 0) === 0) {
          await admin.auth.admin.deleteUser(authUserId).catch((err) => {
            report.errors.push(
              `auth.users delete for ${authUserId}: ${err?.message ?? String(err)}`
            );
          });
        }
      }

      report.dsos_swept += 1;
    } catch (err) {
      report.dsos_failed += 1;
      report.errors.push(
        `dso ${d.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return NextResponse.json(report, { status: 200 });
}

/* ──────────────────────────────────────────────────────────────
 * Storage purge helpers
 *
 * Each helper lists every file under the user/org's prefix in each
 * relevant bucket, then bulk-removes them. Safe to call on a missing
 * folder — Supabase returns an empty list, .remove([]) is a no-op.
 * ─────────────────────────────────────────────────────────── */

/**
 * Recursively list every object under a folder prefix (returns full
 * storage paths). Supabase's list() doesn't recurse on its own —
 * folders show up as entries with `metadata: null`.
 */
async function listAllUnder(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const out: string[] = [];
  const stack: string[] = [prefix];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    try {
      const { data: list } = await admin.storage
        .from(bucket)
        .list(cur, { limit: 1000 });
      for (const entry of list ?? []) {
        const path = `${cur}/${entry.name}`;
        // metadata is null for folders, populated for files.
        if (entry.metadata) {
          out.push(path);
        } else {
          stack.push(path);
        }
      }
    } catch (err) {
      console.warn(
        `[cron] list ${bucket}/${cur}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return out;
}

async function purgeCandidateStorage(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  authUserId: string
): Promise<void> {
  // Avatars + DSO/profile imagery all live in `public-images` keyed by
  // the uploader's auth_user_id. Resumes + CE certs each have their
  // own bucket, also keyed by auth_user_id.
  const buckets = ["public-images", "resumes", "ce_certificates"];
  for (const bucket of buckets) {
    try {
      const paths = await listAllUnder(admin, bucket, authUserId);
      if (paths.length > 0) {
        await admin.storage.from(bucket).remove(paths);
      }
    } catch (err) {
      console.warn(
        `[cron] storage purge ${bucket}/${authUserId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
}

async function purgeOrgStorage(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  dsoId: string
): Promise<void> {
  // Brand imagery is keyed by uploading-user's auth_user_id, not by
  // dso_id. Recover the storage paths from the URLs stored on the rows
  // we're about to drop, then bulk-remove them from `public-images`.
  // (We can't enumerate by dsoId in the storage tree directly.)
  const allUrls: string[] = [];

  try {
    const { data: dsoRow } = await admin
      .from("dsos")
      .select("logo_url, banner_url")
      .eq("id", dsoId)
      .maybeSingle();
    if (dsoRow) {
      const r = dsoRow as Record<string, unknown>;
      const logo = r.logo_url as string | null;
      const banner = r.banner_url as string | null;
      if (logo) allUrls.push(logo);
      if (banner) allUrls.push(banner);
    }

    const { data: locs } = await admin
      .from("dso_locations")
      .select("logo_url")
      .eq("dso_id", dsoId);
    for (const loc of (locs ?? []) as Array<Record<string, unknown>>) {
      const url = loc.logo_url as string | null;
      if (url) allUrls.push(url);
    }

    const { data: photos } = await admin
      .from("dso_photos")
      .select("image_url")
      .eq("dso_id", dsoId);
    for (const p of (photos ?? []) as Array<Record<string, unknown>>) {
      const url = p.image_url as string | null;
      if (url) allUrls.push(url);
    }
  } catch (err) {
    console.warn(
      `[cron] gather org URLs ${dsoId}:`,
      err instanceof Error ? err.message : err
    );
  }

  // Convert URLs to storage paths within `public-images`.
  const paths: string[] = [];
  for (const url of allUrls) {
    try {
      const u = new URL(url);
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.indexOf("public-images");
      if (idx < 0) continue;
      const path = parts.slice(idx + 1).join("/");
      if (path) paths.push(path);
    } catch {
      // Skip malformed URLs.
    }
  }

  if (paths.length > 0) {
    try {
      await admin.storage.from("public-images").remove(paths);
    } catch (err) {
      console.warn(
        `[cron] remove public-images for ${dsoId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
}
