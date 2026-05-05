"use server";

/**
 * /employer/jobs/* server actions.
 *
 * createJob: inserts jobs row + job_locations + job_skills + screening
 *   questions. RLS enforces that the user is a recruiter+ in the DSO.
 * updateJob: updates an existing job, replaces job_locations / job_skills /
 *   screening questions to match the submitted payload.
 * setJobStatus: status transitions (draft → active, paused, etc.).
 * softDeleteJob: soft-delete (sets deleted_at).
 *
 * Screening questions arrive as a JSON-encoded `screening_questions` form
 * field. Each item: { id (null on new), prompt, helper_text, kind, options,
 * required, sort_order }. Sync strategy on update:
 *   - rows in payload with id → upsert (update prompt/helper/kind/options/required/sort_order)
 *   - rows in payload without id → insert
 *   - rows in DB not in payload → delete (cascade clears any answers, but
 *     in practice answers shouldn't exist for a question that was just
 *     created in this same session)
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireActiveSubscriptionError } from "@/lib/billing/subscription";

export interface JobActionState {
  ok: boolean;
  error?: string;
}

interface ScreeningQuestionPayload {
  id: string | null;
  prompt: string;
  helper_text: string | null;
  kind:
    | "short_text"
    | "long_text"
    | "yes_no"
    | "single_select"
    | "multi_select"
    | "number";
  options: Array<{ id: string; label: string }> | null;
  required: boolean;
  sort_order: number;
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

  // Feature gate — block job creation behind an active subscription.
  const billingError = await requireActiveSubscriptionError(supabase, dsoId);
  if (billingError) return { ok: false, error: billingError };

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
      hide_stages_from_candidate: parsed.hideStagesFromCandidate,
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

  // Insert screening questions (create mode — all rows are new)
  if (parsed.screeningQuestions.length > 0) {
    const rows = parsed.screeningQuestions.map((q) => ({
      job_id: job.id as string,
      prompt: q.prompt,
      helper_text: q.helper_text,
      kind: q.kind,
      options: q.options,
      required: q.required,
      sort_order: q.sort_order,
    }));
    const { error: qError } = await supabase
      .from("job_screening_questions")
      .insert(rows);
    if (qError) {
      // Job is already inserted; surface the error so the user can re-try
      // editing the job directly.
      return {
        ok: false,
        error: `Job created, but couldn't save screening questions: ${qError.message}. Edit the job to retry.`,
      };
    }
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
      hide_stages_from_candidate: parsed.hideStagesFromCandidate,
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

  // Sync screening questions: keep existing rows whose id is in the payload
  // (update them), insert payload rows without an id, delete DB rows not in
  // payload.
  const incomingIds = new Set(
    parsed.screeningQuestions
      .map((q) => q.id)
      .filter((id): id is string => id !== null)
  );

  // 1. Delete questions whose id is NOT in the incoming set
  if (incomingIds.size > 0) {
    await supabase
      .from("job_screening_questions")
      .delete()
      .eq("job_id", jobId)
      .not("id", "in", `(${[...incomingIds].map((id) => `"${id}"`).join(",")})`);
  } else {
    await supabase
      .from("job_screening_questions")
      .delete()
      .eq("job_id", jobId);
  }

  // 2. Update existing rows
  for (const q of parsed.screeningQuestions) {
    if (q.id) {
      const { error: updateQErr } = await supabase
        .from("job_screening_questions")
        .update({
          prompt: q.prompt,
          helper_text: q.helper_text,
          kind: q.kind,
          options: q.options,
          required: q.required,
          sort_order: q.sort_order,
        })
        .eq("id", q.id)
        .eq("job_id", jobId);
      if (updateQErr) {
        return {
          ok: false,
          error: `Couldn't update screening question: ${updateQErr.message}`,
        };
      }
    }
  }

  // 3. Insert new rows
  const newRows = parsed.screeningQuestions
    .filter((q) => !q.id)
    .map((q) => ({
      job_id: jobId,
      prompt: q.prompt,
      helper_text: q.helper_text,
      kind: q.kind,
      options: q.options,
      required: q.required,
      sort_order: q.sort_order,
    }));
  if (newRows.length > 0) {
    const { error: insertQErr } = await supabase
      .from("job_screening_questions")
      .insert(newRows);
    if (insertQErr) {
      return {
        ok: false,
        error: `Couldn't add new screening question: ${insertQErr.message}`,
      };
    }
  }

  // Revalidate the public job page so candidates see the updated questions.
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/apply`);
  revalidatePath(`/employer/jobs/${jobId}`);

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
  screeningQuestions: ScreeningQuestionPayload[];
  hideStagesFromCandidate: boolean;
}

const VALID_KINDS: Set<ScreeningQuestionPayload["kind"]> = new Set([
  "short_text",
  "long_text",
  "yes_no",
  "single_select",
  "multi_select",
  "number",
]);

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
  const hideStagesFromCandidate =
    formData.get("hide_stages_from_candidate") === "on";
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

  // Screening questions — JSON-encoded array
  const rawQuestions = String(formData.get("screening_questions") ?? "").trim();
  let screeningQuestions: ScreeningQuestionPayload[] = [];
  if (rawQuestions) {
    let parsedRaw: unknown;
    try {
      parsedRaw = JSON.parse(rawQuestions);
    } catch {
      return { error: "Couldn't parse screening questions payload." };
    }
    if (!Array.isArray(parsedRaw)) {
      return { error: "Screening questions payload must be an array." };
    }
    for (let i = 0; i < parsedRaw.length; i++) {
      const raw = parsedRaw[i] as Record<string, unknown>;
      const prompt = String(raw.prompt ?? "").trim();
      if (!prompt) return { error: `Question ${i + 1}: prompt is empty.` };
      const kind = String(raw.kind ?? "");
      if (!VALID_KINDS.has(kind as ScreeningQuestionPayload["kind"])) {
        return { error: `Question ${i + 1}: invalid kind "${kind}".` };
      }
      const required = Boolean(raw.required);
      const sortOrder =
        typeof raw.sort_order === "number" ? raw.sort_order : i;
      const helperText =
        raw.helper_text === null || raw.helper_text === undefined
          ? null
          : String(raw.helper_text).trim() || null;
      const id =
        raw.id === null || raw.id === undefined || raw.id === ""
          ? null
          : String(raw.id);

      let options: ScreeningQuestionPayload["options"] = null;
      if (kind === "single_select" || kind === "multi_select") {
        const rawOpts = raw.options;
        if (!Array.isArray(rawOpts) || rawOpts.length < 2) {
          return {
            error: `Question ${i + 1}: needs at least 2 options.`,
          };
        }
        options = [];
        for (let j = 0; j < rawOpts.length; j++) {
          const o = rawOpts[j] as Record<string, unknown>;
          const optId = String(o.id ?? "").trim();
          const label = String(o.label ?? "").trim();
          if (!optId || !label) {
            return {
              error: `Question ${i + 1}: option ${j + 1} is incomplete.`,
            };
          }
          options.push({ id: optId, label });
        }
      }

      screeningQuestions.push({
        id,
        prompt,
        helper_text: helperText,
        kind: kind as ScreeningQuestionPayload["kind"],
        options,
        required,
        sort_order: sortOrder,
      });
    }
    // Re-number sort_order to match the array order (defensive — the wizard
    // submits them in order, but if a custom client sends weird values we
    // overwrite).
    screeningQuestions = screeningQuestions.map((q, idx) => ({
      ...q,
      sort_order: idx,
    }));
  }

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
    screeningQuestions,
    hideStagesFromCandidate,
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
