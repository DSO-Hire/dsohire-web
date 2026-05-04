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

import { useState, useTransition } from "react";
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

export interface JobWizardInitial {
  id: string;
  title: string;
  description: string;
  employment_type: string;
  role_category: string;
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_period: string | null;
  compensation_visible: boolean;
  benefits: string[];
  requirements: string | null;
  status: string;
  location_ids: string[];
  skills: string[];
}

interface JobWizardProps {
  dsoId: string;
  locations: LocationOption[];
  mode: "create" | "edit";
  initial?: JobWizardInitial;
  initialQuestions?: WizardScreeningQuestion[];
}

/* ───── Constants ───── */

const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "dentist", label: "Dentist" },
  { value: "dental_hygienist", label: "Dental Hygienist" },
  { value: "dental_assistant", label: "Dental Assistant" },
  { value: "front_office", label: "Front Office" },
  { value: "office_manager", label: "Office Manager" },
  { value: "regional_manager", label: "Regional Manager" },
  { value: "specialist", label: "Specialist" },
  { value: "other", label: "Other" },
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
  const [compVisible, setCompVisible] = useState(
    initial?.compensation_visible ?? true
  );
  const [skills, setSkills] = useState(initial?.skills.join(", ") ?? "");
  const [benefits, setBenefits] = useState(initial?.benefits.join(", ") ?? "");
  const [requirements, setRequirements] = useState(
    initial?.requirements ?? ""
  );
  const [questions, setQuestions] = useState<WizardScreeningQuestion[]>(
    initialQuestions ?? []
  );
  const [status, setStatus] = useState(initial?.status ?? "draft");

  const [error, setError] = useState<string | null>(null);
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
    formData.set("compensation_min", compMin);
    formData.set("compensation_max", compMax);
    formData.set("compensation_period", compPeriod);
    if (compVisible) formData.set("compensation_visible", "on");
    formData.set("skills", skills);
    formData.set("benefits", benefits);
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
          />
        )}

        {currentStep.id === "details" && (
          <DetailsStep
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
            <p className="text-[13px] text-red-900">{error}</p>
          </div>
        )}

        {savedFlash && mode === "edit" && (
          <div className="mt-6 bg-cream border-l-4 border-heritage p-4">
            <p className="text-[13px] text-ink font-semibold">
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
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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
                  <div className="text-[12px] text-slate-meta tracking-[0.3px]">
                    {[loc.city, loc.state].filter(Boolean).join(", ") ||
                      "Address not set"}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-slate-meta">
          Tag every location this job is open at. We render separate
          location-specific listings on the public job board automatically.
        </p>
      </div>
    </div>
  );
}

/* ───── Step 2 — Description ───── */

function DescriptionStep({
  description,
  onChange,
}: {
  description: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Description
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.5px] text-ink leading-tight">
          Tell candidates about the role.
        </h2>
      </div>

      <JobDescriptionEditor
        value={description}
        onChange={onChange}
        placeholder="Describe the role, responsibilities, day-to-day, and what makes this DSO a great place to work…"
      />
      <p className="text-[11px] text-slate-meta">
        Headings, bold/italic, lists, links, and blockquotes are supported. Skip
        H1 — that&apos;s reserved for the page title.
      </p>
    </div>
  );
}

/* ───── Step 3 — Compensation & details ───── */

function DetailsStep({
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
}: {
  compMin: string;
  onCompMin: (v: string) => void;
  compMax: string;
  onCompMax: (v: string) => void;
  compPeriod: string;
  onCompPeriod: (v: string) => void;
  compVisible: boolean;
  onCompVisible: (v: boolean) => void;
  skills: string;
  onSkills: (v: string) => void;
  benefits: string;
  onBenefits: (v: string) => void;
  requirements: string;
  onRequirements: (v: string) => void;
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-2">
          <Input
            label="Minimum"
            type="number"
            placeholder="190000"
            value={compMin}
            onChange={onCompMin}
          />
          <Input
            label="Maximum"
            type="number"
            placeholder="240000"
            value={compMax}
            onChange={onCompMax}
          />
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
        <label className="mt-4 flex items-start gap-2.5 text-[13px] text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={compVisible}
            onChange={(e) => onCompVisible(e.target.checked)}
            className="mt-1 accent-heritage"
          />
          <span>
            Show pay range publicly. Required in CA, CO, WA, NY, and other
            states with pay-transparency laws.
          </span>
        </label>
      </fieldset>

      <Input
        label="Required skills (comma-separated)"
        placeholder="implant placement, scaling and root planing, intraoral camera"
        value={skills}
        onChange={onSkills}
      />
      <Input
        label="Benefits (comma-separated)"
        placeholder="health, dental, 401k match, PTO, CE allowance"
        value={benefits}
        onChange={onBenefits}
      />
      <Textarea
        label="Requirements (one per line)"
        rows={4}
        placeholder={"DDS or DMD\nActive state license\nComfortable with implant cases"}
        value={requirements}
        onChange={onRequirements}
      />
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
        onFocusQuestion={(id) => {
          if (typeof document === "undefined") return;
          const el = document.getElementById(`screening-q-${id}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            const input = el.querySelector<HTMLInputElement>(
              "input[type=text], textarea"
            );
            input?.focus();
          }
        }}
      />

      {questions.length === 0 && (
        <div className="border border-dashed border-[var(--rule-strong)] p-6 text-center bg-cream/40">
          <p className="text-[13px] text-slate-body mb-4">
            No screening questions yet.
          </p>
          <p className="text-[11px] text-slate-meta">
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
                  <span className="text-[11px] font-bold text-slate-meta w-6">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    value={opt.label}
                    onChange={(e) => updateOption(opt.id, e.target.value)}
                    placeholder={`Option ${idx + 1}`}
                    className="flex-1 px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[13px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
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

        <label className="flex items-center gap-2.5 text-[13px] text-ink cursor-pointer pt-1">
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
  skills: string;
  benefits: string;
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
            className="dso-prose text-[13px]"
            dangerouslySetInnerHTML={{ __html: description }}
          />
        ) : (
          <p className="text-[13px] text-slate-meta italic">
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
          {skills.trim() && <Row label="Skills" value={skills} />}
          {benefits.trim() && <Row label="Benefits" value={benefits} />}
        </dl>
        {requirements.trim() && (
          <div className="mt-3 pt-3 border-t border-[var(--rule)]">
            <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-1">
              Requirements
            </div>
            <pre className="text-[13px] text-ink whitespace-pre-wrap font-sans leading-relaxed">
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
          <p className="text-[13px] text-slate-meta italic">
            None — candidates apply with just resume + cover letter.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {questions.map((q, idx) => (
              <li key={q.id} className="text-[13px]">
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
                <span className="text-[13px] text-ink">{opt.label}</span>
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
      <dd className="text-[13px] text-ink mt-0.5">{value}</dd>
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
