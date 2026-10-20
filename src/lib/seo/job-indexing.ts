/**
 * Job lifecycle -> search engines. When a job is published, edited, paused,
 * closed, expired, deleted, or flipped internal/confidential, tell Google
 * (Indexing API, see ./google-indexing.ts) and the IndexNow network (Bing
 * and friends, see ./indexnow.ts) about /jobs/[id].
 *
 * Call scheduleJobIndexingSync(jobId) from a server action AFTER the write
 * lands. It registers the work with next/server after(), so the employer's
 * action never waits on Google, and it re-reads the job with the service
 * role so the decision is based on the committed row, not on what the
 * action thinks it wrote.
 *
 * Decision (decideJobNotification):
 *   - job is indexable          -> URL_UPDATED
 *   - job is NOT indexable      -> URL_DELETED, but only if the URL was live
 *     before: either the caller says so (wasLive) or Google's metadata shows
 *     an update newer than any removal. Drafts that were never public cost
 *     no quota.
 *
 * Indexable (isJobIndexable) mirrors the JobPosting JSON-LD on /jobs/[id]
 * (status active, not deleted, visibility public) and adds the same hard
 * exclusions the distribution RPC uses (not confidential, DSO active and not
 * demo, not past expires_at). Keep this in sync with the page.
 */

import { after } from "next/server";
import { DEMO_DSO_SLUGS, SITE_URL } from "@/lib/distribution/public-jobs";
import {
  getGoogleUrlMetadata,
  isGoogleIndexingEnabled,
  notifyGoogleJobUrl,
  type GoogleNotificationType,
  type GoogleUrlMetadata,
} from "@/lib/seo/google-indexing";
import { isIndexNowEnabled, submitIndexNow } from "@/lib/seo/indexnow";

/** Columns needed to decide indexability. */
export const JOB_INDEXING_SELECT =
  "id, status, deleted_at, visibility, confidential, expires_at, dso:dsos!jobs_dso_id_fkey(status, deleted_at, is_demo, slug)";

export interface JobIndexingRow {
  id: string;
  status: string;
  deleted_at: string | null;
  visibility: string;
  confidential: boolean;
  expires_at: string | null;
  dso: {
    status: string;
    deleted_at: string | null;
    is_demo: boolean;
    slug: string;
  } | null;
}

export function jobPublicUrl(jobId: string): string {
  return `${SITE_URL}/jobs/${jobId}`;
}

/** Should this job be live in Google for Jobs right now? Pure. */
export function isJobIndexable(job: JobIndexingRow, now: Date = new Date()): boolean {
  if (job.status !== "active") return false;
  if (job.deleted_at) return false;
  if (job.visibility !== "public") return false;
  if (job.confidential) return false;
  if (job.expires_at && new Date(job.expires_at).getTime() <= now.getTime()) return false;
  const dso = job.dso;
  if (!dso) return false;
  if (dso.status !== "active" || dso.deleted_at || dso.is_demo) return false;
  if (DEMO_DSO_SLUGS.has(dso.slug)) return false;
  return true;
}

/**
 * Was the URL's latest Google notification an update (i.e. Google currently
 * thinks it is live)? Pure.
 */
export function googleThinksLive(meta: GoogleUrlMetadata): boolean {
  if (!meta.latestUpdateAt) return false;
  if (!meta.latestRemoveAt) return true;
  return new Date(meta.latestUpdateAt).getTime() > new Date(meta.latestRemoveAt).getTime();
}

/**
 * Pure decision; null means send nothing.
 *
 * liveSince (cron only): when set and Google's metadata already shows an
 * update at or after that instant with no later removal, the job is already
 * current in Google and URL_UPDATED is skipped.
 */
export function decideJobNotification(input: {
  indexable: boolean;
  wasLive?: boolean;
  metadata: GoogleUrlMetadata | null;
  liveSince?: string | null;
}): GoogleNotificationType | null {
  const { indexable, wasLive, metadata, liveSince } = input;
  if (indexable) {
    if (
      liveSince &&
      metadata?.latestUpdateAt &&
      googleThinksLive(metadata) &&
      new Date(metadata.latestUpdateAt).getTime() >= new Date(liveSince).getTime()
    ) {
      return null;
    }
    return "URL_UPDATED";
  }
  if (wasLive) return "URL_DELETED";
  if (metadata && googleThinksLive(metadata)) return "URL_DELETED";
  return null;
}

export interface JobIndexingOptions {
  /** The caller knows the job was publicly live before this change. */
  wasLive?: boolean;
  /**
   * Cron backstop: skip URL_UPDATED when Google already has an update at or
   * after this instant (costs one metadata read instead of a publish).
   */
  liveSince?: string | null;
}

/**
 * Decide + send for an already-loaded row (null = row is gone). Never
 * throws. Returns the notification type sent, or null.
 */
export async function notifyForJobRow(
  jobId: string,
  row: JobIndexingRow | null,
  opts: JobIndexingOptions = {},
): Promise<GoogleNotificationType | null> {
  try {
    const url = jobPublicUrl(jobId);
    const indexable = row ? isJobIndexable(row) : false;
    const needMetadata = indexable ? Boolean(opts.liveSince) : !opts.wasLive;
    const metadata =
      needMetadata && isGoogleIndexingEnabled() ? await getGoogleUrlMetadata(url) : null;
    const type = decideJobNotification({
      indexable,
      wasLive: opts.wasLive,
      metadata,
      liveSince: opts.liveSince,
    });
    if (!type) return null;

    await Promise.all([
      notifyGoogleJobUrl(url, type),
      submitIndexNow([url]).then((r) => {
        if (!r.ok && !r.skipped) console.error(`[job-indexing] IndexNow failed for ${url}: ${r.error}`);
      }),
    ]);
    return type;
  } catch (e) {
    console.error(`[job-indexing] notify failed for ${jobId}: ${(e as Error)?.message ?? String(e)}`);
    return null;
  }
}

/**
 * Re-read the job and notify Google + IndexNow. Never throws. Server
 * actions should use scheduleJobIndexingSync() instead of awaiting this.
 */
export async function syncJobIndexing(
  jobId: string,
  opts: JobIndexingOptions = {},
): Promise<GoogleNotificationType | null> {
  try {
    if (!isGoogleIndexingEnabled() && !isIndexNowEnabled()) return null;

    // Lazy: the server client pulls next/headers transitively.
    const { createSupabaseServiceRoleClient } = await import("@/lib/supabase/server");
    const admin = createSupabaseServiceRoleClient();
    const { data, error } = await admin
      .from("jobs")
      .select(JOB_INDEXING_SELECT)
      .eq("id", jobId)
      .maybeSingle();
    if (error) {
      console.error(`[job-indexing] load failed for ${jobId}: ${error.message}`);
      return null;
    }
    // A missing row is treated as not indexable.
    return await notifyForJobRow(jobId, (data as unknown as JobIndexingRow | null) ?? null, opts);
  } catch (e) {
    console.error(`[job-indexing] sync failed for ${jobId}: ${(e as Error)?.message ?? String(e)}`);
    return null;
  }
}

/**
 * Fire-and-forget hook for server actions and route handlers. Safe to call
 * before redirect() (after() callbacks still run when redirect throws).
 */
export function scheduleJobIndexingSync(jobId: string, opts: JobIndexingOptions = {}): void {
  try {
    after(() => syncJobIndexing(jobId, opts));
  } catch (e) {
    // after() throws outside a request scope; never let that break an action.
    console.error(`[job-indexing] could not schedule sync for ${jobId}: ${(e as Error)?.message ?? String(e)}`);
  }
}
