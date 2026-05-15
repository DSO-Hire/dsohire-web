"use server";

/**
 * /employer/applications/[id] — server actions for sending an offer
 * letter from a template (Phase 5A Track E).
 *
 * Flow:
 *   1. Auth + DSO scope check.
 *   2. Load candidate + job + DSO context.
 *   3. Auto-fill the candidate/job/dso merge values.
 *   4. Render the template body via `renderTemplate()`.
 *   5. If `missingRequired` is non-empty → return the missing-fields
 *      error to the caller without sending.
 *   6. Send the email via the centralized `sendEmail` helper (Resend
 *      + email_log). Subject editable from the modal.
 *   7. Insert the application_offer_sends row via service-role with the
 *      rendered HTML snapshot.
 *   8. recordAuditEvent('offer.sent') + revalidatePath.
 */

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/audit/record";
import { dispatchInboxRichCard } from "@/lib/inbox/dispatch-rich-card";
import { sendEmail } from "@/lib/email/send";
import { renderTemplate } from "@/lib/offer-letters/merge";
import { OfferLetter as OfferLetterEmail } from "@/emails/employer/OfferLetter";
import { getDisplayedDsoName } from "@/lib/dso/affiliation-display";
import {
  generateOfferResponseToken,
  offerResponseUrl,
  offerQuickAcceptUrl,
  offerQuickDeclineUrl,
} from "@/lib/offers/tokens";

export interface SendOfferInput {
  applicationId: string;
  templateId: string;
  /** Sender-filled offer.* values (and any overrides). */
  mergeValues: Record<string, string>;
  /** Editable subject — defaults to "Offer from {dsoName}" at the modal. */
  subject: string;
}

export type SendOfferResult = { ok: true; sendId: string } | { ok: false; error: string };

export async function sendOffer(
  input: SendOfferInput
): Promise<SendOfferResult> {
  const { applicationId, templateId, mergeValues, subject } = input;
  if (!applicationId) return { ok: false, error: "Missing application id." };
  if (!templateId) return { ok: false, error: "Missing template id." };
  if (!subject?.trim()) return { ok: false, error: "Subject is required." };
  if (subject.length > 200) {
    return { ok: false, error: "Subject is too long (max 200 chars)." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session expired. Sign in again." };
  }

  // ── Application + job + dso scope check via embedded select.
  // Per feedback_supabase_inner_returns_array.md, embedded selects come
  // back as arrays for to-one FKs.
  const { data: appRow, error: appErr } = await supabase
    .from("applications")
    .select(
      "id, candidate_id, job_id, jobs:jobs!inner(id, dso_id, title, employment_type)"
    )
    .eq("id", applicationId)
    .maybeSingle();
  if (appErr) {
    console.warn("[offer-letters] application lookup failed", appErr);
    return { ok: false, error: "Couldn't load application context." };
  }
  if (!appRow) {
    return { ok: false, error: "Application not found or access denied." };
  }

  const candidateId = (appRow as Record<string, unknown>).candidate_id as string;
  const jobsRel = (appRow as Record<string, unknown>).jobs as
    | Record<string, unknown>
    | Array<Record<string, unknown>>
    | null;
  const jobRow = Array.isArray(jobsRel) ? jobsRel[0] ?? null : jobsRel;
  const jobDsoId = (jobRow?.dso_id as string | null) ?? null;
  const jobTitle = (jobRow?.title as string | null) ?? null;
  const jobEmploymentType =
    (jobRow?.employment_type as string | null) ?? null;
  if (!jobDsoId || !candidateId) {
    return { ok: false, error: "Application missing scope context." };
  }

  // ── DSO membership check
  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id, full_name, role")
    .eq("auth_user_id", user.id)
    .eq("dso_id", jobDsoId)
    .maybeSingle();
  if (!dsoUser) {
    return { ok: false, error: "You don't have access to this DSO's applications." };
  }
  const dsoUserRole = (dsoUser as Record<string, unknown>).role as string;
  if (!["owner", "admin", "recruiter"].includes(dsoUserRole)) {
    return { ok: false, error: "You don't have permission to send offers." };
  }

  // ── Load template (RLS scopes by DSO, also confirms it's in this DSO).
  const { data: tpl, error: tplErr } = await supabase
    .from("dso_offer_letter_templates")
    .select("id, name, body, is_archived")
    .eq("id", templateId)
    .maybeSingle();
  if (tplErr) {
    console.warn("[offer-letters] template lookup failed", tplErr);
    return { ok: false, error: "Couldn't load the offer letter template." };
  }
  if (!tpl) {
    return { ok: false, error: "Template not found or access denied." };
  }
  if ((tpl as Record<string, unknown>).is_archived === true) {
    return { ok: false, error: "This template is archived. Pick an active template." };
  }
  const templateName = (tpl as Record<string, unknown>).name as string;
  const templateBody = (tpl as Record<string, unknown>).body as string;

  // ── Load candidate (for full name) + candidate auth email
  const { data: cand } = await supabase
    .from("candidates")
    .select("id, auth_user_id, full_name")
    .eq("id", candidateId)
    .maybeSingle();
  const candidateFullName =
    ((cand as Record<string, unknown> | null)?.full_name as string | null) ??
    "the candidate";
  const candidateAuthId =
    ((cand as Record<string, unknown> | null)?.auth_user_id as string | null) ??
    null;

  let candidateEmail: string | null = null;
  if (candidateAuthId) {
    try {
      const admin = createSupabaseServiceRoleClient();
      const { data: authUser } = await admin.auth.admin.getUserById(
        candidateAuthId
      );
      candidateEmail = authUser?.user?.email ?? null;
    } catch (err) {
      console.warn("[offer-letters] candidate email lookup failed", err);
    }
  }
  if (!candidateEmail) {
    return {
      ok: false,
      error: "We don't have an email address for this candidate.",
    };
  }

  // ── Job location (city, state). Pulled from the most-recent
  // dso_locations row referenced by the job. Lenient — if it's not
  // available, we leave the token unresolved (the renderer falls back
  // to empty).
  let jobLocation: string | null = null;
  const { data: jobLocRow } = await supabase
    .from("job_locations")
    .select("dso_locations:dso_locations(city, state)")
    .eq("job_id", (appRow as Record<string, unknown>).job_id as string)
    .limit(1)
    .maybeSingle();
  if (jobLocRow) {
    const locRel = (jobLocRow as Record<string, unknown>).dso_locations as
      | Record<string, unknown>
      | Array<Record<string, unknown>>
      | null;
    const loc = Array.isArray(locRel) ? locRel[0] ?? null : locRel;
    if (loc) {
      const city = (loc.city as string | null) ?? "";
      const state = (loc.state as string | null) ?? "";
      const joined = [city, state].filter(Boolean).join(", ");
      jobLocation = joined || null;
    }
  }

  // ── DSO name (CANDIDATE-FACING, affiliation-masked)
  // The offer letter is sent TO the candidate, so we must honor the
  // affiliation-reveal policy + per-location private flags. A private-
  // affiliation job's candidate sees the practice name ("67 Dental"),
  // not the corporate DSO ("dso hire"). Same posture as
  // proposeInterview, the reference-request email, and the /r/[token]
  // public form — every candidate-facing surface routes through
  // getDisplayedDsoName with viewer='candidate'. Raw dsos.name lookup
  // was the same affiliation leak we already cleaned out of Tracks
  // C + D today.
  const displayedDso = await getDisplayedDsoName({
    jobId: (appRow as Record<string, unknown>).job_id as string,
    viewer: { role: "candidate", applicationId },
  });
  const dsoName = displayedDso.name || "Your DSO";

  // ── Compose full merge values (auto + sender-supplied). Sender values
  // win when both are present (so an employer can override the auto-
  // filled candidate full name if they prefer "Dr. Lee" over the raw
  // value, etc.).
  const allValues: Record<string, string> = {
    "candidate.full_name": candidateFullName,
    "candidate.first_name": firstName(candidateFullName),
    "candidate.email": candidateEmail,
    "job.title": jobTitle ?? "the role",
    "job.location": jobLocation ?? "",
    "job.employment_type": jobEmploymentType ?? "",
    "dso.name": dsoName,
    ...mergeValues,
  };

  // ── Render
  const render = renderTemplate(templateBody, allValues);
  if (render.missingRequired.length > 0) {
    return {
      ok: false,
      error: `Required merge field${render.missingRequired.length === 1 ? "" : "s"} missing: ${render.missingRequired.join(", ")}.`,
    };
  }

  // ── Generate the response token BEFORE the email send so we can
  // embed the /o/{token} URL into the body. The token is also written
  // to the application_offer_sends row below; possession of the token
  // is what authorizes the candidate's Accept / Decline on /o/[token].
  const responseToken = generateOfferResponseToken();
  const responseUrl = offerResponseUrl(responseToken);
  const quickAcceptUrl = offerQuickAcceptUrl(responseToken);
  const quickDeclineUrl = offerQuickDeclineUrl(responseToken);

  // ── Send the email. The OfferLetter React Email template wraps the
  // pre-rendered fragment in the brand chrome + adds the tokenized
  // "Review and respond" CTA + Accept/Decline quick-reply links.
  // replyTo points at info@dsohire.com (alias-routes to Cam) so the
  // "questions about anything in the offer" line doesn't bounce.
  const senderName =
    ((dsoUser as Record<string, unknown>).full_name as string | null) ?? null;
  const sendResult = await sendEmail({
    to: candidateEmail,
    subject: subject.trim(),
    template: "employer.offer_letter",
    replyTo: "info@dsohire.com",
    react: OfferLetterEmail({
      candidateFirstName: firstName(candidateFullName),
      dsoName,
      jobTitle: jobTitle ?? undefined,
      senderName,
      bodyHtml: render.html,
      responseUrl,
      quickAcceptUrl,
      quickDeclineUrl,
    }),
    relatedDsoId: jobDsoId,
    relatedCandidateId: candidateId,
  });

  if (!sendResult.ok) {
    return {
      ok: false,
      error:
        sendResult.error ??
        "Couldn't send the offer letter. Try again in a moment.",
    };
  }

  // ── Persist the audit row via service-role. RLS doesn't grant INSERT
  // to the authenticated client on application_offer_sends (intentional
  // — we keep the audit trail immutable from app code). The token
  // column carries the same value embedded in the email above; the
  // /o/[token] response page resolves it back to this row.
  const admin = createSupabaseServiceRoleClient();
  const { data: inserted, error: insertErr } = await admin
    .from("application_offer_sends")
    .insert({
      application_id: applicationId,
      template_id: templateId,
      sent_by_user_id: user.id,
      recipient_email: candidateEmail,
      subject: subject.trim(),
      body_html: render.html,
      merge_values: mergeValues,
      token: responseToken,
    })
    .select("id")
    .maybeSingle();
  if (insertErr || !inserted) {
    console.warn("[offer-letters] send-row insert failed", insertErr);
    // The email already went out — return a non-fatal error so the
    // employer knows the audit record might be missing. They can retry
    // and the email will go again (acceptable: offer-letter sends are
    // rare + a duplicate is recoverable; a missing audit record is not).
    return {
      ok: false,
      error:
        "Email sent, but we couldn't save the audit record. Please contact support before resending.",
    };
  }

  const sendId = (inserted as Record<string, unknown>).id as string;

  // ── Drop an offer_letter RichCard into the inbox thread so the
  // candidate can Accept/Decline in-thread instead of relying solely
  // on the email. The card surfaces /o/[token] (audit-grade response
  // capture) — never duplicates the write path.
  const previewSource = render.html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const preview =
    previewSource.length > 280
      ? `${previewSource.slice(0, 277)}…`
      : previewSource;
  void dispatchInboxRichCard({
    applicationId,
    senderUserId: user.id,
    senderRole: "employer",
    senderDsoUserId: (dsoUser as Record<string, unknown>).id as string,
    fallbackBody: `Offer sent: ${subject.trim()}`,
    payload: {
      kind: "offer_letter",
      offer_send_id: sendId,
      response_token: responseToken,
      subject: subject.trim(),
      preview,
      sent_at: new Date().toISOString(),
      status: "sent",
    },
  });

  void recordAuditEvent({
    dsoId: jobDsoId,
    actorUserId: user.id,
    actorDsoUserId: (dsoUser as Record<string, unknown>).id as string,
    actorName: senderName,
    actorRole: dsoUserRole,
    eventKind: "offer.sent",
    targetTable: "application_offer_sends",
    targetId: sendId,
    summary: `Offer letter sent to ${candidateFullName}`,
    metadata: {
      template_id: templateId,
      template_name: templateName,
      application_id: applicationId,
      recipient_email: candidateEmail,
      subject: subject.trim(),
    },
  });

  revalidatePath(`/employer/applications/${applicationId}`);
  return { ok: true, sendId };
}

function firstName(full: string | null | undefined): string {
  if (!full) return "there";
  const t = full.trim();
  if (!t) return "there";
  return t.split(/\s+/)[0] ?? t;
}
