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
import { dispatchInboxSystemMessage } from "@/lib/inbox/dispatch-system";
import { requireActiveSubscriptionError } from "@/lib/billing/subscription";
import { recordAuditEvent } from "@/lib/audit/record";
import { SUPPORT_EMAIL } from "@/lib/contact";

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
      compensation_type: parsed.compType,
      compensation_visible: parsed.compVisible,
      benefits: parsed.benefits.length > 0 ? parsed.benefits : null,
      requirements: parsed.requirements || null,
      status: parsed.status,
      hide_stages_from_candidate: parsed.hideStagesFromCandidate,
      specialty: parsed.specialty,
      min_years_experience: parsed.minYearsExperience,
      schedule_days: parsed.scheduleDays,
      schedule_evenings: parsed.scheduleEvenings,
      schedule_weekends: parsed.scheduleWeekends,
      scope: parsed.scope,
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
        `Failed to create job. Refresh and try again, or email ${SUPPORT_EMAIL}.`,
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

  // Audit log (Phase 4.5.e). Must run BEFORE redirect — redirect() throws
  // and would skip the await.
  await recordAuditEvent({
    dsoId,
    actorUserId: user.id,
    actorDsoUserId: dsoUser?.id ?? null,
    eventKind: "job.created",
    targetTable: "jobs",
    targetId: job.id as string,
    summary:
      parsed.status === "active"
        ? `Posted "${parsed.title}"`
        : `Drafted "${parsed.title}"`,
    metadata: {
      job_id: job.id,
      title: parsed.title,
      status: parsed.status,
      role_category: parsed.roleCategory,
      employment_type: parsed.employmentType,
      location_count: parsed.locationIds.length,
    },
  });

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
      compensation_type: parsed.compType,
      compensation_visible: parsed.compVisible,
      benefits: parsed.benefits.length > 0 ? parsed.benefits : null,
      requirements: parsed.requirements || null,
      status: parsed.status,
      hide_stages_from_candidate: parsed.hideStagesFromCandidate,
      specialty: parsed.specialty,
      min_years_experience: parsed.minYearsExperience,
      schedule_days: parsed.scheduleDays,
      schedule_evenings: parsed.scheduleEvenings,
      schedule_weekends: parsed.scheduleWeekends,
      scope: parsed.scope,
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

  // Audit log (Phase 4.5.e completion).
  void emitJobAuditEvent(supabase, dsoId, jobId, {
    eventKind: "job.updated",
    summary: `Updated "${parsed.title}"`,
    metadata: {
      job_id: jobId,
      title: parsed.title,
      status: parsed.status,
      section: "all",
    },
  });

  return { ok: true };
}

/* ───── Per-section saves (Phase 4.7.b — sectioned edit page) ───── */

/**
 * Update Basics section only: title, role_category, employment_type,
 * job_locations (replace). Slug is left as-is on edit (changing it would
 * break inbound links and SEO).
 */
export async function updateJobBasicsSection(
  _prev: JobActionState,
  formData: FormData
): Promise<JobActionState> {
  const jobId = String(formData.get("job_id") ?? "").trim();
  const dsoId = String(formData.get("dso_id") ?? "").trim();
  if (!jobId || !dsoId) return { ok: false, error: "Missing job or DSO." };

  const title = String(formData.get("title") ?? "").trim();
  const roleCategory = String(formData.get("role_category") ?? "other");
  const employmentType = String(formData.get("employment_type") ?? "full_time");
  const scopeRaw = String(formData.get("scope") ?? "location").trim();
  const scope = (
    VALID_SCOPES.has(scopeRaw as "location" | "regional" | "corporate")
      ? scopeRaw
      : "location"
  ) as "location" | "regional" | "corporate";
  const locationIds = formData
    .getAll("location_ids")
    .map((v) => String(v).trim())
    .filter(Boolean);

  if (!title) return { ok: false, error: "Job title is required." };
  if (title.length > 200) return { ok: false, error: "Job title is too long." };
  if (locationIds.length === 0) {
    return { ok: false, error: "Pick at least one practice location." };
  }

  const supabase = await createSupabaseServerClient();

  const { error: updateError } = await supabase
    .from("jobs")
    .update({
      title,
      role_category: roleCategory,
      employment_type: employmentType,
      scope,
    })
    .eq("id", jobId)
    .eq("dso_id", dsoId);
  if (updateError) return { ok: false, error: updateError.message };

  await supabase.from("job_locations").delete().eq("job_id", jobId);
  await supabase.from("job_locations").insert(
    locationIds.map((locId) => ({ job_id: jobId, location_id: locId }))
  );

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/employer/jobs/${jobId}`);
  revalidatePath(`/employer/jobs/${jobId}/edit`);

  void emitJobAuditEvent(supabase, dsoId, jobId, {
    eventKind: "job.updated",
    summary: `Updated basics on "${title}"`,
    metadata: { job_id: jobId, title, section: "basics" },
  });

  return { ok: true };
}

/**
 * Update Description section only (the rich-text body).
 */
export async function updateJobDescriptionSection(
  _prev: JobActionState,
  formData: FormData
): Promise<JobActionState> {
  const jobId = String(formData.get("job_id") ?? "").trim();
  const dsoId = String(formData.get("dso_id") ?? "").trim();
  if (!jobId || !dsoId) return { ok: false, error: "Missing job or DSO." };

  const description = String(formData.get("description") ?? "").trim();
  if (!description || description === "<p></p>") {
    return { ok: false, error: "Job description can't be empty." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("jobs")
    .update({ description })
    .eq("id", jobId)
    .eq("dso_id", dsoId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/employer/jobs/${jobId}/edit`);

  void emitJobAuditEvent(supabase, dsoId, jobId, {
    eventKind: "job.updated",
    summary: `Updated description`,
    metadata: { job_id: jobId, section: "description" },
  });

  return { ok: true };
}

/**
 * Update Compensation & Details section: comp range/period/visible,
 * benefits, requirements, candidate-visibility toggle, plus job_skills
 * (replace).
 */
export async function updateJobDetailsSection(
  _prev: JobActionState,
  formData: FormData
): Promise<JobActionState> {
  const jobId = String(formData.get("job_id") ?? "").trim();
  const dsoId = String(formData.get("dso_id") ?? "").trim();
  if (!jobId || !dsoId) return { ok: false, error: "Missing job or DSO." };

  const compMinRaw = String(formData.get("compensation_min") ?? "").trim();
  const compMaxRaw = String(formData.get("compensation_max") ?? "").trim();
  const compPeriodRaw = String(formData.get("compensation_period") ?? "").trim();
  // v1.8
  const compTypeRawEdit = String(formData.get("compensation_type") ?? "range").trim();
  const compTypeEdit: "range" | "starting_at" | "up_to" | "exact" | "doe" =
    ["range", "starting_at", "up_to", "exact", "doe"].includes(compTypeRawEdit)
      ? (compTypeRawEdit as "range" | "starting_at" | "up_to" | "exact" | "doe")
      : "range";
  const compVisible = formData.get("compensation_visible") === "on";
  const hideStagesFromCandidate =
    formData.get("hide_stages_from_candidate") === "on";
  // v1.6 — chip-picker multi-value path with CSV legacy fallback.
  const skillsMulti = formData
    .getAll("skills")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const benefitsMulti = formData
    .getAll("benefits")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const skillsCsv =
    skillsMulti.length === 1 && skillsMulti[0].includes(",")
      ? skillsMulti[0]
      : "";
  const benefitsCsv =
    benefitsMulti.length === 1 && benefitsMulti[0].includes(",")
      ? benefitsMulti[0]
      : "";
  const requirements = String(formData.get("requirements") ?? "").trim();

  const compMin = compMinRaw ? parseInt(compMinRaw, 10) : null;
  const compMax = compMaxRaw ? parseInt(compMaxRaw, 10) : null;
  if (compMin !== null && Number.isNaN(compMin)) {
    return { ok: false, error: "Min compensation must be a number." };
  }
  if (compMax !== null && Number.isNaN(compMax)) {
    return { ok: false, error: "Max compensation must be a number." };
  }

  const benefits = benefitsMulti.length > 0 && !benefitsCsv
    ? benefitsMulti
    : benefitsCsv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  const skills = skillsMulti.length > 0 && !skillsCsv
    ? skillsMulti
    : skillsCsv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

  // v1.1 — multi-select specialty + optional min years of experience.
  const specialty = formData
    .getAll("specialty")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const minYearsRaw = String(formData.get("min_years_experience") ?? "").trim();
  const minYearsExperience = minYearsRaw ? parseInt(minYearsRaw, 10) : null;
  if (minYearsExperience !== null && Number.isNaN(minYearsExperience)) {
    return { ok: false, error: "Min years of experience must be a number." };
  }
  if (minYearsExperience !== null && minYearsExperience < 0) {
    return { ok: false, error: "Min years of experience can't be negative." };
  }

  // Track F — schedule overlap inputs.
  const validDayKeys = new Set([
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
    "sat",
    "sun",
  ]);
  const scheduleDays = formData
    .getAll("schedule_days")
    .map((v) => String(v).trim().toLowerCase())
    .filter((v) => validDayKeys.has(v));
  const scheduleEvenings = formData.get("schedule_evenings") === "on";
  const scheduleWeekends = formData.get("schedule_weekends") === "on";

  const supabase = await createSupabaseServerClient();
  const { error: updateError } = await supabase
    .from("jobs")
    .update({
      compensation_min: compMin,
      compensation_max: compMax,
      compensation_period: compPeriodRaw || null,
      compensation_type: compTypeEdit,
      compensation_visible: compVisible,
      benefits: benefits.length > 0 ? benefits : null,
      requirements: requirements || null,
      hide_stages_from_candidate: hideStagesFromCandidate,
      specialty,
      min_years_experience: minYearsExperience,
      schedule_days: scheduleDays,
      schedule_evenings: scheduleEvenings,
      schedule_weekends: scheduleWeekends,
    })
    .eq("id", jobId)
    .eq("dso_id", dsoId);
  if (updateError) return { ok: false, error: updateError.message };

  await supabase.from("job_skills").delete().eq("job_id", jobId);
  if (skills.length > 0) {
    await supabase.from("job_skills").insert(
      skills.map((skill) => ({ job_id: jobId, skill }))
    );
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/employer/jobs/${jobId}/edit`);

  void emitJobAuditEvent(supabase, dsoId, jobId, {
    eventKind: "job.updated",
    summary: `Updated compensation & details`,
    metadata: {
      job_id: jobId,
      section: "details",
      compensation_visible: compVisible,
      hide_stages_from_candidate: hideStagesFromCandidate,
    },
  });

  return { ok: true };
}

/**
 * Update Screening Questions section: full sync of job_screening_questions
 * to match the submitted payload (mirrors the logic in updateJob).
 */
export async function updateJobScreeningSection(
  _prev: JobActionState,
  formData: FormData
): Promise<JobActionState> {
  const jobId = String(formData.get("job_id") ?? "").trim();
  const dsoId = String(formData.get("dso_id") ?? "").trim();
  if (!jobId || !dsoId) return { ok: false, error: "Missing job or DSO." };

  const rawQuestions = String(formData.get("screening_questions") ?? "").trim();
  let parsedRaw: unknown = [];
  if (rawQuestions) {
    try {
      parsedRaw = JSON.parse(rawQuestions);
    } catch {
      return { ok: false, error: "Couldn't parse screening questions payload." };
    }
  }
  if (!Array.isArray(parsedRaw)) {
    return { ok: false, error: "Screening questions payload must be an array." };
  }

  const screening: ScreeningQuestionPayload[] = [];
  for (let i = 0; i < parsedRaw.length; i++) {
    const raw = parsedRaw[i] as Record<string, unknown>;
    const prompt = String(raw.prompt ?? "").trim();
    if (!prompt) return { ok: false, error: `Question ${i + 1}: prompt is empty.` };
    const kind = String(raw.kind ?? "");
    if (!VALID_KINDS.has(kind as ScreeningQuestionPayload["kind"])) {
      return { ok: false, error: `Question ${i + 1}: invalid kind "${kind}".` };
    }
    const required = Boolean(raw.required);
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
        return { ok: false, error: `Question ${i + 1}: needs at least 2 options.` };
      }
      options = [];
      for (let j = 0; j < rawOpts.length; j++) {
        const o = rawOpts[j] as Record<string, unknown>;
        const optId = String(o.id ?? "").trim();
        const label = String(o.label ?? "").trim();
        if (!optId || !label) {
          return { ok: false, error: `Question ${i + 1}: option ${j + 1} is incomplete.` };
        }
        options.push({ id: optId, label });
      }
    }
    screening.push({
      id,
      prompt,
      helper_text: helperText,
      kind: kind as ScreeningQuestionPayload["kind"],
      options,
      required,
      sort_order: i,
    });
  }

  const supabase = await createSupabaseServerClient();

  const incomingIds = new Set(
    screening.map((q) => q.id).filter((id): id is string => id !== null)
  );
  if (incomingIds.size > 0) {
    await supabase
      .from("job_screening_questions")
      .delete()
      .eq("job_id", jobId)
      .not("id", "in", `(${[...incomingIds].map((id) => `"${id}"`).join(",")})`);
  } else {
    await supabase.from("job_screening_questions").delete().eq("job_id", jobId);
  }

  for (const q of screening) {
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
        return { ok: false, error: `Couldn't update screening question: ${updateQErr.message}` };
      }
    }
  }

  const newRows = screening
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
      return { ok: false, error: `Couldn't add new screening question: ${insertQErr.message}` };
    }
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/apply`);
  revalidatePath(`/employer/jobs/${jobId}/edit`);

  void emitJobAuditEvent(supabase, dsoId, jobId, {
    eventKind: "job.updated",
    summary: `Updated screening questions (${screening.length} ${screening.length === 1 ? "question" : "questions"})`,
    metadata: {
      job_id: jobId,
      section: "screening",
      question_count: screening.length,
    },
  });

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

  // Snapshot the prior status + the title (for system-message body) so
  // we know whether this transition is the "filled" event we want to
  // broadcast to applicants.
  const { data: priorJob } = await supabase
    .from("jobs")
    .select("status, title")
    .eq("id", jobId)
    .maybeSingle();
  const priorStatus = (priorJob as Record<string, unknown> | null)?.status as
    | string
    | null;
  const jobTitle =
    ((priorJob as Record<string, unknown> | null)?.title as string | null) ??
    "the job";

  const update: Record<string, unknown> = { status: newStatus };
  if (newStatus === "active") update.posted_at = new Date().toISOString();

  const { error } = await supabase.from("jobs").update(update).eq("id", jobId);
  if (error) return { ok: false, error: error.message };

  // Phase 4.8 follow-up — broadcast a job_filled inbox message to every
  // active applicant when the status transitions to 'filled'. Skip when
  // the prior status was already 'filled' (idempotent against double-clicks).
  //
  // Post-Path-B (Track B pipeline-stages): applications.status is gone.
  // Resolve the DSO's terminal stage IDs (hired/rejected/withdrawn) so
  // we can NOT-IN filter on stage_id, then dispatch to everyone else.
  if (newStatus === "filled" && priorStatus !== "filled") {
    const { data: jobScope } = await supabase
      .from("jobs")
      .select("dso_id")
      .eq("id", jobId)
      .maybeSingle();
    const jobDsoId =
      (jobScope as Record<string, unknown> | null)?.dso_id as string | null;
    if (jobDsoId) {
      const { data: terminalStageRows } = await supabase
        .from("dso_pipeline_stages")
        .select("id")
        .eq("dso_id", jobDsoId)
        .in("kind", ["hired", "rejected", "withdrawn"]);
      const terminalStageIds = (
        (terminalStageRows ?? []) as Array<{ id: string }>
      ).map((r) => r.id);
      let appsQuery = supabase
        .from("applications")
        .select("id")
        .eq("job_id", jobId);
      if (terminalStageIds.length > 0) {
        appsQuery = appsQuery.not(
          "stage_id",
          "in",
          `(${terminalStageIds.map((id) => `"${id}"`).join(",")})`
        );
      }
      const { data: activeApps } = await appsQuery;
      for (const app of (activeApps ?? []) as Array<Record<string, unknown>>) {
        void dispatchInboxSystemMessage({
          applicationId: app.id as string,
          eventKind: "job_filled",
          senderRole: "employer",
          body: `${jobTitle} has been filled. Thanks for your interest — we'll let you know about future openings.`,
        });
      }
    }
  }

  // Audit log (Phase 4.5.e completion). Resolve dso_id off the job since
  // setJobStatus doesn't accept one in the form payload.
  if (priorStatus !== newStatus) {
    const { data: jobRow } = await supabase
      .from("jobs")
      .select("dso_id")
      .eq("id", jobId)
      .maybeSingle();
    const dsoId = (jobRow as { dso_id: string } | null)?.dso_id ?? null;
    if (dsoId) {
      const verbByStatus: Record<string, string> = {
        active: "Activated",
        paused: "Paused",
        filled: "Marked as filled",
        archived: "Archived",
        draft: "Reverted to draft",
        closed: "Closed",
      };
      const verb = verbByStatus[newStatus] ?? `Set status to ${newStatus}`;
      void emitJobAuditEvent(supabase, dsoId, jobId, {
        eventKind: "job.status_changed",
        summary: `${verb} "${jobTitle}"`,
        metadata: {
          job_id: jobId,
          title: jobTitle,
          from_status: priorStatus,
          to_status: newStatus,
        },
      });
    }
  }

  return { ok: true };
}

/**
 * Clone an existing job (E1.15 / Cam re-audit 2026-05-11).
 *
 * Universal ATS pattern absent from the dental cluster — saves the
 * employer from re-creating a near-duplicate job by hand. Copies:
 *   - jobs row (title prefixed "Copy of …", new slug, status = draft,
 *     fresh views/applications_count, no posted_at)
 *   - job_locations join rows
 *   - job_skills join rows
 *   - job_screening_questions rows (new IDs, same content)
 *
 * Does NOT copy:
 *   - job_attachments — storage objects are job-scoped, and copying
 *     binaries between jobs has ambiguous semantics (does the new job
 *     own a fresh signed-URL surface, or share?). Skip for v1; the
 *     employer can re-upload in the cloned job's edit page.
 *   - applications — applications are tied to the source job, not its
 *     clone.
 *
 * Redirects to /employer/jobs/{newId}/edit on success.
 */
export async function cloneJob(formData: FormData): Promise<void> {
  const jobId = String(formData.get("job_id") ?? "").trim();
  if (!jobId) return;

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  // 1. Read source job + DSO context.
  const { data: src, error: srcErr } = await supabase
    .from("jobs")
    .select(
      "id, dso_id, title, description, employment_type, role_category, compensation_min, compensation_max, compensation_period, compensation_type, compensation_visible, benefits, requirements, hide_stages_from_candidate, scope, specialty, min_years_experience, schedule_days, schedule_evenings, schedule_weekends"
    )
    .eq("id", jobId)
    .maybeSingle();
  if (srcErr || !src) return;

  const dsoId = src.dso_id as string;

  // Active-subscription gate (matches createJob's posture).
  const billingError = await requireActiveSubscriptionError(supabase, dsoId);
  if (billingError) return;

  // 2. Build the new title + slug.
  const sourceTitle = (src.title as string) ?? "Untitled";
  const newTitle = `Copy of ${sourceTitle}`.slice(0, 200);
  const baseSlug = makeSlug(newTitle);
  if (!baseSlug) return;
  const slug = await resolveAvailableJobSlug(supabase, dsoId, baseSlug);

  // 3. Look up the cloning user's dso_users row for created_by.
  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("dso_id", dsoId)
    .maybeSingle();

  // 4. Insert the new job (status = draft).
  const { data: newJob, error: insertErr } = await supabase
    .from("jobs")
    .insert({
      dso_id: dsoId,
      title: newTitle,
      slug,
      description: (src.description as string) ?? "",
      employment_type: src.employment_type,
      role_category: src.role_category,
      compensation_min: src.compensation_min,
      compensation_max: src.compensation_max,
      compensation_period: src.compensation_period,
      compensation_type: src.compensation_type,
      compensation_visible: src.compensation_visible,
      benefits: src.benefits,
      requirements: src.requirements,
      status: "draft",
      hide_stages_from_candidate: src.hide_stages_from_candidate,
      scope: src.scope,
      specialty: src.specialty,
      min_years_experience: src.min_years_experience,
      schedule_days: (src as Record<string, unknown>).schedule_days ?? [],
      schedule_evenings: Boolean(
        (src as Record<string, unknown>).schedule_evenings
      ),
      schedule_weekends: Boolean(
        (src as Record<string, unknown>).schedule_weekends
      ),
      posted_at: null,
      created_by: (dsoUser?.id as string | undefined) ?? null,
    })
    .select("id")
    .single();
  if (insertErr || !newJob) {
    console.warn("[cloneJob] jobs insert failed", insertErr);
    return;
  }
  const newId = newJob.id as string;

  // 5. Duplicate job_locations.
  const { data: srcLocs } = await supabase
    .from("job_locations")
    .select("location_id")
    .eq("job_id", jobId);
  const locRows = ((srcLocs ?? []) as Array<{ location_id: string }>).map(
    (l) => ({ job_id: newId, location_id: l.location_id })
  );
  if (locRows.length > 0) {
    await supabase.from("job_locations").insert(locRows);
  }

  // 6. Duplicate job_skills.
  const { data: srcSkills } = await supabase
    .from("job_skills")
    .select("skill")
    .eq("job_id", jobId);
  const skillRows = ((srcSkills ?? []) as Array<{ skill: string }>).map(
    (s) => ({ job_id: newId, skill: s.skill })
  );
  if (skillRows.length > 0) {
    await supabase.from("job_skills").insert(skillRows);
  }

  // 7. Duplicate screening questions (new IDs, same content).
  const { data: srcQs } = await supabase
    .from("job_screening_questions")
    .select("prompt, helper_text, kind, options, required, sort_order")
    .eq("job_id", jobId)
    .order("sort_order", { ascending: true });
  const qRows = ((srcQs ?? []) as Array<{
    prompt: string;
    helper_text: string | null;
    kind: string;
    options: Array<{ id: string; label: string }> | null;
    required: boolean;
    sort_order: number;
  }>).map((q) => ({
    job_id: newId,
    prompt: q.prompt,
    helper_text: q.helper_text,
    kind: q.kind,
    options: q.options,
    required: q.required,
    sort_order: q.sort_order,
  }));
  if (qRows.length > 0) {
    await supabase.from("job_screening_questions").insert(qRows);
  }

  // 8. Audit log.
  void emitJobAuditEvent(supabase, dsoId, newId, {
    eventKind: "job.cloned",
    summary: `Cloned "${sourceTitle}" → "${newTitle}"`,
    metadata: {
      source_job_id: jobId,
      source_title: sourceTitle,
      new_job_id: newId,
      new_title: newTitle,
    },
  });

  revalidatePath("/employer/jobs");
  redirect(`/employer/jobs/${newId}/edit`);
}

export async function softDeleteJob(
  _prev: JobActionState,
  formData: FormData
): Promise<JobActionState> {
  const jobId = String(formData.get("job_id") ?? "").trim();
  if (!jobId) return { ok: false, error: "Missing job ID." };

  const supabase = await createSupabaseServerClient();

  // Snapshot title + dso_id BEFORE the soft-delete so we can audit-log
  // with full context.
  const { data: priorJob } = await supabase
    .from("jobs")
    .select("title, dso_id")
    .eq("id", jobId)
    .maybeSingle();
  const jobTitle =
    ((priorJob as Record<string, unknown> | null)?.title as string | null) ??
    "the job";
  const dsoId =
    ((priorJob as Record<string, unknown> | null)?.dso_id as string | null) ??
    null;

  const { error } = await supabase
    .from("jobs")
    .update({ deleted_at: new Date().toISOString(), status: "archived" })
    .eq("id", jobId);

  if (error) return { ok: false, error: error.message };

  // Audit log (Phase 4.5.e completion). Must run BEFORE redirect.
  if (dsoId) {
    await emitJobAuditEvent(supabase, dsoId, jobId, {
      eventKind: "job.archived",
      summary: `Deleted "${jobTitle}"`,
      metadata: {
        job_id: jobId,
        title: jobTitle,
        soft_delete: true,
      },
    });
  }

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
  compType: "range" | "starting_at" | "up_to" | "exact" | "doe";
  compVisible: boolean;
  benefits: string[];
  requirements: string;
  status: string;
  locationIds: string[];
  skills: string[];
  screeningQuestions: ScreeningQuestionPayload[];
  hideStagesFromCandidate: boolean;
  scope: "location" | "regional" | "corporate";
  // v1.1 — Practice Fit scoring inputs
  specialty: string[];
  minYearsExperience: number | null;
  // Track F (2026-05-12) — Practice Fit schedule overlap inputs
  scheduleDays: string[];
  scheduleEvenings: boolean;
  scheduleWeekends: boolean;
}

const VALID_SCOPES = new Set<"location" | "regional" | "corporate">([
  "location",
  "regional",
  "corporate",
]);

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
  // v1.8 — compensation_type drives display + Practice Fit comp dim.
  const compTypeRaw = String(formData.get("compensation_type") ?? "range").trim();
  const compType: "range" | "starting_at" | "up_to" | "exact" | "doe" =
    ["range", "starting_at", "up_to", "exact", "doe"].includes(compTypeRaw)
      ? (compTypeRaw as "range" | "starting_at" | "up_to" | "exact" | "doe")
      : "range";
  const compVisible = formData.get("compensation_visible") === "on";
  const hideStagesFromCandidate =
    formData.get("hide_stages_from_candidate") === "on";
  // v1.6 — skills + benefits are multi-value form keys (chip-picker)
  // backed by the canonical lists. Legacy comma-string fallback kept
  // for any older callers; we read getAll first and only fall back to
  // the comma-split when no multi-values were submitted.
  const skillsMulti = formData
    .getAll("skills")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const benefitsMulti = formData
    .getAll("benefits")
    .map((v) => String(v).trim())
    .filter(Boolean);
  // Comma-split fallback only when the multi-value path is empty AND
  // the field was submitted as a single CSV string (legacy). Detect by
  // checking the FIRST entry — if it contains a comma, it's likely CSV.
  const skillsRaw =
    skillsMulti.length === 1 && skillsMulti[0].includes(",")
      ? skillsMulti[0]
      : "";
  const benefitsRaw =
    benefitsMulti.length === 1 && benefitsMulti[0].includes(",")
      ? benefitsMulti[0]
      : "";

  const requirements = String(formData.get("requirements") ?? "").trim();
  const status = String(formData.get("status") ?? "draft");
  const scopeRaw = String(formData.get("scope") ?? "location").trim();
  const scope = (
    VALID_SCOPES.has(scopeRaw as "location" | "regional" | "corporate")
      ? scopeRaw
      : "location"
  ) as "location" | "regional" | "corporate";

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

  // Prefer the multi-value chip-picker submissions; fall back to CSV.
  const benefits = benefitsMulti.length > 0 && !benefitsRaw
    ? benefitsMulti
    : benefitsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  const skills = skillsMulti.length > 0 && !skillsRaw
    ? skillsMulti
    : skillsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

  // v1.1 — multi-select submitted as repeated `specialty` form entries.
  const specialty = formData
    .getAll("specialty")
    .map((v) => String(v).trim())
    .filter(Boolean);

  const minYearsRaw = String(formData.get("min_years_experience") ?? "").trim();
  const minYearsExperience = minYearsRaw ? parseInt(minYearsRaw, 10) : null;
  if (minYearsExperience !== null && Number.isNaN(minYearsExperience)) {
    return { error: "Min years of experience must be a number." };
  }
  if (minYearsExperience !== null && minYearsExperience < 0) {
    return { error: "Min years of experience can't be negative." };
  }

  // Track F — schedule overlap inputs. Days bounded to canonical keys.
  const validDayKeys = new Set([
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
    "sat",
    "sun",
  ]);
  const scheduleDays = formData
    .getAll("schedule_days")
    .map((v) => String(v).trim().toLowerCase())
    .filter((v) => validDayKeys.has(v));
  const scheduleEvenings = formData.get("schedule_evenings") === "on";
  const scheduleWeekends = formData.get("schedule_weekends") === "on";

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
    compType,
    compVisible,
    benefits,
    requirements,
    status,
    locationIds,
    skills,
    screeningQuestions,
    hideStagesFromCandidate,
    scope,
    specialty,
    minYearsExperience,
    scheduleDays,
    scheduleEvenings,
    scheduleWeekends,
  };
}

function makeSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 80);
}

/**
 * Audit-log helper for job mutations. Wraps recordAuditEvent with the
 * actor-resolution boilerplate so each call site stays a one-liner.
 * Fail-open: errors are swallowed inside recordAuditEvent itself.
 */
async function emitJobAuditEvent(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  dsoId: string,
  jobId: string,
  input: {
    eventKind: string;
    summary: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await recordAuditEvent({
    dsoId,
    actorUserId: user.id,
    eventKind: input.eventKind,
    targetTable: "jobs",
    targetId: jobId,
    summary: input.summary,
    metadata: input.metadata ?? {},
  });
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
