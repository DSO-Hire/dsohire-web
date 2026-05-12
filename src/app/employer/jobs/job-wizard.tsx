"use client";

/**
 * JobWizard — multi-step job posting flow.
 *
 * Steps:
 *   1. Basics              — title, role category, employment type, locations
 *   2. Description         — Tiptap editor
 *   3. Compensation & details — comp range/period/visible, skills, benefits, requirements
 *   4. Screening questions — full CRUD UI for per-job questions, all 6 kinds
 *   5. Preview & publish   — summary + status select + Publish button
 *
 * Same component handles both create and edit modes via the `mode` and
 * `initial` props. On edit, screening questions are seeded from `initialQuestions`.
 *
 * Submit posts the full FormData blob to createJob or updateJob (in actions.ts),
 * which parses + syncs `job_screening_questions`.
 */

import { useEffect, useState, useTransition } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Pencil,
  Check,
} from "lucide-react";
import { JobDescriptionEditor } from "@/components/job-description-editor";
import {
  createJob,
  updateJob,
  type JobActionState,
} from "./actions";
import { RecommendedQuestionsPanel } from "./recommended-questions-panel";
import { JdGeneratorPanel } from "./jd-generator-panel";
import { ChipArrayInput } from "@/app/candidate/profile/edit-sheet";
import {
  getAllDentalSkills,
  BENEFITS,
} from "@/lib/candidate/canonical-lists";

/* ───── Types ───── */

export interface LocationOption {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

export type ScreeningQuestionKind =
  | "short_text"
  | "long_text"
  | "yes_no"
  | "single_select"
  | "multi_select"
  | "number";

export interface ScreeningQuestionOption {
  id: string;
  label: string;
}

export interface WizardScreeningQuestion {
  /** Stable client ID — matches DB id when editing existing question; new questions get a tmp_${n} id. */
  id: string;
  /** True when this question already exists in the DB (only set in edit mode). */
  persisted: boolean;
  prompt: string;
  helper_text: string | null;
  kind: ScreeningQuestionKind;
  options: ScreeningQuestionOption[] | null;
  required: boolean;
  sort_order: number;
}

export type JobScope = "location" | "regional" | "corporate";

// v1.8 — relative-time helper for the draft banner. Tight format:
// "30s", "5m", "2h", "1d". Returns "just now" under 30 seconds.
function timeAgoShort(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 30) return "just now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// v1.8 — locked compensation_type vocabulary; mirrored in the SQL
// check constraint on jobs.compensation_type.
export type CompensationType =
  | "range"
  | "starting_at"
  | "up_to"
  | "exact"
  | "doe";

const COMP_TYPE_OPTIONS: Array<{
  value: CompensationType;
  label: string;
  helper: string;
}> = [
  {
    value: "range",
    label: "Range",
    helper: "Min & max — most common, fits the broadest set of postings.",
  },
  {
    value: "starting_at",
    label: "Starting at",
    helper: "A floor only. Use when you don't want to publicly cap the top.",
  },
  {
    value: "up_to",
    label: "Up to",
    helper: "A ceiling only. Useful for capped hourly or contract roles.",
  },
  {
    value: "exact",
    label: "Exact",
    helper: "A single number. Common for hourly assistant / hygienist roles.",
  },
  {
    value: "doe",
    label: "DOE / discussed",
    helper: "Discussed at the offer stage. Comp drops out of Practice Fit.",
  },
];

export interface JobWizardInitial {
  id: string;
  title: string;
  description: string;
  employment_type: string;
  role_category: string;
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_period: string | null;
  compensation_type: CompensationType | null;
  compensation_visible: boolean;
  benefits: string[];
  requirements: string | null;
  status: string;
  location_ids: string[];
  skills: string[];
  hide_stages_from_candidate: boolean;
  scope: JobScope;
  // v1.1 — Practice Fit scoring inputs
  specialty: string[];
  min_years_experience: number | null;
  // Track F (2026-05-12) — Practice Fit schedule overlap dimension
  schedule_days: string[];
  schedule_evenings: boolean;
  schedule_weekends: boolean;
}

export const SCOPE_OPTIONS: Array<{
  value: JobScope;
  label: string;
  helper: string;
}> = [
  {
    value: "location",
    label: "Single practice",
    helper:
      "This role is open at one specific practice. Hiring managers see it only if they're tagged on that practice.",
  },
  {
    value: "regional",
    label: "Regional / multi-practice",
    helper:
      "Open across several practices. Any hiring manager in your DSO can see and staff this role.",
  },
  {
    value: "corporate",
    label: "DSO-wide",
    helper:
      "A corporate-level role (CEO, CFO, regional director, etc.). Visible to every hiring manager regardless of practice tagging.",
  },
];

interface JobWizardProps {
  dsoId: string;
  locations: LocationOption[];
  mode: "create" | "edit";
  initial?: JobWizardInitial;
  initialQuestions?: WizardScreeningQuestion[];
}

/* ───── Constants ───── */

// Stored values are the legacy job-side enum (dental_hygienist etc) — we
// keep them to avoid a Postgres enum migration. Labels match the
// candidate-side ROLE_CATEGORIES vocabulary so an employer's "Dental
// Assistant" posting reads identically to a candidate's "Dental
// Assistant" preference. Practice Fit's role-canonicalize layer
// (src/lib/practice-fit/role-canonicalize.ts) maps both vocabularies to
// a single internal key before comparing — that's how an "assistant"
// candidate now matches a "dental_assistant" job, instead of dropping
// out of the chip pool.
const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "dentist", label: "Associate Dentist" },
  { value: "specialist", label: "Specialist Dentist" },
  { value: "dental_hygienist", label: "Dental Hygienist" },
  { value: "dental_assistant", label: "Dental Assistant" },
  { value: "front_office", label: "Front Desk / Receptionist" },
  { value: "office_manager", label: "Office Manager" },
  { value: "regional_manager", label: "Regional Manager" },
  { value: "other", label: "Other" },
];

// v1.1 — mirrors SPECIALTIES in src/lib/candidate/canonical-lists.ts.
// Inlined here to keep job-wizard a "use client" file without crossing
// the server-side canonical-lists boundary (which carries other types
// the wizard doesn't need).
const SPECIALTY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "general_dentistry", label: "General Dentistry" },
  { value: "pediatric_dentistry", label: "Pediatric Dentistry" },
  { value: "orthodontics", label: "Orthodontics" },
  { value: "endodontics", label: "Endodontics" },
  { value: "periodontics", label: "Periodontics" },
  { value: "prosthodontics", label: "Prosthodontics" },
  { value: "oral_surgery", label: "Oral & Maxillofacial Surgery" },
  { value: "oral_medicine", label: "Oral Medicine" },
  { value: "dental_anesthesiology", label: "Dental Anesthesiology" },
  { value: "public_health_dentistry", label: "Public Health Dentistry" },
];

const EMPLOYMENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "contract", label: "Contract" },
  { value: "prn", label: "PRN" },
  { value: "locum", label: "Locum" },
];

const KIND_LABELS: Record<ScreeningQuestionKind, string> = {
  short_text: "Short text",
  long_text: "Long text",
  yes_no: "Yes / No",
  single_select: "Single choice",
  multi_select: "Multiple choice",
  number: "Number",
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "draft", label: "Draft (only you can see)" },
  { value: "active", label: "Active (publicly visible)" },
];

const STATUS_OPTIONS_EDIT: Array<{ value: string; label: string }> = [
  ...STATUS_OPTIONS,
  { value: "paused", label: "Paused" },
  { value: "filled", label: "Filled" },
];

const STEPS = [
  { id: "basics", label: "Basics" },
  { id: "description", label: "Description" },
  { id: "details", label: "Compensation & details" },
  { id: "screening", label: "Screening" },
  { id: "preview", label: "Preview & publish" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

/* ───── Component ───── */

export function JobWizard({
  dsoId,
  locations,
  mode,
  initial,
  initialQuestions,
}: JobWizardProps) {
  const [stepIdx, setStepIdx] = useState(0);

  // v1.8 — draft autosave. Only on create (we don't want a stale local
  // draft overriding edits on a saved job). Key per dso so multiple
  // owners on different DSOs don't collide. Declared up here so the
  // load/save effects below can close over them — block-scoped const
  // refs would otherwise hit "used before declaration."
  const draftKey =
    mode === "create" ? `dsohire-job-wizard-draft-${dsoId}` : null;
  const [draftFound, setDraftFound] = useState<{ savedAt: string } | null>(
    null
  );
  const [draftDismissed, setDraftDismissed] = useState(false);

  // v1.7 — every step change scrolls the page back to top. Without this
  // the user was getting dumped at the bottom (Next button) of the new
  // step, since the browser preserves scroll position and the buttons
  // sit at the page footer. Smooth-scroll feels right; instant feels
  // jarring on a long form.
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [stepIdx]);

  // Form state
  const [title, setTitle] = useState(initial?.title ?? "");
  const [roleCategory, setRoleCategory] = useState(
    initial?.role_category ?? "dentist"
  );
  const [employmentType, setEmploymentType] = useState(
    initial?.employment_type ?? "full_time"
  );
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(
    new Set(initial?.location_ids ?? [])
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [compMin, setCompMin] = useState(
    initial?.compensation_min !== null && initial?.compensation_min !== undefined
      ? String(initial.compensation_min)
      : ""
  );
  const [compMax, setCompMax] = useState(
    initial?.compensation_max !== null && initial?.compensation_max !== undefined
      ? String(initial.compensation_max)
      : ""
  );
  const [compPeriod, setCompPeriod] = useState(
    initial?.compensation_period ?? ""
  );
  // v1.8 — flexible comp type. Drives which inputs render in the
  // Compensation fieldset and how the value is displayed downstream.
  const [compType, setCompType] = useState<CompensationType>(
    (initial?.compensation_type as CompensationType | undefined) ?? "range"
  );
  const [compVisible, setCompVisible] = useState(
    initial?.compensation_visible ?? true
  );
  const [hideStagesFromCandidate, setHideStagesFromCandidate] = useState(
    initial?.hide_stages_from_candidate ?? false
  );
  const [scope, setScope] = useState<JobScope>(initial?.scope ?? "location");
  // v1.6 — skills + benefits are now string[] (chip-picker), not the
  // legacy comma-separated string. Existing rows hydrate from initial.skills
  // / initial.benefits arrays directly.
  const [skills, setSkills] = useState<string[]>(initial?.skills ?? []);
  const [benefits, setBenefits] = useState<string[]>(initial?.benefits ?? []);
  const [requirements, setRequirements] = useState(
    initial?.requirements ?? ""
  );
  const [questions, setQuestions] = useState<WizardScreeningQuestion[]>(
    initialQuestions ?? []
  );
  const [status, setStatus] = useState(initial?.status ?? "draft");
  // v1.1 — Practice Fit inputs.
  const [specialty, setSpecialty] = useState<Set<string>>(
    new Set(initial?.specialty ?? [])
  );
  const [minYearsExperience, setMinYearsExperience] = useState(
    initial?.min_years_experience !== null &&
      initial?.min_years_experience !== undefined
      ? String(initial.min_years_experience)
      : ""
  );
  // Track F (2026-05-12) — Practice Fit schedule overlap inputs.
  const [scheduleDays, setScheduleDays] = useState<Set<string>>(
    new Set(initial?.schedule_days ?? [])
  );
  const [scheduleEvenings, setScheduleEvenings] = useState(
    Boolean(initial?.schedule_evenings)
  );
  const [scheduleWeekends, setScheduleWeekends] = useState(
    Boolean(initial?.schedule_weekends)
  );

  const [error, setError] = useState<string | null>(null);

  // v1.8 — draft autosave. Placed AFTER all form state declarations so
  // the deps array's references resolve cleanly (block-scoped const TDZ
  // catches forward-refs on Vercel's clean build even though incremental
  // tsc lets it slide locally). Mount probes localStorage and surfaces
  // a banner if there's a non-trivial draft. Subsequent state changes
  // serialize the wizard with a 500ms debounce.
  useEffect(() => {
    if (!draftKey || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { savedAt?: string; title?: string };
      if (!parsed?.savedAt) return;
      if (!parsed.title?.trim()) {
        window.localStorage.removeItem(draftKey);
        return;
      }
      setDraftFound({ savedAt: parsed.savedAt });
    } catch {
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        /* noop */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!draftKey || typeof window === "undefined") return;
    if (draftFound) return;
    const handle = setTimeout(() => {
      const payload = {
        savedAt: new Date().toISOString(),
        title,
        roleCategory,
        employmentType,
        selectedLocationIds: [...selectedLocationIds],
        description,
        compType,
        compMin,
        compMax,
        compPeriod,
        compVisible,
        scope,
        hideStagesFromCandidate,
        skills,
        benefits,
        requirements,
        questions,
        status,
        specialty: [...specialty],
        minYearsExperience,
        scheduleDays: [...scheduleDays],
        scheduleEvenings,
        scheduleWeekends,
        stepIdx,
      };
      try {
        window.localStorage.setItem(draftKey, JSON.stringify(payload));
      } catch {
        /* localStorage full or disabled — silent fallback. */
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [
    draftKey,
    draftFound,
    title,
    roleCategory,
    employmentType,
    selectedLocationIds,
    description,
    compType,
    compMin,
    compMax,
    compPeriod,
    compVisible,
    scope,
    hideStagesFromCandidate,
    skills,
    benefits,
    requirements,
    questions,
    status,
    specialty,
    minYearsExperience,
    scheduleDays,
    scheduleEvenings,
    scheduleWeekends,
    stepIdx,
  ]);

  function restoreDraft() {
    if (!draftKey || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw) as Record<string, unknown>;
      setTitle((d.title as string) ?? "");
      setRoleCategory((d.roleCategory as string) ?? "dentist");
      setEmploymentType((d.employmentType as string) ?? "full_time");
      setSelectedLocationIds(
        new Set(((d.selectedLocationIds as string[]) ?? []))
      );
      setDescription((d.description as string) ?? "");
      setCompType(
        ((d.compType as CompensationType) ?? "range") as CompensationType
      );
      setCompMin((d.compMin as string) ?? "");
      setCompMax((d.compMax as string) ?? "");
      setCompPeriod((d.compPeriod as string) ?? "");
      setCompVisible(Boolean(d.compVisible));
      setScope(((d.scope as JobScope) ?? "location") as JobScope);
      setHideStagesFromCandidate(Boolean(d.hideStagesFromCandidate));
      setSkills(((d.skills as string[]) ?? []));
      setBenefits(((d.benefits as string[]) ?? []));
      setRequirements((d.requirements as string) ?? "");
      setQuestions(((d.questions as WizardScreeningQuestion[]) ?? []));
      setStatus((d.status as string) ?? "draft");
      setSpecialty(new Set(((d.specialty as string[]) ?? [])));
      setMinYearsExperience((d.minYearsExperience as string) ?? "");
      setScheduleDays(new Set(((d.scheduleDays as string[]) ?? [])));
      setScheduleEvenings(Boolean(d.scheduleEvenings));
      setScheduleWeekends(Boolean(d.scheduleWeekends));
      if (typeof d.stepIdx === "number") setStepIdx(d.stepIdx as number);
    } catch {
      /* noop */
    } finally {
      setDraftFound(null);
    }
  }
  function dismissDraft() {
    if (draftKey && typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        /* noop */
      }
    }
    setDraftFound(null);
    setDraftDismissed(true);
  }
  const [pending, startTransition] = useTransition();

  /* ───── Step navigation + per-step validation ───── */

  function tryAdvance() {
    const stepId = STEPS[stepIdx].id;
    setError(null);

    if (stepId === "basics") {
      if (!title.trim()) return setError("Add a job title before continuing.");
      if (selectedLocationIds.size === 0)
        return setError("Pick at least one practice location.");
    }
    if (stepId === "description") {
      const stripped = description.replace(/<[^>]*>/g, "").trim();
      if (!stripped)
        return setError("Add a job description before continuing.");
    }
    if (stepId === "screening") {
      const validation = validateQuestions(questions);
      if (validation) return setError(validation);
    }
    setStepIdx((i) => Math.min(STEPS.length - 1, i + 1));
  }

  function back() {
    setError(null);
    setStepIdx((i) => Math.max(0, i - 1));
  }

  /* ───── Submit ───── */

  function handleSubmit() {
    setError(null);

    // Final validation across all steps
    if (!title.trim()) {
      setStepIdx(0);
      return setError("Add a job title.");
    }
    if (selectedLocationIds.size === 0) {
      setStepIdx(0);
      return setError("Pick at least one practice location.");
    }
    const strippedDesc = description.replace(/<[^>]*>/g, "").trim();
    if (!strippedDesc) {
      setStepIdx(1);
      return setError("Add a job description.");
    }
    const questionError = validateQuestions(questions);
    if (questionError) {
      setStepIdx(3);
      return setError(questionError);
    }

    const formData = new FormData();
    formData.set("dso_id", dsoId);
    if (mode === "edit" && initial) formData.set("job_id", initial.id);
    formData.set("title", title);
    formData.set("description", description);
    formData.set("role_category", roleCategory);
    formData.set("employment_type", employmentType);
    for (const id of selectedLocationIds) {
      formData.append("location_ids", id);
    }
    // v1.8 — normalize per compensation_type so backend stores the
    // canonical shape regardless of whatever lingered in the alternate
    // field after a type-toggle.
    formData.set("compensation_type", compType);
    if (compType === "range") {
      formData.set("compensation_min", compMin);
      formData.set("compensation_max", compMax);
    } else if (compType === "starting_at") {
      formData.set("compensation_min", compMin);
      formData.set("compensation_max", "");
    } else if (compType === "up_to") {
      formData.set("compensation_min", "");
      formData.set("compensation_max", compMax);
    } else if (compType === "exact") {
      formData.set("compensation_min", compMin);
      formData.set("compensation_max", compMin); // same value both ends
    } else {
      // doe
      formData.set("compensation_min", "");
      formData.set("compensation_max", "");
    }
    formData.set("compensation_period", compType === "doe" ? "" : compPeriod);
    // v1.1 — repeated `specialty` form entries; min_years_experience is
    // a single optional integer string.
    for (const sp of specialty) {
      formData.append("specialty", sp);
    }
    formData.set("min_years_experience", minYearsExperience);
    // Track F — schedule overlap inputs. Days are repeated form entries
    // like specialty/skills; evenings/weekends are boolean checkboxes
    // emitted only when on.
    for (const d of scheduleDays) {
      formData.append("schedule_days", d);
    }
    if (scheduleEvenings) formData.set("schedule_evenings", "on");
    if (scheduleWeekends) formData.set("schedule_weekends", "on");
    if (compVisible) formData.set("compensation_visible", "on");
    if (hideStagesFromCandidate)
      formData.set("hide_stages_from_candidate", "on");
    formData.set("scope", scope);
    // v1.6 — multi-value form keys, mirroring specialty. Lets the
    // server action read getAll() and avoid comma-split parsing.
    for (const s of skills) formData.append("skills", s);
    for (const b of benefits) formData.append("benefits", b);
    formData.set("requirements", requirements);
    formData.set("status", status);
    formData.set(
      "screening_questions",
      JSON.stringify(
        questions.map((q, idx) => ({
          id: q.persisted ? q.id : null,
          prompt: q.prompt.trim(),
          helper_text: q.helper_text?.trim() || null,
          kind: q.kind,
          options:
            q.kind === "single_select" || q.kind === "multi_select"
              ? (q.options ?? []).map((o) => ({
                  id: o.id,
                  label: o.label.trim(),
                }))
              : null,
          required: q.required,
          sort_order: idx,
        }))
      )
    );

    startTransition(async () => {
      const action = mode === "edit" ? updateJob : createJob;
      const result: JobActionState = await action({ ok: false }, formData);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      // v1.8 — clear the draft on a successful create. createJob
      // redirects, so this is the last chance to clean up before nav.
      if (draftKey && typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(draftKey);
        } catch {
          /* noop */
        }
      }
      // createJob redirects on success; updateJob returns ok=true and stays on page.
      // For edit mode, surface a saved confirmation; the page's revalidation pulls fresh data.
      if (mode === "edit") {
        // Mark all questions as persisted (their tmp_ ids stay client-side; the
        // server has assigned real DB ids on its next read).
        setQuestions((qs) =>
          qs.map((q) => ({ ...q, persisted: true }))
        );
        setError(null);
        // Tiny nudge — flash a saved indicator. We could go fancier but ship-green.
        setSavedFlash(Date.now());
      }
    });
  }

  const [savedFlash, setSavedFlash] = useState<number | null>(null);

  const currentStep = STEPS[stepIdx];

  return (
    <div className="space-y-8 max-w-[820px]">
      {/* v1.8 — draft autosave banner. Only on create mode (draftKey
          is null in edit mode). Renders until the user picks Restore
          or Start fresh. */}
      {draftFound && !draftDismissed && (
        <div className="border border-heritage/50 bg-heritage/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-bold text-ink mb-0.5">
              We saved a draft of an in-progress job posting.
            </p>
            <p className="text-[12px] text-slate-meta">
              Last edit {timeAgoShort(new Date(draftFound.savedAt))} ago. Resume where you left off?
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={restoreDraft}
              className="px-4 py-2 bg-ink text-ivory text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors"
            >
              Restore draft
            </button>
            <button
              type="button"
              onClick={dismissDraft}
              className="px-4 py-2 border border-[var(--rule-strong)] text-ink text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-cream transition-colors"
            >
              Start fresh
            </button>
          </div>
        </div>
      )}
      <Stepper currentIdx={stepIdx} />

      <div className="border border-[var(--rule)] bg-white p-8 sm:p-10">
        {currentStep.id === "basics" && (
          <BasicsStep
            title={title}
            onTitle={setTitle}
            roleCategory={roleCategory}
            onRoleCategory={setRoleCategory}
            employmentType={employmentType}
            onEmploymentType={setEmploymentType}
            scope={scope}
            onScope={setScope}
            locations={locations}
            selectedLocationIds={selectedLocationIds}
            onToggleLocation={(id) => {
              setSelectedLocationIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            }}
          />
        )}

        {currentStep.id === "description" && (
          <DescriptionStep
            description={description}
            onChange={setDescription}
            roleCategory={roleCategory}
            roleLabel={
              ROLE_OPTIONS.find((r) => r.value === roleCategory)?.label ??
              roleCategory
            }
            title={title}
            onTitle={setTitle}
            locationIds={Array.from(selectedLocationIds)}
          />
        )}

        {currentStep.id === "details" && (
          <DetailsStep
            compType={compType}
            onCompType={setCompType}
            compMin={compMin}
            onCompMin={setCompMin}
            compMax={compMax}
            onCompMax={setCompMax}
            compPeriod={compPeriod}
            onCompPeriod={setCompPeriod}
            compVisible={compVisible}
            onCompVisible={setCompVisible}
            skills={skills}
            onSkills={setSkills}
            benefits={benefits}
            onBenefits={setBenefits}
            requirements={requirements}
            onRequirements={setRequirements}
            hideStagesFromCandidate={hideStagesFromCandidate}
            onHideStagesFromCandidate={setHideStagesFromCandidate}
            specialty={specialty}
            onSpecialty={setSpecialty}
            minYearsExperience={minYearsExperience}
            onMinYearsExperience={setMinYearsExperience}
            scheduleDays={scheduleDays}
            onScheduleDays={setScheduleDays}
            scheduleEvenings={scheduleEvenings}
            onScheduleEvenings={setScheduleEvenings}
            scheduleWeekends={scheduleWeekends}
            onScheduleWeekends={setScheduleWeekends}
          />
        )}

        {currentStep.id === "screening" && (
          <ScreeningStep
            roleCategory={roleCategory}
            questions={questions}
            onChange={setQuestions}
          />
        )}

        {currentStep.id === "preview" && (
          <PreviewStep
            mode={mode}
            title={title}
            roleCategory={roleCategory}
            employmentType={employmentType}
            locations={locations}
            selectedLocationIds={selectedLocationIds}
            description={description}
            compMin={compMin}
            compMax={compMax}
            compPeriod={compPeriod}
            compVisible={compVisible}
            skills={skills}
            benefits={benefits}
            requirements={requirements}
            questions={questions}
            status={status}
            onStatus={setStatus}
            onJumpTo={(stepId) => {
              const idx = STEPS.findIndex((s) => s.id === stepId);
              if (idx >= 0) setStepIdx(idx);
            }}
          />
        )}

        {error && (
          <div className="mt-6 bg-red-50 border-l-4 border-red-500 p-4">
            <p className="text-[14px] text-red-900">{error}</p>
          </div>
        )}

        {savedFlash && mode === "edit" && (
          <div className="mt-6 bg-cream border-l-4 border-heritage p-4">
            <p className="text-[14px] text-ink font-semibold">
              Saved. Changes are live.
            </p>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-[var(--rule)] flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={back}
            disabled={stepIdx === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-[10px] font-bold tracking-[1.5px] uppercase text-ink hover:bg-cream transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>

          {stepIdx < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={tryAdvance}
              className="inline-flex items-center gap-2 px-6 py-3 bg-ink text-ivory text-[10px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
            >
              Continue
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={pending}
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {pending
                ? "Saving…"
                : mode === "create"
                ? status === "active"
                  ? "Publish Job"
                  : "Save Draft"
                : "Save Changes"}
              {!pending && <ArrowRight className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───── Stepper ───── */

function Stepper({ currentIdx }: { currentIdx: number }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
          Step {currentIdx + 1} of {STEPS.length}
        </span>
        <span className="text-[10px] font-bold tracking-[2px] uppercase text-slate-meta">
          ·
        </span>
        <span className="text-[10px] font-bold tracking-[2.5px] uppercase text-ink">
          {STEPS[currentIdx].label}
        </span>
      </div>
      <div className="flex gap-1.5">
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            className={
              "h-1 flex-1 transition-colors " +
              (i < currentIdx
                ? "bg-heritage"
                : i === currentIdx
                ? "bg-ink"
                : "bg-[var(--rule-strong)]")
            }
          />
        ))}
      </div>
    </div>
  );
}

/* ───── Step 1 — Basics ───── */

function BasicsStep({
  title,
  onTitle,
  roleCategory,
  onRoleCategory,
  employmentType,
  onEmploymentType,
  scope,
  onScope,
  locations,
  selectedLocationIds,
  onToggleLocation,
}: {
  title: string;
  onTitle: (v: string) => void;
  roleCategory: string;
  onRoleCategory: (v: string) => void;
  employmentType: string;
  onEmploymentType: (v: string) => void;
  scope: JobScope;
  onScope: (v: JobScope) => void;
  locations: LocationOption[];
  selectedLocationIds: Set<string>;
  onToggleLocation: (id: string) => void;
}) {
  return (
    <div className="space-y-7">
      <div>
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Basics
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.5px] text-ink leading-tight">
          What is the job and where is it open?
        </h2>
      </div>

      <Input
        label="Job title"
        required
        placeholder="Associate Dentist — General"
        value={title}
        onChange={onTitle}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Select
          label="Role category"
          required
          value={roleCategory}
          onChange={onRoleCategory}
          options={ROLE_OPTIONS}
        />
        <Select
          label="Employment type"
          required
          value={employmentType}
          onChange={onEmploymentType}
          options={EMPLOYMENT_OPTIONS}
        />
      </div>

      <div>
        <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-3">
          Practice locations <span className="text-heritage">*</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[var(--rule)] border border-[var(--rule)]">
          {locations.map((loc) => {
            const checked = selectedLocationIds.has(loc.id);
            return (
              <label
                key={loc.id}
                className={`flex items-start gap-3 p-4 cursor-pointer transition-colors ${
                  checked ? "bg-cream" : "bg-white hover:bg-cream/60"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 accent-heritage flex-shrink-0"
                  checked={checked}
                  onChange={() => onToggleLocation(loc.id)}
                />
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-ink">
                    {loc.name}
                  </div>
                  <div className="text-[13px] text-slate-meta tracking-[0.3px]">
                    {[loc.city, loc.state].filter(Boolean).join(", ") ||
                      "Address not set"}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-slate-meta">
          Tag every location this job is open at. We render separate
          location-specific listings on the public job board automatically.
        </p>
      </div>

      <div>
        <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-3">
          Job scope
        </label>
        <div className="space-y-2">
          {SCOPE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={
                "flex items-start gap-3 px-4 py-3 border cursor-pointer transition-colors " +
                (scope === opt.value
                  ? "bg-heritage/[0.08] border-heritage"
                  : "bg-white border-[var(--rule-strong)] hover:bg-cream")
              }
            >
              <input
                type="radio"
                name="scope"
                checked={scope === opt.value}
                onChange={() => onScope(opt.value)}
                className="mt-1 accent-heritage"
              />
              <div className="flex-1">
                <div className="text-[14px] font-bold text-ink">
                  {opt.label}
                </div>
                <div className="text-[13px] text-slate-body mt-0.5 leading-relaxed">
                  {opt.helper}
                </div>
              </div>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-slate-meta">
          Scope controls who on your team can see this job. Owners, admins,
          and recruiters always see every job — this only changes what
          hiring managers see.
        </p>
      </div>
    </div>
  );
}

/* ───── Step 2 — Description ───── */

function DescriptionStep({
  description,
  onChange,
  roleCategory,
  roleLabel,
  title,
  onTitle,
  locationIds,
}: {
  description: string;
  onChange: (v: string) => void;
  roleCategory: string;
  roleLabel: string;
  title: string;
  onTitle: (v: string) => void;
  /**
   * Threaded down from the wizard's selectedLocationIds Set so the AI
   * JD generator can resolve the affiliation context before drafting
   * (Phase 4.5.b launch-blocker).
   */
  locationIds: string[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Description
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.5px] text-ink leading-tight">
          Tell candidates about the role.
        </h2>
      </div>

      <JdGeneratorPanel
        roleCategory={roleCategory}
        roleLabel={roleLabel}
        locationIds={locationIds}
        onApplyTitle={(t) => onTitle(t)}
        onApplyDescription={(html) => onChange(html)}
        onApplyAll={({ title: t, descriptionHtml }) => {
          onTitle(t);
          onChange(descriptionHtml);
        }}
      />

      {title.trim() && (
        <p className="text-[12px] text-slate-meta">
          Job title is currently:{" "}
          <span className="font-bold text-ink">{title}</span>. Edit it from the
          Basics step.
        </p>
      )}

      {/* data-jd-editor-anchor lets JdGeneratorPanel scroll the editor
          into view after an "Apply" so operators see their AI draft
          land in editable state below. */}
      <div data-jd-editor-anchor="true" className="scroll-mt-24">
        <JobDescriptionEditor
          value={description}
          onChange={onChange}
          placeholder="Describe the role, responsibilities, day-to-day, and what makes this DSO a great place to work…"
        />
      </div>
      <p className="text-[12px] text-slate-meta">
        Headings, bold/italic, lists, links, and blockquotes are supported. Skip
        H1 — that&apos;s reserved for the page title. The AI draft above is a
        read-only preview — your edits live below.
      </p>
    </div>
  );
}

/* ───── Step 3 — Compensation & details ───── */

function DetailsStep({
  compType,
  onCompType,
  compMin,
  onCompMin,
  compMax,
  onCompMax,
  compPeriod,
  onCompPeriod,
  compVisible,
  onCompVisible,
  skills,
  onSkills,
  benefits,
  onBenefits,
  requirements,
  onRequirements,
  hideStagesFromCandidate,
  onHideStagesFromCandidate,
  specialty,
  onSpecialty,
  minYearsExperience,
  onMinYearsExperience,
  scheduleDays,
  onScheduleDays,
  scheduleEvenings,
  onScheduleEvenings,
  scheduleWeekends,
  onScheduleWeekends,
}: {
  compType: CompensationType;
  onCompType: (v: CompensationType) => void;
  compMin: string;
  onCompMin: (v: string) => void;
  compMax: string;
  onCompMax: (v: string) => void;
  compPeriod: string;
  onCompPeriod: (v: string) => void;
  compVisible: boolean;
  onCompVisible: (v: boolean) => void;
  // v1.6 — string[] (canonical chip-picker), not legacy comma-string.
  skills: string[];
  onSkills: (v: string[]) => void;
  benefits: string[];
  onBenefits: (v: string[]) => void;
  requirements: string;
  onRequirements: (v: string) => void;
  hideStagesFromCandidate: boolean;
  onHideStagesFromCandidate: (v: boolean) => void;
  specialty: Set<string>;
  onSpecialty: (v: Set<string>) => void;
  minYearsExperience: string;
  onMinYearsExperience: (v: string) => void;
  scheduleDays: Set<string>;
  onScheduleDays: (v: Set<string>) => void;
  scheduleEvenings: boolean;
  onScheduleEvenings: (v: boolean) => void;
  scheduleWeekends: boolean;
  onScheduleWeekends: (v: boolean) => void;
}) {
  return (
    <div className="space-y-7">
      <div>
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Compensation & details
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.5px] text-ink leading-tight">
          Pay, perks, and must-haves.
        </h2>
      </div>

      <fieldset className="border border-[var(--rule)] p-6 bg-cream/40">
        <legend className="px-2 text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep">
          Compensation
        </legend>

        {/* v1.8 — comp type radio. The dynamic inputs below swap based
            on this choice so range / starting / up-to / exact / DOE
            postings all express their intent cleanly. */}
        <div className="mt-1 mb-4">
          <label className="block text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-2">
            Compensation type
          </label>
          <div className="flex flex-wrap gap-2">
            {COMP_TYPE_OPTIONS.map((opt) => {
              const checked = compType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onCompType(opt.value)}
                  className={`px-3 py-1.5 text-[12px] font-medium border transition-colors ${
                    checked
                      ? "bg-heritage-deep text-ivory border-heritage-deep"
                      : "bg-white text-ink border-[var(--rule)] hover:border-heritage"
                  }`}
                  title={opt.helper}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-meta leading-snug">
            {COMP_TYPE_OPTIONS.find((o) => o.value === compType)?.helper}
          </p>
        </div>

        {/* Dynamic input grid — shape changes by type. */}
        {compType !== "doe" && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {(compType === "range" ||
              compType === "starting_at" ||
              compType === "exact") && (
              <Input
                label={
                  compType === "range"
                    ? "Minimum"
                    : compType === "starting_at"
                      ? "Starting at"
                      : "Pay"
                }
                type="number"
                placeholder="190000"
                value={compMin}
                onChange={onCompMin}
              />
            )}
            {(compType === "range" || compType === "up_to") && (
              <Input
                label={compType === "range" ? "Maximum" : "Up to"}
                type="number"
                placeholder="240000"
                value={compMax}
                onChange={onCompMax}
              />
            )}
            <Select
              label="Period"
              value={compPeriod}
              onChange={onCompPeriod}
              options={[
                { value: "", label: "—" },
                { value: "hourly", label: "Per hour" },
                { value: "daily", label: "Per day" },
                { value: "annual", label: "Per year" },
              ]}
            />
          </div>
        )}

        <label className="mt-4 flex items-start gap-2.5 text-[14px] text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={compVisible}
            onChange={(e) => onCompVisible(e.target.checked)}
            className="mt-1 accent-heritage"
          />
          <span>
            Show pay publicly. Required in CA, CO, WA, NY, and other
            states with pay-transparency laws.
          </span>
        </label>
      </fieldset>

      <fieldset className="border border-[var(--rule)] p-6 bg-cream/40">
        <legend className="px-2 text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep">
          Match scoring
        </legend>
        <p className="mt-1 text-[12px] text-slate-meta leading-relaxed">
          These fields drive Practice Fit — the proprietary match score
          candidates and recruiters see on every application. Both are
          optional; the score adapts to whatever you fill in.
        </p>
        <div className="mt-4">
          <label className="block text-[12px] font-semibold text-ink mb-2">
            Specialty <span className="text-slate-meta font-normal">(pick any that apply)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {SPECIALTY_OPTIONS.map((opt) => {
              const checked = specialty.has(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    const next = new Set(specialty);
                    if (checked) next.delete(opt.value);
                    else next.add(opt.value);
                    onSpecialty(next);
                  }}
                  className={`px-3 py-1.5 text-[12px] font-medium border transition-colors ${
                    checked
                      ? "bg-heritage-deep text-ivory border-heritage-deep"
                      : "bg-white text-ink border-[var(--rule)] hover:border-heritage"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-5">
          <Input
            label="Minimum years of dental experience (optional)"
            type="number"
            placeholder="e.g. 2"
            value={minYearsExperience}
            onChange={onMinYearsExperience}
          />
          <p className="mt-1 text-[11px] text-slate-meta">
            Leave blank if there&apos;s no minimum. The score excludes this
            dimension when blank — it doesn&apos;t penalize newer candidates.
          </p>
        </div>
        <div className="mt-5">
          <label className="block text-[12px] font-semibold text-ink mb-2">
            Staffed days{" "}
            <span className="text-slate-meta font-normal">(optional)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { value: "mon", label: "Mon" },
              { value: "tue", label: "Tue" },
              { value: "wed", label: "Wed" },
              { value: "thu", label: "Thu" },
              { value: "fri", label: "Fri" },
              { value: "sat", label: "Sat" },
              { value: "sun", label: "Sun" },
            ].map((opt) => {
              const checked = scheduleDays.has(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    const next = new Set(scheduleDays);
                    if (checked) next.delete(opt.value);
                    else next.add(opt.value);
                    onScheduleDays(next);
                  }}
                  className={`px-3 py-1.5 text-[12px] font-medium border transition-colors ${
                    checked
                      ? "bg-heritage-deep text-ivory border-heritage-deep"
                      : "bg-white text-ink border-[var(--rule)] hover:border-heritage"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            <label className="inline-flex items-start gap-2 text-[12px] text-ink">
              <input
                type="checkbox"
                checked={scheduleEvenings}
                onChange={(e) => onScheduleEvenings(e.target.checked)}
                className="mt-1 accent-heritage"
              />
              <span>Evening hours (5pm or later)</span>
            </label>
            <label className="inline-flex items-start gap-2 text-[12px] text-ink">
              <input
                type="checkbox"
                checked={scheduleWeekends}
                onChange={(e) => onScheduleWeekends(e.target.checked)}
                className="mt-1 accent-heritage"
              />
              <span>Weekend shifts (Sat/Sun)</span>
            </label>
          </div>
          <p className="mt-2 text-[11px] text-slate-meta">
            Powers Practice Fit&apos;s schedule overlap dimension. Leave blank if
            scheduling is flexible — the score excludes the dimension when no
            days/flags are set.
          </p>
        </div>
      </fieldset>

      {/* v1.6 — both fields use the SAME canonical pool the candidate
          side draws from, so skills + benefits no longer require exact
          string matches between sides. Type to search; pick canonical
          chips. Custom values still allowed (Enter to add) but matching
          works best on the canonical vocabulary. */}
      <ChipArrayInput
        label="Preferred skills"
        values={skills}
        onChange={onSkills}
        options={getAllDentalSkills()}
        placeholder="Search skills — type and press Enter for custom"
        helper="Skills you'd like to see in candidates — not a hard filter. Practice Fit rewards candidates who match a few of these; missing skills don't disqualify anyone."
      />
      <ChipArrayInput
        label="Benefits"
        values={benefits}
        onChange={onBenefits}
        options={BENEFITS}
        placeholder="Search benefits — type and press Enter for custom"
        helper="Standard DSO benefits package. Pick what applies; the chip-picker keeps phrasing consistent across listings."
      />
      <Textarea
        label="Requirements (one per line)"
        rows={4}
        placeholder={"DDS or DMD\nActive state license\nComfortable with implant cases"}
        value={requirements}
        onChange={onRequirements}
      />

      {/* Candidate visibility — escape-hatch toggle for sensitive roles. We
          ship candidate-transparent by default (DSO Hire's stance), but the
          toggle is here for the rare role (executive, sensitive search)
          where the employer wants minimal stage visibility on the candidate
          side. */}
      <fieldset className="border border-[var(--rule)] p-6 bg-cream/40">
        <legend className="px-2 text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep">
          Candidate visibility
        </legend>
        <label className="mt-2 flex items-start gap-2.5 text-[14px] text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={hideStagesFromCandidate}
            onChange={(e) => onHideStagesFromCandidate(e.target.checked)}
            className="mt-1 accent-heritage"
          />
          <div>
            <div className="font-bold mb-1">
              Hide pipeline stages from candidates
            </div>
            <div className="text-[13px] text-slate-body leading-relaxed">
              By default, candidates see exactly where they sit in the
              pipeline — Submitted, Screening, Interview, Offer. Turn this on
              for a sensitive role and candidates will see an abstracted
              &ldquo;In review&rdquo; label until they reach Offer or Hired.
              Most roles should leave this off.
            </div>
          </div>
        </label>
      </fieldset>
    </div>
  );
}

/* ───── Step 4 — Screening questions ───── */

function ScreeningStep({
  roleCategory,
  questions,
  onChange,
}: {
  roleCategory: string;
  questions: WizardScreeningQuestion[];
  onChange: (qs: WizardScreeningQuestion[]) => void;
}) {
  const addQuestion = (kind: ScreeningQuestionKind) => {
    const newQ: WizardScreeningQuestion = {
      id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      persisted: false,
      prompt: "",
      helper_text: null,
      kind,
      options:
        kind === "single_select" || kind === "multi_select"
          ? [
              { id: `opt_${Date.now()}_a`, label: "" },
              { id: `opt_${Date.now()}_b`, label: "" },
            ]
          : null,
      required: false,
      sort_order: questions.length,
    };
    onChange([...questions, newQ]);
  };

  const updateQ = (id: string, patch: Partial<WizardScreeningQuestion>) => {
    onChange(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const removeQ = (id: string) => {
    onChange(questions.filter((q) => q.id !== id));
  };

  const move = (id: string, direction: -1 | 1) => {
    const idx = questions.findIndex((q) => q.id === id);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Screening questions
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.5px] text-ink leading-tight">
          What do you want to know up front?
        </h2>
        <p className="mt-3 text-[14px] text-slate-body leading-relaxed">
          Optional. Candidates answer these as part of their application — pick
          the ones that actually filter. You can add more later.
        </p>
      </div>

      <RecommendedQuestionsPanel
        roleCategory={roleCategory}
        questions={questions}
        onChange={onChange}
      />

      {questions.length === 0 && (
        <div className="border border-dashed border-[var(--rule-strong)] p-6 text-center bg-cream/40">
          <p className="text-[14px] text-slate-body mb-4">
            No screening questions yet.
          </p>
          <p className="text-[12px] text-slate-meta">
            Add a question below to get started.
          </p>
        </div>
      )}

      {questions.map((q, idx) => (
        <QuestionCard
          key={q.id}
          question={q}
          index={idx}
          total={questions.length}
          onUpdate={(patch) => updateQ(q.id, patch)}
          onRemove={() => removeQ(q.id)}
          onMove={(dir) => move(q.id, dir)}
        />
      ))}

      <div>
        <div className="text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-3">
          Add a question
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              "short_text",
              "long_text",
              "yes_no",
              "single_select",
              "multi_select",
              "number",
            ] as ScreeningQuestionKind[]
          ).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => addQuestion(k)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-[var(--rule-strong)] text-ink text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-cream transition-colors"
            >
              <Plus className="h-3 w-3" />
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuestionCard({
  question,
  index,
  total,
  onUpdate,
  onRemove,
  onMove,
}: {
  question: WizardScreeningQuestion;
  index: number;
  total: number;
  onUpdate: (patch: Partial<WizardScreeningQuestion>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const isSelect =
    question.kind === "single_select" || question.kind === "multi_select";

  const updateOption = (id: string, label: string) => {
    if (!question.options) return;
    onUpdate({
      options: question.options.map((o) =>
        o.id === id ? { ...o, label } : o
      ),
    });
  };

  const addOption = () => {
    const newOpt: ScreeningQuestionOption = {
      id: `opt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: "",
    };
    onUpdate({ options: [...(question.options ?? []), newOpt] });
  };

  const removeOption = (id: string) => {
    onUpdate({ options: (question.options ?? []).filter((o) => o.id !== id) });
  };

  return (
    <div
      id={`screening-q-${question.id}`}
      className="border border-[var(--rule)] p-5 bg-white"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-[2px] uppercase text-slate-meta">
            Q{index + 1}
          </span>
          <span className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep px-2 py-1 bg-heritage/[0.08]">
            {KIND_LABELS[question.kind]}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="p-1.5 text-slate-meta hover:text-ink hover:bg-cream transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Move up"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="p-1.5 text-slate-meta hover:text-ink hover:bg-cream transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Move down"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 transition-colors"
            aria-label="Remove question"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <Input
          label="Prompt"
          required
          placeholder="What is your ideal start date?"
          value={question.prompt}
          onChange={(v) => onUpdate({ prompt: v })}
        />
        <Input
          label="Helper text (optional)"
          placeholder="Show this under the question to clarify what you want."
          value={question.helper_text ?? ""}
          onChange={(v) => onUpdate({ helper_text: v || null })}
        />

        {isSelect && (
          <div>
            <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
              Options <span className="text-heritage">*</span>
            </label>
            <div className="space-y-2">
              {(question.options ?? []).map((opt, idx) => (
                <div key={opt.id} className="flex items-center gap-2">
                  <span className="text-[12px] font-bold text-slate-meta w-6">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    value={opt.label}
                    onChange={(e) => updateOption(opt.id, e.target.value)}
                    placeholder={`Option ${idx + 1}`}
                    className="flex-1 px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(opt.id)}
                    disabled={(question.options ?? []).length <= 2}
                    className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Remove option"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addOption}
              className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add option
            </button>
          </div>
        )}

        <label className="flex items-center gap-2.5 text-[14px] text-ink cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={question.required}
            onChange={(e) => onUpdate({ required: e.target.checked })}
            className="accent-heritage"
          />
          <span>Required — candidate must answer this to submit.</span>
        </label>
      </div>
    </div>
  );
}

/* ───── Step 5 — Preview ───── */

function PreviewStep({
  mode,
  title,
  roleCategory,
  employmentType,
  locations,
  selectedLocationIds,
  description,
  compMin,
  compMax,
  compPeriod,
  compVisible,
  skills,
  benefits,
  requirements,
  questions,
  status,
  onStatus,
  onJumpTo,
}: {
  mode: "create" | "edit";
  title: string;
  roleCategory: string;
  employmentType: string;
  locations: LocationOption[];
  selectedLocationIds: Set<string>;
  description: string;
  compMin: string;
  compMax: string;
  compPeriod: string;
  compVisible: boolean;
  skills: string[];
  benefits: string[];
  requirements: string;
  questions: WizardScreeningQuestion[];
  status: string;
  onStatus: (v: string) => void;
  onJumpTo: (id: StepId) => void;
}) {
  const role =
    ROLE_OPTIONS.find((r) => r.value === roleCategory)?.label ?? roleCategory;
  const employment =
    EMPLOYMENT_OPTIONS.find((e) => e.value === employmentType)?.label ??
    employmentType;
  const selectedLocations = locations.filter((l) =>
    selectedLocationIds.has(l.id)
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Preview & publish
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.5px] text-ink leading-tight">
          Final check before it goes live.
        </h2>
      </div>

      <ReviewBlock label="Basics" onEdit={() => onJumpTo("basics")}>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
          <Row label="Title" value={title || "—"} />
          <Row label="Role" value={role} />
          <Row label="Employment" value={employment} />
          <Row
            label="Locations"
            value={
              selectedLocations.length > 0
                ? selectedLocations.map((l) => l.name).join(", ")
                : "—"
            }
          />
        </dl>
      </ReviewBlock>

      <ReviewBlock label="Description" onEdit={() => onJumpTo("description")}>
        {description.replace(/<[^>]*>/g, "").trim() ? (
          <div
            className="dso-prose text-[14px]"
            dangerouslySetInnerHTML={{ __html: description }}
          />
        ) : (
          <p className="text-[14px] text-slate-meta italic">
            No description yet.
          </p>
        )}
      </ReviewBlock>

      <ReviewBlock label="Compensation & details" onEdit={() => onJumpTo("details")}>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
          <Row
            label="Pay range"
            value={formatComp(compMin, compMax, compPeriod)}
          />
          <Row label="Public" value={compVisible ? "Yes" : "Hidden"} />
          {skills.length > 0 && (
            <Row label="Skills" value={skills.join(", ")} />
          )}
          {benefits.length > 0 && (
            <Row label="Benefits" value={benefits.join(", ")} />
          )}
        </dl>
        {requirements.trim() && (
          <div className="mt-3 pt-3 border-t border-[var(--rule)]">
            <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-1">
              Requirements
            </div>
            <pre className="text-[14px] text-ink whitespace-pre-wrap font-sans leading-relaxed">
              {requirements}
            </pre>
          </div>
        )}
      </ReviewBlock>

      <ReviewBlock
        label={`Screening questions (${questions.length})`}
        onEdit={() => onJumpTo("screening")}
      >
        {questions.length === 0 ? (
          <p className="text-[14px] text-slate-meta italic">
            None — candidates apply with just resume + cover letter.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {questions.map((q, idx) => (
              <li key={q.id} className="text-[14px]">
                <span className="text-slate-meta font-bold mr-2">
                  {idx + 1}.
                </span>
                <span className="text-ink">{q.prompt || "(empty prompt)"}</span>
                {q.required && (
                  <span className="ml-2 text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep">
                    required
                  </span>
                )}
                <span className="ml-2 text-[10px] tracking-[0.5px] uppercase text-slate-meta">
                  · {KIND_LABELS[q.kind]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ReviewBlock>

      <div className="border border-[var(--rule)] p-5 bg-cream/40">
        <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-3">
          Publish status
        </label>
        <div className="space-y-2">
          {(mode === "edit" ? STATUS_OPTIONS_EDIT : STATUS_OPTIONS).map(
            (opt) => (
              <label
                key={opt.value}
                className={
                  "flex items-center gap-3 px-4 py-2.5 border cursor-pointer transition-colors " +
                  (status === opt.value
                    ? "bg-heritage/[0.08] border-heritage"
                    : "bg-white border-[var(--rule-strong)] hover:bg-cream")
                }
              >
                <input
                  type="radio"
                  name="status"
                  checked={status === opt.value}
                  onChange={() => onStatus(opt.value)}
                  className="accent-heritage"
                />
                <span className="text-[14px] text-ink">{opt.label}</span>
                {opt.value === "active" && status === opt.value && (
                  <Check className="h-3.5 w-3.5 text-heritage-deep ml-auto" />
                )}
              </label>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewBlock({
  label,
  onEdit,
  children,
}: {
  label: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-[var(--rule)] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-bold tracking-[2px] uppercase text-slate-body">
          {label}
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink transition-colors"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta">
        {label}
      </dt>
      <dd className="text-[14px] text-ink mt-0.5">{value}</dd>
    </div>
  );
}

function formatComp(min: string, max: string, period: string): string {
  if (!min && !max) return "—";
  const periodLabel: Record<string, string> = {
    hourly: "/hr",
    daily: "/day",
    annual: "/yr",
  };
  const suffix = period ? periodLabel[period] ?? "" : "";
  if (!max) return `$${min}+${suffix}`;
  if (!min) return `up to $${max}${suffix}`;
  return `$${min}–$${max}${suffix}`;
}

/* ───── Validation ───── */

function validateQuestions(
  questions: WizardScreeningQuestion[]
): string | null {
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.prompt.trim()) {
      return `Question ${i + 1}: prompt is empty.`;
    }
    if (q.kind === "single_select" || q.kind === "multi_select") {
      if (!q.options || q.options.length < 2) {
        return `Question ${i + 1}: needs at least 2 options.`;
      }
      for (let j = 0; j < q.options.length; j++) {
        if (!q.options[j].label.trim()) {
          return `Question ${i + 1}: option ${j + 1} is empty.`;
        }
      }
    }
  }
  return null;
}

/* ───── Reusable inputs ───── */

function Input({
  label,
  required,
  type = "text",
  placeholder,
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
        {label} {required && <span className="text-heritage">*</span>}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
      />
    </div>
  );
}

function Textarea({
  label,
  required,
  rows = 4,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  rows?: number;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
        {label} {required && <span className="text-heritage">*</span>}
      </label>
      <textarea
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors resize-vertical"
      />
    </div>
  );
}

function Select({
  label,
  required,
  value,
  onChange,
  options,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
        {label} {required && <span className="text-heritage">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
