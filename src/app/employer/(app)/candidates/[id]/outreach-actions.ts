"use server";

/**
 * Talent-pool outreach send — Sourcing CRM Phase 2.
 *
 * CHANGED: outreach no longer sends a one-shot email with reply-to = the
 * recruiter's inbox (which leaked the candidate's email off-platform and broke
 * anonymity). It now delegates to sendProspectMessage, which:
 *   - opens / appends the on-platform prospect thread,
 *   - masks the candidate (no real name written into the DSO-visible body),
 *   - sends the email nudge with NO reply-to (platform no-reply); replies come
 *     back in-app, never to the recruiter,
 *   - enforces the block list.
 *
 * This wrapper keeps the existing modal contract (FormData in) plus the founder
 * audit row + template usage stats.
 */

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/audit/record";
import { sendProspectMessage } from "@/app/employer/(app)/talent-pool/prospect-actions";

export interface SendOutreachResult {
  ok: boolean;
  error?: string;
  messageId?: string;
}

export async function sendOutreachToCandidate(
  formData: FormData,
): Promise<SendOutreachResult> {
  const candidateId = String(formData.get("candidate_id") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 200);
  const body = String(formData.get("body") ?? "").trim();
  const templateId = String(formData.get("template_id") ?? "").trim() || null;

  if (!candidateId) return { ok: false, error: "Missing candidate." };
  if (!body) return { ok: false, error: "Message body is required." };
  if (body.length > 8000) {
    return { ok: false, error: "Message is too long (max 8000 characters)." };
  }

  // Delegate to the privacy-safe thread path (auth, role, block, masking, and
  // the no-reply nudge are all enforced inside).
  const result = await sendProspectMessage({ candidateId, subject, body });
  if (!result.ok) return { ok: false, error: result.error };

  // Best-effort continuity: founder audit + template usage stats.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: dsoUser } = await supabase
      .from("dso_users")
      .select("id, dso_id, full_name, role")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (dsoUser) {
      await recordAuditEvent({
        dsoId: dsoUser.dso_id as string,
        actorUserId: user.id,
        actorDsoUserId: dsoUser.id as string,
        actorName: (dsoUser.full_name as string | null) ?? null,
        actorRole: (dsoUser.role as string | null) ?? null,
        eventKind: "talent_pool.outreach_sent",
        targetTable: "candidates",
        targetId: candidateId,
        summary: `Messaged a prospect (in-app thread)`,
        metadata: { candidate_id: candidateId, thread_id: result.threadId },
      });

      if (templateId) {
        const admin = createSupabaseServiceRoleClient();
        const { data: prior } = await admin
          .from("dso_outreach_templates")
          .select("usage_count")
          .eq("id", templateId)
          .eq("dso_id", dsoUser.dso_id as string)
          .maybeSingle();
        const nextCount = ((prior?.usage_count as number | undefined) ?? 0) + 1;
        await admin
          .from("dso_outreach_templates")
          .update({ usage_count: nextCount, last_used_at: new Date().toISOString() })
          .eq("id", templateId)
          .eq("dso_id", dsoUser.dso_id as string);
      }
    }
  }

  revalidatePath(`/employer/candidates/${candidateId}`);
  return { ok: true, messageId: result.threadId };
}
