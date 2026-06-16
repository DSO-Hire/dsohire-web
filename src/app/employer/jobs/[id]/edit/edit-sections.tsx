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

import { useMemo, useRef, useState, useTransition } from "react";
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
  updateJobSchedule,
  type JobActionState,
} from "../../actions";
import { RecommendedQuestionsPanel } from "../../recommended-questions-panel";
import { JdGeneratorPanel } from "../../jd-generator-panel";
import { ChipArrayInput } from "@/app/candidate/profile/edit-sheet";
import { CORPORATE_FUNCTIONS } from "@/lib/corporate/functions";
import { ExternalLinksField } from "@/components/external-links-field";
import { CompensationSection } from "../../compensation-section";
// #128 Phase D — structured dental comp on the edit surface (same
// builder + children-slot pattern as the create wizard).
import {
  CompModelBuilder,
  type CompModelState,
} from "../../comp-model-builder";
import {
  evaluateJobPosting,
  describeRequirement,
  describeJurisdictions,
} from "@/lib/compliance/pay-transparency";
import { VerificationRequirements } from "../../verification-requirements";
import type { VerificationTypeValue } from "@/lib/verifications/types";
import {
  getAllDentalSkills,
  getAllDentalSkillsPrioritized,
  getJobRequirementsPrioritized,
  BENEFITS,
} from "@/lib/candidate/canonical-lists";
import {
  SCOPE_OPTIONS,
  KnockoutAuthoring,
  type LocationOption,
  type WizardScreeningQuestion,
  type ScreeningQuestionKind,
  type ScreeningQuestionOption,
  type JobScope,
} from "../../job-wizard";

/* ───── Constants ───── */

// #77 (2026-06-12) — expanded practice-level roles (DSOFit_Spec
// taxonomy). Regional Manager stays HERE — existing RM jobs must
// remain editable (the create wizard no longer offers it; new
// multi-site leadership posts go through the corporate wizard).
const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "dentist", label: "Dentist" },
  { value: "specialist", label: "Specialist Dentist" },
  { value: "dental_hygienist", label: "Dental Hygienist" },
  { value: "dental_therapist", label: "Dental Therapist" },
  { value: "dental_assistant", label: "Dental Assistant (RDA/CDA/EFDA)" },
  { value: "sterilization_tech", label: "Sterilization Technician" },
  { value: "lab_tech", label: "Dental Lab Technician" },
  { value: "front_office", label: "Front Desk / Patient Coordinator" },
  { value: "treatment_coordinator", label: "Treatment Coordinator" },
  {
    value: "financial_coordinator",
    label: "Financial / Insurance Coordinator",
  },
  { value: "scheduling_coordinator", label: "Scheduling Coordinator" },
  { value: "office_manager", label: "Office Manager" },
  { value: "practice_administrator", label: "Practice Administrator" },
  { value: "regional_manager", label: "Regional Manager" },
  { value: "other", label: "Other" },
];

const EMPLOYMENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  // #128 — relabel only; stored value untouched (classification field carries W-2/1099 now).
  { value: "contract", label: "Temporary / locum-style (contract)" },
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
  scale: "Scale (slider)",
};

const STATUS_OPTIONS: Array<{ value: string; label: string; helper: string }> = [
  { value: "draft", label: "Draft", helper: "Only your team can see it." },
  { value: "active", label: "Active", helper: "Live on the public job board." },
  { value: "paused", label: "Paused", helper: "Hidden from candidates, kept in your dashboard." },
  { value: "filled", label: "Filled", helper: "Closed because you hired someone." },
];

// v1.1 — mirrors src/lib/candidate/canonical-lists.ts SPECIALTIES.
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

/* ───── Initial-data shape (mirrors JobWizardInitial) ───── */

export interface EditSectionsInitial {
  id: string;
  title: string;
  description: string;
  employment_type: string;
  role_category: string;
  /** #128 — structured comp, pre-mapped by the page into builder state
   * (strings). EMPTY_COMP_MODEL_STATE for legacy/simple jobs. */
  comp_model_state: CompModelState;
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_period: string | null;
  compensation_type: "range" | "starting_at" | "up_to" | "exact" | "doe";
  compensation_visible: boolean;
  // 2026-05-14 — composable compensation components.
  variable_comp_enabled: boolean;
  variable_comp_target: number | null;
  variable_comp_structure: string | null;
  bonus_enabled: boolean;
  bonus_target: number | null;
  bonus_structure: string | null;
  equity_offered: boolean;
  equity_note: string | null;
  benefits: string[];
  requirements: string | null;
  status: string;
  // E1.18 — posting schedule (auto-expire + scheduled publish).
  expires_at: string | null;
  scheduled_publish_at: string | null;
  location_ids: string[];
  skills: string[];
  hide_stages_from_candidate: boolean;
  scope: JobScope;
  // v1.1 — PracticeFit scoring inputs
  specialty: string[];
  min_years_experience: number | null;
  // Track F — PracticeFit schedule overlap inputs
  schedule_days: string[];
  schedule_evenings: boolean;
  schedule_weekends: boolean;
  // 5G.c (2026-05-13) — corporate function slug; only meaningful when scope=corporate.
  corporate_function: string | null;
  // E1.12 Slice B (2026-05-13) — external links {label,url} pairs.
  external_links: Array<{ label: string; url: string }>;
  // 5G.e Tier 2 (2026-05-14) — verification requirements the role needs.
  verification_requirements: string[];
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
        initialScope={initial.scope}
        initialCorporateFunction={initial.corporate_function}
        initialLocationIds={initial.location_ids}
        locations={locations}
      />
      <DescriptionSection
        dsoId={dsoId}
        jobId={initial.id}
        initialDescription={initial.description}
        initialTitle={initial.title}
        roleCategory={initial.role_category}
        initialLocationIds={initial.location_ids}
      />
      <DetailsSection
        dsoId={dsoId}
        jobId={initial.id}
        roleCategory={initial.role_category}
        jobLocations={locations
          .filter((l) => initial.location_ids.includes(l.id))
          .map((l) => ({ id: l.id, state: l.state, city: l.city }))}
        initialCompModelState={initial.comp_model_state}
        initialCompType={initial.compensation_type}
        initialCompMin={initial.compensation_min}
        initialCompMax={initial.compensation_max}
        initialCompPeriod={initial.compensation_period ?? ""}
        initialCompVisible={initial.compensation_visible}
        initialVariableCompEnabled={initial.variable_comp_enabled}
        initialVariableCompTarget={initial.variable_comp_target}
        initialVariableCompStructure={initial.variable_comp_structure}
        initialBonusEnabled={initial.bonus_enabled}
        initialBonusTarget={initial.bonus_target}
        initialBonusStructure={initial.bonus_structure}
        initialEquityOffered={initial.equity_offered}
        initialEquityNote={initial.equity_note}
        initialSkills={initial.skills}
        initialBenefits={initial.benefits}
        initialRequirements={initial.requirements ?? ""}
        initialHideStages={initial.hide_stages_from_candidate}
        initialSpecialty={initial.specialty}
        initialMinYearsExperience={initial.min_years_experience}
        initialScheduleDays={initial.schedule_days}
        initialScheduleEvenings={initial.schedule_evenings}
        initialScheduleWeekends={initial.schedule_weekends}
        initialExternalLinks={initial.external_links}
        initialVerificationRequirements={initial.verification_requirements}
      />
      <ScreeningSection
        dsoId={dsoId}
        jobId={initial.id}
        roleCategory={initial.role_category}
        initialQuestions={initialQuestions}
      />
      <ScheduleSection
        jobId={initial.id}
        status={initial.status}
        initialExpiresAt={initial.expires_at}
        initialScheduledPublishAt={initial.scheduled_publish_at}
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
  initialScope,
  initialCorporateFunction,
  initialLocationIds,
  locations,
}: {
  dsoId: string;
  jobId: string;
  initialTitle: string;
  initialRoleCategory: string;
  initialEmploymentType: string;
  initialScope: JobScope;
  initialCorporateFunction: string | null;
  initialLocationIds: string[];
  locations: LocationOption[];
}) {
  const [title, setTitle] = useState(initialTitle);
  const [roleCategory, setRoleCategory] = useState(initialRoleCategory);
  const [employmentType, setEmploymentType] = useState(initialEmploymentType);
  const [scope, setScope] = useState<JobScope>(initialScope);
  const [corporateFunction, setCorporateFunction] = useState<string>(
    initialCorporateFunction ?? ""
  );
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
    scope: initialScope,
    corporateFunction: initialCorporateFunction ?? "",
    locationIds: [...initialLocationIds].sort().join("|"),
  });

  const currentLocationKey = [...selectedLocationIds].sort().join("|");
  const dirty =
    title !== snapshot.title ||
    roleCategory !== snapshot.roleCategory ||
    employmentType !== snapshot.employmentType ||
    scope !== snapshot.scope ||
    corporateFunction !== snapshot.corporateFunction ||
    currentLocationKey !== snapshot.locationIds;

  const onSave = () => {
    setError(null);
    setSaved(false);
    if (!title.trim()) return setError("Add a job title.");
    // 5G.a (2026-05-13) — corporate-scope jobs treat locations as an
    // optional anchor. Mirror the wizard's per-scope validation: location
    // + regional still require ≥1 practice; corporate can leave blank.
    if (scope !== "corporate" && selectedLocationIds.size === 0)
      return setError("Pick at least one practice location.");

    const fd = new FormData();
    fd.set("job_id", jobId);
    fd.set("dso_id", dsoId);
    fd.set("title", title.trim());
    fd.set("role_category", roleCategory);
    fd.set("employment_type", employmentType);
    fd.set("scope", scope);
    if (scope === "corporate" && corporateFunction) {
      fd.set("corporate_function", corporateFunction);
    }
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
        scope,
        corporateFunction,
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
        {/* 5G.c follow-up (Cam catch 2026-05-13) — corporate scope hides
            role_category; corporate_function takes its place. */}
        <div
          className={
            scope === "corporate"
              ? "grid grid-cols-1 gap-4"
              : "grid grid-cols-1 sm:grid-cols-2 gap-4"
          }
        >
          {scope !== "corporate" && (
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
          )}
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
            {scope === "corporate" ? "Anchor location" : "Practice locations"}{" "}
            {scope === "corporate" ? (
              <span className="text-slate-meta font-normal normal-case tracking-[0.3px]">
                (optional)
              </span>
            ) : (
              <span className="text-heritage">*</span>
            )}
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
          <p className="mt-2 text-[12px] text-slate-meta">
            {scope === "corporate"
              ? "Corporate roles are DSO-wide. Pick an anchor practice if the role reports out of one, or leave blank for fully remote / floating roles."
              : scope === "regional"
                ? "Tag every practice this regional role covers. Hiring managers at any tagged practice will see this job."
                : "Tag every location this job is open at. We render separate location-specific listings on the public job board automatically."}
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
                  onChange={() => {
                    setScope(opt.value);
                    setSaved(false);
                  }}
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
            Owners, admins, and recruiters always see every job — scope only
            changes what hiring managers see.
          </p>
        </div>

        {/* 5G.c — corporate function selector. Mirrors the wizard surface.
            Only renders when scope=corporate. */}
        {scope === "corporate" && (
          <div>
            <label
              htmlFor="corporate_function_edit"
              className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
            >
              Corporate function{" "}
              <span className="text-slate-meta font-normal normal-case tracking-[0.3px]">
                (optional)
              </span>
            </label>
            <select
              id="corporate_function_edit"
              value={corporateFunction}
              onChange={(e) => {
                setCorporateFunction(e.target.value);
                setSaved(false);
              }}
              className="w-full max-w-[420px] h-[44px] px-3 bg-white border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
            >
              <option value="">Not specified</option>
              {CORPORATE_FUNCTIONS.map((f) => (
                <option key={f.slug} value={f.slug}>
                  {f.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[12px] text-slate-meta">
              Powers the Corporate Roles tab filter on the public job
              board and the role-family landing pages.
            </p>
          </div>
        )}
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
  initialLocationIds,
}: {
  dsoId: string;
  jobId: string;
  initialDescription: string;
  initialTitle: string;
  roleCategory: string;
  /**
   * Snapshot of the job's currently-tagged locations from the parent
   * EditSections (passed through from the server-rendered initial
   * data). The JD generator uses these to resolve affiliation context
   * — if any are private-affiliation, the AI prompt switches to
   * practice-name-only mode (Phase 4.5.b launch-blocker).
   *
   * Note: this is the SAVED location set, not the in-flight basics-
   * section selection. If the recruiter changes locations in the
   * Basics section but hasn't saved, regenerating before saving uses
   * the prior location set. That's a fine seam for v1 — the wizard
   * (vs. the edit page) reads from live React state and gets the
   * up-to-date set. We can lift this to EditSections-level state if
   * the seam becomes a real problem, but it's not worth the refactor
   * today.
   */
  initialLocationIds: string[];
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
          locationIds={initialLocationIds}
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
        {/* data-jd-editor-anchor lets JdGeneratorPanel scroll into view
            after Apply so operators see the editable editor below. */}
        <div data-jd-editor-anchor="true" className="scroll-mt-24">
          <JobDescriptionEditor
            value={description}
            onChange={(v) => {
              setDescription(v);
              setSaved(false);
            }}
            placeholder="Describe the role, responsibilities, day-to-day, and what makes this DSO a great place to work…"
          />
        </div>
        <p className="text-[12px] text-slate-meta">
          Headings, bold/italic, lists, links, and blockquotes supported. Skip
          H1 — that&apos;s reserved for the page title. The AI draft above is a
          read-only preview — your edits live below.
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
  roleCategory,
  jobLocations,
  initialCompModelState,
  initialCompType,
  initialCompMin,
  initialCompMax,
  initialCompPeriod,
  initialCompVisible,
  initialVariableCompEnabled,
  initialVariableCompTarget,
  initialVariableCompStructure,
  initialBonusEnabled,
  initialBonusTarget,
  initialBonusStructure,
  initialEquityOffered,
  initialEquityNote,
  initialSkills,
  initialBenefits,
  initialRequirements,
  initialHideStages,
  initialSpecialty,
  initialMinYearsExperience,
  initialScheduleDays,
  initialScheduleEvenings,
  initialScheduleWeekends,
  initialExternalLinks,
  initialVerificationRequirements,
}: {
  dsoId: string;
  jobId: string;
  roleCategory: string;
  jobLocations: Array<{ id: string; state: string | null; city: string | null }>;
  initialCompModelState: CompModelState;
  initialCompType: "range" | "starting_at" | "up_to" | "exact" | "doe";
  initialCompMin: number | null;
  initialCompMax: number | null;
  initialCompPeriod: string;
  initialCompVisible: boolean;
  // 2026-05-14 — composable compensation components.
  initialVariableCompEnabled: boolean;
  initialVariableCompTarget: number | null;
  initialVariableCompStructure: string | null;
  initialBonusEnabled: boolean;
  initialBonusTarget: number | null;
  initialBonusStructure: string | null;
  initialEquityOffered: boolean;
  initialEquityNote: string | null;
  initialSkills: string[];
  initialBenefits: string[];
  initialRequirements: string;
  initialHideStages: boolean;
  initialSpecialty: string[];
  initialMinYearsExperience: number | null;
  initialScheduleDays: string[];
  initialScheduleEvenings: boolean;
  initialScheduleWeekends: boolean;
  initialExternalLinks: Array<{ label: string; url: string }>;
  initialVerificationRequirements: string[];
}) {
  // v1.8 — comp type drives input shape.
  const [compType, setCompType] = useState<
    "range" | "starting_at" | "up_to" | "exact" | "doe"
  >(initialCompType);
  const [compMin, setCompMin] = useState(
    initialCompMin !== null ? String(initialCompMin) : ""
  );
  const [compMax, setCompMax] = useState(
    initialCompMax !== null ? String(initialCompMax) : ""
  );
  const [compPeriod, setCompPeriod] = useState(initialCompPeriod);
  const [compVisible, setCompVisible] = useState(initialCompVisible);
  // Day 24 — pay-transparency exemption self-cert on the edit page.
  const [payExempt, setPayExempt] = useState(false);
  // 2026-05-14 — composable compensation components. Numeric targets are
  // STRINGS in section state (mirrors compMin/compMax); the server parser
  // coerces to int. The _enabled flag is the source of truth.
  const [variableCompEnabled, setVariableCompEnabled] = useState(
    initialVariableCompEnabled
  );
  const [variableCompTarget, setVariableCompTarget] = useState(
    initialVariableCompTarget !== null
      ? String(initialVariableCompTarget)
      : ""
  );
  const [variableCompStructure, setVariableCompStructure] = useState(
    initialVariableCompStructure ?? ""
  );
  const [bonusEnabled, setBonusEnabled] = useState(initialBonusEnabled);
  const [bonusTarget, setBonusTarget] = useState(
    initialBonusTarget !== null ? String(initialBonusTarget) : ""
  );
  const [bonusStructure, setBonusStructure] = useState(
    initialBonusStructure ?? ""
  );
  // #128 — structured comp (single object, same shape as the wizard).
  const [compModelState, setCompModelState] = useState<CompModelState>(
    initialCompModelState
  );
  const [equityOffered, setEquityOffered] = useState(initialEquityOffered);
  const [equityNote, setEquityNote] = useState(initialEquityNote ?? "");
  // v1.6 — string[] chip-picker, not legacy comma-string.
  const [skills, setSkills] = useState<string[]>(initialSkills);
  const [benefits, setBenefits] = useState<string[]>(initialBenefits);
  const [requirements, setRequirements] = useState(initialRequirements);
  const [hideStages, setHideStages] = useState(initialHideStages);
  // v1.1 — PracticeFit fields. specialty as a Set for chip-toggle ergonomics.
  const [specialty, setSpecialty] = useState<Set<string>>(
    new Set(initialSpecialty)
  );
  const [minYearsExperience, setMinYearsExperience] = useState(
    initialMinYearsExperience !== null
      ? String(initialMinYearsExperience)
      : ""
  );
  // Track F — PracticeFit schedule overlap inputs.
  const [scheduleDays, setScheduleDays] = useState<Set<string>>(
    new Set(initialScheduleDays)
  );
  const [scheduleEvenings, setScheduleEvenings] = useState(
    initialScheduleEvenings
  );
  const [scheduleWeekends, setScheduleWeekends] = useState(
    initialScheduleWeekends
  );
  // E1.12 Slice B — external links state.
  const [externalLinks, setExternalLinks] =
    useState<Array<{ label: string; url: string }>>(initialExternalLinks);
  // 5G.e Tier 2 — verification requirements as a Set<string>, mirroring
  // the specialty / scheduleDays chip-toggle ergonomics.
  const [verificationRequirements, setVerificationRequirements] = useState<
    Set<string>
  >(new Set(initialVerificationRequirements));

  const initialSpecialtyKey = [...initialSpecialty].sort().join(",");
  const initialVerificationKey = [...initialVerificationRequirements]
    .sort()
    .join(",");
  const initialScheduleDaysKey = [...initialScheduleDays].sort().join(",");
  const initialSnapshot = {
    compModelKey: JSON.stringify(initialCompModelState),
    compType: initialCompType,
    compMin: initialCompMin !== null ? String(initialCompMin) : "",
    compMax: initialCompMax !== null ? String(initialCompMax) : "",
    compPeriod: initialCompPeriod,
    compVisible: initialCompVisible,
    // 2026-05-14 — composable compensation components. Targets stored as
    // strings to match the section state shape.
    variableCompEnabled: initialVariableCompEnabled,
    variableCompTarget:
      initialVariableCompTarget !== null
        ? String(initialVariableCompTarget)
        : "",
    variableCompStructure: initialVariableCompStructure ?? "",
    bonusEnabled: initialBonusEnabled,
    bonusTarget:
      initialBonusTarget !== null ? String(initialBonusTarget) : "",
    bonusStructure: initialBonusStructure ?? "",
    equityOffered: initialEquityOffered,
    equityNote: initialEquityNote ?? "",
    // v1.6 — store as sorted-join key so order changes don't trigger
    // false dirty state.
    skills: [...initialSkills].sort().join("|"),
    benefits: [...initialBenefits].sort().join("|"),
    requirements: initialRequirements,
    hideStages: initialHideStages,
    specialtyKey: initialSpecialtyKey,
    minYearsExperience:
      initialMinYearsExperience !== null
        ? String(initialMinYearsExperience)
        : "",
    scheduleDaysKey: initialScheduleDaysKey,
    scheduleEvenings: initialScheduleEvenings,
    scheduleWeekends: initialScheduleWeekends,
    externalLinksKey: JSON.stringify(initialExternalLinks),
    verificationKey: initialVerificationKey,
  };
  const [snapshot, setSnapshot] = useState(initialSnapshot);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const specialtyKey = [...specialty].sort().join(",");
  const skillsKey = [...skills].sort().join("|");
  const benefitsKey = [...benefits].sort().join("|");
  const scheduleDaysKey = [...scheduleDays].sort().join(",");
  const externalLinksKey = JSON.stringify(externalLinks);
  const verificationKey = [...verificationRequirements].sort().join(",");
  const compModelKey = JSON.stringify(compModelState);
  const dirty =
    compModelKey !== snapshot.compModelKey ||
    compType !== snapshot.compType ||
    compMin !== snapshot.compMin ||
    compMax !== snapshot.compMax ||
    compPeriod !== snapshot.compPeriod ||
    compVisible !== snapshot.compVisible ||
    variableCompEnabled !== snapshot.variableCompEnabled ||
    variableCompTarget !== snapshot.variableCompTarget ||
    variableCompStructure !== snapshot.variableCompStructure ||
    bonusEnabled !== snapshot.bonusEnabled ||
    bonusTarget !== snapshot.bonusTarget ||
    bonusStructure !== snapshot.bonusStructure ||
    equityOffered !== snapshot.equityOffered ||
    equityNote !== snapshot.equityNote ||
    skillsKey !== snapshot.skills ||
    benefitsKey !== snapshot.benefits ||
    requirements !== snapshot.requirements ||
    hideStages !== snapshot.hideStages ||
    specialtyKey !== snapshot.specialtyKey ||
    minYearsExperience !== snapshot.minYearsExperience ||
    scheduleDaysKey !== snapshot.scheduleDaysKey ||
    scheduleEvenings !== snapshot.scheduleEvenings ||
    scheduleWeekends !== snapshot.scheduleWeekends ||
    externalLinksKey !== snapshot.externalLinksKey ||
    verificationKey !== snapshot.verificationKey;

  const touch = () => setSaved(false);

  // Pay-transparency — same client mirror as the wizard, scoped to the job's
  // saved locations. Drives the adaptive comp UI on the edit page.
  const payAssessment = useMemo(
    () =>
      evaluateJobPosting({
        locations: jobLocations,
        workMode: null,
        remoteStates: [],
        compType,
        compMin: compMin.trim() ? Number(compMin) : null,
        compMax: compMax.trim() ? Number(compMax) : null,
        compVisible,
        hasBenefits: benefits.length > 0,
      }),
    [jobLocations, compType, compMin, compMax, compVisible, benefits]
  );
  const payTransparency = useMemo(() => {
    if (payAssessment.covered.length === 0) return null;
    return {
      requiresRange: payAssessment.requiresRange,
      requiresBenefits: payAssessment.requiresBenefits,
      coveredLabel: describeJurisdictions(
        payAssessment.rangeDrivers.length
          ? payAssessment.rangeDrivers
          : payAssessment.benefitsDrivers
      ),
      message: describeRequirement(payAssessment) ?? "",
      remoteRisk: payAssessment.remoteRisk,
      remoteRiskLabel: describeJurisdictions(payAssessment.remoteRiskStates),
    };
  }, [payAssessment]);

  const onSave = () => {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("job_id", jobId);
    fd.set("dso_id", dsoId);
    // v1.8 — compensation_type drives the canonical shape downstream;
    // keep min/max consistent with type before submitting.
    fd.set("compensation_type", compType);
    if (compType === "range") {
      fd.set("compensation_min", compMin);
      fd.set("compensation_max", compMax);
    } else if (compType === "starting_at") {
      fd.set("compensation_min", compMin);
      fd.set("compensation_max", "");
    } else if (compType === "up_to") {
      fd.set("compensation_min", "");
      fd.set("compensation_max", compMax);
    } else if (compType === "exact") {
      fd.set("compensation_min", compMin);
      fd.set("compensation_max", compMin);
    } else {
      fd.set("compensation_min", "");
      fd.set("compensation_max", "");
    }
    fd.set("compensation_period", compType === "doe" ? "" : compPeriod);
    if (compVisible || (payTransparency?.requiresRange && !payExempt))
      fd.set("compensation_visible", "on");
    if (payExempt) fd.set("pay_transparency_exempt", "on");
    // 2026-05-14 — composable compensation components. Checkbox convention:
    // _enabled set "on" only when enabled, omitted when off. Targets +
    // structures always sent as strings (may be ""). Identical contract to
    // the wizard's handleSubmit and the corporate side.
    if (variableCompEnabled) fd.set("variable_comp_enabled", "on");
    fd.set("variable_comp_target", variableCompTarget);
    fd.set("variable_comp_structure", variableCompStructure);
    if (bonusEnabled) fd.set("bonus_enabled", "on");
    fd.set("bonus_target", bonusTarget);
    fd.set("bonus_structure", bonusStructure);
    if (equityOffered) fd.set("equity_offered", "on");
    fd.set("equity_note", equityNote);
    // #128 — structured dental comp (identical contract to the wizard's
    // handleSubmit; parseComp128 reads both).
    fd.set("comp_model", compModelState.compModel);
    if (compModelState.compModel !== "simple") {
      fd.set("guarantee_kind", compModelState.guaranteeKind);
      fd.set("guarantee_amount", compModelState.guaranteeAmount);
      fd.set("guarantee_duration", compModelState.guaranteeDuration);
      fd.set("percent_rate_min", compModelState.percentRateMin);
      fd.set("percent_rate_max", compModelState.percentRateMax);
      fd.set("percent_basis", compModelState.percentBasis);
      fd.set("percent_tiers_note", compModelState.percentTiersNote);
      fd.set("hygiene_exam_credited", compModelState.hygieneExamCredited);
      fd.set(
        "hygienist_work_credited",
        compModelState.hygienistWorkCredited
      );
      fd.set("lab_fee_policy", compModelState.labFeePolicy);
      fd.set("basis_exclusions_note", compModelState.basisExclusionsNote);
      fd.set("pay_cadence", compModelState.payCadence);
      fd.set("est_annual_min", compModelState.estAnnualMin);
      fd.set("est_annual_max", compModelState.estAnnualMax);
    }
    fd.set("worker_classification", compModelState.workerClassification);
    if (hideStages) fd.set("hide_stages_from_candidate", "on");
    // v1.6 — multi-value submission for chip-pickers.
    for (const s of skills) fd.append("skills", s);
    for (const b of benefits) fd.append("benefits", b);
    fd.set("requirements", requirements);
    for (const sp of specialty) fd.append("specialty", sp);
    fd.set("min_years_experience", minYearsExperience);
    for (const d of scheduleDays) fd.append("schedule_days", d);
    if (scheduleEvenings) fd.set("schedule_evenings", "on");
    if (scheduleWeekends) fd.set("schedule_weekends", "on");
    // E1.12 Slice B — external link pair arrays + sentinel.
    for (const link of externalLinks) {
      fd.append("external_link_label", link.label);
      fd.append("external_link_url", link.url);
    }
    fd.set("external_links_submitted", "1");
    // 5G.e Tier 2 — one repeated entry per ticked verification type.
    // Same FormData field name + shape the wizard emits.
    for (const v of verificationRequirements) {
      fd.append("verification_requirements", v);
    }

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
        compModelKey,
        compType,
        compMin,
        compMax,
        compPeriod,
        compVisible,
        variableCompEnabled,
        variableCompTarget,
        variableCompStructure,
        bonusEnabled,
        bonusTarget,
        bonusStructure,
        equityOffered,
        equityNote,
        skills: skillsKey,
        benefits: benefitsKey,
        requirements,
        hideStages,
        specialtyKey,
        minYearsExperience,
        scheduleDaysKey,
        scheduleEvenings,
        scheduleWeekends,
        externalLinksKey,
        verificationKey,
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
        {/* 2026-05-14 — composable compensation editor. Replaces the old
            inline comp-type / min-max / show-pay fieldset; the shared
            CompensationSection now OWNS the whole comp UI. Every setter is
            wrapped to also call touch() so the per-section dirty tracker
            lights up the Save button. */}
        <CompModelBuilder
          state={compModelState}
          onState={(next) => {
            setCompModelState(next);
            touch();
          }}
          roleCategory={roleCategory}
          specialty={specialty}
          payTransparency={
            payTransparency
              ? {
                  requiresRange: payTransparency.requiresRange,
                  coveredLabel: payTransparency.coveredLabel,
                }
              : null
          }
        >
        <CompensationSection
          accent="heritage"
          roleCategory={roleCategory}
          benchmarkState={jobLocations.find((l) => l.state)?.state ?? null}
          benchmarkLocationId={
            jobLocations.find((l) => l.state)?.id ?? jobLocations[0]?.id ?? null
          }
          enforcement={
            payTransparency
              ? {
                  ...payTransparency,
                  exempt: payExempt,
                  onExempt: (v) => {
                    setPayExempt(v);
                    touch();
                  },
                }
              : undefined
          }
          compType={compType}
          onCompType={(v) => {
            setCompType(v);
            touch();
          }}
          compMin={compMin}
          onCompMin={(v) => {
            setCompMin(v);
            touch();
          }}
          compMax={compMax}
          onCompMax={(v) => {
            setCompMax(v);
            touch();
          }}
          compPeriod={compPeriod}
          onCompPeriod={(v) => {
            setCompPeriod(v);
            touch();
          }}
          compVisible={compVisible}
          onCompVisible={(v) => {
            setCompVisible(v);
            touch();
          }}
          variableCompEnabled={variableCompEnabled}
          onVariableCompEnabled={(v) => {
            setVariableCompEnabled(v);
            touch();
          }}
          variableCompTarget={variableCompTarget}
          onVariableCompTarget={(v) => {
            setVariableCompTarget(v);
            touch();
          }}
          variableCompStructure={variableCompStructure}
          onVariableCompStructure={(v) => {
            setVariableCompStructure(v);
            touch();
          }}
          bonusEnabled={bonusEnabled}
          onBonusEnabled={(v) => {
            setBonusEnabled(v);
            touch();
          }}
          bonusTarget={bonusTarget}
          onBonusTarget={(v) => {
            setBonusTarget(v);
            touch();
          }}
          bonusStructure={bonusStructure}
          onBonusStructure={(v) => {
            setBonusStructure(v);
            touch();
          }}
          equityOffered={equityOffered}
          onEquityOffered={(v) => {
            setEquityOffered(v);
            touch();
          }}
          equityNote={equityNote}
          onEquityNote={(v) => {
            setEquityNote(v);
            touch();
          }}
        />
        </CompModelBuilder>

        <fieldset className="border border-[var(--rule)] p-5 bg-cream/40">
          <legend className="px-2 text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep">
            Match scoring
          </legend>
          <p className="mt-1 text-[12px] text-slate-meta leading-relaxed">
            Drives PracticeFit — the proprietary match score on every
            application. Both fields are optional; the score adapts to
            whatever you fill in.
          </p>
          <div className="mt-4">
            <label className="block text-[12px] font-semibold text-ink mb-2">
              Specialty{" "}
              <span className="text-slate-meta font-normal">
                (pick any that apply)
              </span>
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
                      setSpecialty(next);
                      touch();
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
              onChange={(v) => {
                setMinYearsExperience(v);
                touch();
              }}
            />
            <p className="mt-1 text-[11px] text-slate-meta">
              Leave blank if there&apos;s no minimum. Excluded from the
              score when blank — doesn&apos;t penalize newer candidates.
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
                      setScheduleDays(next);
                      touch();
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
                  onChange={(e) => {
                    setScheduleEvenings(e.target.checked);
                    touch();
                  }}
                  className="mt-1 accent-heritage"
                />
                <span>Evening hours (5pm or later)</span>
              </label>
              <label className="inline-flex items-start gap-2 text-[12px] text-ink">
                <input
                  type="checkbox"
                  checked={scheduleWeekends}
                  onChange={(e) => {
                    setScheduleWeekends(e.target.checked);
                    touch();
                  }}
                  className="mt-1 accent-heritage"
                />
                <span>Weekend shifts (Sat/Sun)</span>
              </label>
            </div>
            <p className="mt-2 text-[11px] text-slate-meta">
              Powers PracticeFit&apos;s schedule overlap dimension. Leave
              blank if scheduling is flexible.
            </p>
          </div>
        </fieldset>

        {/* v1.6 — canonical chip-pickers. Same vocabulary the candidate
            side uses, so skills + benefits actually match between sides. */}
        <ChipArrayInput
          label="Preferred skills"
          values={skills}
          onChange={(next) => {
            setSkills(next);
            touch();
          }}
          // Role-aware ordering: role-specific skills surface first in
          // the quick-add chips (capped at 12), then universal, then
          // everything else alphabetically. Mirror of the new-wizard
          // change so create + edit experiences match.
          options={getAllDentalSkillsPrioritized(roleCategory)}
          placeholder="Search skills — type and press Enter for custom"
          helper="Skills you'd like to see in candidates — not a hard filter. Custom entries allowed; canonical picks match candidate vocab best."
        />
        <ChipArrayInput
          label="Benefits"
          values={benefits}
          onChange={(next) => {
            setBenefits(next);
            touch();
          }}
          options={BENEFITS}
          placeholder="Search benefits — type and press Enter for custom"
          helper="Standard DSO benefits. Pick what applies."
        />

        {/* E1.12 Slice B — external links recruiter UX, same component as
            the wizard surface. */}
        <ExternalLinksField
          initial={externalLinks}
          onChange={(next) => {
            setExternalLinks(next);
            touch();
          }}
        />

        {/* Note 6 (Dave 2026-05-21) — role-aware Requirements chip picker.
            Mirror of the new-wizard change so create + edit experiences match.
            Stored value stays a newline-joined string (text column unchanged;
            listing renders whitespace-pre-wrap). Custom typing still allowed. */}
        <ChipArrayInput
          label="Requirements"
          values={requirements
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)}
          onChange={(vals) => {
            setRequirements(vals.join("\n"));
            touch();
          }}
          options={getJobRequirementsPrioritized(roleCategory)}
          placeholder="Search requirements — type and press Enter for custom"
          helper="Must-haves for the role — license, education, experience. Pick from role-specific suggestions or type your own; each becomes one line on the listing."
        />

        {/* 5G.e Tier 2 — verification requirements checklist. Shared
            component, same surface as the wizard's Details step. */}
        <VerificationRequirements
          accent="heritage"
          selected={verificationRequirements}
          onToggle={(value: VerificationTypeValue) => {
            setVerificationRequirements((prev) => {
              const next = new Set(prev);
              if (next.has(value)) next.delete(value);
              else next.add(value);
              return next;
            });
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

  // Cam UX 2026-05-13 PM — collapsed-card mode. Every question card
  // starts collapsed (just prompt + chips + Edit button). The employer
  // clicks Edit on a card to expand its form fields. Auto-expands a
  // freshly-added card so the empty prompt gets immediate keyboard
  // focus. Pre-existing DB-loaded questions and recommended-Q adds both
  // start collapsed — the editor is for tweaks, not initial composition.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = snapshotQuestions(questions) !== snapshot;
  const touch = () => setSaved(false);

  const addQuestion = (kind: ScreeningQuestionKind) => {
    const newId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const newQ: WizardScreeningQuestion = {
      id: newId,
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
          : kind === "scale"
            ? // #71 — scale stores its two end labels in options (low/high).
              [
                { id: "low", label: "" },
                { id: "high", label: "" },
              ]
            : null,
      required: false,
      sort_order: questions.length,
    };
    setQuestions((qs) => [...qs, newQ]);
    // Auto-expand the new card — it has an empty prompt and needs
    // immediate attention; making the employer click Edit just to type
    // a prompt would be silly.
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(newId);
      return next;
    });
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

  // #73 — drag-to-reorder (collapsed cards); arrows stay as fallback.
  const dragIndex = useRef<number | null>(null);
  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setQuestions((qs) => {
      const next = [...qs];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
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
          // E2.10 — pass knockout fields through to the server. Without
          // these the server-side validateKnockoutCorrectAnswer never
          // sees the operator's selection and the toggle round-trips
          // back as off after Save.
          knockout: Boolean(q.knockout),
          knockout_correct_answer: q.knockout
            ? q.knockout_correct_answer ?? null
            : null,
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
        />

        {questions.length === 0 && (
          <div className="border border-dashed border-[var(--rule-strong)] p-5 text-center bg-cream/40">
            <p className="text-[14px] text-slate-body">
              No screening questions yet. Add one below or apply a recommended
              set above.
            </p>
          </div>
        )}

        {questions.length >= 2 && (
          <p className="text-[12px] text-slate-meta">
            Drag a collapsed card to reorder — or use the arrows.
          </p>
        )}

        {questions.map((q, idx) => {
          const collapsed = !expandedIds.has(q.id);
          return (
            <div
              key={q.id}
              draggable={collapsed}
              onDragStart={(e) => {
                dragIndex.current = idx;
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragIndex.current !== null && dragIndex.current !== idx)
                  e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex.current !== null) reorder(dragIndex.current, idx);
                dragIndex.current = null;
              }}
              onDragEnd={() => {
                dragIndex.current = null;
              }}
              className={collapsed ? "cursor-grab active:cursor-grabbing" : ""}
            >
              <QuestionCard
                question={q}
                index={idx}
                total={questions.length}
                expanded={expandedIds.has(q.id)}
                onToggleExpand={() => toggleExpand(q.id)}
                onUpdate={(patch) => updateQ(q.id, patch)}
                onRemove={() => removeQ(q.id)}
                onMove={(dir) => move(q.id, dir)}
              />
            </div>
          );
        })}

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
                "scale",
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
  expanded,
  onToggleExpand,
  onUpdate,
  onRemove,
  onMove,
}: {
  question: WizardScreeningQuestion;
  index: number;
  total: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (patch: Partial<WizardScreeningQuestion>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const isSelect =
    question.kind === "single_select" || question.kind === "multi_select";
  const isScale = question.kind === "scale";
  const scaleLabel = (id: "low" | "high") =>
    (question.options ?? []).find((o) => o.id === id)?.label ?? "";

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

      {/* Cam UX 2026-05-13 PM — collapsed-mode summary. One line: prompt
          + Required/Knockout chips + Edit affordance. Clicking anywhere
          on the row expands the editor. Pre-existing cards start
          collapsed; newly-added cards start expanded (see addQuestion). */}
      {!expanded && (
        <button
          type="button"
          onClick={onToggleExpand}
          className="w-full text-left -mx-1 px-1 py-1 group rounded hover:bg-cream/50 transition-colors"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 text-[14px] text-ink truncate">
              {question.prompt.trim() ? (
                question.prompt
              ) : (
                <span className="italic text-slate-meta">
                  (empty prompt — click Edit to fill in)
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {question.required && (
                <span className="text-[9px] font-bold tracking-[1.2px] uppercase text-heritage-deep">
                  Required
                </span>
              )}
              {question.knockout && (
                <span className="text-[9px] font-bold tracking-[1.2px] uppercase text-amber-900 bg-amber-100 px-1.5 py-0.5">
                  Knockout
                </span>
              )}
              <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep group-hover:text-ink transition-colors ml-2">
                Edit →
              </span>
            </div>
          </div>
        </button>
      )}

      {expanded && (
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
        {isScale && (
          <div>
            <label className="block text-[13px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
              Slider end labels <span className="text-heritage">*</span>
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="text"
                value={scaleLabel("low")}
                onChange={(e) => updateOption("low", e.target.value)}
                placeholder="Left end (1) — e.g. Prefer clinical focus"
                className="px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
              />
              <input
                type="text"
                value={scaleLabel("high")}
                onChange={(e) => updateOption("high", e.target.value)}
                placeholder="Right end (5) — e.g. I love patient interaction"
                className="px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
              />
            </div>
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

        {/* E2.10 — Soft knockout toggle + per-kind correct-answer authoring.
            Imported from job-wizard.tsx so the edit-page renders the same
            UI the new-job wizard does. Cam catch 2026-05-13 — the toggle
            was missing here because this file has its own local QuestionCard
            that wasn't kept in sync with the wizard's. */}
        <KnockoutAuthoring question={question} onUpdate={onUpdate} />

        {/* Collapse button at the bottom of the expanded editor — lets
            the employer stash the card back to its summary state without
            scrolling up to the header. */}
        <div className="pt-2 border-t border-[var(--rule)] mt-1">
          <button
            type="button"
            onClick={onToggleExpand}
            className="text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink transition-colors"
          >
            ↑ Collapse this question
          </button>
        </div>
      </div>
      )}
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
      // E2.10 — track knockout fields so the dirty-state detector enables
      // Save when the operator toggles knockout / edits the correct-answer
      // payload. Without this the form looks like it accepted the change
      // (UI flips) but never lights up the Save button.
      knockout: Boolean(q.knockout),
      knockout_correct_answer: q.knockout ? q.knockout_correct_answer ?? null : null,
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

/**
 * Format a stored ISO instant into the "YYYY-MM-DD" a <input type="date">
 * expects, using LOCAL date parts so it matches the day the recruiter
 * picked (expiry is stored at 23:59:59, scheduled publish at 00:00:00, so
 * the local calendar day round-trips cleanly).
 */
function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ScheduleSection({
  jobId,
  status,
  initialExpiresAt,
  initialScheduledPublishAt,
}: {
  jobId: string;
  status: string;
  initialExpiresAt: string | null;
  initialScheduledPublishAt: string | null;
}) {
  const isDraft = status === "draft";
  const [expires, setExpires] = useState(isoToDateInput(initialExpiresAt));
  const [scheduled, setScheduled] = useState(
    isoToDateInput(initialScheduledPublishAt)
  );
  const [snapExpires, setSnapExpires] = useState(expires);
  const [snapScheduled, setSnapScheduled] = useState(scheduled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    expires !== snapExpires || (isDraft && scheduled !== snapScheduled);
  const today = isoToDateInput(new Date().toISOString());

  const onSave = () => {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("job_id", jobId);
    fd.set("expires_at", expires);
    // Scheduled publish only applies to drafts; the action ignores it for
    // non-drafts, but don't even send it so the intent is unambiguous.
    fd.set("scheduled_publish_at", isDraft ? scheduled : "");
    startTransition(async () => {
      const result: JobActionState = await updateJobSchedule({ ok: false }, fd);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save.");
        return;
      }
      setSnapExpires(expires);
      setSnapScheduled(scheduled);
      setSaved(true);
    });
  };

  return (
    <SectionShell
      title="Posting schedule"
      subtitle="Auto-expire the listing on a date, and (for drafts) schedule it to publish automatically."
    >
      <div className="space-y-5">
        {isDraft && (
          <div>
            <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
              Schedule publish for
            </label>
            <div className="flex items-center gap-3">
              <input
                type="date"
                min={today}
                value={scheduled}
                onChange={(e) => {
                  setScheduled(e.target.value);
                  setSaved(false);
                }}
                className="px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
              />
              {scheduled && (
                <button
                  type="button"
                  onClick={() => {
                    setScheduled("");
                    setSaved(false);
                  }}
                  className="text-[12px] font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
                >
                  Clear
                </button>
              )}
            </div>
            <p className="mt-2 text-[12px] text-slate-meta leading-relaxed">
              {scheduled
                ? "This draft will go live automatically at the start of that day. Leave it as a draft until then."
                : "Leave empty to keep this as a manual draft. Set a date to have it publish itself."}
            </p>
          </div>
        )}

        <div>
          <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
            Auto-expire on
          </label>
          <div className="flex items-center gap-3">
            <input
              type="date"
              min={today}
              value={expires}
              onChange={(e) => {
                setExpires(e.target.value);
                setSaved(false);
              }}
              className="px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
            />
            {expires && (
              <button
                type="button"
                onClick={() => {
                  setExpires("");
                  setSaved(false);
                }}
                className="text-[12px] font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
              >
                Clear
              </button>
            )}
          </div>
          <p className="mt-2 text-[12px] text-slate-meta leading-relaxed">
            {expires
              ? "The listing stays live through this day, then closes itself and drops off the public job board."
              : "Leave empty for no expiration — the listing stays live until you pause or fill it."}
          </p>
        </div>
      </div>
      <SaveBar
        dirty={dirty}
        saving={pending}
        saved={saved}
        error={error}
        onSave={onSave}
        saveLabel="Save schedule"
      />
    </SectionShell>
  );
}

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
