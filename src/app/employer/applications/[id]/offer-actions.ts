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
import { after } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/audit/record";
import { dispatchInboxRichCard } from "@/lib/inbox/dispatch-rich-card";
import { sendEmail } from "@/lib/email/send";
import { resolveCandidateReplyTo } from "@/lib/email/candidate-reply-to";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { renderTemplate } from "@/lib/offer-letters/merge";
import { OfferLetter as OfferLetterEmail } from "@/emails/employer/OfferLetter";
import { OfferApprovalRequest } from "@/emails/employer/OfferApprovalRequest";
import { getDisplayedDsoName } from "@/lib/dso/affiliation-display";
import {
  generateOfferResponseToken,
  offerResponseUrl,
  offerQuickAcceptUrl,
  offerQuickDeclineUrl,
} from "@/lib/offers/tokens";
import {
  evaluateOfferGuardrail,
  jobRangeForGuardrail,
  type JobCompPeriod,
} from "@/lib/offers/comp-guardrail";
import {
  resolveOfferGate,
  parseOfferApprovalPolicy,
  offerGateReasonLabel,
  type OfferGateReason,
} from "@/lib/offers/approval-policy";
import { dsoCanUseOfferApprovals } from "@/lib/offers/approval-tier";
import { can } from "@/lib/permissions/capabilities";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

export interface SendOfferInput {
  applicationId: string;
  templateId: string;
  /** Sender-filled offer.* values (and any overrides). */
  mergeValues: Record<string, string>;
  /** Editable subject — defaults to "Offer from {dsoName}" at the modal. */
  subject: string;
  /** N12: structured base amount (powers comp guardrails + offer analytics).
   *  The prose `offer.compensation` mergeValue stays for the letter body. */
  baseAmount?: number | null;
  basePeriod?: "hourly" | "annual" | null;
  /** N12 — per-offer live edit: a fully-merged markdown body that replaces
   *  the template for THIS send only (the saved template is untouched).
   *  When present + non-empty, it's rendered instead of the template body. */
  bodyOverride?: string | null;
}

export type SendOfferResult =
  | {
      ok: true;
      sendId: string;
      /** 'sent' = went straight to the candidate. 'pending_approval' = held
       *  for owner/admin sign-off (N12 Phase 2); nothing emailed yet. */
      status: "sent" | "pending_approval";
      /** Why approval was required (only when status === 'pending_approval'). */
      reason?: OfferGateReason;
    }
  | { ok: false; error: string };

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
      "id, candidate_id, job_id, jobs:jobs!inner(id, dso_id, title, employment_type, compensation_min, compensation_max, compensation_period, comp_model, est_annual_min, est_annual_max)"
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
  // #128 Phase D — percentage comp models guardrail against the posted
  // est. annual range (jobRangeForGuardrail = the single mapper).
  const jobRange = jobRangeForGuardrail({
    compModel: (jobRow?.comp_model as string | null) ?? null,
    compensationMin: (jobRow?.compensation_min as number | null) ?? null,
    compensationMax: (jobRow?.compensation_max as number | null) ?? null,
    compensationPeriod:
      (jobRow?.compensation_period as "hourly" | "daily" | "annual" | null) ??
      null,
    estAnnualMin: (jobRow?.est_annual_min as number | null) ?? null,
    estAnnualMax: (jobRow?.est_annual_max as number | null) ?? null,
  });
  const jobCompMin = jobRange.jobMin;
  const jobCompMax = jobRange.jobMax;
  const jobCompPeriod = jobRange.jobPeriod;
  if (!jobDsoId || !candidateId) {
    return { ok: false, error: "Application missing scope context." };
  }

  // ── DSO membership check
  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id, full_name, role, permission_overrides")
    .eq("auth_user_id", user.id)
    .eq("dso_id", jobDsoId)
    .maybeSingle();
  if (!dsoUser) {
    return { ok: false, error: "You don't have access to this DSO's applications." };
  }
  const dsoUserRole = (dsoUser as Record<string, unknown>).role as string;
  const dsoUserOverrides = (dsoUser as Record<string, unknown>)
    .permission_overrides;
  // #83 Phase 2 — preparing an offer requires the offers.draft capability
  // (owner/admin/recruiter by preset; HM only via per-teammate grant). A
  // non-empowered drafter's offer still routes to approval below.
  if (!can(dsoUserRole, dsoUserOverrides, "offers.draft")) {
    return {
      ok: false,
      error:
        "Your account doesn't have permission to draft offers. An owner or admin can grant this on the Team page.",
    };
  }
  // Single source of truth for direct-send: the capability model (the legacy
  // can_send_offers_directly column was migrated into permission_overrides).
  const senderCanSendDirectly = can(
    dsoUserRole,
    dsoUserOverrides,
    "offers.send_direct"
  );
  const senderName =
    ((dsoUser as Record<string, unknown>).full_name as string | null) ?? null;
  const dsoUserId = (dsoUser as Record<string, unknown>).id as string;

  // ── N12 — load the DSO's offer-approval policy + whether the approval
  // mechanism is unlocked for this tier (Scale+). Below Scale the gate is
  // off and every permitted sender sends directly (pre-N12 behavior).
  const { data: dsoPolicyRow } = await supabase
    .from("dsos")
    .select("offer_approval_policy")
    .eq("id", jobDsoId)
    .maybeSingle();
  const offerPolicy = parseOfferApprovalPolicy(
    (dsoPolicyRow as Record<string, unknown> | null)?.offer_approval_policy
  );
  const approvalsEnabled = await dsoCanUseOfferApprovals(supabase, jobDsoId);

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

  // ── Render. A per-offer live edit (bodyOverride) replaces the template
  // body for this send only; tokens are already merged in the override, so
  // renderTemplate just markdown→HTMLs it (missingRequired comes back empty).
  const sourceBody =
    typeof input.bodyOverride === "string" && input.bodyOverride.trim()
      ? input.bodyOverride
      : templateBody;
  const render = renderTemplate(sourceBody, allValues);
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

  // ── N12 GATE — decide whether this offer goes straight to the candidate
  // or must be held for owner/admin sign-off. The guardrail is recomputed
  // SERVER-SIDE here (never trust the client banner) from the structured
  // base + the job's posted range.
  const structuredBase =
    typeof input.baseAmount === "number" && Number.isFinite(input.baseAmount)
      ? input.baseAmount
      : null;
  const structuredPeriod: "hourly" | "annual" =
    input.basePeriod === "annual" ? "annual" : "hourly";
  const guardrail = evaluateOfferGuardrail({
    baseAmount: structuredBase,
    basePeriod: structuredPeriod,
    jobMin: jobCompMin,
    jobMax: jobCompMax,
    jobPeriod: jobCompPeriod as JobCompPeriod | null,
  });
  const gate = resolveOfferGate({
    approvalsEnabled,
    role: dsoUserRole,
    canSendDirectly: senderCanSendDirectly,
    guardrailSeverity: guardrail.severity,
    baseAmount: structuredBase,
    basePeriod: structuredPeriod,
    policy: offerPolicy,
  });

  // ── N12 Phase 3 — link this offer to the most recent DELIVERED offer it
  // supersedes (skip pending/rejected drafts — those never reached the
  // candidate, so they're not part of the negotiation thread).
  let revisedFromId: string | null = null;
  {
    const { data: priorSends } = await supabase
      .from("application_offer_sends")
      .select("id, approval_status")
      .eq("application_id", applicationId)
      .order("sent_at", { ascending: false })
      .limit(20);
    const prior = ((priorSends ?? []) as Array<{
      id: string;
      approval_status: string | null;
    }>).find((s) => {
      const st = s.approval_status ?? "not_required";
      return st === "not_required" || st === "approved";
    });
    revisedFromId = prior?.id ?? null;
  }

  if (gate.mode === "approval") {
    // Hold the offer as a PENDING draft — render + token are already on the
    // row, so an approver's click can dispatch the exact same letter. No
    // email, no inbox card until approval.
    const admin = createSupabaseServiceRoleClient();
    const { data: pendingRow, error: pendingErr } = await admin
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
        base_amount: structuredBase,
        base_period: structuredBase != null ? structuredPeriod : null,
        revised_from_offer_send_id: revisedFromId,
        approval_status: "pending",
      })
      .select("id")
      .maybeSingle();
    if (pendingErr || !pendingRow) {
      console.warn("[offer-letters] pending-approval insert failed", pendingErr);
      return {
        ok: false,
        error: "Couldn't submit the offer for approval. Try again in a moment.",
      };
    }
    const pendingId = (pendingRow as Record<string, unknown>).id as string;

    await recordAuditEvent({
      dsoId: jobDsoId,
      actorUserId: user.id,
      actorDsoUserId: dsoUserId,
      actorName: senderName,
      actorRole: dsoUserRole,
      eventKind: "offer.approval_requested",
      targetTable: "application_offer_sends",
      targetId: pendingId,
      summary: `Offer to ${candidateFullName} submitted for approval`,
      metadata: {
        application_id: applicationId,
        reason: gate.reason,
        base_amount: structuredBase,
        base_period: structuredBase != null ? structuredPeriod : null,
      },
    });

    // Notify owners/admins who can approve. after() keeps the action snappy
    // while still completing the sends (no fire-and-forget mid-handler).
    const baseLabel = formatBaseLabel(structuredBase, structuredPeriod);
    const reasonLabel = offerGateReasonLabel(gate.reason);
    after(async () => {
      try {
        await notifyApprovers({
          dsoId: jobDsoId,
          requesterAuthId: user.id,
          requesterName: senderName ?? "A teammate",
          candidateName: candidateFullName,
          jobTitle: jobTitle ?? "a role",
          baseLabel,
          reasonLabel,
        });
      } catch (err) {
        console.warn("[offer-letters] approver notification failed", err);
      }
    });

    revalidatePath(`/employer/applications/${applicationId}`);
    revalidatePath(`/employer/offer-approvals`);
    return {
      ok: true,
      sendId: pendingId,
      status: "pending_approval",
      reason: gate.reason,
    };
  }

  // ── Send the email. The OfferLetter React Email template wraps the
  // pre-rendered fragment in the brand chrome + adds the tokenized
  // "Review and respond" CTA + Accept/Decline quick-reply links.
  // The letter says "reply and {sender} will follow up," so replies must
  // reach the sender — not the platform. Sender's own email first, then the
  // DSO's candidate reply-to (careers@ / owner), then no header.
  const replyToAddress =
    (user.email ?? undefined) ?? (await resolveCandidateReplyTo(jobDsoId));
  const sendResult = await sendEmail({
    to: candidateEmail,
    subject: subject.trim(),
    template: "employer.offer_letter",
    replyTo: replyToAddress,
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
      base_amount:
        typeof input.baseAmount === "number" && Number.isFinite(input.baseAmount)
          ? input.baseAmount
          : null,
      base_period:
        input.basePeriod === "hourly" || input.basePeriod === "annual"
          ? input.basePeriod
          : null,
      revised_from_offer_send_id: revisedFromId,
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
  return { ok: true, sendId, status: "sent" };
}

/** Pretty "$72/hr" / "$165,000/yr" label for the structured base, or null. */
function formatBaseLabel(
  amount: number | null,
  period: "hourly" | "annual"
): string | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null;
  const pretty =
    amount % 1 === 0
      ? amount.toLocaleString("en-US")
      : amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `$${pretty}/${period === "annual" ? "yr" : "hr"}`;
}

/**
 * Email every owner/admin in the DSO that an offer is awaiting their
 * sign-off. Service-role lookup (we're notifying recipients, not the
 * caller). The requester is skipped so they don't get their own request.
 */
async function notifyApprovers(args: {
  dsoId: string;
  requesterAuthId: string;
  requesterName: string;
  candidateName: string;
  jobTitle: string;
  baseLabel: string | null;
  reasonLabel: string;
}): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  const { data: approverRows } = await admin
    .from("dso_users")
    .select("auth_user_id, first_name, role")
    .eq("dso_id", args.dsoId)
    .in("role", ["owner", "admin"]);
  const approvalsUrl = `${SITE_URL}/employer/offer-approvals`;
  for (const row of (approverRows ?? []) as Array<{
    auth_user_id: string | null;
    first_name: string | null;
    role: string;
  }>) {
    const authId = row.auth_user_id;
    if (!authId || authId === args.requesterAuthId) continue;
    const { data: authResp } = await admin.auth.admin.getUserById(authId);
    const email = authResp?.user?.email;
    if (!email) continue;
    await dispatchNotification({
      userId: authId,
      eventKind: "employer.offer_approval",
      relatedDsoId: args.dsoId,
      email: {
        to: email,
        subject: `Offer approval needed — ${args.candidateName}`,
        react: OfferApprovalRequest({
          recipientName: row.first_name ?? "there",
          requesterName: args.requesterName,
          candidateName: args.candidateName,
          jobTitle: args.jobTitle,
          baseLabel: args.baseLabel,
          reasonLabel: args.reasonLabel,
          approvalsUrl,
        }),
      },
    });
  }
}

function firstName(full: string | null | undefined): string {
  if (!full) return "there";
  const t = full.trim();
  if (!t) return "there";
  return t.split(/\s+/)[0] ?? t;
}
