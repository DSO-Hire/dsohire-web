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

import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getResumeData } from "@/lib/resume/resume-data";
import { ResumePdfDocument } from "@/components/resume/resume-pdf-document";

export async function saveResumePdf(): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You're not signed in." };

  const data = await getResumeData();
  if (!data) return { ok: false, error: "We couldn't find your profile." };

  let buffer: Buffer;
  try {
    buffer = await renderToBuffer(createElement(ResumePdfDocument, { data }));
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
