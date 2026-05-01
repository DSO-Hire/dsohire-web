"use server";

/**
 * /candidate/profile server action — save candidate profile fields.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ProfileState {
  ok: boolean;
  error?: string;
  message?: string;
}

const RESUME_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const RESUME_MAX_BYTES = 10 * 1024 * 1024;

const VALID_AVAILABILITY = new Set(["immediate", "2_weeks", "1_month", "passive"]);

export async function saveCandidateProfile(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired." };

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, resume_url")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) return { ok: false, error: "Candidate profile not found." };

  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const headline = String(formData.get("headline") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  const currentTitle = String(formData.get("current_title") ?? "").trim();
  const yearsRaw = String(formData.get("years_experience") ?? "").trim();
  const desiredRolesRaw = String(formData.get("desired_roles") ?? "").trim();
  const desiredLocationsRaw = String(formData.get("desired_locations") ?? "").trim();
  const availability = String(formData.get("availability") ?? "").trim();
  const linkedinUrl = String(formData.get("linkedin_url") ?? "").trim();
  const isSearchable = formData.get("is_searchable") === "on";
  const resumeFile = formData.get("resume") as File | null;

  if (!fullName) {
    return { ok: false, error: "Full name is required." };
  }

  const yearsExperience = yearsRaw ? parseInt(yearsRaw, 10) : null;
  if (yearsRaw && (Number.isNaN(yearsExperience) || (yearsExperience ?? 0) < 0)) {
    return { ok: false, error: "Years of experience must be a positive number." };
  }

  const desiredRoles = desiredRolesRaw
    ? desiredRolesRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const desiredLocations = desiredLocationsRaw
    ? desiredLocationsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  // Resume upload (optional)
  let resumeUrl: string | null = (candidate.resume_url as string | null) ?? null;
  if (resumeFile && resumeFile.size > 0) {
    if (!RESUME_MIME.has(resumeFile.type)) {
      return {
        ok: false,
        error: "Resume must be a PDF or Word document (.pdf, .doc, .docx).",
      };
    }
    if (resumeFile.size > RESUME_MAX_BYTES) {
      return { ok: false, error: "Resume file too large (10 MB max)." };
    }
    const safeName = resumeFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${user.id}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("resumes")
      .upload(path, resumeFile, { contentType: resumeFile.type, upsert: false });
    if (uploadError) {
      return { ok: false, error: `Resume upload failed: ${uploadError.message}` };
    }
    resumeUrl = path;
  }

  const { error } = await supabase
    .from("candidates")
    .update({
      full_name: fullName,
      phone: phone || null,
      headline: headline || null,
      summary: summary || null,
      current_title: currentTitle || null,
      years_experience: yearsExperience,
      desired_roles: desiredRoles.length > 0 ? desiredRoles : null,
      desired_locations: desiredLocations.length > 0 ? desiredLocations : null,
      availability: VALID_AVAILABILITY.has(availability) ? availability : null,
      linkedin_url: linkedinUrl || null,
      resume_url: resumeUrl,
      is_searchable: isSearchable,
    })
    .eq("id", candidate.id as string);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/candidate/dashboard");
  revalidatePath("/candidate/profile");
  return { ok: true, message: "Profile saved." };
}
