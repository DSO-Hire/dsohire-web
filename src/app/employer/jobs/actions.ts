"use server";

/**
 * /employer/jobs/* server actions.
 *
 * createJob: inserts jobs row + job_locations join rows. RLS enforces that
 * the user is a recruiter+ in the DSO.
 * updateJob: updates an existing job, replaces job_locations join.
 * setJobStatus: status transitions (draft → active, paused, etc.).
 * deleteJob: soft-delete (sets deleted_at).
 */

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface JobActionState {
  ok: boolean;
  error?: string;
}

const RESERVED_JOB_SLUGS = new Set(["new", "search", "feed"]);

/* ───── Create ───── */

export async function createJob(
  _prev: JobActionState,
  formData: FormData
): Promise<JobActionState> {
  const dsoId = String(formData.get("dso_id") ?? "").trim();
  const parsed = parseJobFormData(formData);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const supabase = await createSupabaseServerClient();

  const baseSlug = makeSlug(parsed.title);
  if (!baseSlug) return { ok: false, error: "Couldn't generate a URL slug." };
  const slug = await resolveAvailableJobSlug(supabase, dsoId, baseSlug);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("dso_id", dsoId)
    .maybeSingle();

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      dso_id: dsoId,
      title: parsed.title,
      slug,
      description: parsed.description,
      employment_type: parsed.employmentType,
      role_category: parsed.roleCategory,
      compensation_min: parsed.compMin,
      compensation_max: parsed.compMax,
      compensation_period: parsed.compPeriod,
      compensation_visible: parsed.compVisible,
      benefits: parsed.benefits.length > 0 ? parsed.benefits : null,
      requirements: parsed.requirements || null,
      status: parsed.status,
      posted_at: parsed.status === "active" ? new Date().toISOString() : null,
      created_by: dsoUser?.id ?? null,
    })
    .select("id")
    .single();

  if (jobError || !job) {
    return {
      ok: false,
      error:
        jobError?.message ??
        "Failed to create job. Refresh and try again, or email cam@dsohire.com.",
    };
  }

  // Insert job_locations join rows
  if (parsed.locationIds.length > 0) {
    const locationRows = parsed.locationIds.map((locId) => ({
      job_id: job.id as string,
      location_id: locId,
    }));
    await supabase.from("job_locations").insert(locationRows);
  }

  // Insert job_skills rows
  if (parsed.skills.length > 0) {
    const skillRows = parsed.skills.map((skill) => ({
      job_id: job.id as string,
      skill,
    }));
    await supabase.from("job_skills").insert(skillRows);
  }

  redirect(`/employer/jobs/${job.id}`);
}

/* ───── Update ───── */

export async function updateJob(
  _prev: JobActionState,
  formData: FormData
): Promise<JobActionState> {
  const dsoId = String(formData.get("dso_id") ?? "").trim();
  const jobId = String(formData.get("job_id") ?? "").trim();
  if (!jobId) return { ok: false, error: "Missing job ID." };

  const parsed = parseJobFormData(formData);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const supabase = await createSupabaseServerClient();

  const { error: updateError } = await supabase
    .from("jobs")
    .update({
      title: parsed.title,
      description: parsed.description,
      employment_type: parsed.employmentType,
      role_category: parsed.roleCategory,
      compensation_min: parsed.compMin,
      compensation_max: parsed.compMax,
      compensation_period: parsed.compPeriod,
      compensation_visible: parsed.compVisible,
      benefits: parsed.benefits.length > 0 ? parsed.benefits : null,
      requirements: parsed.requirements || null,
      status: parsed.status,
      posted_at:
        parsed.status === "active" ? new Date().toISOString() : null,
    })
    .eq("id", jobId)
    .eq("dso_id", dsoId);

  if (updateError) {
    return {
      ok: false,
      error: updateError.message ?? "Failed to update job.",
    };
  }

  // Replace job_locations
  await supabase.from("job_locations").delete().eq("job_id", jobId);
  if (parsed.locationIds.length > 0) {
    await supabase.from("job_locations").insert(
      parsed.locationIds.map((locId) => ({
        job_id: jobId,
        location_id: locId,
      }))
    );
  }

  // Replace job_skills
  await supabase.from("job_skills").delete().eq("job_id", jobId);
  if (parsed.skills.length > 0) {
    await supabase.from("job_skills").insert(
      parsed.skills.map((skill) => ({ job_id: jobId, skill }))
    );
  }

  return { ok: true };
}

/* ───── Status transitions / soft delete ───── */

export async function setJobStatus(
  _prev: JobActionState,
  formData: FormData
): Promise<JobActionState> {
  const jobId = String(formData.get("job_id") ?? "").trim();
  const newStatus = String(formData.get("new_status") ?? "").trim();

  if (!jobId || !newStatus) {
    return { ok: false, error: "Missing job or status." };
  }

  const supabase = await createSupabaseServerClient();

  const update: Record<string, unknown> = { status: newStatus };
  if (newStatus === "active") update.posted_at = new Date().toISOString();

  const { error } = await supabase.from("jobs").update(update).eq("id", jobId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function softDeleteJob(
  _prev: JobActionState,
  formData: FormData
): Promise<JobActionState> {
  const jobId = String(formData.get("job_id") ?? "").trim();
  if (!jobId) return { ok: false, error: "Missing job ID." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("jobs")
    .update({ deleted_at: new Date().toISOString(), status: "archived" })
    .eq("id", jobId);

  if (error) return { ok: false, error: error.message };
  redirect("/employer/jobs");
}

/* ───── Shared parsing ───── */

interface ParsedJobInput {
  title: string;
  description: string;
  employmentType: string;
  roleCategory: string;
  compMin: number | null;
  compMax: number | null;
  compPeriod: string | null;
  compVisible: boolean;
  benefits: string[];
  requirements: string;
  status: string;
  locationIds: string[];
  skills: string[];
}

function parseJobFormData(
  formData: FormData
): ParsedJobInput | { error: string } {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const employmentType = String(formData.get("employment_type") ?? "full_time");
  const roleCategory = String(formData.get("role_category") ?? "other");
  const compMinRaw = String(formData.get("compensation_min") ?? "").trim();
  const compMaxRaw = String(formData.get("compensation_max") ?? "").trim();
  const compPeriod = String(formData.get("compensation_period") ?? "").trim();
  const compVisible = formData.get("compensation_visible") === "on";
  const benefitsRaw = String(formData.get("benefits") ?? "").trim();
  const requirements = String(formData.get("requirements") ?? "").trim();
  const status = String(formData.get("status") ?? "draft");
  const skillsRaw = String(formData.get("skills") ?? "").trim();

  if (!title) return { error: "Job title is required." };
  if (title.length > 200) return { error: "Job title is too long." };
  if (!description || description === "<p></p>") {
    return { error: "Job description is required." };
  }

  const locationIds = formData
    .getAll("location_ids")
    .map((v) => String(v).trim())
    .filter(Boolean);

  if (locationIds.length === 0) {
    return { error: "Pick at least one practice location for this job." };
  }

  const compMin = compMinRaw ? parseInt(compMinRaw, 10) : null;
  const compMax = compMaxRaw ? parseInt(compMaxRaw, 10) : null;
  if (compMin !== null && Number.isNaN(compMin)) {
    return { error: "Min compensation must be a number." };
  }
  if (compMax !== null && Number.isNaN(compMax)) {
    return { error: "Max compensation must be a number." };
  }

  const benefits = benefitsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const skills = skillsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    title,
    description,
    employmentType,
    roleCategory,
    compMin,
    compMax,
    compPeriod: compPeriod || null,
    compVisible,
    benefits,
    requirements,
    status,
    locationIds,
    skills,
  };
}

function makeSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 80);
}

async function resolveAvailableJobSlug(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  dsoId: string,
  baseSlug: string
): Promise<string> {
  if (RESERVED_JOB_SLUGS.has(baseSlug)) {
    return resolveAvailableJobSlug(supabase, dsoId, `${baseSlug}-job`);
  }
  const { data: existing } = await supabase
    .from("jobs")
    .select("id")
    .eq("dso_id", dsoId)
    .eq("slug", baseSlug)
    .maybeSingle();
  if (!existing) return baseSlug;
  for (let i = 2; i <= 99; i++) {
    const candidate = `${baseSlug}-${i}`;
    const { data: clash } = await supabase
      .from("jobs")
      .select("id")
      .eq("dso_id", dsoId)
      .eq("slug", candidate)
      .maybeSingle();
    if (!clash) return candidate;
  }
  return `${baseSlug}-${Math.floor(Math.random() * 100000)}`;
}
