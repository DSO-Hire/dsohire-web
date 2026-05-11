/**
 * Job-attachments helpers (E1.10 / Phase 5D).
 *
 * Shared server-side loaders for the employer edit surfaces and the
 * public job detail page. Signed-URL generation is per-attachment with
 * a 1-hour TTL — short enough that links can't be passed around long
 * after revocation, long enough that a single page render and one
 * subsequent click both work.
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { JobAttachmentRow } from "@/app/employer/jobs/[id]/job-attachments-section";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const BUCKET = "job-attachments";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

export const JOB_ATTACHMENT_TIER_CAPS: Record<string, number> = {
  starter: 2,
  growth: 20,
  enterprise: 50,
  founding: 20,
  pro: 20,
};

export function tierLabel(tier: string): string {
  if (!tier) return "Starter";
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

/**
 * Load attachments for a job. RLS handles authorization:
 *   - public callers see only non-gated attachments
 *   - applicants see all (including gated)
 *   - DSO members see all
 */
export async function loadJobAttachments(
  supabase: SupabaseClient,
  jobId: string
): Promise<JobAttachmentRow[]> {
  const { data, error } = await supabase
    .from("job_attachments")
    .select(
      "id, display_name, file_size_bytes, mime_type, sort_order, hide_until_applied, created_at"
    )
    .eq("job_id", jobId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.warn("[job-attachments] loadJobAttachments failed", error);
    return [];
  }
  return (data ?? []) as JobAttachmentRow[];
}

export interface JobAttachmentWithUrl extends JobAttachmentRow {
  signed_url: string | null;
}

/**
 * Load attachments WITH signed download URLs. Use on public + employer
 * surfaces that render the actual download buttons. RLS still applies to
 * the row read; storage RLS still applies to the signed-URL issuance.
 */
export async function loadJobAttachmentsWithUrls(
  supabase: SupabaseClient,
  jobId: string
): Promise<JobAttachmentWithUrl[]> {
  const rows = await loadJobAttachments(supabase, jobId);
  if (rows.length === 0) return [];

  const paths = rows.map((r) => `${jobId}/${r.id}.${extensionFromMime(r.mime_type)}`);
  // Bulk signed URLs in one call.
  const { data: signed, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.warn("[job-attachments] createSignedUrls failed", error);
    return rows.map((r) => ({ ...r, signed_url: null }));
  }

  // signed is parallel to paths input order.
  return rows.map((r, idx) => ({
    ...r,
    signed_url: signed?.[idx]?.signedUrl ?? null,
  }));
}

function extensionFromMime(mime: string): string {
  switch (mime) {
    case "application/pdf":
      return "pdf";
    case "application/msword":
      return "doc";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "docx";
    case "application/vnd.ms-excel":
      return "xls";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "xlsx";
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}
