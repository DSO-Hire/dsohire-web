"use server";

/**
 * Outreach template CRUD (E7.11 / Phase 5D Day 2).
 *
 * Server actions called from the templates management page and the
 * outreach modal. RLS enforces recruiter+ write + DSO-scoped read.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface TemplateActionResult {
  ok: boolean;
  error?: string;
  templateId?: string;
}

export async function createOutreachTemplate(formData: FormData): Promise<TemplateActionResult> {
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 200);
  const body = String(formData.get("body") ?? "").trim();
  if (!name) return { ok: false, error: "Template name is required." };
  if (!subject) return { ok: false, error: "Subject is required." };
  if (!body) return { ok: false, error: "Body is required." };
  if (body.length > 8000) {
    return { ok: false, error: "Body is too long (max 8000 characters)." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) return { ok: false, error: "No DSO context." };

  const { data: inserted, error } = await supabase
    .from("dso_outreach_templates")
    .insert({
      dso_id: dsoUser.dso_id as string,
      name,
      subject,
      body,
      created_by: dsoUser.id as string,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "Couldn't save template." };
  }

  revalidatePath("/employer/settings/outreach-templates");
  return { ok: true, templateId: inserted.id as string };
}

export async function updateOutreachTemplate(formData: FormData): Promise<TemplateActionResult> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 200);
  const body = String(formData.get("body") ?? "").trim();
  if (!id) return { ok: false, error: "Missing template ID." };
  if (!name || !subject || !body) {
    return { ok: false, error: "Name, subject, and body are all required." };
  }

  const supabase = await createSupabaseServerClient();
  const { error, data } = await supabase
    .from("dso_outreach_templates")
    .update({ name, subject, body })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Not found or permission denied." };
  }

  revalidatePath("/employer/settings/outreach-templates");
  return { ok: true, templateId: id };
}

export async function deleteOutreachTemplate(id: string): Promise<TemplateActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error, data } = await supabase
    .from("dso_outreach_templates")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Not found or permission denied." };
  }
  revalidatePath("/employer/settings/outreach-templates");
  return { ok: true };
}
