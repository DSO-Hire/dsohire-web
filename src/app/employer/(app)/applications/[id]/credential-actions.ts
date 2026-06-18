"use server";

/**
 * /employer/applications/[id] — server actions for the employer-side
 * Credentials section (Phase 5B v1).
 *
 * RLS posture: candidate_licenses + candidate_certifications have an "FOR
 * SELECT" policy for DSO members who have an application linkage to the
 * candidate. There is intentionally NO RLS UPDATE policy for DSO members
 * (only the candidate themselves can write to their own credential rows).
 * So the employer-side "Mark verified" / "Mark unverified" / "Mark expired"
 * writes go through the service-role client AFTER a manual scope check
 * that proves the caller belongs to the DSO that owns the job this
 * application was submitted to.
 *
 * This mirrors the comments-actions.ts pattern of pre-checking scope on
 * the RLS-gated client and then upgrading to the service-role client for
 * the write. Don't propose changing the RLS — service-role for v1 is the
 * locked decision.
 *
 * Document signed-URL generation uses the RLS-gated client because the
 * "Credentials: DSO read application docs" storage policy already lets
 * DSO members read attachments via the candidate→application→job→dso join.
 */

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/audit/record";

const CREDENTIAL_BUCKET = "candidate-credentials";

type CredentialKind = "license" | "certification";

function credentialTable(kind: CredentialKind): string {
  return kind === "license" ? "candidate_licenses" : "candidate_certifications";
}

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

/**
 * Verify that the authenticated caller belongs to the DSO that owns the
 * job this application was submitted to AND that the credential row
 * targeted by (kind, rowId) belongs to the application's candidate.
 *
 * Both checks use the RLS-gated client — RLS on `applications` and on
 * `candidate_licenses`/`candidate_certifications` (SELECT policies) is
 * enough to enforce scope without needing the service-role client here.
 * If either lookup fails we return an `ok: false` result.
 */
async function resolveScope(
  kind: CredentialKind,
  rowId: string,
  applicationId: string
): Promise<{ ok: true; ctx: ScopeContext } | { ok: false; error: string }> {
  if (!rowId) return { ok: false, error: "Missing credential id." };
  if (!applicationId) return { ok: false, error: "Missing application id." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session expired. Sign in again." };
  }

  // Pull the application + its job's dso_id + the candidate's display
  // name + the job title in one trip. Embedded selects come back as
  // arrays even for to-one FKs per
  // feedback_supabase_inner_returns_array.md — narrow defensively.
  const { data: appRow, error: appErr } = await supabase
    .from("applications")
    .select(
      "id, candidate_id, job_id, jobs:jobs!inner(id, dso_id, title), candidates:candidates(full_name)"
    )
    .eq("id", applicationId)
    .maybeSingle();
  if (appErr) {
    console.warn("[credentials] application lookup failed", appErr);
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
  const candidateId = ((appRow as Record<string, unknown>).candidate_id as
    | string
    | null) ?? null;
  if (!jobDsoId || !candidateId) {
    return {
      ok: false,
      error: "Application is missing scope context.",
    };
  }

  // Resolve the caller's dso_users membership for THIS dso. If the
  // viewer is a member of a different DSO, this returns no row and we
  // refuse the action.
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

  // Confirm the credential row belongs to the application's candidate.
  // Prevents a forged rowId from pointing at a credential on a
  // different candidate the caller has access to (via a different
  // application). RLS already filters by application linkage, but the
  // app-layer check is the belt — RLS is the suspenders.
  const table = credentialTable(kind);
  const { data: credentialRow } = await supabase
    .from(table)
    .select("id, candidate_id")
    .eq("id", rowId)
    .maybeSingle();
  if (!credentialRow) {
    return {
      ok: false,
      error: "Credential entry not found.",
    };
  }
  if (
    (credentialRow as Record<string, unknown>).candidate_id !== candidateId
  ) {
    return {
      ok: false,
      error: "This credential does not belong to the candidate on file.",
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

/* ───────────────────────────────────────────────────────────────
 * Mark verified
 * ───────────────────────────────────────────────────────────── */

export async function verifyCredential(
  kind: CredentialKind,
  rowId: string,
  applicationId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const scope = await resolveScope(kind, rowId, applicationId);
  if (!scope.ok) return scope;
  const { ctx } = scope;

  const admin = createSupabaseServiceRoleClient();
  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from(credentialTable(kind))
    .update({
      verification_status: "verified",
      verified_at: nowIso,
      verified_by_user_id: ctx.userId,
    })
    .eq("id", rowId);
  if (error) {
    console.warn("[credentials] verifyCredential update failed", error);
    return { ok: false, error: "Couldn't mark this credential verified." };
  }

  void recordAuditEvent({
    dsoId: ctx.dsoId,
    actorUserId: ctx.userId,
    actorDsoUserId: ctx.dsoUserId,
    actorName: ctx.dsoUserName,
    actorRole: ctx.dsoUserRole,
    eventKind:
      kind === "license"
        ? "credential.license_verified"
        : "credential.certification_verified",
    targetTable: credentialTable(kind),
    targetId: rowId,
    summary: `Marked a ${kind} verified for ${
      ctx.candidateName ?? "an applicant"
    }${ctx.jobTitle ? ` on ${ctx.jobTitle}` : ""}`,
    metadata: {
      application_id: applicationId,
      credential_kind: kind,
      credential_id: rowId,
      candidate_id: ctx.candidateId,
      new_status: "verified",
    },
  });

  revalidatePath(`/employer/applications/${applicationId}`);
  return { ok: true };
}

/* ───────────────────────────────────────────────────────────────
 * Mark unverified — reverts back to the canonical "unverified" state
 * ───────────────────────────────────────────────────────────── */

export async function unverifyCredential(
  kind: CredentialKind,
  rowId: string,
  applicationId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const scope = await resolveScope(kind, rowId, applicationId);
  if (!scope.ok) return scope;
  const { ctx } = scope;

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from(credentialTable(kind))
    .update({
      verification_status: "unverified",
      verified_at: null,
      verified_by_user_id: null,
    })
    .eq("id", rowId);
  if (error) {
    console.warn("[credentials] unverifyCredential update failed", error);
    return { ok: false, error: "Couldn't revert this credential." };
  }

  void recordAuditEvent({
    dsoId: ctx.dsoId,
    actorUserId: ctx.userId,
    actorDsoUserId: ctx.dsoUserId,
    actorName: ctx.dsoUserName,
    actorRole: ctx.dsoUserRole,
    eventKind:
      kind === "license"
        ? "credential.license_unverified"
        : "credential.certification_unverified",
    targetTable: credentialTable(kind),
    targetId: rowId,
    summary: `Reverted a ${kind} to unverified for ${
      ctx.candidateName ?? "an applicant"
    }${ctx.jobTitle ? ` on ${ctx.jobTitle}` : ""}`,
    metadata: {
      application_id: applicationId,
      credential_kind: kind,
      credential_id: rowId,
      candidate_id: ctx.candidateId,
      new_status: "unverified",
    },
  });

  revalidatePath(`/employer/applications/${applicationId}`);
  return { ok: true };
}

/* ───────────────────────────────────────────────────────────────
 * Mark expired
 * ───────────────────────────────────────────────────────────── */

export async function markCredentialExpired(
  kind: CredentialKind,
  rowId: string,
  applicationId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const scope = await resolveScope(kind, rowId, applicationId);
  if (!scope.ok) return scope;
  const { ctx } = scope;

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from(credentialTable(kind))
    .update({
      verification_status: "expired",
    })
    .eq("id", rowId);
  if (error) {
    console.warn("[credentials] markCredentialExpired update failed", error);
    return { ok: false, error: "Couldn't mark this credential expired." };
  }

  void recordAuditEvent({
    dsoId: ctx.dsoId,
    actorUserId: ctx.userId,
    actorDsoUserId: ctx.dsoUserId,
    actorName: ctx.dsoUserName,
    actorRole: ctx.dsoUserRole,
    eventKind:
      kind === "license"
        ? "credential.license_expired"
        : "credential.certification_expired",
    targetTable: credentialTable(kind),
    targetId: rowId,
    summary: `Marked a ${kind} expired for ${
      ctx.candidateName ?? "an applicant"
    }${ctx.jobTitle ? ` on ${ctx.jobTitle}` : ""}`,
    metadata: {
      application_id: applicationId,
      credential_kind: kind,
      credential_id: rowId,
      candidate_id: ctx.candidateId,
      new_status: "expired",
    },
  });

  revalidatePath(`/employer/applications/${applicationId}`);
  return { ok: true };
}

/* ───────────────────────────────────────────────────────────────
 * Signed-URL generation for the document attachment (60s TTL)
 *
 * The "Credentials: DSO read application docs" storage policy already
 * lets a DSO member read credential attachments for any candidate who
 * applied to one of their jobs, so we use the RLS-gated client here.
 * We still scope-check application + credential ownership first so a
 * stale or forged rowId can't sneak a URL out of bounds.
 * ───────────────────────────────────────────────────────────── */

export async function getEmployerCredentialSignedUrl(
  kind: CredentialKind,
  rowId: string,
  applicationId: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const scope = await resolveScope(kind, rowId, applicationId);
  if (!scope.ok) return scope;

  const supabase = await createSupabaseServerClient();
  const { data: row, error: rowErr } = await supabase
    .from(credentialTable(kind))
    .select("id, document_path")
    .eq("id", rowId)
    .maybeSingle();
  if (rowErr) {
    console.warn("[credentials] document_path lookup failed", rowErr);
    return { ok: false, error: "Couldn't load credential document." };
  }
  const documentPath = (row as Record<string, unknown> | null)?.document_path as
    | string
    | null
    | undefined;
  if (!documentPath) {
    return { ok: false, error: "No document attached to this credential." };
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from(CREDENTIAL_BUCKET)
    .createSignedUrl(documentPath, 60);
  if (signErr || !signed?.signedUrl) {
    console.warn("[credentials] createSignedUrl failed", signErr);
    return { ok: false, error: "Couldn't generate a download link." };
  }

  return { ok: true, url: signed.signedUrl };
}
