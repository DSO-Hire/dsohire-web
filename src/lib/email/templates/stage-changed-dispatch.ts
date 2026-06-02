/**
 * dispatchStageChangedEmail() — shared helper for the
 * `candidate.stage_changed` template. Looks up candidate + auth email,
 * builds the fallback React component, and routes through
 * dispatchCandidateEmail (which respects the DSO's custom template when
 * one exists on Growth+).
 *
 * Called fire-and-forget from `moveApplicationStage` (single move via
 * detail surface / kanban DnD) and `moveOne` inside the bulk-actions
 * loop. Must NEVER throw — every code path swallows errors and logs.
 *
 * Suppression: the caller should skip calling this entirely when
 * `jobs.hide_stages_from_candidate=true` (already gated at the call site
 * for the inbox system message). The dispatcher also no-ops when the
 * candidate has turned the `candidate.stage_changed` preference off.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { dispatchCandidateEmail } from "./dispatch";
import { resolveCandidateReplyTo } from "@/lib/email/candidate-reply-to";
import { StageChanged } from "@/emails/StageChanged";
import { greetingFirstName } from "@/lib/candidate/name";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

export interface StageChangedDispatchInput {
  applicationId: string;
  candidateId: string;
  jobId: string;
  jobTitle: string;
  dsoId: string;
  /** Pre-resolved human-readable stage labels (e.g. "New", "Interview"). */
  fromStageLabel: string;
  toStageLabel: string;
}

/**
 * Look up candidate + auth email, build the StageChanged email, and fire
 * it via dispatchCandidateEmail. Returns void; all failure paths log and
 * swallow. The caller treats this strictly as fire-and-forget.
 */
export async function dispatchStageChangedEmail(
  input: StageChangedDispatchInput
): Promise<void> {
  try {
    const admin = createSupabaseServiceRoleClient();

    // Pull candidate row — name parts + auth user id.
    const { data: cand, error: candErr } = await admin
      .from("candidates")
      .select("first_name, full_name, auth_user_id")
      .eq("id", input.candidateId)
      .maybeSingle();

    if (candErr || !cand) {
      console.warn(
        "[dispatchStageChangedEmail] candidate lookup failed",
        { candidateId: input.candidateId, error: candErr }
      );
      return;
    }

    const authUserId = (cand as { auth_user_id: string | null }).auth_user_id;
    if (!authUserId) {
      // Guest applications never get stage-change emails — no auth record.
      return;
    }

    // Resolve recipient email from auth.users via the admin API.
    const { data: authUserResp, error: authErr } =
      await admin.auth.admin.getUserById(authUserId);
    if (authErr || !authUserResp?.user?.email) {
      console.warn(
        "[dispatchStageChangedEmail] auth user lookup failed",
        { authUserId, error: authErr }
      );
      return;
    }
    const recipientEmail = authUserResp.user.email;

    const firstName = greetingFirstName({
      first_name: (cand as { first_name: string | null }).first_name,
      full_name: (cand as { full_name: string | null }).full_name,
    });
    const fullName =
      (cand as { full_name: string | null }).full_name ?? firstName;

    const jobUrl = `${SITE_URL}/jobs/${input.jobId}`;
    const applicationUrl = `${SITE_URL}/candidate/applications/${input.applicationId}`;

    // Pull DSO name for the fallback React component. The custom-template
    // path inside dispatchCandidateEmail pulls its own dso row; we just
    // need a label here for the system-default fallback.
    const { data: dsoRow } = await admin
      .from("dsos")
      .select("name")
      .eq("id", input.dsoId)
      .maybeSingle();
    const dsoName =
      (dsoRow?.name as string | undefined) ?? "the hiring team";

    const fallbackSubject = `Update on your application for ${input.jobTitle}`;
    const replyTo = await resolveCandidateReplyTo(input.dsoId);

    await dispatchCandidateEmail({
      kind: "candidate.stage_changed",
      dsoId: input.dsoId,
      recipientUserId: authUserId,
      recipientEmail,
      replyTo,
      candidate: {
        first_name: firstName,
        full_name: fullName,
        email: recipientEmail,
      },
      job: {
        title: input.jobTitle,
        url: jobUrl,
      },
      extraContext: {
        stage: {
          from_label: input.fromStageLabel,
          to_label: input.toStageLabel,
        },
      },
      relatedDsoId: input.dsoId,
      relatedCandidateId: input.candidateId,
      fallback: {
        subject: fallbackSubject,
        react: StageChanged({
          recipientName: firstName,
          jobTitle: input.jobTitle,
          dsoName,
          fromStageLabel: input.fromStageLabel,
          toStageLabel: input.toStageLabel,
          applicationUrl,
        }),
      },
    });
  } catch (err) {
    console.error("[dispatchStageChangedEmail] unexpected error", err);
  }
}
