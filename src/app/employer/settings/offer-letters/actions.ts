"use server";

/**
 * /employer/settings/offer-letters — server actions for the template
 * library (Phase 5A Track E).
 *
 * RLS handles the dso/role authorization gate ("Offer letters: DSO admin
 * write"). The app-layer checks here surface friendly error messages and
 * keep the audit-log writes clean.
 *
 * The send-an-offer action lives in
 * src/app/employer/applications/[id]/offer-actions.ts — that file is the
 * "use the library" surface; this file is the "manage the library"
 * surface.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/audit/record";

export interface TemplateActionResult {
  ok: boolean;
  error?: string;
  templateId?: string;
}

interface ScopeContext {
  userId: string;
  dsoId: string;
  dsoUserId: string;
  dsoUserName: string | null;
  dsoUserRole: string;
}

async function resolveScope(): Promise<
  { ok: true; ctx: ScopeContext } | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id, full_name, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) return { ok: false, error: "No DSO context." };

  return {
    ok: true,
    ctx: {
      userId: user.id,
      dsoId: (dsoUser as Record<string, unknown>).dso_id as string,
      dsoUserId: (dsoUser as Record<string, unknown>).id as string,
      dsoUserName:
        ((dsoUser as Record<string, unknown>).full_name as string | null) ??
        null,
      dsoUserRole: (dsoUser as Record<string, unknown>).role as string,
    },
  };
}

function requireAdmin(ctx: ScopeContext): { ok: true } | { ok: false; error: string } {
  if (ctx.dsoUserRole !== "owner" && ctx.dsoUserRole !== "admin") {
    return {
      ok: false,
      error: "Only DSO owners and admins can manage offer-letter templates.",
    };
  }
  return { ok: true };
}

const NAME_MAX = 120;
const BODY_MAX = 20000;

function validate(name: string, body: string): string | null {
  if (!name) return "Template name is required.";
  if (name.length > NAME_MAX) {
    return `Template name is too long (max ${NAME_MAX} chars).`;
  }
  if (!body) return "Template body is required.";
  if (body.length > BODY_MAX) {
    return `Template body is too long (max ${BODY_MAX} chars).`;
  }
  return null;
}

/* ───────────────────────────────────────────────────────────────
 * createTemplate
 * ───────────────────────────────────────────────────────────── */

export async function createTemplate(
  input: { name: string; body: string }
): Promise<TemplateActionResult> {
  const scope = await resolveScope();
  if (!scope.ok) return scope;
  const { ctx } = scope;

  const adminGate = requireAdmin(ctx);
  if (!adminGate.ok) return adminGate;

  const name = (input.name ?? "").trim();
  const body = (input.body ?? "").trim();
  const err = validate(name, body);
  if (err) return { ok: false, error: err };

  const supabase = await createSupabaseServerClient();
  const { data: inserted, error } = await supabase
    .from("dso_offer_letter_templates")
    .insert({
      dso_id: ctx.dsoId,
      name,
      body,
      created_by_user_id: ctx.userId,
    })
    .select("id")
    .maybeSingle();
  if (error || !inserted) {
    console.warn("[offer-letters] create failed", error);
    return { ok: false, error: error?.message ?? "Couldn't save template." };
  }

  const templateId = (inserted as Record<string, unknown>).id as string;
  void recordAuditEvent({
    dsoId: ctx.dsoId,
    actorUserId: ctx.userId,
    actorDsoUserId: ctx.dsoUserId,
    actorName: ctx.dsoUserName,
    actorRole: ctx.dsoUserRole,
    eventKind: "offer_template.created",
    targetTable: "dso_offer_letter_templates",
    targetId: templateId,
    summary: `Created offer-letter template "${name}"`,
    metadata: { name },
  });

  revalidatePath("/employer/settings/offer-letters");
  return { ok: true, templateId };
}

/* ───────────────────────────────────────────────────────────────
 * updateTemplate
 * ───────────────────────────────────────────────────────────── */

export async function updateTemplate(
  input: { id: string; name: string; body: string }
): Promise<TemplateActionResult> {
  const scope = await resolveScope();
  if (!scope.ok) return scope;
  const { ctx } = scope;

  const adminGate = requireAdmin(ctx);
  if (!adminGate.ok) return adminGate;

  const id = (input.id ?? "").trim();
  if (!id) return { ok: false, error: "Missing template id." };
  const name = (input.name ?? "").trim();
  const body = (input.body ?? "").trim();
  const err = validate(name, body);
  if (err) return { ok: false, error: err };

  const supabase = await createSupabaseServerClient();
  const { error, data } = await supabase
    .from("dso_offer_letter_templates")
    .update({ name, body })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Not found or permission denied." };
  }

  void recordAuditEvent({
    dsoId: ctx.dsoId,
    actorUserId: ctx.userId,
    actorDsoUserId: ctx.dsoUserId,
    actorName: ctx.dsoUserName,
    actorRole: ctx.dsoUserRole,
    eventKind: "offer_template.updated",
    targetTable: "dso_offer_letter_templates",
    targetId: id,
    summary: `Updated offer-letter template "${name}"`,
    metadata: { name },
  });

  revalidatePath("/employer/settings/offer-letters");
  return { ok: true, templateId: id };
}

/* ───────────────────────────────────────────────────────────────
 * archiveTemplate — soft delete (keeps historic sends readable)
 * ───────────────────────────────────────────────────────────── */

export async function archiveTemplate(id: string): Promise<TemplateActionResult> {
  const scope = await resolveScope();
  if (!scope.ok) return scope;
  const { ctx } = scope;
  const adminGate = requireAdmin(ctx);
  if (!adminGate.ok) return adminGate;

  if (!id) return { ok: false, error: "Missing template id." };

  const supabase = await createSupabaseServerClient();
  const { error, data } = await supabase
    .from("dso_offer_letter_templates")
    .update({ is_archived: true })
    .eq("id", id)
    .select("id, name");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Not found or permission denied." };
  }

  void recordAuditEvent({
    dsoId: ctx.dsoId,
    actorUserId: ctx.userId,
    actorDsoUserId: ctx.dsoUserId,
    actorName: ctx.dsoUserName,
    actorRole: ctx.dsoUserRole,
    eventKind: "offer_template.archived",
    targetTable: "dso_offer_letter_templates",
    targetId: id,
    summary: `Archived offer-letter template "${(data[0] as Record<string, unknown>).name as string}"`,
    metadata: {},
  });

  revalidatePath("/employer/settings/offer-letters");
  return { ok: true, templateId: id };
}

/* ───────────────────────────────────────────────────────────────
 * restoreTemplate — undo archive
 * ───────────────────────────────────────────────────────────── */

export async function restoreTemplate(id: string): Promise<TemplateActionResult> {
  const scope = await resolveScope();
  if (!scope.ok) return scope;
  const { ctx } = scope;
  const adminGate = requireAdmin(ctx);
  if (!adminGate.ok) return adminGate;

  if (!id) return { ok: false, error: "Missing template id." };

  const supabase = await createSupabaseServerClient();
  const { error, data } = await supabase
    .from("dso_offer_letter_templates")
    .update({ is_archived: false })
    .eq("id", id)
    .select("id, name");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Not found or permission denied." };
  }

  void recordAuditEvent({
    dsoId: ctx.dsoId,
    actorUserId: ctx.userId,
    actorDsoUserId: ctx.dsoUserId,
    actorName: ctx.dsoUserName,
    actorRole: ctx.dsoUserRole,
    eventKind: "offer_template.restored",
    targetTable: "dso_offer_letter_templates",
    targetId: id,
    summary: `Restored offer-letter template "${(data[0] as Record<string, unknown>).name as string}"`,
    metadata: {},
  });

  revalidatePath("/employer/settings/offer-letters");
  return { ok: true, templateId: id };
}

/* ───────────────────────────────────────────────────────────────
 * deleteTemplate — hard delete. Refuses if any application_offer_sends
 * rows reference the template (Archive is the right move in that case
 * so the audit trail stays intact).
 * ───────────────────────────────────────────────────────────── */

export async function deleteTemplate(id: string): Promise<TemplateActionResult> {
  const scope = await resolveScope();
  if (!scope.ok) return scope;
  const { ctx } = scope;
  const adminGate = requireAdmin(ctx);
  if (!adminGate.ok) return adminGate;

  if (!id) return { ok: false, error: "Missing template id." };

  const supabase = await createSupabaseServerClient();

  // Defensive count of historic sends. The FK is ON DELETE SET NULL so
  // a delete WOULD succeed without breaking the audit trail, but we
  // still refuse and steer the user toward Archive — preserves the
  // human-readable "sent from template X" affordance.
  const { count: sendCount, error: countErr } = await supabase
    .from("application_offer_sends")
    .select("id", { count: "exact", head: true })
    .eq("template_id", id);
  if (countErr) {
    console.warn("[offer-letters] usage count failed", countErr);
    return { ok: false, error: "Couldn't check template usage." };
  }
  if ((sendCount ?? 0) > 0) {
    return {
      ok: false,
      error: `This template has ${sendCount} historic offer send${
        sendCount === 1 ? "" : "s"
      } — archive it instead so those records stay linked.`,
    };
  }

  const { error, data } = await supabase
    .from("dso_offer_letter_templates")
    .delete()
    .eq("id", id)
    .select("id, name");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Not found or permission denied." };
  }

  void recordAuditEvent({
    dsoId: ctx.dsoId,
    actorUserId: ctx.userId,
    actorDsoUserId: ctx.dsoUserId,
    actorName: ctx.dsoUserName,
    actorRole: ctx.dsoUserRole,
    eventKind: "offer_template.deleted",
    targetTable: "dso_offer_letter_templates",
    targetId: id,
    summary: `Deleted offer-letter template "${(data[0] as Record<string, unknown>).name as string}"`,
    metadata: {},
  });

  revalidatePath("/employer/settings/offer-letters");
  return { ok: true, templateId: id };
}
