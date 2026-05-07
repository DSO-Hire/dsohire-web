"use server";

/**
 * /employer/settings/templates server actions (Phase 4.5.f).
 *
 * - upsertTemplate     — save a custom subject + body_html for one kind
 * - revertTemplate     — delete the custom row, falling back to system default
 *
 * Tier gate is checked here so Starter DSOs can't sneak past the UI lock by
 * crafting a request manually. RLS + "use server" auth still gate at the
 * server-action edge.
 *
 * "use server" rule: only async functions exported here. Constants/types
 * live in `templates-data.ts`.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  TEMPLATE_KINDS,
  type EmailTemplateKind,
} from "@/lib/email/templates/manifest";
import { dsoCanUseCustomTemplates } from "@/lib/email/templates/tier";
import { sanitizeTiptapHtml } from "@/lib/html/sanitize-tiptap";

type Result =
  | { ok: true }
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
    .select("dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) {
    return { ok: false as const, error: "No DSO membership found." };
  }
  const role = dsoUser.role as string;
  if (role !== "owner" && role !== "admin") {
    return {
      ok: false as const,
      error: "Only owners and admins can edit email templates.",
    };
  }
  return {
    ok: true as const,
    supabase,
    user,
    dsoId: dsoUser.dso_id as string,
  };
}

function isValidKind(kind: string): kind is EmailTemplateKind {
  return (TEMPLATE_KINDS as string[]).includes(kind);
}

export async function upsertTemplate(input: {
  kind: string;
  subject: string;
  body_html: string;
}): Promise<Result> {
  const ctx = await getDsoAdminContext();
  if (!ctx.ok) return ctx;

  if (!isValidKind(input.kind)) {
    return { ok: false, error: "Unknown template kind." };
  }

  const tierOk = await dsoCanUseCustomTemplates(ctx.supabase, ctx.dsoId);
  if (!tierOk) {
    return {
      ok: false,
      error:
        "Custom email templates are a Growth+ feature. Upgrade to enable.",
    };
  }

  const subject = input.subject.trim();
  if (!subject || subject.length > 200) {
    return {
      ok: false,
      error: "Subject must be between 1 and 200 characters.",
    };
  }

  // Sanitize body via the shared Tiptap sanitizer so we never persist
  // anything outside the allowlist. Keep the original Tiptap output
  // shape (wrapping <p>, etc.) — sanitizer is a passthrough for
  // allowlisted markup.
  const cleanBody = sanitizeTiptapHtml(input.body_html);
  if (!cleanBody.trim() || cleanBody.length > 50000) {
    return {
      ok: false,
      error: "Body must be between 1 and 50000 characters.",
    };
  }

  const { error } = await ctx.supabase.from("email_templates").upsert(
    {
      dso_id: ctx.dsoId,
      kind: input.kind,
      subject,
      body_html: cleanBody,
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

  if (!isValidKind(input.kind)) {
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
