"use server";

/**
 * /o/[token] — candidate Accept / Decline server actions (Track E
 * completion).
 *
 * Posture: NO AUTH. The token is the authorization. Service-role
 * client throughout. Mirrors the /r/[token] reference-form pattern.
 *
 * Both actions:
 *   1. Validate token shape (cheap), then look up the offer-send row
 *      by token (the canonical "is this real").
 *   2. Refuse if a response is already recorded (unique constraint
 *      also enforces this defensively).
 *   3. Insert into application_offer_responses with the
 *      response/reason/signed_name + IP/UA snapshot for audit.
 *   4. Move the application's stage_id to the DSO's default 'hired'
 *      (accept) or 'withdrawn' (decline) stage.
 *   5. Drop a system message into the inbox thread (visible to the
 *      employer's unread feed — senderRole='candidate').
 *   6. Record an audit_events row.
 *   7. Send the employer-notification email to the original sender +
 *      the DSO's owner.
 *   8. revalidatePath the employer detail page so the OfferSection
 *      flips to "Accepted by Jordan on May 12 at 3:42pm" without a
 *      manual refresh.
 *
 * IP + UA come from the request headers (next/headers). We capture
 * best-effort and don't fail if missing — the audit signal is
 * "this token was redeemed from approximately this network" rather
 * than a forensic-grade identity proof.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { looksLikeOfferToken } from "@/lib/offers/tokens";
import { sendEmail } from "@/lib/email/send";
import { dispatchInboxSystemMessage } from "@/lib/inbox/dispatch-system";
import { recordAuditEvent } from "@/lib/audit/record";
import { OfferAccepted } from "@/emails/employer/OfferAccepted";
import { OfferDeclined } from "@/emails/employer/OfferDeclined";

const SIGNED_NAME_MIN = 2;
const SIGNED_NAME_MAX = 120;
const REASON_MAX = 1000;

export type RecordOfferResponseResult =
  | { ok: true }
  | { ok: false; error: string; alreadyResponded?: boolean };

/* ───────────────────────────────────────────────────────────────
 * recordAcceptance
 * ───────────────────────────────────────────────────────────── */

export async function recordAcceptance(
  token: string,
  signedName: string
): Promise<RecordOfferResponseResult> {
  const cleanToken = (token ?? "").trim();
  if (!looksLikeOfferToken(cleanToken)) {
    return { ok: false, error: "This offer link isn't recognized." };
  }

  const cleanSig = (signedName ?? "").trim();
  if (cleanSig.length < SIGNED_NAME_MIN) {
    return {
      ok: false,
      error:
        "Type your full legal name to acknowledge the offer (at least 2 characters).",
    };
  }
  if (cleanSig.length > SIGNED_NAME_MAX) {
    return {
      ok: false,
      error: `Name is too long (max ${SIGNED_NAME_MAX} characters).`,
    };
  }

  const admin = createSupabaseServiceRoleClient();
  const ctx = await loadOfferContext(admin, cleanToken);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  if (ctx.existingResponse) {
    return {
      ok: false,
      alreadyResponded: true,
      error: `You already ${ctx.existingResponse.response} this offer on ${formatDate(ctx.existingResponse.responded_at)}.`,
    };
  }

  const { ip, userAgent } = await readRequestSignals();

  // 1. Insert the response row first — unique(offer_send_id) defends
  //    against double-click races on the CTA.
  const { error: insertErr } = await admin
    .from("application_offer_responses")
    .insert({
      offer_send_id: ctx.offerSendId,
      application_id: ctx.applicationId,
      response: "accepted",
      signed_name: cleanSig,
      ip,
      user_agent: userAgent,
    });
  if (insertErr) {
    // PG error code 23505 = unique_violation. A concurrent click won
    // the race; treat as success-from-the-candidate's-POV.
    if (insertErr.code === "23505") {
      return {
        ok: false,
        alreadyResponded: true,
        error: "This offer was already responded to.",
      };
    }
    console.warn("[offer-response] accept insert failed", insertErr);
    return {
      ok: false,
      error: "Couldn't record your response. Please try again in a moment.",
    };
  }

  // 2. Flip the application's stage to Hired (DSO's default 'hired' row).
  await flipApplicationStage(admin, {
    applicationId: ctx.applicationId,
    dsoId: ctx.dsoId,
    targetKind: "hired",
  });

  // 3. Side effects (fire-and-forget — none should roll the response back).
  void dispatchInboxSystemMessage({
    applicationId: ctx.applicationId,
    eventKind: "stage_changed",
    senderRole: "candidate",
    body: `${ctx.candidateName} accepted the offer for ${ctx.jobTitle}.`,
  });

  void recordAuditEvent({
    dsoId: ctx.dsoId,
    actorUserId: null,
    actorName: ctx.candidateName,
    actorRole: "candidate",
    eventKind: "offer.accepted",
    targetTable: "application_offer_responses",
    targetId: null,
    summary: `${ctx.candidateName} accepted the offer for ${ctx.jobTitle}`,
    metadata: {
      offer_send_id: ctx.offerSendId,
      application_id: ctx.applicationId,
      signed_name: cleanSig,
    },
  });

  void notifyEmployer({
    kind: "accepted",
    senderEmail: ctx.senderEmail,
    senderName: ctx.senderName,
    candidateName: ctx.candidateName,
    candidateEmail: ctx.candidateEmail,
    dsoName: ctx.dsoName,
    jobTitle: ctx.jobTitle,
    applicationId: ctx.applicationId,
    signedName: cleanSig,
    dsoId: ctx.dsoId,
  });

  revalidatePath(`/employer/applications/${ctx.applicationId}`);
  return { ok: true };
}

/* ───────────────────────────────────────────────────────────────
 * recordDecline
 * ───────────────────────────────────────────────────────────── */

export async function recordDecline(
  token: string,
  reason: string | null
): Promise<RecordOfferResponseResult> {
  const cleanToken = (token ?? "").trim();
  if (!looksLikeOfferToken(cleanToken)) {
    return { ok: false, error: "This offer link isn't recognized." };
  }

  const cleanReason = (reason ?? "").trim();
  if (cleanReason.length > REASON_MAX) {
    return {
      ok: false,
      error: `Reason is too long (max ${REASON_MAX} characters).`,
    };
  }

  const admin = createSupabaseServiceRoleClient();
  const ctx = await loadOfferContext(admin, cleanToken);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  if (ctx.existingResponse) {
    return {
      ok: false,
      alreadyResponded: true,
      error: `You already ${ctx.existingResponse.response} this offer on ${formatDate(ctx.existingResponse.responded_at)}.`,
    };
  }

  const { ip, userAgent } = await readRequestSignals();

  const { error: insertErr } = await admin
    .from("application_offer_responses")
    .insert({
      offer_send_id: ctx.offerSendId,
      application_id: ctx.applicationId,
      response: "declined",
      reason: cleanReason || null,
      ip,
      user_agent: userAgent,
    });
  if (insertErr) {
    if (insertErr.code === "23505") {
      return {
        ok: false,
        alreadyResponded: true,
        error: "This offer was already responded to.",
      };
    }
    console.warn("[offer-response] decline insert failed", insertErr);
    return {
      ok: false,
      error: "Couldn't record your response. Please try again in a moment.",
    };
  }

  // Decline → flip to withdrawn (candidate-driven exit from the
  // pipeline). Modeling decline-at-offer as withdrawn keeps the
  // "candidate-initiated" semantics consistent with how the existing
  // /candidate/applications withdraw path works.
  await flipApplicationStage(admin, {
    applicationId: ctx.applicationId,
    dsoId: ctx.dsoId,
    targetKind: "withdrawn",
  });

  void dispatchInboxSystemMessage({
    applicationId: ctx.applicationId,
    eventKind: "stage_changed",
    senderRole: "candidate",
    body: cleanReason
      ? `${ctx.candidateName} declined the offer for ${ctx.jobTitle}. Reason: ${cleanReason}`
      : `${ctx.candidateName} declined the offer for ${ctx.jobTitle}.`,
  });

  void recordAuditEvent({
    dsoId: ctx.dsoId,
    actorUserId: null,
    actorName: ctx.candidateName,
    actorRole: "candidate",
    eventKind: "offer.declined",
    targetTable: "application_offer_responses",
    targetId: null,
    summary: `${ctx.candidateName} declined the offer for ${ctx.jobTitle}`,
    metadata: {
      offer_send_id: ctx.offerSendId,
      application_id: ctx.applicationId,
      reason: cleanReason || null,
    },
  });

  void notifyEmployer({
    kind: "declined",
    senderEmail: ctx.senderEmail,
    senderName: ctx.senderName,
    candidateName: ctx.candidateName,
    candidateEmail: ctx.candidateEmail,
    dsoName: ctx.dsoName,
    jobTitle: ctx.jobTitle,
    applicationId: ctx.applicationId,
    declineReason: cleanReason || null,
    dsoId: ctx.dsoId,
  });

  revalidatePath(`/employer/applications/${ctx.applicationId}`);
  return { ok: true };
}

/* ───────────────────────────────────────────────────────────────
 * Internals — context loader, stage flip, employer notification
 * ───────────────────────────────────────────────────────────── */

type OfferContextResult =
  | {
      ok: true;
      offerSendId: string;
      applicationId: string;
      dsoId: string;
      jobTitle: string;
      candidateName: string;
      candidateEmail: string | null;
      senderEmail: string | null;
      senderName: string | null;
      dsoName: string;
      error?: undefined;
      existingResponse: { response: string; responded_at: string } | null;
    }
  | { ok: false; error: string };

async function loadOfferContext(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  token: string
): Promise<OfferContextResult> {
  // Resolve the offer-send row by token. Pull just what we need to
  // identify the application + assemble notification copy.
  const { data: sendRow, error: sendErr } = await admin
    .from("application_offer_sends")
    .select(
      "id, application_id, sent_by_user_id, " +
        "applications:applications(id, candidate_id, job_id, " +
        "jobs:jobs(id, title, dso_id))"
    )
    .eq("token", token)
    .maybeSingle();
  if (sendErr) {
    console.warn("[offer-response] token lookup failed", sendErr);
    return { ok: false, error: "Couldn't load this offer." };
  }
  if (!sendRow) {
    return {
      ok: false,
      error: "This offer link isn't recognized. Reach out to the hiring team if you think it should be.",
    };
  }

  const s = sendRow as Record<string, unknown>;
  const offerSendId = s.id as string;
  const sentByUserId = (s.sent_by_user_id as string | null) ?? null;
  const appRel = s.applications as
    | Record<string, unknown>
    | Array<Record<string, unknown>>
    | null;
  const appRow = Array.isArray(appRel) ? appRel[0] ?? null : appRel;
  if (!appRow) {
    return { ok: false, error: "Offer has no application linked." };
  }
  const applicationId = appRow.id as string;
  const candidateId = (appRow.candidate_id as string | null) ?? null;
  const jobRel = appRow.jobs as
    | Record<string, unknown>
    | Array<Record<string, unknown>>
    | null;
  const jobRow = Array.isArray(jobRel) ? jobRel[0] ?? null : jobRel;
  if (!jobRow) {
    return { ok: false, error: "Offer has no job linked." };
  }
  const jobId = (jobRow.id as string | null) ?? null;
  const jobTitle = (jobRow.title as string | null) ?? "the role";
  const dsoId = (jobRow.dso_id as string | null) ?? null;
  if (!dsoId || !jobId) {
    return { ok: false, error: "Offer missing scope context." };
  }

  // Candidate name + email (best-effort).
  let candidateName = "the candidate";
  let candidateEmail: string | null = null;
  if (candidateId) {
    const { data: cand } = await admin
      .from("candidates")
      .select("full_name, auth_user_id")
      .eq("id", candidateId)
      .maybeSingle();
    if (cand) {
      const c = cand as Record<string, unknown>;
      candidateName = (c.full_name as string | null) ?? candidateName;
      const authId = (c.auth_user_id as string | null) ?? null;
      if (authId) {
        try {
          const { data: au } = await admin.auth.admin.getUserById(authId);
          candidateEmail = au?.user?.email ?? null;
        } catch (err) {
          console.warn("[offer-response] candidate email lookup failed", err);
        }
      }
    }
  }

  // DSO name — use affiliation-aware candidate-facing display, same
  // posture as the offer email + the reference page. The candidate
  // sees the practice name, not the corporate parent.
  let dsoName = "the hiring team";
  try {
    const { getDisplayedDsoName } = await import(
      "@/lib/dso/affiliation-display"
    );
    const displayed = await getDisplayedDsoName({
      jobId,
      viewer: { role: "candidate", applicationId },
    });
    if (displayed.name) dsoName = displayed.name;
  } catch (err) {
    console.warn("[offer-response] dso display lookup failed", err);
  }

  // Sender email + name (the original recruiter) — for the employer
  // notification reply-to + addressing.
  let senderEmail: string | null = null;
  let senderName: string | null = null;
  if (sentByUserId) {
    try {
      const { data: au } = await admin.auth.admin.getUserById(sentByUserId);
      senderEmail = au?.user?.email ?? null;
    } catch (err) {
      console.warn("[offer-response] sender email lookup failed", err);
    }
    const { data: dsoUserRow } = await admin
      .from("dso_users")
      .select("full_name")
      .eq("auth_user_id", sentByUserId)
      .eq("dso_id", dsoId)
      .maybeSingle();
    senderName =
      ((dsoUserRow as Record<string, unknown> | null)?.full_name as
        | string
        | null
        | undefined) ?? null;
  }

  // Existing response, if any. We surface "already responded" without
  // mutating anything when the candidate re-clicks the email link
  // after their first response. Stable view, no double-flip.
  const { data: existing } = await admin
    .from("application_offer_responses")
    .select("response, responded_at")
    .eq("offer_send_id", offerSendId)
    .maybeSingle();
  const existingResponse = existing
    ? {
        response: (existing as Record<string, unknown>).response as string,
        responded_at: (existing as Record<string, unknown>)
          .responded_at as string,
      }
    : null;

  return {
    ok: true,
    offerSendId,
    applicationId,
    dsoId,
    jobTitle,
    candidateName,
    candidateEmail,
    senderEmail,
    senderName,
    dsoName,
    existingResponse,
  };
}

/**
 * Service-role stage flip. Resolves the DSO's default stage row for
 * the target kind, then UPDATEs applications.stage_id. Skips when
 * the application is already on that stage.
 *
 * Mirrors the logic in `moveApplicationStage` (src/app/employer/
 * applications/[id]/actions.ts) but uses service-role so it works
 * from the unauthenticated /o/[token] surface.
 */
async function flipApplicationStage(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  args: {
    applicationId: string;
    dsoId: string;
    targetKind: "hired" | "withdrawn";
  }
): Promise<void> {
  const { applicationId, dsoId, targetKind } = args;

  // Find the DSO's default stage row for the target kind.
  const { data: stageRow, error: stageErr } = await admin
    .from("dso_pipeline_stages")
    .select("id, kind")
    .eq("dso_id", dsoId)
    .eq("kind", targetKind)
    .eq("is_default", true)
    .maybeSingle();
  if (stageErr || !stageRow) {
    console.warn(
      `[offer-response] no default ${targetKind} stage for dso`,
      { dsoId, applicationId, error: stageErr }
    );
    return;
  }
  const targetStageId = (stageRow as Record<string, unknown>).id as string;

  // No-op short-circuit when already on this stage.
  const { data: appRow } = await admin
    .from("applications")
    .select("stage_id")
    .eq("id", applicationId)
    .maybeSingle();
  const prevStageId =
    ((appRow as Record<string, unknown> | null)?.stage_id as
      | string
      | null
      | undefined) ?? null;
  if (prevStageId === targetStageId) return;

  const { error: updateErr } = await admin
    .from("applications")
    .update({ stage_id: targetStageId })
    .eq("id", applicationId);
  if (updateErr) {
    console.warn("[offer-response] stage flip failed", updateErr);
  }
}

interface NotifyEmployerArgs {
  kind: "accepted" | "declined";
  senderEmail: string | null;
  senderName: string | null;
  candidateName: string;
  candidateEmail: string | null;
  dsoName: string;
  jobTitle: string;
  applicationId: string;
  dsoId: string;
  signedName?: string;
  declineReason?: string | null;
}

async function notifyEmployer(args: NotifyEmployerArgs): Promise<void> {
  if (!args.senderEmail) {
    // No identifiable sender — nothing to notify. (Sender may have
    // left the DSO between send and response; the audit row + the
    // OfferSection still surface the response in-app on next view.)
    return;
  }
  const detailUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com"}/employer/applications/${args.applicationId}`;
  const recipientFirstName =
    args.senderName?.split(/\s+/)[0] ?? null;

  if (args.kind === "accepted") {
    void sendEmail({
      to: args.senderEmail,
      subject: `${args.candidateName} accepted the offer for ${args.jobTitle}`,
      template: "employer.offer_accepted",
      replyTo: args.candidateEmail ?? undefined,
      relatedDsoId: args.dsoId,
      react: OfferAccepted({
        recipientFirstName,
        candidateName: args.candidateName,
        candidateEmail: args.candidateEmail,
        jobTitle: args.jobTitle,
        dsoName: args.dsoName,
        signedName: args.signedName ?? null,
        detailUrl,
      }),
    });
    return;
  }

  void sendEmail({
    to: args.senderEmail,
    subject: `${args.candidateName} declined the offer for ${args.jobTitle}`,
    template: "employer.offer_declined",
    replyTo: args.candidateEmail ?? undefined,
    relatedDsoId: args.dsoId,
    react: OfferDeclined({
      recipientFirstName,
      candidateName: args.candidateName,
      candidateEmail: args.candidateEmail,
      jobTitle: args.jobTitle,
      dsoName: args.dsoName,
      reason: args.declineReason ?? null,
      detailUrl,
    }),
  });
}

async function readRequestSignals(): Promise<{
  ip: string | null;
  userAgent: string | null;
}> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    const real = h.get("x-real-ip");
    const ua = h.get("user-agent");
    const ip = fwd?.split(",")[0]?.trim() || real || null;
    return { ip: ip ?? null, userAgent: ua ?? null };
  } catch {
    return { ip: null, userAgent: null };
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
