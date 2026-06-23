"use server";

/**
 * Candidate-side prospect-thread actions (Sourcing CRM Phase 2).
 *
 * The candidate is always in control: reply (anonymously OR sharing their
 * profile), mute, or block. Block writes candidate_blocked_employers (which the
 * Phase 0 helper enforces across discovery + outbound) and will auto-exit
 * sequences in Phase 3. The candidate's identity de-masks to the DSO ONLY when
 * they reply with reveal=true (or apply).
 *
 * DSO-side rows (pipeline stage, activity log) are written with the service-role
 * client because the candidate is not a DSO member (DSO-table RLS is DSO-only).
 */

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { logProspectActivity } from "@/lib/sourcing/pipeline";

export interface ProspectReplyResult {
  ok: boolean;
  error?: string;
}

/** Resolve the signed-in candidate + the thread they're acting on (RLS-scoped). */
async function loadOwnedThread(threadId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." as const };

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) return { error: "No candidate profile." as const };

  // RLS guarantees the candidate can only read their own thread.
  const { data: thread } = await supabase
    .from("prospect_threads")
    .select("id, dso_id, candidate_id, status")
    .eq("id", threadId)
    .eq("candidate_id", candidate.id as string)
    .maybeSingle();
  if (!thread) return { error: "Conversation not found." as const };

  return { supabase, user, candidateId: candidate.id as string, thread };
}

export async function sendProspectReply(
  threadId: string,
  body: string,
  reveal: boolean,
): Promise<ProspectReplyResult> {
  const text = (body ?? "").trim();
  if (!text) return { ok: false, error: "Write a message first." };
  if (text.length > 8000) return { ok: false, error: "Message is too long." };

  const loaded = await loadOwnedThread(threadId);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const { supabase, user, candidateId, thread } = loaded;
  if ((thread.status as string) === "blocked") {
    return { ok: false, error: "You've blocked this employer." };
  }

  const { error: msgErr } = await supabase.from("prospect_messages").insert({
    thread_id: threadId,
    sender_role: "candidate",
    sender_user_id: user.id,
    body: text,
  });
  if (msgErr) return { ok: false, error: "Couldn't send your reply." };

  // Reveal contract: only de-mask if the candidate explicitly chose to.
  const patch: Record<string, unknown> = {
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (reveal) patch.candidate_revealed = true;
  await supabase
    .from("prospect_threads")
    .update(patch)
    .eq("id", threadId)
    .eq("candidate_id", candidateId);

  // Advance the DSO's pipeline to "responded" + log activity (service role —
  // candidate can't write DSO-owned rows under RLS).
  const admin = createSupabaseServiceRoleClient();
  const dsoId = thread.dso_id as string;
  await admin
    .from("dso_talent_pool_entries")
    .update({ pipeline_stage: "responded", last_activity_at: new Date().toISOString() })
    .eq("dso_id", dsoId)
    .eq("candidate_id", candidateId)
    .in("pipeline_stage", ["sourced", "contacted", "nurturing"]);
  await logProspectActivity(admin, {
    dsoId,
    candidateId,
    kind: "replied",
    metadata: { thread_id: threadId, revealed: Boolean(reveal) },
  });

  revalidatePath(`/candidate/prospects/${threadId}`);
  revalidatePath("/candidate/prospects");
  return { ok: true };
}

export async function muteProspectThread(
  threadId: string,
): Promise<ProspectReplyResult> {
  const loaded = await loadOwnedThread(threadId);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const { supabase, candidateId } = loaded;
  const { error } = await supabase
    .from("prospect_threads")
    .update({ status: "muted", updated_at: new Date().toISOString() })
    .eq("id", threadId)
    .eq("candidate_id", candidateId);
  if (error) return { ok: false, error: "Couldn't mute." };
  revalidatePath(`/candidate/prospects/${threadId}`);
  return { ok: true };
}

export async function blockProspectFromThread(
  threadId: string,
): Promise<ProspectReplyResult> {
  const loaded = await loadOwnedThread(threadId);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const { supabase, candidateId, thread } = loaded;
  const dsoId = thread.dso_id as string;

  // Record the block (candidate owns candidate_blocked_employers via RLS).
  const { error: blockErr } = await supabase
    .from("candidate_blocked_employers")
    .upsert(
      { candidate_id: candidateId, dso_id: dsoId, reason_optional: "blocked_from_prospect_thread" },
      { onConflict: "candidate_id,dso_id" },
    );
  if (blockErr) return { ok: false, error: "Couldn't block." };

  await supabase
    .from("prospect_threads")
    .update({ status: "blocked", updated_at: new Date().toISOString() })
    .eq("id", threadId)
    .eq("candidate_id", candidateId);

  // Log opt-out on the DSO timeline (service role). Sequence auto-exit lands in
  // Phase 3 (checkExit reads block + thread status).
  const admin = createSupabaseServiceRoleClient();
  await logProspectActivity(admin, {
    dsoId,
    candidateId,
    kind: "opted_out",
    metadata: { thread_id: threadId, reason: "blocked" },
  });

  revalidatePath(`/candidate/prospects/${threadId}`);
  revalidatePath("/candidate/prospects");
  return { ok: true };
}
