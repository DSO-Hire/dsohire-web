"use client";

/**
 * Sectioned edit form for /employer/jobs/[id]/edit (Phase 4.7.b).
 *
 * Replaces the old wizard chrome (Step X of 5 + Continue button) with five
 * inline-editable section cards: Basics, Description, Compensation &
 * Details, Screening, Status. Each card has its own dirty-state tracker,
 * Save button, and per-section server action.
 *
 * Pattern parallels the candidate-profile editor (Phase 4.2.b) but uses
 * inline editing instead of modal sheets — the JD's TipTap editor and the
 * screening-question CRUD are too heavy for sheets, and the employer's
 * mental model when on this page is "I'm editing this job," not "I'm
 * dipping in and out of a profile."
 *
 * Recommended-question chips and JD generator continue to render in their
 * own sections; AI usage logging is unchanged.
 *
 * Status section reuses the existing JobStatusActions component pattern
 * via direct setJobStatus calls — keeps the toggle close to what people
 * already learned on the pipeline page header.
 */

import { useState, useTransition } from "react";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Check,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { JobDescriptionEditor } from "@/components/job-description-editor";
import {
  updateJobBasicsSection,
  updateJobDescriptionSection,
  updateJobDetailsSection,
  updateJobScreeningSection,
  setJobStatus,
  type JobActionState,
} from "../../actions";
import { RecommendedQuestionsPanel } from "../../recommended-questions-panel";
import { JdGeneratorPanel } from "../../jd-generator-panel";
import type {
  LocationOption,
  WizardScreeningQuestion,
  ScreeningQuestionKind,
  ScreeningQuestionOption,
} from "../../job-wizard";

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

const STATUS_OPTIONS: Array<{ value: string; label: string; helper: string }> = [
  { value: "draft", label: "Draft", helper: "Only your team can see it." },
  { value: "active", label: "Active", helper: "Live on the public job board." },
  { value: "paused", label: "Paused", helper: "Hidden from candidates, kept in your dashboard." },
  { value: "filled", label: "Filled", helper: "Closed because you hired someone." },
];

/* ───── Initial-data shape (mirrors JobWizardInitial) ───── */

export interface EditSectionsInitial {
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
  hide_stages_from_candidate: boolean;
}

interface EditSectionsProps {
  dsoId: string;
  initial: EditSectionsInitial;
  initialQuestions: WizardScreeningQuestion[];
  locations: LocationOption[];
}

/* ───── Top-level component ───── */

export function EditSections({
  dsoId,
  initial,
  initialQuestions,
  locations,
}: EditSectionsProps) {
  return (
    <div className="space-y-5 max-w-[820px]">
      <BasicsSection
        dsoId={dsoId}
        jobId={initial.id}
        initialTitle={initial.title}
        initialRoleCategory={initial.role_category}
        initialEmploymentType={initial.employment_type}
        initialLocationIds={initial.location_ids}
        locations={locations}
      />
      <DescriptionSection
        dsoId={dsoId}
        jobId={initial.id}
        initialDescription={initial.description}
        initialTitle={initial.title}
        roleCategory={initial.role_category}
      />
      <DetailsSection
        dsoId={dsoId}
        jobId={initial.id}
        initialCompMin={initial.compensation_min}
        initialCompMax={initial.compensation_max}
        initialCompPeriod={initial.compensation_period ?? ""}
        initialCompVisible={initial.compensation_visible}
        initialSkills={initial.skills}
        initialBenefits={initial.benefits}
        initialRequirements={initial.requirements ?? ""}
        initialHideStages={initial.hide_stages_from_candidate}
      />
      <ScreeningSection
        dsoId={dsoId}
        jobId={initial.id}
        roleCategory={initial.role_category}
        initialQuestions={initialQuestions}
      />
      <StatusSection jobId={initial.id} initialStatus={initial.status} />
    </div>
  );
}

/* ───── Section shell + save button ───── */

interface SaveBarProps {
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
  onSave: () => void;
  saveLabel?: string;
}

function SaveBar({
  dirty,
  saving,
  saved,
  error,
  onSave,
  saveLabel = "Save changes",
}: SaveBarProps) {
  return (
    <div className="mt-6 flex items-center justify-between gap-4 border-t border-[var(--rule)] pt-4">
      <div className="min-w-0 flex-1 text-sm">
        {error && <p className="text-red-700">{error}</p>}
        {!error && saved && (
          <p className="inline-flex items-center gap-1.5 text-heritage-deep">
            <CheckCircle2 className="size-3.5" />
            <span className="font-semibold">Saved.</span>
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onSave}
        disabled={!dirty || saving}
        className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-ivory transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            Saving…
          </>
        ) : (
          saveLabel
        )}
      </button>
    </div>
  );
}

function SectionShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-slate-200 bg-white p-6 sm:p-8">
      <header className="mb-5">
        <h2 className="font-display text-lg font-bold text-[#14233F]">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p>
        )}
      </header>
      <div>{children}</div>
    </section>
  );
}

/* ───── Section 1 — Basics ───── */

function BasicsSection({
  dsoId,
  jobId,
  initialTitle,
  initialRoleCategory,
  initialEmploymentType,
  initialLocationIds,
  locations,
}: {
  dsoId: string;
  jobId: string;
  initialTitle: string;
  initialRoleCategory: string;
  initialEmploymentType: string;
  initialLocationIds: string[];
  locations: LocationOption[];
}) {
  const [title, setTitle] = useState(initialTitle);
  const [roleCategory, setRoleCategory] = useState(initialRoleCategory);
  const [employmentType, setEmploymentType] = useState(initialEmploymentType);
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(
    new Set(initialLocationIds)
  );

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [snapshot, setSnapshot] = useState({
    title: initialTitle,
    roleCategory: initialRoleCategory,
    employmentType: initialEmploymentType,
    locationIds: [...initialLocationIds].sort().join("|"),
  });

  const currentLocationKey = [...selectedLocationIds].sort().join("|");
  const dirty =
    title !== snapshot.title ||
    roleCategory !== snapshot.roleCategory ||
    employmentType !== snapshot.employmentType ||
    currentLocationKey !== snapshot.locationIds;

  const onSave = () => {
    setError(null);
    setSaved(false);
    if (!title.trim()) return setError("Add a job title.");
    if (selectedLocationIds.size === 0)
      return setError("Pick at least one practice location.");

    const fd = new FormData();
    fd.set("job_id", jobId);
    fd.set("dso_id", dsoId);
    fd.set("title", title.trim());
    fd.set("role_category", roleCategory);
    fd.set("employment_type", employmentType);
    for (const id of selectedLocationIds) fd.append("location_ids", id);

    startTransition(async () => {
      const result: JobActionState = await updateJobBasicsSection({ ok: false }, fd);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save.");
        return;
      }
      setSnapshot({
        title: title.trim(),
        roleCategory,
        employmentType,
        locationIds: currentLocationKey,
      });
      setSaved(true);
    });
  };

  const toggleLocation = (id: string) => {
    setSaved(false);
    setSelectedLocationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <SectionShell
      title="Basics"
      subtitle="Title, role, employment type, and which locations this job is open at."
    >
      <div className="space-y-5">
        <Input
          label="Job title"
          required
          value={title}
          onChange={(v) => {
            setTitle(v);
            setSaved(false);
          }}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Role category"
            required
            value={roleCategory}
            onChange={(v) => {
              setRoleCategory(v);
              setSaved(false);
            }}
            options={ROLE_OPTIONS}
          />
          <Select
            label="Employment type"
            required
            value={employmentType}
            onChange={(v) => {
              setEmploymentType(v);
              setSaved(false);
            }}
            options={EMPLOYMENT_OPTIONS}
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
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
                    onChange={() => toggleLocation(loc.id)}
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
        </div>
      </div>
      <SaveBar
        dirty={dirty}
        saving={pending}
        saved={saved}
        error={error}
        onSave={onSave}
      />
    </SectionShell>
  );
}

/* ───── Section 2 — Description ───── */

function DescriptionSection({
  dsoId,
  jobId,
  initialDescription,
  initialTitle,
  roleCategory,
}: {
  dsoId: string;
  jobId: string;
  initialDescription: string;
  initialTitle: string;
  roleCategory: string;
}) {
  const [description, setDescription] = useState(initialDescription);
  const [snapshot, setSnapshot] = useState(initialDescription);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = description !== snapshot;
  const roleLabel =
    ROLE_OPTIONS.find((r) => r.value === roleCategory)?.label ?? roleCategory;

  const onSave = () => {
    setError(null);
    setSaved(false);
    const stripped = description.replace(/<[^>]*>/g, "").trim();
    if (!stripped) return setError("Description can't be empty.");

    const fd = new FormData();
    fd.set("job_id", jobId);
    fd.set("dso_id", dsoId);
    fd.set("description", description);

    startTransition(async () => {
      const result: JobActionState = await updateJobDescriptionSection(
        { ok: false },
        fd
      );
      if (!result.ok) {
        setError(result.error ?? "Couldn't save.");
        return;
      }
      setSnapshot(description);
      setSaved(true);
    });
  };

  return (
    <SectionShell
      title="Description"
      subtitle="What the role is, day-to-day, and what makes this DSO worth joining."
    >
      <div className="space-y-5">
        <JdGeneratorPanel
          roleCategory={roleCategory}
          roleLabel={roleLabel}
          onApplyTitle={() => {
            /* edit page keeps title in Basics section — JD generator only
               applies description here. Title-apply on edit is intentionally
               disabled to avoid silent overwrites. */
          }}
          onApplyDescription={(html) => {
            setDescription(html);
            setSaved(false);
          }}
          onApplyAll={({ descriptionHtml }) => {
            setDescription(descriptionHtml);
            setSaved(false);
          }}
        />
        {initialTitle.trim() && (
          <p className="text-[12px] text-slate-meta">
            Editing description for{" "}
            <span className="font-bold text-ink">{initialTitle}</span>.
          </p>
        )}
        <JobDescriptionEditor
          value={description}
          onChange={(v) => {
            setDescription(v);
            setSaved(false);
          }}
          placeholder="Describe the role, responsibilities, day-to-day, and what makes this DSO a great place to work…"
        />
        <p className="text-[12px] text-slate-meta">
          Headings, bold/italic, lists, links, and blockquotes supported. Skip
          H1 — that&apos;s reserved for the page title.
        </p>
      </div>
      <SaveBar
        dirty={dirty}
        saving={pending}
        saved={saved}
        error={error}
        onSave={onSave}
      />
    </SectionShell>
  );
}

/* ───── Section 3 — Compensation & Details ───── */

function DetailsSection({
  dsoId,
  jobId,
  initialCompMin,
  initialCompMax,
  initialCompPeriod,
  initialCompVisible,
  initialSkills,
  initialBenefits,
  initialRequirements,
  initialHideStages,
}: {
  dsoId: string;
  jobId: string;
  initialCompMin: number | null;
  initialCompMax: number | null;
  initialCompPeriod: string;
  initialCompVisible: boolean;
  initialSkills: string[];
  initialBenefits: string[];
  initialRequirements: string;
  initialHideStages: boolean;
}) {
  const [compMin, setCompMin] = useState(
    initialCompMin !== null ? String(initialCompMin) : ""
  );
  const [compMax, setCompMax] = useState(
    initialCompMax !== null ? String(initialCompMax) : ""
  );
  const [compPeriod, setCompPeriod] = useState(initialCompPeriod);
  const [compVisible, setCompVisible] = useState(initialCompVisible);
  const [skills, setSkills] = useState(initialSkills.join(", "));
  const [benefits, setBenefits] = useState(initialBenefits.join(", "));
  const [requirements, setRequirements] = useState(initialRequirements);
  const [hideStages, setHideStages] = useState(initialHideStages);

  const initialSnapshot = {
    compMin: initialCompMin !== null ? String(initialCompMin) : "",
    compMax: initialCompMax !== null ? String(initialCompMax) : "",
    compPeriod: initialCompPeriod,
    compVisible: initialCompVisible,
    skills: initialSkills.join(", "),
    benefits: initialBenefits.join(", "),
    requirements: initialRequirements,
    hideStages: initialHideStages,
  };
  const [snapshot, setSnapshot] = useState(initialSnapshot);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    compMin !== snapshot.compMin ||
    compMax !== snapshot.compMax ||
    compPeriod !== snapshot.compPeriod ||
    compVisible !== snapshot.compVisible ||
    skills !== snapshot.skills ||
    benefits !== snapshot.benefits ||
    requirements !== snapshot.requirements ||
    hideStages !== snapshot.hideStages;

  const touch = () => setSaved(false);

  const onSave = () => {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("job_id", jobId);
    fd.set("dso_id", dsoId);
    fd.set("compensation_min", compMin);
    fd.set("compensation_max", compMax);
    fd.set("compensation_period", compPeriod);
    if (compVisible) fd.set("compensation_visible", "on");
    if (hideStages) fd.set("hide_stages_from_candidate", "on");
    fd.set("skills", skills);
    fd.set("benefits", benefits);
    fd.set("requirements", requirements);

    startTransition(async () => {
      const result: JobActionState = await updateJobDetailsSection(
        { ok: false },
        fd
      );
      if (!result.ok) {
        setError(result.error ?? "Couldn't save.");
        return;
      }
      setSnapshot({
        compMin,
        compMax,
        compPeriod,
        compVisible,
        skills,
        benefits,
        requirements,
        hideStages,
      });
      setSaved(true);
    });
  };

  return (
    <SectionShell
      title="Compensation & details"
      subtitle="Pay range, perks, must-haves, and visibility settings."
    >
      <div className="space-y-6">
        <fieldset className="border border-[var(--rule)] p-5 bg-cream/40">
          <legend className="px-2 text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep">
            Compensation
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
            <Input
              label="Minimum"
              type="number"
              value={compMin}
              onChange={(v) => {
                setCompMin(v);
                touch();
              }}
            />
            <Input
              label="Maximum"
              type="number"
              value={compMax}
              onChange={(v) => {
                setCompMax(v);
                touch();
              }}
            />
            <Select
              label="Period"
              value={compPeriod}
              onChange={(v) => {
                setCompPeriod(v);
                touch();
              }}
              options={[
                { value: "", label: "—" },
                { value: "hourly", label: "Per hour" },
                { value: "daily", label: "Per day" },
                { value: "annual", label: "Per year" },
              ]}
            />
          </div>
          <label className="mt-4 flex items-start gap-2.5 text-[14px] text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={compVisible}
              onChange={(e) => {
                setCompVisible(e.target.checked);
                touch();
              }}
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
          onChange={(v) => {
            setSkills(v);
            touch();
          }}
        />
        <Input
          label="Benefits (comma-separated)"
          placeholder="health, dental, 401k match, PTO, CE allowance"
          value={benefits}
          onChange={(v) => {
            setBenefits(v);
            touch();
          }}
        />
        <Textarea
          label="Requirements (one per line)"
          rows={4}
          placeholder={"DDS or DMD\nActive state license\nComfortable with implant cases"}
          value={requirements}
          onChange={(v) => {
            setRequirements(v);
            touch();
          }}
        />

        <fieldset className="border border-[var(--rule)] p-5 bg-cream/40">
          <legend className="px-2 text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep">
            Candidate visibility
          </legend>
          <label className="mt-2 flex items-start gap-2.5 text-[14px] text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={hideStages}
              onChange={(e) => {
                setHideStages(e.target.checked);
                touch();
              }}
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
              </div>
            </div>
          </label>
        </fieldset>
      </div>
      <SaveBar
        dirty={dirty}
        saving={pending}
        saved={saved}
        error={error}
        onSave={onSave}
      />
    </SectionShell>
  );
}

/* ───── Section 4 — Screening Questions ───── */

function ScreeningSection({
  dsoId,
  jobId,
  roleCategory,
  initialQuestions,
}: {
  dsoId: string;
  jobId: string;
  roleCategory: string;
  initialQuestions: WizardScreeningQuestion[];
}) {
  const [questions, setQuestions] =
    useState<WizardScreeningQuestion[]>(initialQuestions);
  const [snapshot, setSnapshot] = useState(() =>
    snapshotQuestions(initialQuestions)
  );

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = snapshotQuestions(questions) !== snapshot;
  const touch = () => setSaved(false);

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
    setQuestions((qs) => [...qs, newQ]);
    touch();
  };

  const updateQ = (id: string, patch: Partial<WizardScreeningQuestion>) => {
    setQuestions((qs) =>
      qs.map((q) => (q.id === id ? { ...q, ...patch } : q))
    );
    touch();
  };

  const removeQ = (id: string) => {
    setQuestions((qs) => qs.filter((q) => q.id !== id));
    touch();
  };

  const move = (id: string, direction: -1 | 1) => {
    setQuestions((qs) => {
      const idx = qs.findIndex((q) => q.id === id);
      if (idx < 0) return qs;
      const target = idx + direction;
      if (target < 0 || target >= qs.length) return qs;
      const next = [...qs];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
    touch();
  };

  const onSave = () => {
    setError(null);
    setSaved(false);
    const validation = validateQuestions(questions);
    if (validation) return setError(validation);

    const fd = new FormData();
    fd.set("job_id", jobId);
    fd.set("dso_id", dsoId);
    fd.set(
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
      const result: JobActionState = await updateJobScreeningSection(
        { ok: false },
        fd
      );
      if (!result.ok) {
        setError(result.error ?? "Couldn't save.");
        return;
      }
      // Mark every question persisted; next render reads from snapshot.
      setQuestions((qs) => qs.map((q) => ({ ...q, persisted: true })));
      setSnapshot(snapshotQuestions(questions));
      setSaved(true);
    });
  };

  return (
    <SectionShell
      title="Screening questions"
      subtitle="Optional questions candidates answer as part of their application."
    >
      <div className="space-y-5">
        <RecommendedQuestionsPanel
          roleCategory={roleCategory}
          questions={questions}
          onChange={(next) => {
            setQuestions(next);
            touch();
          }}
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
          <div className="border border-dashed border-[var(--rule-strong)] p-5 text-center bg-cream/40">
            <p className="text-[14px] text-slate-body">
              No screening questions yet. Add one below or apply a recommended
              set above.
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
          <div className="text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
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
      <SaveBar
        dirty={dirty}
        saving={pending}
        saved={saved}
        error={error}
        onSave={onSave}
        saveLabel="Save questions"
      />
    </SectionShell>
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
      className="border border-[var(--rule)] p-4 bg-white"
    >
      <div className="flex items-center justify-between mb-3">
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

function snapshotQuestions(qs: WizardScreeningQuestion[]): string {
  return JSON.stringify(
    qs.map((q) => ({
      id: q.id,
      persisted: q.persisted,
      prompt: q.prompt.trim(),
      helper_text: q.helper_text?.trim() || null,
      kind: q.kind,
      options:
        q.options?.map((o) => ({ id: o.id, label: o.label.trim() })) ?? null,
      required: q.required,
    }))
  );
}

function validateQuestions(qs: WizardScreeningQuestion[]): string | null {
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i];
    if (!q.prompt.trim()) return `Question ${i + 1}: prompt is empty.`;
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

/* ───── Section 5 — Status ───── */

function StatusSection({
  jobId,
  initialStatus,
}: {
  jobId: string;
  initialStatus: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [snapshot, setSnapshot] = useState(initialStatus);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = status !== snapshot;

  const onSave = () => {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("job_id", jobId);
    fd.set("new_status", status);
    startTransition(async () => {
      const result: JobActionState = await setJobStatus({ ok: false }, fd);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save.");
        return;
      }
      setSnapshot(status);
      setSaved(true);
    });
  };

  return (
    <SectionShell
      title="Status"
      subtitle="Whether candidates can see and apply to this job."
    >
      <div className="space-y-2">
        {STATUS_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={
              "flex items-start gap-3 px-4 py-3 border cursor-pointer transition-colors " +
              (status === opt.value
                ? "bg-heritage/[0.08] border-heritage"
                : "bg-white border-[var(--rule-strong)] hover:bg-cream")
            }
          >
            <input
              type="radio"
              name="status"
              checked={status === opt.value}
              onChange={() => {
                setStatus(opt.value);
                setSaved(false);
              }}
              className="mt-1 accent-heritage"
            />
            <div className="flex-1">
              <div className="text-[14px] font-bold text-ink flex items-center gap-2">
                {opt.label}
                {status === opt.value && opt.value === "active" && (
                  <Check className="h-3.5 w-3.5 text-heritage-deep" />
                )}
              </div>
              <div className="text-[13px] text-slate-body mt-0.5">
                {opt.helper}
              </div>
            </div>
          </label>
        ))}
      </div>
      <SaveBar
        dirty={dirty}
        saving={pending}
        saved={saved}
        error={error}
        onSave={onSave}
        saveLabel="Save status"
      />
    </SectionShell>
  );
}

/* ───── Reusable inputs (mirror job-wizard) ───── */

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
