"use server";

/**
 * /employer/settings/templates server actions.
 *
 * Two surfaces:
 *
 *   PREDEFINED (3 system kinds — `candidate.application_received` etc.)
 *     - upsertTemplate     — save a custom subject + body for one kind
 *     - revertTemplate     — delete the custom row, falling back to system default
 *     - Available to ALL paid tiers (Solo unlocked Day 21 2026-05-27)
 *
 *   CUSTOM (user-defined arbitrary kinds — Growth+ only)
 *     - createCustomTemplate
 *     - updateCustomTemplate
 *     - archiveCustomTemplate
 *
 * RLS + "use server" auth gate at the server-action edge. The tier gate
 * inside this file is a defense-in-depth check so even a manually-crafted
 * request from a Solo subscriber can't write a custom kind.
 *
 * "use server" rule: only async functions exported here. Constants/types
 * live in `templates-data.ts`.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions/capabilities";
import {
  CUSTOM_KIND_PREFIX,
  PREDEFINED_TEMPLATE_KINDS,
  TEMPLATE_META,
  type PredefinedTemplateKind,
} from "@/lib/email/templates/manifest";
import { dsoCanUseCustomTemplates } from "@/lib/email/templates/tier";
import { sanitizeTiptapHtml } from "@/lib/html/sanitize-tiptap";

type Result =
  | { ok: true }
  | { ok: false; error: string };

type CreateResult =
  | { ok: true; id: string; kind: string }
  | { ok: false; error: string };

async function getDsoAdminContext() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, error: "Please sign in." };
  }

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role, permission_overrides")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) {
    return { ok: false as const, error: "No DSO membership found." };
  }
  // #83 Phase 2 — settings.manage capability (was hard owner/admin).
  const role = dsoUser.role as string;
  if (
    !can(
      role,
      (dsoUser as Record<string, unknown>).permission_overrides,
      "settings.manage"
    )
  ) {
    return {
      ok: false as const,
      error: "You don't have permission to edit email templates.",
    };
  }
  return {
    ok: true as const,
    supabase,
    user,
    dsoId: dsoUser.dso_id as string,
  };
}

function isPredefinedKind(kind: string): kind is PredefinedTemplateKind {
  return (PREDEFINED_TEMPLATE_KINDS as string[]).includes(kind);
}

/* ──────────────────────────────────────────────────────────────
 * Predefined templates — available to ALL paid tiers
 * ─────────────────────────────────────────────────────────── */

export async function upsertTemplate(input: {
  kind: string;
  subject: string;
  body_html: string;
}): Promise<Result> {
  const ctx = await getDsoAdminContext();
  if (!ctx.ok) return ctx;

  if (!isPredefinedKind(input.kind)) {
    return { ok: false, error: "Unknown template kind." };
  }

  const subject = input.subject.trim();
  if (!subject || subject.length > 200) {
    return {
      ok: false,
      error: "Subject must be between 1 and 200 characters.",
    };
  }

  const cleanBody = sanitizeTiptapHtml(input.body_html);
  if (!cleanBody.trim() || cleanBody.length > 50000) {
    return {
      ok: false,
      error: "Body must be between 1 and 50000 characters.",
    };
  }

  // Populate name from manifest label so admins editing in the DB or
  // looking at email_log can identify the row without a code lookup.
  const name = TEMPLATE_META[input.kind].label;

  const { error } = await ctx.supabase.from("email_templates").upsert(
    {
      dso_id: ctx.dsoId,
      kind: input.kind,
      name,
      subject,
      body_html: cleanBody,
      is_custom: false,
      is_archived: false,
      updated_by: ctx.user.id,
    },
    { onConflict: "dso_id,kind" }
  );

  if (error) {
    console.error("[settings/templates/upsertTemplate]", error);
    return { ok: false, error: "Couldn't save the template." };
  }

  revalidatePath("/employer/settings/templates");
  return { ok: true };
}

export async function revertTemplate(input: {
  kind: string;
}): Promise<Result> {
  const ctx = await getDsoAdminContext();
  if (!ctx.ok) return ctx;

  if (!isPredefinedKind(input.kind)) {
    return { ok: false, error: "Unknown template kind." };
  }

  const { error } = await ctx.supabase
    .from("email_templates")
    .delete()
    .eq("dso_id", ctx.dsoId)
    .eq("kind", input.kind);

  if (error) {
    console.error("[settings/templates/revertTemplate]", error);
    return { ok: false, error: "Couldn't revert to the default template." };
  }

  revalidatePath("/employer/settings/templates");
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────
 * Custom templates — Growth+ only
 * ─────────────────────────────────────────────────────────── */

/**
 * Slugify a free-form name into a URL/audit-log-friendly token. Keeps
 * lowercase alphanumerics + dashes; collapses everything else.
 */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Build a unique `custom.<slug>` kind for this DSO. Suffixes -2, -3, …
 * on collision against existing (non-archived) rows.
 */
async function buildUniqueKind(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  dsoId: string,
  baseName: string
): Promise<string | null> {
  const baseSlug = slugify(baseName) || "untitled";
  let candidate = `${CUSTOM_KIND_PREFIX}${baseSlug}`;
  let counter = 2;
  // Bounded attempts — collision >50 means the user is doing something
  // weird and we'd rather error than loop.
  for (let i = 0; i < 50; i++) {
    const { data, error } = await supabase
      .from("email_templates")
      .select("id")
      .eq("dso_id", dsoId)
      .eq("kind", candidate)
      .eq("is_archived", false)
      .maybeSingle();
    if (error) {
      console.error("[settings/templates/buildUniqueKind] lookup failed", error);
      return null;
    }
    if (!data) return candidate;
    candidate = `${CUSTOM_KIND_PREFIX}${baseSlug}-${counter}`;
    counter++;
  }
  return null;
}

function validateCustomInput(input: {
  name: string;
  subject: string;
  body_html: string;
}): Result {
  const name = input.name.trim();
  if (!name || name.length > 120) {
    return { ok: false, error: "Name must be between 1 and 120 characters." };
  }
  const subject = input.subject.trim();
  if (!subject || subject.length > 200) {
    return {
      ok: false,
      error: "Subject must be between 1 and 200 characters.",
    };
  }
  return { ok: true };
}

export async function createCustomTemplate(input: {
  name: string;
  description: string;
  subject: string;
  body_html: string;
}): Promise<CreateResult> {
  const ctx = await getDsoAdminContext();
  if (!ctx.ok) return ctx;

  const tierOk = await dsoCanUseCustomTemplates(ctx.supabase, ctx.dsoId);
  if (!tierOk) {
    return {
      ok: false,
      error:
        "Custom email templates are a Growth+ feature. Upgrade to enable.",
    };
  }

  const validation = validateCustomInput(input);
  if (!validation.ok) return validation;

  const cleanBody = sanitizeTiptapHtml(input.body_html);
  if (!cleanBody.trim() || cleanBody.length > 50000) {
    return {
      ok: false,
      error: "Body must be between 1 and 50000 characters.",
    };
  }

  const kind = await buildUniqueKind(ctx.supabase, ctx.dsoId, input.name);
  if (!kind) {
    return {
      ok: false,
      error: "Couldn't pick a unique template name. Try a different one.",
    };
  }

  const { data, error } = await ctx.supabase
    .from("email_templates")
    .insert({
      dso_id: ctx.dsoId,
      kind,
      name: input.name.trim(),
      description: input.description.trim() || null,
      subject: input.subject.trim(),
      body_html: cleanBody,
      is_custom: true,
      is_archived: false,
      updated_by: ctx.user.id,
    })
    .select("id, kind")
    .single();

  if (error || !data) {
    console.error("[settings/templates/createCustomTemplate]", error);
    return { ok: false, error: "Couldn't create the template." };
  }

  revalidatePath("/employer/settings/templates");
  return { ok: true, id: data.id as string, kind: data.kind as string };
}

export async function updateCustomTemplate(input: {
  id: string;
  name: string;
  description: string;
  subject: string;
  body_html: string;
}): Promise<Result> {
  const ctx = await getDsoAdminContext();
  if (!ctx.ok) return ctx;

  const tierOk = await dsoCanUseCustomTemplates(ctx.supabase, ctx.dsoId);
  if (!tierOk) {
    return {
      ok: false,
      error:
        "Custom email templates are a Growth+ feature. Upgrade to enable.",
    };
  }

  const validation = validateCustomInput(input);
  if (!validation.ok) return validation;

  const cleanBody = sanitizeTiptapHtml(input.body_html);
  if (!cleanBody.trim() || cleanBody.length > 50000) {
    return {
      ok: false,
      error: "Body must be between 1 and 50000 characters.",
    };
  }

  // Lookup the existing row to make sure it belongs to this DSO + is
  // actually a custom template (predefined kinds are edited through
  // upsertTemplate, not here).
  const { data: existing, error: lookupErr } = await ctx.supabase
    .from("email_templates")
    .select("id, kind, is_custom")
    .eq("id", input.id)
    .eq("dso_id", ctx.dsoId)
    .maybeSingle();
  if (lookupErr || !existing) {
    return { ok: false, error: "Template not found." };
  }
  if (!(existing as { is_custom: boolean }).is_custom) {
    return { ok: false, error: "This is a predefined template. Edit it from the predefined section." };
  }

  // The kind isn't renamed on rename (preserves email_log history) —
  // only the display name + content updates.
  const { error } = await ctx.supabase
    .from("email_templates")
    .update({
      name: input.name.trim(),
      description: input.description.trim() || null,
      subject: input.subject.trim(),
      body_html: cleanBody,
      updated_by: ctx.user.id,
    })
    .eq("id", input.id)
    .eq("dso_id", ctx.dsoId);

  if (error) {
    console.error("[settings/templates/updateCustomTemplate]", error);
    return { ok: false, error: "Couldn't save the template." };
  }

  revalidatePath("/employer/settings/templates");
  return { ok: true };
}

/**
 * Soft-delete a custom template. Archived rows are excluded from the
 * editor list + the "Send custom email" picker but keep the row around
 * so existing email_log entries that reference it stay coherent.
 */
export async function archiveCustomTemplate(input: {
  id: string;
}): Promise<Result> {
  const ctx = await getDsoAdminContext();
  if (!ctx.ok) return ctx;

  const { data: existing, error: lookupErr } = await ctx.supabase
    .from("email_templates")
    .select("id, is_custom")
    .eq("id", input.id)
    .eq("dso_id", ctx.dsoId)
    .maybeSingle();
  if (lookupErr || !existing) {
    return { ok: false, error: "Template not found." };
  }
  if (!(existing as { is_custom: boolean }).is_custom) {
    return { ok: false, error: "Predefined templates can't be archived." };
  }

  const { error } = await ctx.supabase
    .from("email_templates")
    .update({ is_archived: true, updated_by: ctx.user.id })
    .eq("id", input.id)
    .eq("dso_id", ctx.dsoId);

  if (error) {
    console.error("[settings/templates/archiveCustomTemplate]", error);
    return { ok: false, error: "Couldn't archive the template." };
  }

  revalidatePath("/employer/settings/templates");
  return { ok: true };
}
