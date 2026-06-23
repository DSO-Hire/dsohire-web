"use server";

/**
 * Prospect outbound — the double-blind DSO → candidate message (Sourcing CRM
 * Phase 2). This REPLACES one-shot recruiter-inbox email with an on-platform
 * thread + a no-reply email nudge.
 *
 * Privacy invariants enforced here:
 *  - The candidate's identity is masked to the DSO (anonymous_mode && !applied
 *    && !revealed). When masked, candidate name merge-tokens resolve to EMPTY so
 *    no real name is ever written into the stored message body the DSO can see.
 *  - The candidate's email is looked up only via the service-role client to send
 *    the nudge; it is NEVER returned to the DSO surface.
 *  - The nudge email sets NO reply-to → defaults to platform no-reply; replies
 *    happen in-app only.
 *  - Block list is enforced (isBlocked, fail-safe). A blocked/refused thread
 *    never sends.
 */

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { isBlocked } from "@/lib/sourcing/blocklist";
import { logProspectActivity } from "@/lib/sourcing/pipeline";
import { resolveMergeFields } from "@/lib/outreach/merge-fields";
import { stripCandidateNameTokens } from "@/lib/sourcing/merge-masking";
import { getDsoAppliedCandidateIds } from "@/lib/candidate/anonymity";
import { can } from "@/lib/permissions/capabilities";
import { dsoCanUseSourcingOutbound } from "@/lib/sourcing/tier";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { ProspectInterest } from "@/emails/candidate/ProspectInterest";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

export interface ProspectMessageResult {
  ok: boolean;
  error?: string;
  threadId?: string;
}

export async function sendProspectMessage(input: {
  candidateId: string;
  subject?: string;
  body: string;
}): Promise<ProspectMessageResult> {
  const candidateId = input.candidateId?.trim();
  const subject = (input.subject ?? "").trim().slice(0, 200);
  const body = (input.body ?? "").trim();
  if (!candidateId) return { ok: false, error: "Missing candidate." };
  if (!body) return { ok: false, error: "Message body is required." };
  if (body.length > 8000) return { ok: false, error: "Message is too long." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id, full_name, role, permission_overrides")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) return { ok: false, error: "No DSO context." };
  // Capability gate (replaces the old hardcoded role array).
  if (!can(dsoUser.role as string, dsoUser.permission_overrides, "sourcing.message")) {
    return { ok: false, error: "You don't have permission to message prospects." };
  }
  const dsoId = dsoUser.dso_id as string;

  // Tier gate — manual outbound is Growth+.
  if (!(await dsoCanUseSourcingOutbound(supabase, dsoId))) {
    return {
      ok: false,
      error: "Messaging sourced candidates is a Growth feature. Upgrade to reach out.",
    };
  }

  // Candidate reachability.
  const { data: candidate } = await supabase
    .from("candidates")
    .select(
      "id, first_name, full_name, cv_visibility, is_guest, deleted_at, auth_user_id, anonymous_mode",
    )
    .eq("id", candidateId)
    .maybeSingle();
  if (!candidate) return { ok: false, error: "Candidate not found." };
  if (
    (candidate.cv_visibility as string) === "hidden" ||
    candidate.is_guest ||
    candidate.deleted_at
  ) {
    return { ok: false, error: "This candidate isn't reachable right now." };
  }

  // Block list — fail-safe (unknown → blocked).
  if (await isBlocked(supabase, dsoId, candidateId)) {
    return { ok: false, error: "This candidate isn't reachable right now." };
  }

  // Get-or-create the thread (RLS: recruiter+ for this DSO).
  let threadId: string;
  let threadStatus = "active";
  let revealed = false;
  const { data: existingThread } = await supabase
    .from("prospect_threads")
    .select("id, status, candidate_revealed")
    .eq("dso_id", dsoId)
    .eq("candidate_id", candidateId)
    .maybeSingle();

  if (existingThread) {
    threadId = existingThread.id as string;
    threadStatus = (existingThread.status as string) ?? "active";
    revealed = Boolean(existingThread.candidate_revealed);
    if (threadStatus === "blocked") {
      return { ok: false, error: "This candidate isn't reachable right now." };
    }
  } else {
    const { data: created, error: createErr } = await supabase
      .from("prospect_threads")
      .insert({
        dso_id: dsoId,
        candidate_id: candidateId,
        created_by: dsoUser.id as string,
        status: "active",
      })
      .select("id")
      .single();
    if (createErr || !created) {
      return { ok: false, error: "Couldn't open the conversation." };
    }
    threadId = created.id as string;
  }

  // Masking: name tokens resolve to EMPTY when masked, so no real identity is
  // ever written into the DSO-visible message body.
  const applied = await getDsoAppliedCandidateIds(supabase, dsoId, [candidateId]);
  const masked =
    Boolean(candidate.anonymous_mode) && !applied.has(candidateId) && !revealed;

  const { data: dso } = await supabase
    .from("dsos")
    .select("name")
    .eq("id", dsoId)
    .maybeSingle();
  const dsoName = (dso?.name as string | undefined) ?? "A dental group";

  // Masked → strip candidate-name tokens to a neutral greeting (defense: also
  // null the candidate name in the context so no path can resolve a real name).
  const safeBody = masked ? stripCandidateNameTokens(body) : body;
  const safeSubject =
    masked && subject ? stripCandidateNameTokens(subject) : subject;
  const mergeCtx = {
    candidate: {
      first_name: masked ? null : ((candidate.first_name as string | null) ?? null),
      full_name: masked ? null : ((candidate.full_name as string | null) ?? null),
    },
    sender: { full_name: (dsoUser.full_name as string | null) ?? null },
    dso: { name: dsoName },
  };
  const resolvedBody = resolveMergeFields(safeBody, mergeCtx);
  const resolvedSubject = safeSubject ? resolveMergeFields(safeSubject, mergeCtx) : "";

  // In-app message (RLS: dso insert into own thread). sender_user_id must be
  // auth.uid() per policy.
  const { error: msgErr } = await supabase.from("prospect_messages").insert({
    thread_id: threadId,
    sender_role: "dso",
    sender_user_id: user.id,
    sender_dso_user_id: dsoUser.id as string,
    body: resolvedBody,
  });
  if (msgErr) return { ok: false, error: "Couldn't send the message." };

  await supabase
    .from("prospect_threads")
    .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", threadId)
    .eq("dso_id", dsoId);

  // Keep the pipeline coherent: ensure a pool entry exists and advance
  // sourced → contacted. Service-role so messaging a not-yet-saved prospect
  // still records the prospect row.
  const admin = createSupabaseServiceRoleClient();
  const { data: poolEntry } = await admin
    .from("dso_talent_pool_entries")
    .select("id, pipeline_stage")
    .eq("dso_id", dsoId)
    .eq("candidate_id", candidateId)
    .maybeSingle();
  if (!poolEntry) {
    await admin.from("dso_talent_pool_entries").insert({
      dso_id: dsoId,
      candidate_id: candidateId,
      added_by: dsoUser.id as string,
      pipeline_stage: "contacted",
      last_activity_at: new Date().toISOString(),
    });
  } else if ((poolEntry.pipeline_stage as string) === "sourced") {
    await admin
      .from("dso_talent_pool_entries")
      .update({ pipeline_stage: "contacted", last_activity_at: new Date().toISOString() })
      .eq("id", poolEntry.id as string);
  }

  await logProspectActivity(supabase, {
    dsoId,
    candidateId,
    kind: "outreach_sent",
    actorDsoUserId: dsoUser.id as string,
    metadata: { thread_id: threadId },
  });

  // Continuity row for outreach analytics (service-role).
  await admin.from("dso_outreach_messages").insert({
    dso_id: dsoId,
    candidate_id: candidateId,
    sent_by: dsoUser.id as string,
    subject: resolvedSubject || "(message)",
    body: resolvedBody,
  });

  // Email nudge — only if not muted. The candidate email is resolved here via
  // the service-role client purely to send the platform email; it is NEVER
  // returned to the DSO surface. No reply-to → platform no-reply (replies are
  // in-app only).
  if (threadStatus !== "muted") {
    const authUserId = candidate.auth_user_id as string | null;
    if (authUserId) {
      const { data: authUser } = await admin.auth.admin.getUserById(authUserId);
      const candidateEmail = authUser?.user?.email ?? null;
      if (candidateEmail) {
        await dispatchNotification({
          userId: authUserId,
          eventKind: "prospect.interested_nudge",
          relatedDsoId: dsoId,
          relatedCandidateId: candidateId,
          email: {
            to: candidateEmail,
            subject: `${dsoName} is interested in you on DSO Hire`,
            react: ProspectInterest({
              dsoName,
              messageBody: resolvedBody,
              threadUrl: `${SITE_URL}/candidate/prospects/${threadId}`,
            }),
          },
        });
      }
    }
  }

  revalidatePath("/employer/talent-pool");
  revalidatePath(`/employer/candidates/${candidateId}`);
  return { ok: true, threadId };
}
