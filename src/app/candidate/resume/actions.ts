"use server";

/**
 * #87b — save the generated résumé PDF to the candidate's profile.
 *
 * Renders the same @react-pdf document the download route uses, uploads it to
 * the `resumes` storage bucket, and points candidates.resume_url at it — so
 * the built résumé becomes the file attached to applications (same column the
 * upload path writes). This is what turns "build" into a real, reusable
 * artifact rather than a one-off browser print.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getResumeData, getResumeTemplateId } from "@/lib/resume/resume-data";
import { renderResumePdfBuffer } from "@/components/resume/resume-pdf-document";
import {
  getResumeTemplate,
  type ResumeTemplateId,
} from "@/lib/resume/resume-templates";

export async function saveResumePdf(): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const data = await getResumeData();
  if (!data) return { ok: false, error: "We couldn't find your profile." };

  const template = await getResumeTemplateId();
  let buffer: Buffer;
  try {
    buffer = await renderResumePdfBuffer(data, template);
  } catch {
    return { ok: false, error: "Couldn't generate the PDF. Please try again." };
  }

  const path = `${user.id}/${Date.now()}-resume.pdf`;
  const { error: upErr } = await supabase.storage
    .from("resumes")
    .upload(path, buffer, { contentType: "application/pdf", upsert: true });
  if (upErr) return { ok: false, error: upErr.message };

  const { data: pub } = supabase.storage.from("resumes").getPublicUrl(path);

  const { error: updErr } = await supabase
    .from("candidates")
    .update({ resume_url: pub.publicUrl })
    .eq("auth_user_id", user.id);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/candidate/profile");
  revalidatePath("/candidate/resume");
  return { ok: true };
}

/** Persist the candidate's chosen résumé template (presentation only). */
export async function setResumeTemplate(
  template: ResumeTemplateId
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const id = getResumeTemplate(template).id; // normalize / validate
  const { error } = await supabase
    .from("candidates")
    .update({ resume_template: id })
    .eq("auth_user_id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/candidate/resume");
  return { ok: true };
}
