"use server";

/**
 * /employer/applications/[id] — server actions for the reference-check
 * workflow (Phase 5A Track D).
 *
 * Each action:
 *   1. Auth-checks the caller via createSupabaseServerClient().
 *   2. Uses RLS-gated reads to resolve the application scope (the
 *      "References: DSO …" policies on reference_requests already
 *      enforce membership; the app-layer check is the belt to the RLS
 *      suspenders).
 *   3. Writes via the RLS-gated client (the standard create/update/
 *      delete paths) — RLS handles authz. The dispatch helper drops to
 *      the service-role client because it needs to read across tables
 *      AFTER an insert and write `sent_at` outside the request's RLS
 *      context.
 *   4. Calls revalidatePath + recordAuditEvent on success.
 *
 * Email dispatch is fire-and-forget: createReferenceRequest succeeds even
 * if the email send fails, so the row stays in `pending` and the
 * employer can hit "Resend".
 */

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/audit/record";
import { sendEmail } from "@/lib/email/send";
import { ReferenceRequest as ReferenceRequestEmail } from "@/emails/employer/ReferenceRequest";
import { referenceUrlForToken } from "./reference-data";

// Minimal email-format validator. Strict enough to catch typos + obvious
// non-emails, lenient enough that a quirky address passes (we don't want
// to false-reject a real reference).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ScopeContext {
  userId: string;
  dsoId: string;
  dsoUserId: string;
  dsoUserName: string | null;
  dsoUserRole: string | null;
  candidateId: string;
  candidateName: string | null;
  jobTitle: string | null;
}

async function resolveScope(
  applicationId: string
): Promise<{ ok: true; ctx: ScopeContext } | { ok: false; error: string }> {
  if (!applicationId) return { ok: false, error: "Missing application id." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session expired. Sign in again." };
  }

  // Embedded selects come back as arrays for to-one FKs (per
  // feedback_supabase_inner_returns_array.md) — narrow defensively.
  const { data: appRow, error: appErr } = await supabase
    .from("applications")
    .select(
      "id, candidate_id, job_id, jobs:jobs!inner(id, dso_id, title), candidates:candidates(full_name)"
    )
    .eq("id", applicationId)
    .maybeSingle();
  if (appErr) {
    console.warn("[references] application lookup failed", appErr);
    return { ok: false, error: "Couldn't load application context." };
  }
  if (!appRow) {
    return {
      ok: false,
      error: "Application not found or you don't have access to it.",
    };
  }

  const candidateRecord = (appRow as Record<string, unknown>).candidates as
    | Record<string, unknown>
    | Array<Record<string, unknown>>
    | null;
  const candidateRow = Array.isArray(candidateRecord)
    ? candidateRecord[0] ?? null
    : candidateRecord;
  const candidateName =
    (candidateRow?.full_name as string | null | undefined) ?? null;

  const jobRecord = (appRow as Record<string, unknown>).jobs as
    | Record<string, unknown>
    | Array<Record<string, unknown>>
    | null;
  const jobRow = Array.isArray(jobRecord) ? jobRecord[0] ?? null : jobRecord;
  const jobDsoId = (jobRow?.dso_id as string | null) ?? null;
  const jobTitle = (jobRow?.title as string | null) ?? null;
  const candidateId =
    ((appRow as Record<string, unknown>).candidate_id as string | null) ?? null;
  if (!jobDsoId || !candidateId) {
    return { ok: false, error: "Application is missing scope context." };
  }

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id, full_name, role")
    .eq("auth_user_id", user.id)
    .eq("dso_id", jobDsoId)
    .maybeSingle();
  if (!dsoUser) {
    return {
      ok: false,
      error: "You don't have access to this DSO's applications.",
    };
  }

  return {
    ok: true,
    ctx: {
      userId: user.id,
      dsoId: jobDsoId,
      dsoUserId: (dsoUser as Record<string, unknown>).id as string,
      dsoUserName:
        ((dsoUser as Record<string, unknown>).full_name as string | null) ??
        null,
      dsoUserRole:
        ((dsoUser as Record<string, unknown>).role as string | null) ?? null,
      candidateId,
      candidateName,
      jobTitle,
    },
  };
}

/**
 * Resolve scope for an existing reference_request row (resend, decline,
 * delete). Looks up the row first, then runs the application-level
 * scope check.
 */
async function resolveScopeForRequest(
  requestId: string
): Promise<
  | { ok: true; ctx: ScopeContext; applicationId: string; referenceEmail: string; referenceName: string }
  | { ok: false; error: string }
> {
  if (!requestId) return { ok: false, error: "Missing reference id." };
  const supabase = await createSupabaseServerClient();
  const { data: row, error: rowErr } = await supabase
    .from("reference_requests")
    .select("id, application_id, reference_email, reference_name")
    .eq("id", requestId)
    .maybeSingle();
  if (rowErr) {
    console.warn("[references] request lookup failed", rowErr);
    return { ok: false, error: "Couldn't load reference request." };
  }
  if (!row) {
    return { ok: false, error: "Reference request not found." };
  }
  const applicationId =
    ((row as Record<string, unknown>).application_id as string | null) ?? null;
  if (!applicationId) {
    return { ok: false, error: "Reference request is missing application context." };
  }
  const scope = await resolveScope(applicationId);
  if (!scope.ok) return scope;
  return {
    ok: true,
    ctx: scope.ctx,
    applicationId,
    referenceEmail:
      ((row as Record<string, unknown>).reference_email as string | null) ?? "",
    referenceName:
      ((row as Record<string, unknown>).reference_name as string | null) ?? "",
  };
}

/* ───────────────────────────────────────────────────────────────
 * Dispatcher — sends the reference-request email via Resend.
 *
 * Service-role client because we need to:
 *   • Read DSO name + the requesting user's name across tables
 *     without depending on the caller's session in this helper
 *   • Update `sent_at` + `status` on success
 *
 * Fire-and-forget from the perspective of the caller — failures are
 * logged, the row stays in `pending`, and the employer can hit Resend.
 * ───────────────────────────────────────────────────────────── */

async function dispatchReferenceEmail(requestId: string): Promise<void> {
  const admin = createSupabaseServiceRoleClient();

  const { data: row, error: rowErr } = await admin
    .from("reference_requests")
    .select(
      "id, application_id, candidate_id, requested_by_user_id, reference_name, reference_email, token, status"
    )
    .eq("id", requestId)
    .maybeSingle();
  if (rowErr || !row) {
    console.warn("[references] dispatch: row lookup failed", rowErr ?? "no row");
    return;
  }

  const r = row as Record<string, unknown>;
  const referenceEmail = (r.reference_email as string | null) ?? null;
  const referenceName = (r.reference_name as string | null) ?? null;
  const token = (r.token as string | null) ?? null;
  const applicationId = (r.application_id as string | null) ?? null;
  const requestedByUserId = (r.requested_by_user_id as string | null) ?? null;
  const candidateId = (r.candidate_id as string | null) ?? null;
  if (!referenceEmail || !token || !applicationId) {
    console.warn("[references] dispatch: row is missing required fields", {
      hasEmail: !!referenceEmail,
      hasToken: !!token,
      hasApp: !!applicationId,
    });
    return;
  }

  // Pull application + job + dso in one trip, candidate in another.
  // Service-role bypasses RLS so embedded selects work without the
  // candidate-side privacy gate.
  const { data: appRow } = await admin
    .from("applications")
    .select(
      "id, job_id, candidate_id, jobs:jobs(id, title, dso_id, dsos:dsos(id, name))"
    )
    .eq("id", applicationId)
    .maybeSingle();

  let jobTitle: string | null = null;
  let dsoId: string | null = null;
  let dsoName: string | null = null;
  if (appRow) {
    const jobsRel = (appRow as Record<string, unknown>).jobs as
      | Record<string, unknown>
      | Array<Record<string, unknown>>
      | null;
    const jobRow = Array.isArray(jobsRel) ? jobsRel[0] ?? null : jobsRel;
    if (jobRow) {
      jobTitle = (jobRow.title as string | null) ?? null;
      dsoId = (jobRow.dso_id as string | null) ?? null;
      const dsoRel = (jobRow as Record<string, unknown>).dsos as
        | Record<string, unknown>
        | Array<Record<string, unknown>>
        | null;
      const dsoRow = Array.isArray(dsoRel) ? dsoRel[0] ?? null : dsoRel;
      dsoName = (dsoRow?.name as string | null | undefined) ?? null;
    }
  }

  let candidateName: string | null = null;
  if (candidateId) {
    const { data: candRow } = await admin
      .from("candidates")
      .select("id, full_name")
      .eq("id", candidateId)
      .maybeSingle();
    candidateName =
      ((candRow as Record<string, unknown> | null)?.full_name as
        | string
        | null
        | undefined) ?? null;
  }

  let requestingUserName: string | null = null;
  if (requestedByUserId && dsoId) {
    const { data: requesterRow } = await admin
      .from("dso_users")
      .select("full_name")
      .eq("auth_user_id", requestedByUserId)
      .eq("dso_id", dsoId)
      .maybeSingle();
    requestingUserName =
      ((requesterRow as Record<string, unknown> | null)?.full_name as
        | string
        | null
        | undefined) ?? null;
  }

  const url = referenceUrlForToken(token);
  const safeDsoName = dsoName ?? "A DSO Hire employer";
  const safeCandidateName = candidateName ?? "the candidate";
  const safeJobTitle = jobTitle ?? "an open role";
  const safeRequestingUserName = requestingUserName ?? "The hiring team";

  const result = await sendEmail({
    to: referenceEmail,
    subject: `Reference request from ${safeDsoName}`,
    template: "employer.reference_request",
    react: ReferenceRequestEmail({
      referenceName: referenceName ?? "there",
      candidateName: safeCandidateName,
      dsoName: safeDsoName,
      requestingUserName: safeRequestingUserName,
      jobTitle: safeJobTitle,
      formUrl: url,
    }),
    relatedDsoId: dsoId,
    relatedCandidateId: candidateId,
  });

  if (!result.ok) {
    // Leave the row in its current status (pending) so the employer can
    // retry. We don't surface the failure inline because the create
    // action returns `{ ok: true }` as soon as the row is inserted.
    console.warn("[references] dispatch failed", {
      requestId,
      error: result.error,
    });
    return;
  }

  // Flip to "sent" + stamp sent_at. We don't overwrite an existing
  // `sent_at` from a prior resend — `set sent_at = now()` is intentional.
  const { error: updateErr } = await admin
    .from("reference_requests")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (updateErr) {
    console.warn("[references] dispatch: status update failed", updateErr);
  }
}

/* ───────────────────────────────────────────────────────────────
 * createReferenceRequest
 * ───────────────────────────────────────────────────────────── */

export async function createReferenceRequest(
  applicationId: string,
  input: {
    name: string;
    email: string;
    role: string | null;
    relationship: string | null;
  }
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const scope = await resolveScope(applicationId);
  if (!scope.ok) return scope;
  const { ctx } = scope;

  // Role-gate matches the RLS write policy: owner / admin / recruiter only.
  if (
    !ctx.dsoUserRole ||
    !["owner", "admin", "recruiter"].includes(ctx.dsoUserRole)
  ) {
    return {
      ok: false,
      error: "Only DSO owners, admins, and recruiters can request references.",
    };
  }

  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim();
  const role = (input.role ?? "").trim() || null;
  const relationship = (input.relationship ?? "").trim() || null;

  if (!name) {
    return { ok: false, error: "Reference name is required." };
  }
  if (name.length > 120) {
    return { ok: false, error: "Reference name is too long (max 120 chars)." };
  }
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, error: "Enter a valid email address for the reference." };
  }
  if (email.length > 254) {
    return { ok: false, error: "Email is too long." };
  }
  if (role && role.length > 120) {
    return { ok: false, error: "Role/title is too long (max 120 chars)." };
  }
  if (relationship && relationship.length > 240) {
    return {
      ok: false,
      error: "Relationship description is too long (max 240 chars).",
    };
  }

  // Generate a 24-byte base64url token in app code. The DB has its own
  // SQL fallback default; we override here so test/staging logs reveal
  // the precise app-generated value when debugging.
  const token = crypto.randomBytes(24).toString("base64url");

  const supabase = await createSupabaseServerClient();
  const { data: inserted, error: insertErr } = await supabase
    .from("reference_requests")
    .insert({
      application_id: applicationId,
      candidate_id: ctx.candidateId,
      requested_by_user_id: ctx.userId,
      reference_name: name,
      reference_email: email,
      reference_role: role,
      relationship: relationship,
      token,
      status: "pending",
    })
    .select("id")
    .maybeSingle();
  if (insertErr || !inserted) {
    console.warn("[references] insert failed", insertErr);
    return { ok: false, error: "Couldn't create the reference request." };
  }

  const requestId = (inserted as Record<string, unknown>).id as string;

  // Dispatch the email. Awaited so the UI sees `sent` instead of
  // `pending` after the action resolves (no flicker on the badge).
  // Errors don't abort — the row remains in `pending` for Resend.
  await dispatchReferenceEmail(requestId);

  void recordAuditEvent({
    dsoId: ctx.dsoId,
    actorUserId: ctx.userId,
    actorDsoUserId: ctx.dsoUserId,
    actorName: ctx.dsoUserName,
    actorRole: ctx.dsoUserRole,
    eventKind: "reference.requested",
    targetTable: "reference_requests",
    targetId: requestId,
    summary: `Requested a reference from ${name}${
      ctx.candidateName ? ` for ${ctx.candidateName}` : ""
    }${ctx.jobTitle ? ` on ${ctx.jobTitle}` : ""}`,
    metadata: {
      application_id: applicationId,
      reference_email: email,
      reference_role: role,
    },
  });

  revalidatePath(`/employer/applications/${applicationId}`);
  return { ok: true, id: requestId };
}

/* ───────────────────────────────────────────────────────────────
 * resendReferenceRequest — re-fires the email without rotating
 * the token. Updates sent_at again.
 * ───────────────────────────────────────────────────────────── */

export async function resendReferenceRequest(
  requestId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const scope = await resolveScopeForRequest(requestId);
  if (!scope.ok) return scope;
  const { ctx, applicationId } = scope;

  if (
    !ctx.dsoUserRole ||
    !["owner", "admin", "recruiter"].includes(ctx.dsoUserRole)
  ) {
    return {
      ok: false,
      error: "Only DSO owners, admins, and recruiters can resend references.",
    };
  }

  await dispatchReferenceEmail(requestId);

  void recordAuditEvent({
    dsoId: ctx.dsoId,
    actorUserId: ctx.userId,
    actorDsoUserId: ctx.dsoUserId,
    actorName: ctx.dsoUserName,
    actorRole: ctx.dsoUserRole,
    eventKind: "reference.resent",
    targetTable: "reference_requests",
    targetId: requestId,
    summary: `Resent a reference request${
      ctx.candidateName ? ` for ${ctx.candidateName}` : ""
    }${ctx.jobTitle ? ` on ${ctx.jobTitle}` : ""}`,
    metadata: {
      application_id: applicationId,
      reference_email: scope.referenceEmail,
    },
  });

  revalidatePath(`/employer/applications/${applicationId}`);
  return { ok: true };
}

/* ───────────────────────────────────────────────────────────────
 * markReferenceDeclined — keep the row, mark intent, stop the
 * employer's followup workflow.
 * ───────────────────────────────────────────────────────────── */

export async function markReferenceDeclined(
  requestId: string,
  reason: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const scope = await resolveScopeForRequest(requestId);
  if (!scope.ok) return scope;
  const { ctx, applicationId } = scope;

  if (
    !ctx.dsoUserRole ||
    !["owner", "admin", "recruiter"].includes(ctx.dsoUserRole)
  ) {
    return {
      ok: false,
      error: "Only DSO owners, admins, and recruiters can change reference status.",
    };
  }

  const trimmedReason = (reason ?? "").trim() || null;
  if (trimmedReason && trimmedReason.length > 500) {
    return { ok: false, error: "Reason is too long (max 500 chars)." };
  }

  const supabase = await createSupabaseServerClient();
  const { error: updateErr } = await supabase
    .from("reference_requests")
    .update({
      status: "declined",
      decline_reason: trimmedReason,
    })
    .eq("id", requestId);
  if (updateErr) {
    console.warn("[references] decline update failed", updateErr);
    return { ok: false, error: "Couldn't mark this request declined." };
  }

  void recordAuditEvent({
    dsoId: ctx.dsoId,
    actorUserId: ctx.userId,
    actorDsoUserId: ctx.dsoUserId,
    actorName: ctx.dsoUserName,
    actorRole: ctx.dsoUserRole,
    eventKind: "reference.declined",
    targetTable: "reference_requests",
    targetId: requestId,
    summary: `Marked a reference request declined${
      ctx.candidateName ? ` for ${ctx.candidateName}` : ""
    }${ctx.jobTitle ? ` on ${ctx.jobTitle}` : ""}`,
    metadata: {
      application_id: applicationId,
      reference_email: scope.referenceEmail,
      decline_reason: trimmedReason,
    },
  });

  revalidatePath(`/employer/applications/${applicationId}`);
  return { ok: true };
}

/* ───────────────────────────────────────────────────────────────
 * deleteReferenceRequest — hard delete. Cascade tidies any
 * future child rows (response notifications, etc.).
 * ───────────────────────────────────────────────────────────── */

export async function deleteReferenceRequest(
  requestId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const scope = await resolveScopeForRequest(requestId);
  if (!scope.ok) return scope;
  const { ctx, applicationId } = scope;

  if (
    !ctx.dsoUserRole ||
    !["owner", "admin", "recruiter"].includes(ctx.dsoUserRole)
  ) {
    return {
      ok: false,
      error: "Only DSO owners, admins, and recruiters can delete references.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error: deleteErr } = await supabase
    .from("reference_requests")
    .delete()
    .eq("id", requestId);
  if (deleteErr) {
    console.warn("[references] delete failed", deleteErr);
    return { ok: false, error: "Couldn't delete this reference request." };
  }

  void recordAuditEvent({
    dsoId: ctx.dsoId,
    actorUserId: ctx.userId,
    actorDsoUserId: ctx.dsoUserId,
    actorName: ctx.dsoUserName,
    actorRole: ctx.dsoUserRole,
    eventKind: "reference.deleted",
    targetTable: "reference_requests",
    targetId: requestId,
    summary: `Deleted a reference request${
      ctx.candidateName ? ` for ${ctx.candidateName}` : ""
    }${ctx.jobTitle ? ` on ${ctx.jobTitle}` : ""}`,
    metadata: {
      application_id: applicationId,
      reference_email: scope.referenceEmail,
      reference_name: scope.referenceName,
    },
  });

  revalidatePath(`/employer/applications/${applicationId}`);
  return { ok: true };
}
