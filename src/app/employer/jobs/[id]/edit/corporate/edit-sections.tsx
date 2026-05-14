"use client";

/**
 * CorporateEditSections — sectioned edit form for a CORPORATE job posting
 * (Phase 5G.d, 2026-05-14).
 *
 * The corporate analogue of ../edit-sections.tsx. Five inline-editable
 * section cards, each with its own dirty-state tracker, Save button, and
 * per-section server action:
 *
 *   1. Basics                  — title, employment type, corporate function,
 *                                authority level, work mode (+ detail),
 *                                anchor location(s) → updateCorporateJobBasicsSection
 *   2. Description             — Tiptap editor → updateJobDescriptionSection
 *                                (scope-agnostic; reused from ../../../actions)
 *   3. Compensation & sandbox  — comp + the rest of the 16-column sandbox
 *                                → updateCorporateJobDetailsSection
 *   4. Screening               — custom screening-question CRUD
 *                                → updateCorporateJob (full save; corporate-
 *                                actions has no dedicated screening section
 *                                action, so screening saves go through the
 *                                whole-job update which syncs questions)
 *   5. Status                  → setJobStatus (scope-agnostic; reused)
 *
 * EDIT-PAGE PARITY: every per-field validation / label / behavior here
 * mirrors corporate-wizard.tsx exactly. 5G.a shipped wizard + edit page out
 * of sync and it caused a bug class — keep them lockstep.
 *
 * Reused: KnockoutAuthoring + WizardScreeningQuestion shape from job-wizard,
 * JobDescriptionEditor, ExternalLinksField. The corporate field enums come
 * from @/lib/corporate/job-fields. Input/Textarea/Select primitives are
 * re-declared locally (matching ../edit-sections.tsx, which does the same).
 *
 * NOTE on the Screening section: corporate-actions.ts exposes
 * updateCorporateJobBasicsSection + updateCorporateJobDetailsSection but no
 * standalone screening-section action. Rather than invent one, the Screening
 * card composes a full-job FormData payload and calls updateCorporateJob —
 * which runs syncScreeningQuestions. To keep updateCorporateJob's required-
 * field guards (title/description/corporate_function/authority_level/
 * work_mode) satisfied, the section is handed the job's saved values for
 * those fields as props and re-submits them unchanged.
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
import { JdGeneratorCorporatePanel } from "../../../jd-generator-corporate-panel";
import { CorporateRecommendedQuestionsPanel } from "../../../corporate-recommended-questions-panel";
import {
  updateJobDescriptionSection,
  setJobStatus,
} from "../../../actions";
import {
  updateCorporateJobBasicsSection,
  updateCorporateJobDetailsSection,
  updateCorporateJob,
  type JobActionState,
} from "../../../corporate-actions";
import {
  KnockoutAuthoring,
  type LocationOption,
  type WizardScreeningQuestion,
  type ScreeningQuestionKind,
  type ScreeningQuestionOption,
  type CompensationType,
} from "../../../job-wizard";
import { ExternalLinksField } from "@/components/external-links-field";
import { CORPORATE_FUNCTIONS } from "@/lib/corporate/functions";
import {
  WORK_MODES,
  TRAVEL_EXPECTATIONS,
  DIRECT_REPORTS_BANDS,
  INDIRECT_REPORTS_BANDS,
  AUTHORITY_LEVELS,
  EDUCATION_REQUIREMENTS,
  INDUSTRY_EXPERIENCES,
} from "@/lib/corporate/job-fields";

/* ───── Constants ───── */

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

const STATUS_OPTIONS: Array<{ value: string; label: string; helper: string }> =
  [
    { value: "draft", label: "Draft", helper: "Only your team can see it." },
    {
      value: "active",
      label: "Active",
      helper: "Live on the public job board.",
    },
    {
      value: "paused",
      label: "Paused",
      helper: "Hidden from candidates, kept in your dashboard.",
    },
    {
      value: "filled",
      label: "Filled",
      helper: "Closed because you hired someone.",
    },
  ];

const US_STATES: string[] = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
];

/* ───── Initial-data shape ───── */

export interface CorporateEditSectionsInitial {
  id: string;
  title: string;
  description: string;
  employment_type: string;
  corporate_function: string | null;
  authority_level: string | null;
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_period: string | null;
  compensation_type: CompensationType;
  compensation_visible: boolean;
  requirements: string | null;
  status: string;
  location_ids: string[];
  hide_stages_from_candidate: boolean;
  external_links: Array<{ label: string; url: string }>;
  work_mode: string | null;
  work_mode_detail: string | null;
  remote_state_restrictions: string[];
  travel_expectation: string | null;
  travel_territory: string | null;
  reports_to: string | null;
  direct_reports_band: string | null;
  indirect_reports_band: string | null;
  education_requirement: string | null;
  industry_experience: string | null;
  min_years_corporate_experience: number | null;
  max_years_corporate_experience: number | null;
  bonus_structure: string | null;
  equity_offered: boolean;
  equity_note: string | null;
}

interface CorporateEditSectionsProps {
  dsoId: string;
  initial: CorporateEditSectionsInitial;
  initialQuestions: WizardScreeningQuestion[];
  locations: LocationOption[];
}

/* ───── Top-level component ───── */

export function CorporateEditSections({
  dsoId,
  initial,
  initialQuestions,
  locations,
}: CorporateEditSectionsProps) {
  return (
    <div className="space-y-5 max-w-[820px]">
      <BasicsSection
        dsoId={dsoId}
        jobId={initial.id}
        initialTitle={initial.title}
        initialEmploymentType={initial.employment_type}
        initialCorporateFunction={initial.corporate_function}
        initialAuthorityLevel={initial.authority_level}
        initialWorkMode={initial.work_mode}
        initialWorkModeDetail={initial.work_mode_detail}
        initialLocationIds={initial.location_ids}
        locations={locations}
      />
      <DescriptionSection
        dsoId={dsoId}
        jobId={initial.id}
        initialDescription={initial.description}
        initialTitle={initial.title}
        initialCorporateFunction={initial.corporate_function ?? ""}
        initialAuthorityLevel={initial.authority_level ?? ""}
        initialWorkMode={initial.work_mode ?? ""}
        initialLocationIds={initial.location_ids}
      />
      <DetailsSection
        dsoId={dsoId}
        jobId={initial.id}
        initial={initial}
      />
      <ScreeningSection
        dsoId={dsoId}
        jobId={initial.id}
        initialQuestions={initialQuestions}
        // The full-job save path (updateCorporateJob) needs these required
        // fields re-submitted unchanged — see file header.
        savedBasics={{
          title: initial.title,
          employment_type: initial.employment_type,
          corporate_function: initial.corporate_function ?? "",
          authority_level: initial.authority_level ?? "",
          work_mode: initial.work_mode ?? "",
          description: initial.description,
          status: initial.status,
        }}
      />
      <StatusSection jobId={initial.id} initialStatus={initial.status} />
    </div>
  );
}

/* ───── Section shell + save bar ───── */

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
          <p className="inline-flex items-center gap-1.5 text-[#3D5266]">
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
  initialEmploymentType,
  initialCorporateFunction,
  initialAuthorityLevel,
  initialWorkMode,
  initialWorkModeDetail,
  initialLocationIds,
  locations,
}: {
  dsoId: string;
  jobId: string;
  initialTitle: string;
  initialEmploymentType: string;
  initialCorporateFunction: string | null;
  initialAuthorityLevel: string | null;
  initialWorkMode: string | null;
  initialWorkModeDetail: string | null;
  initialLocationIds: string[];
  locations: LocationOption[];
}) {
  const [title, setTitle] = useState(initialTitle);
  const [employmentType, setEmploymentType] = useState(initialEmploymentType);
  const [corporateFunction, setCorporateFunction] = useState<string>(
    initialCorporateFunction ?? ""
  );
  const [authorityLevel, setAuthorityLevel] = useState<string>(
    initialAuthorityLevel ?? ""
  );
  const [workMode, setWorkMode] = useState<string>(initialWorkMode ?? "");
  const [workModeDetail, setWorkModeDetail] = useState(
    initialWorkModeDetail ?? ""
  );
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(
    new Set(initialLocationIds)
  );

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [snapshot, setSnapshot] = useState({
    title: initialTitle,
    employmentType: initialEmploymentType,
    corporateFunction: initialCorporateFunction ?? "",
    authorityLevel: initialAuthorityLevel ?? "",
    workMode: initialWorkMode ?? "",
    workModeDetail: initialWorkModeDetail ?? "",
    locationIds: [...initialLocationIds].sort().join("|"),
  });

  const currentLocationKey = [...selectedLocationIds].sort().join("|");
  const dirty =
    title !== snapshot.title ||
    employmentType !== snapshot.employmentType ||
    corporateFunction !== snapshot.corporateFunction ||
    authorityLevel !== snapshot.authorityLevel ||
    workMode !== snapshot.workMode ||
    workModeDetail !== snapshot.workModeDetail ||
    currentLocationKey !== snapshot.locationIds;

  const onSave = () => {
    setError(null);
    setSaved(false);
    // Parity with corporate-wizard.tsx's Basics-step validation.
    if (!title.trim()) return setError("Add a job title.");
    if (!corporateFunction)
      return setError("Pick a corporate function for this role.");
    if (!authorityLevel)
      return setError("Pick an authority level for this role.");
    if (!workMode) return setError("Pick a work mode for this role.");
    // Anchor location is OPTIONAL — 0/1/N all valid.

    const fd = new FormData();
    fd.set("job_id", jobId);
    fd.set("dso_id", dsoId);
    fd.set("title", title.trim());
    fd.set("employment_type", employmentType);
    fd.set("corporate_function", corporateFunction);
    fd.set("authority_level", authorityLevel);
    fd.set("work_mode", workMode);
    if (workMode === "hybrid" && workModeDetail.trim())
      fd.set("work_mode_detail", workModeDetail);
    for (const id of selectedLocationIds) fd.append("location_ids", id);

    startTransition(async () => {
      const result: JobActionState = await updateCorporateJobBasicsSection(
        { ok: false },
        fd
      );
      if (!result.ok) {
        setError(result.error ?? "Couldn't save.");
        return;
      }
      setSnapshot({
        title: title.trim(),
        employmentType,
        corporateFunction,
        authorityLevel,
        workMode,
        workModeDetail,
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
      subtitle="Title, function, authority level, work mode, and anchor locations."
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
            label="Corporate function"
            required
            value={corporateFunction}
            onChange={(v) => {
              setCorporateFunction(v);
              setSaved(false);
            }}
            options={[
              { value: "", label: "Select a function…" },
              ...CORPORATE_FUNCTIONS.map((f) => ({
                value: f.slug,
                label: f.label,
              })),
            ]}
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
            Authority level <span className="text-[#3D5266]">*</span>
          </label>
          <div className="space-y-2">
            {AUTHORITY_LEVELS.map((opt) => (
              <label
                key={opt.value}
                className={
                  "flex items-center gap-3 px-4 py-2.5 border cursor-pointer transition-colors " +
                  (authorityLevel === opt.value
                    ? "bg-[#3D5266]/[0.08] border-[#3D5266]"
                    : "bg-white border-[var(--rule-strong)] hover:bg-cream")
                }
              >
                <input
                  type="radio"
                  name="authority_level_edit"
                  checked={authorityLevel === opt.value}
                  onChange={() => {
                    setAuthorityLevel(opt.value);
                    setSaved(false);
                  }}
                  className="accent-[#3D5266]"
                />
                <span className="text-[14px] text-ink font-semibold">
                  {opt.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
            Work mode <span className="text-[#3D5266]">*</span>
          </label>
          <div className="space-y-2">
            {WORK_MODES.map((opt) => (
              <label
                key={opt.value}
                className={
                  "flex items-start gap-3 px-4 py-3 border cursor-pointer transition-colors " +
                  (workMode === opt.value
                    ? "bg-[#3D5266]/[0.08] border-[#3D5266]"
                    : "bg-white border-[var(--rule-strong)] hover:bg-cream")
                }
              >
                <input
                  type="radio"
                  name="work_mode_edit"
                  checked={workMode === opt.value}
                  onChange={() => {
                    setWorkMode(opt.value);
                    setSaved(false);
                  }}
                  className="mt-1 accent-[#3D5266]"
                />
                <div className="flex-1">
                  <div className="text-[14px] font-bold text-ink">
                    {opt.label}
                  </div>
                  {opt.hint && (
                    <div className="text-[13px] text-slate-body mt-0.5 leading-relaxed">
                      {opt.hint}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
          {workMode === "hybrid" && (
            <div className="mt-3">
              <Input
                label="Hybrid detail (optional)"
                placeholder="3 days in office Mon/Wed/Fri"
                value={workModeDetail}
                onChange={(v) => {
                  setWorkModeDetail(v);
                  setSaved(false);
                }}
              />
            </div>
          )}
        </div>

        <div>
          <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
            Anchor location{" "}
            <span className="text-slate-meta font-normal normal-case tracking-[0.3px]">
              (optional)
            </span>
          </label>
          {locations.length > 0 ? (
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
                      className="mt-0.5 accent-[#3D5266] flex-shrink-0"
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
          ) : (
            <p className="text-[13px] text-slate-meta italic border border-dashed border-[var(--rule-strong)] p-4 bg-cream/40">
              No practice locations on file. Corporate roles don&apos;t
              require one.
            </p>
          )}
          <p className="mt-2 text-[12px] text-slate-meta">
            Corporate roles are DSO-wide. Pick anchor practices if the role
            reports out of them, or leave blank. Zero, one, or several are
            all valid.
          </p>
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
  initialCorporateFunction,
  initialAuthorityLevel,
  initialWorkMode,
  initialLocationIds,
}: {
  dsoId: string;
  jobId: string;
  initialDescription: string;
  initialTitle: string;
  initialCorporateFunction: string;
  initialAuthorityLevel: string;
  initialWorkMode: string;
  initialLocationIds: string[];
}) {
  const [description, setDescription] = useState(initialDescription);
  const [snapshot, setSnapshot] = useState(initialDescription);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = description !== snapshot;

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
      // Description is scope-agnostic — reuse the practice action.
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
      subtitle="The role's scope, what success looks like, and what makes this DSO worth joining."
    >
      <div className="space-y-5">
        {/* 5G.d P3 — corporate-tuned AI JD generator. onApplyTitle is a
            no-op here: the title lives in the Basics section card, and a
            silent cross-section overwrite would surprise the operator
            (mirrors the dental edit page's JD panel behavior). */}
        <JdGeneratorCorporatePanel
          corporateFunction={initialCorporateFunction}
          authorityLevel={initialAuthorityLevel}
          workMode={initialWorkMode}
          locationIds={initialLocationIds}
          onApplyTitle={() => {
            /* intentionally disabled on the edit page — see comment above */
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
        <div data-jd-editor-anchor="true" className="scroll-mt-24">
          <JobDescriptionEditor
            value={description}
            onChange={(v) => {
              setDescription(v);
              setSaved(false);
            }}
            placeholder="Describe the role, scope, what success looks like, and what makes this DSO a great place to work…"
          />
        </div>
        <p className="text-[12px] text-slate-meta">
          Headings, bold/italic, lists, links, and blockquotes supported.
          Skip H1 — that&apos;s reserved for the page title.
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

/* ───── Section 3 — Compensation & sandbox ───── */

function DetailsSection({
  dsoId,
  jobId,
  initial,
}: {
  dsoId: string;
  jobId: string;
  initial: CorporateEditSectionsInitial;
}) {
  const [compType, setCompType] = useState<CompensationType>(
    initial.compensation_type
  );
  const [compMin, setCompMin] = useState(
    initial.compensation_min !== null
      ? String(initial.compensation_min)
      : ""
  );
  const [compMax, setCompMax] = useState(
    initial.compensation_max !== null
      ? String(initial.compensation_max)
      : ""
  );
  const [compPeriod, setCompPeriod] = useState(
    initial.compensation_period ?? ""
  );
  const [compVisible, setCompVisible] = useState(initial.compensation_visible);

  // Sandbox fields (work_mode + work_mode_detail live in Basics).
  const [remoteStates, setRemoteStates] = useState<Set<string>>(
    new Set(initial.remote_state_restrictions)
  );
  const [travelExpectation, setTravelExpectation] = useState<string>(
    initial.travel_expectation ?? ""
  );
  const [travelTerritory, setTravelTerritory] = useState(
    initial.travel_territory ?? ""
  );
  const [reportsTo, setReportsTo] = useState(initial.reports_to ?? "");
  const [directReportsBand, setDirectReportsBand] = useState<string>(
    initial.direct_reports_band ?? ""
  );
  const [indirectReportsBand, setIndirectReportsBand] = useState<string>(
    initial.indirect_reports_band ?? ""
  );
  const [educationRequirement, setEducationRequirement] = useState<string>(
    initial.education_requirement ?? ""
  );
  const [industryExperience, setIndustryExperience] = useState<string>(
    initial.industry_experience ?? ""
  );
  const [minYears, setMinYears] = useState(
    initial.min_years_corporate_experience !== null
      ? String(initial.min_years_corporate_experience)
      : ""
  );
  const [maxYears, setMaxYears] = useState(
    initial.max_years_corporate_experience !== null
      ? String(initial.max_years_corporate_experience)
      : ""
  );
  const [bonusStructure, setBonusStructure] = useState(
    initial.bonus_structure ?? ""
  );
  const [equityOffered, setEquityOffered] = useState(initial.equity_offered);
  const [equityNote, setEquityNote] = useState(initial.equity_note ?? "");
  const [externalLinks, setExternalLinks] = useState<
    Array<{ label: string; url: string }>
  >(initial.external_links);
  const [requirements, setRequirements] = useState(
    initial.requirements ?? ""
  );
  const [hideStages, setHideStages] = useState(
    initial.hide_stages_from_candidate
  );
  const [reportingOpen, setReportingOpen] = useState(
    Boolean(
      initial.reports_to ||
        initial.direct_reports_band ||
        initial.indirect_reports_band
    )
  );

  // The work_mode here is read-only context for the remote-states section
  // visibility — work_mode itself is edited + saved in the Basics section.
  const savedWorkMode = initial.work_mode ?? "";

  const remoteStatesKey = [...remoteStates].sort().join(",");
  const initialSnapshot = {
    compType: initial.compensation_type,
    compMin:
      initial.compensation_min !== null
        ? String(initial.compensation_min)
        : "",
    compMax:
      initial.compensation_max !== null
        ? String(initial.compensation_max)
        : "",
    compPeriod: initial.compensation_period ?? "",
    compVisible: initial.compensation_visible,
    remoteStatesKey: [...initial.remote_state_restrictions].sort().join(","),
    travelExpectation: initial.travel_expectation ?? "",
    travelTerritory: initial.travel_territory ?? "",
    reportsTo: initial.reports_to ?? "",
    directReportsBand: initial.direct_reports_band ?? "",
    indirectReportsBand: initial.indirect_reports_band ?? "",
    educationRequirement: initial.education_requirement ?? "",
    industryExperience: initial.industry_experience ?? "",
    minYears:
      initial.min_years_corporate_experience !== null
        ? String(initial.min_years_corporate_experience)
        : "",
    maxYears:
      initial.max_years_corporate_experience !== null
        ? String(initial.max_years_corporate_experience)
        : "",
    bonusStructure: initial.bonus_structure ?? "",
    equityOffered: initial.equity_offered,
    equityNote: initial.equity_note ?? "",
    externalLinksKey: JSON.stringify(initial.external_links),
    requirements: initial.requirements ?? "",
    hideStages: initial.hide_stages_from_candidate,
  };
  const [snapshot, setSnapshot] = useState(initialSnapshot);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const externalLinksKey = JSON.stringify(externalLinks);
  const dirty =
    compType !== snapshot.compType ||
    compMin !== snapshot.compMin ||
    compMax !== snapshot.compMax ||
    compPeriod !== snapshot.compPeriod ||
    compVisible !== snapshot.compVisible ||
    remoteStatesKey !== snapshot.remoteStatesKey ||
    travelExpectation !== snapshot.travelExpectation ||
    travelTerritory !== snapshot.travelTerritory ||
    reportsTo !== snapshot.reportsTo ||
    directReportsBand !== snapshot.directReportsBand ||
    indirectReportsBand !== snapshot.indirectReportsBand ||
    educationRequirement !== snapshot.educationRequirement ||
    industryExperience !== snapshot.industryExperience ||
    minYears !== snapshot.minYears ||
    maxYears !== snapshot.maxYears ||
    bonusStructure !== snapshot.bonusStructure ||
    equityOffered !== snapshot.equityOffered ||
    equityNote !== snapshot.equityNote ||
    externalLinksKey !== snapshot.externalLinksKey ||
    requirements !== snapshot.requirements ||
    hideStages !== snapshot.hideStages;

  const touch = () => setSaved(false);

  const onSave = () => {
    setError(null);
    setSaved(false);
    // Parity with corporate-wizard.tsx's details-step validation.
    if (minYears && maxYears && Number(minYears) > Number(maxYears))
      return setError("Min years of experience can't be greater than max.");

    const fd = new FormData();
    fd.set("job_id", jobId);
    fd.set("dso_id", dsoId);
    // Compensation — normalize per type (same logic as the wizard).
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
    if (compVisible) fd.set("compensation_visible", "on");
    // Sandbox columns. work_mode + work_mode_detail belong to Basics and
    // updateCorporateJobDetailsSection deliberately does NOT write them.
    if (savedWorkMode === "remote") {
      for (const s of remoteStates)
        fd.append("remote_state_restrictions", s);
    }
    if (travelExpectation)
      fd.set("travel_expectation", travelExpectation);
    if (travelTerritory.trim())
      fd.set("travel_territory", travelTerritory);
    if (reportsTo.trim()) fd.set("reports_to", reportsTo);
    if (directReportsBand)
      fd.set("direct_reports_band", directReportsBand);
    if (indirectReportsBand)
      fd.set("indirect_reports_band", indirectReportsBand);
    if (educationRequirement)
      fd.set("education_requirement", educationRequirement);
    if (industryExperience)
      fd.set("industry_experience", industryExperience);
    fd.set("min_years_corporate_experience", minYears);
    fd.set("max_years_corporate_experience", maxYears);
    if (bonusStructure.trim())
      fd.set("bonus_structure", bonusStructure);
    if (equityOffered) fd.set("equity_offered", "on");
    if (equityNote.trim()) fd.set("equity_note", equityNote);
    fd.set("requirements", requirements);
    if (hideStages) fd.set("hide_stages_from_candidate", "on");
    for (const link of externalLinks) {
      fd.append("external_link_label", link.label);
      fd.append("external_link_url", link.url);
    }
    fd.set("external_links_submitted", "1");

    startTransition(async () => {
      const result: JobActionState = await updateCorporateJobDetailsSection(
        { ok: false },
        fd
      );
      if (!result.ok) {
        setError(result.error ?? "Couldn't save.");
        return;
      }
      setSnapshot({
        compType,
        compMin,
        compMax,
        compPeriod,
        compVisible,
        remoteStatesKey,
        travelExpectation,
        travelTerritory,
        reportsTo,
        directReportsBand,
        indirectReportsBand,
        educationRequirement,
        industryExperience,
        minYears,
        maxYears,
        bonusStructure,
        equityOffered,
        equityNote,
        externalLinksKey,
        requirements,
        hideStages,
      });
      setSaved(true);
    });
  };

  return (
    <SectionShell
      title="Compensation & sandbox"
      subtitle="Pay, travel, reporting structure, experience, bonus/equity, and visibility."
    >
      <div className="space-y-6">
        {/* ── Compensation ── */}
        <fieldset className="border border-[var(--rule)] p-5 bg-cream/40">
          <legend className="px-2 text-[10px] font-bold tracking-[2px] uppercase text-[#3D5266]">
            Compensation
          </legend>
          <div className="mt-1 mb-4">
            <label className="block text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-2">
              Compensation type
            </label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { value: "range", label: "Range" },
                  { value: "starting_at", label: "Starting at" },
                  { value: "up_to", label: "Up to" },
                  { value: "exact", label: "Exact" },
                  { value: "doe", label: "DOE / discussed" },
                ] as const
              ).map((opt) => {
                const checked = compType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setCompType(opt.value);
                      touch();
                    }}
                    className={`px-3 py-1.5 text-[12px] font-medium border transition-colors ${
                      checked
                        ? "bg-[#3D5266] text-ivory border-[#3D5266]"
                        : "bg-white text-ink border-[var(--rule)] hover:border-[#3D5266]"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {compType !== "doe" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                  value={compMin}
                  onChange={(v) => {
                    setCompMin(v);
                    touch();
                  }}
                />
              )}
              {(compType === "range" || compType === "up_to") && (
                <Input
                  label={compType === "range" ? "Maximum" : "Up to"}
                  type="number"
                  value={compMax}
                  onChange={(v) => {
                    setCompMax(v);
                    touch();
                  }}
                />
              )}
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
          )}
          <label className="mt-4 flex items-start gap-2.5 text-[14px] text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={compVisible}
              onChange={(e) => {
                setCompVisible(e.target.checked);
                touch();
              }}
              className="mt-1 accent-[#3D5266]"
            />
            <span>
              Show pay publicly. Required in CA, CO, WA, NY, and other states
              with pay-transparency laws.
            </span>
          </label>
        </fieldset>

        {/* ── Remote state restrictions — only relevant when work mode is
            remote. work_mode itself is edited in the Basics section. ── */}
        {savedWorkMode === "remote" && (
          <fieldset className="border border-[var(--rule)] p-5 bg-cream/40">
            <legend className="px-2 text-[10px] font-bold tracking-[2px] uppercase text-[#3D5266]">
              Remote state restrictions{" "}
              <span className="text-slate-meta font-normal normal-case tracking-[0.3px]">
                (optional)
              </span>
            </legend>
            <p className="mt-2 text-[12px] text-slate-meta leading-relaxed mb-3">
              Pick the states a remote hire must reside in, for tax /
              compliance reasons. Leave blank for no restriction.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {US_STATES.map((st) => {
                const checked = remoteStates.has(st);
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      const next = new Set(remoteStates);
                      if (checked) next.delete(st);
                      else next.add(st);
                      setRemoteStates(next);
                      touch();
                    }}
                    className={`px-2.5 py-1 text-[11px] font-bold tracking-[0.5px] border transition-colors ${
                      checked
                        ? "bg-[#3D5266] text-ivory border-[#3D5266]"
                        : "bg-white text-ink border-[var(--rule)] hover:border-[#3D5266]"
                    }`}
                  >
                    {st}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {/* ── Travel ── */}
        <fieldset className="border border-[var(--rule)] p-5 bg-cream/40">
          <legend className="px-2 text-[10px] font-bold tracking-[2px] uppercase text-[#3D5266]">
            Travel{" "}
            <span className="text-slate-meta font-normal normal-case tracking-[0.3px]">
              (optional)
            </span>
          </legend>
          <div className="mt-2">
            <label className="block text-[12px] font-semibold text-ink mb-2">
              Travel expectation
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setTravelExpectation("");
                  touch();
                }}
                className={`px-3 py-1.5 text-[12px] font-medium border transition-colors ${
                  travelExpectation === ""
                    ? "bg-[#3D5266] text-ivory border-[#3D5266]"
                    : "bg-white text-ink border-[var(--rule)] hover:border-[#3D5266]"
                }`}
              >
                Not specified
              </button>
              {TRAVEL_EXPECTATIONS.map((opt) => {
                const checked = travelExpectation === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setTravelExpectation(opt.value);
                      touch();
                    }}
                    className={`px-3 py-1.5 text-[12px] font-medium border transition-colors ${
                      checked
                        ? "bg-[#3D5266] text-ivory border-[#3D5266]"
                        : "bg-white text-ink border-[var(--rule)] hover:border-[#3D5266]"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-4">
            <Input
              label="Travel territory (optional)"
              placeholder="Southeast region — GA, FL, AL, SC"
              value={travelTerritory}
              onChange={(v) => {
                setTravelTerritory(v);
                touch();
              }}
            />
          </div>
        </fieldset>

        {/* ── Reporting structure (collapsible) ── */}
        <fieldset className="border border-[var(--rule)] p-5 bg-cream/40">
          <legend className="px-2 text-[10px] font-bold tracking-[2px] uppercase text-[#3D5266]">
            Reporting structure{" "}
            <span className="text-slate-meta font-normal normal-case tracking-[0.3px]">
              (optional)
            </span>
          </legend>
          {!reportingOpen ? (
            <button
              type="button"
              onClick={() => setReportingOpen(true)}
              className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-bold tracking-[1px] uppercase text-[#3D5266] hover:text-ink transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add reporting detail
            </button>
          ) : (
            <div className="mt-2 space-y-4">
              <Input
                label="Reports to (optional)"
                placeholder="Chief Operating Officer"
                value={reportsTo}
                onChange={(v) => {
                  setReportsTo(v);
                  touch();
                }}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Direct reports (optional)"
                  value={directReportsBand}
                  onChange={(v) => {
                    setDirectReportsBand(v);
                    touch();
                  }}
                  options={[
                    { value: "", label: "Not specified" },
                    ...DIRECT_REPORTS_BANDS.map((b) => ({
                      value: b.value,
                      label: b.label,
                    })),
                  ]}
                />
                <Select
                  label="Indirect reports (optional)"
                  value={indirectReportsBand}
                  onChange={(v) => {
                    setIndirectReportsBand(v);
                    touch();
                  }}
                  options={[
                    { value: "", label: "Not specified" },
                    ...INDIRECT_REPORTS_BANDS.map((b) => ({
                      value: b.value,
                      label: b.label,
                    })),
                  ]}
                />
              </div>
            </div>
          )}
        </fieldset>

        {/* ── Experience & education ── */}
        <fieldset className="border border-[var(--rule)] p-5 bg-cream/40">
          <legend className="px-2 text-[10px] font-bold tracking-[2px] uppercase text-[#3D5266]">
            Experience & education{" "}
            <span className="text-slate-meta font-normal normal-case tracking-[0.3px]">
              (optional)
            </span>
          </legend>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Min years experience"
              type="number"
              placeholder="e.g. 5"
              value={minYears}
              onChange={(v) => {
                setMinYears(v);
                touch();
              }}
            />
            <Input
              label="Max years experience"
              type="number"
              placeholder="e.g. 12"
              value={maxYears}
              onChange={(v) => {
                setMaxYears(v);
                touch();
              }}
            />
            <Select
              label="Education requirement"
              value={educationRequirement}
              onChange={(v) => {
                setEducationRequirement(v);
                touch();
              }}
              options={[
                { value: "", label: "Not specified" },
                ...EDUCATION_REQUIREMENTS.map((e) => ({
                  value: e.value,
                  label: e.label,
                })),
              ]}
            />
          </div>
          <div className="mt-5">
            <label className="block text-[12px] font-semibold text-ink mb-2">
              Industry experience
            </label>
            <div className="space-y-2">
              <label
                className={
                  "flex items-start gap-3 px-4 py-2.5 border cursor-pointer transition-colors " +
                  (industryExperience === ""
                    ? "bg-[#3D5266]/[0.08] border-[#3D5266]"
                    : "bg-white border-[var(--rule-strong)] hover:bg-cream")
                }
              >
                <input
                  type="radio"
                  name="industry_experience_edit"
                  checked={industryExperience === ""}
                  onChange={() => {
                    setIndustryExperience("");
                    touch();
                  }}
                  className="mt-1 accent-[#3D5266]"
                />
                <div className="flex-1">
                  <div className="text-[14px] font-bold text-ink">
                    Not specified
                  </div>
                </div>
              </label>
              {INDUSTRY_EXPERIENCES.map((opt) => (
                <label
                  key={opt.value}
                  className={
                    "flex items-start gap-3 px-4 py-2.5 border cursor-pointer transition-colors " +
                    (industryExperience === opt.value
                      ? "bg-[#3D5266]/[0.08] border-[#3D5266]"
                      : "bg-white border-[var(--rule-strong)] hover:bg-cream")
                  }
                >
                  <input
                    type="radio"
                    name="industry_experience_edit"
                    checked={industryExperience === opt.value}
                    onChange={() => {
                      setIndustryExperience(opt.value);
                      touch();
                    }}
                    className="mt-1 accent-[#3D5266]"
                  />
                  <div className="flex-1">
                    <div className="text-[14px] font-bold text-ink">
                      {opt.label}
                    </div>
                    {opt.hint && (
                      <div className="text-[13px] text-slate-body mt-0.5 leading-relaxed">
                        {opt.hint}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        </fieldset>

        {/* ── Bonus & equity ── */}
        <fieldset className="border border-[var(--rule)] p-5 bg-cream/40">
          <legend className="px-2 text-[10px] font-bold tracking-[2px] uppercase text-[#3D5266]">
            Bonus & equity{" "}
            <span className="text-slate-meta font-normal normal-case tracking-[0.3px]">
              (optional)
            </span>
          </legend>
          <div className="mt-2">
            <Textarea
              label="Bonus structure"
              rows={2}
              placeholder="Annual performance bonus up to 20% of base, tied to EBITDA targets."
              value={bonusStructure}
              onChange={(v) => {
                setBonusStructure(v);
                touch();
              }}
            />
          </div>
          <label className="mt-4 flex items-start gap-2.5 text-[14px] text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={equityOffered}
              onChange={(e) => {
                setEquityOffered(e.target.checked);
                touch();
              }}
              className="mt-1 accent-[#3D5266]"
            />
            <span className="font-bold">Equity is part of this package</span>
          </label>
          {equityOffered && (
            <div className="mt-3">
              <Textarea
                label="Equity note (optional)"
                rows={2}
                placeholder="0.1–0.5% with a 4-year vest, 1-year cliff."
                value={equityNote}
                onChange={(v) => {
                  setEquityNote(v);
                  touch();
                }}
              />
            </div>
          )}
        </fieldset>

        <ExternalLinksField
          initial={externalLinks}
          onChange={(next) => {
            setExternalLinks(next);
            touch();
          }}
        />

        <Textarea
          label="Requirements (one per line)"
          rows={4}
          placeholder={"CPA or MBA preferred\n10+ years multi-site finance leadership\nPrior DSO or healthcare experience"}
          value={requirements}
          onChange={(v) => {
            setRequirements(v);
            touch();
          }}
        />

        <fieldset className="border border-[var(--rule)] p-5 bg-cream/40">
          <legend className="px-2 text-[10px] font-bold tracking-[2px] uppercase text-[#3D5266]">
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
              className="mt-1 accent-[#3D5266]"
            />
            <div>
              <div className="font-bold mb-1">
                Hide pipeline stages from candidates
              </div>
              <div className="text-[13px] text-slate-body leading-relaxed">
                By default, candidates see exactly where they sit in the
                pipeline — Submitted, Screening, Interview, Offer. Turn this
                on for a sensitive executive search and candidates will see
                an abstracted &ldquo;In review&rdquo; label until they reach
                Offer or Hired.
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

/* ───── Section 4 — Screening questions ───── */

function ScreeningSection({
  dsoId,
  jobId,
  initialQuestions,
  savedBasics,
}: {
  dsoId: string;
  jobId: string;
  initialQuestions: WizardScreeningQuestion[];
  // Required-field values re-submitted unchanged on the full-job save path.
  savedBasics: {
    title: string;
    employment_type: string;
    corporate_function: string;
    authority_level: string;
    work_mode: string;
    description: string;
    status: string;
  };
}) {
  const [questions, setQuestions] =
    useState<WizardScreeningQuestion[]>(initialQuestions);
  const [snapshot, setSnapshot] = useState(() =>
    snapshotQuestions(initialQuestions)
  );
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
    const newId = `tmp_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
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
          : null,
      required: false,
      sort_order: questions.length,
    };
    setQuestions((qs) => [...qs, newQ]);
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

  const onSave = () => {
    setError(null);
    setSaved(false);
    const validation = validateQuestions(questions);
    if (validation) return setError(validation);

    // corporate-actions has no standalone screening section action — the
    // Screening card composes a full-job payload and calls updateCorporateJob,
    // which runs syncScreeningQuestions. The required basics fields are
    // re-submitted unchanged so updateCorporateJob's guards pass.
    const fd = new FormData();
    fd.set("job_id", jobId);
    fd.set("dso_id", dsoId);
    fd.set("title", savedBasics.title);
    fd.set("description", savedBasics.description);
    fd.set("employment_type", savedBasics.employment_type);
    fd.set("corporate_function", savedBasics.corporate_function);
    fd.set("authority_level", savedBasics.authority_level);
    fd.set("work_mode", savedBasics.work_mode);
    fd.set("status", savedBasics.status);
    // Do NOT send external_links_submitted — updateCorporateJob's sentinel
    // gate then leaves external_links untouched (this section doesn't edit
    // them).
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
          knockout: Boolean(q.knockout),
          knockout_correct_answer: q.knockout
            ? q.knockout_correct_answer ?? null
            : null,
        }))
      )
    );

    startTransition(async () => {
      const result: JobActionState = await updateCorporateJob(
        { ok: false },
        fd
      );
      if (!result.ok) {
        setError(result.error ?? "Couldn't save.");
        return;
      }
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
        {/* 5G.d P3 — corporate recommended-question library, keyed by
            corporate_function. Separate from the dental clinical library. */}
        <CorporateRecommendedQuestionsPanel
          corporateFunction={savedBasics.corporate_function}
          questions={questions}
          onChange={(next) => {
            setQuestions(next);
            touch();
          }}
        />

        {questions.length === 0 && (
          <div className="border border-dashed border-[var(--rule-strong)] p-5 text-center bg-cream/40">
            <p className="text-[14px] text-slate-body">
              No screening questions yet. Add one below.
            </p>
          </div>
        )}

        {questions.map((q, idx) => (
          <QuestionCard
            key={q.id}
            question={q}
            index={idx}
            total={questions.length}
            expanded={expandedIds.has(q.id)}
            onToggleExpand={() => toggleExpand(q.id)}
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
    onUpdate({
      options: (question.options ?? []).filter((o) => o.id !== id),
    });
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
          <span className="text-[10px] font-bold tracking-[2px] uppercase text-[#3D5266] px-2 py-1 bg-[#3D5266]/[0.08]">
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
                <span className="text-[9px] font-bold tracking-[1.2px] uppercase text-[#3D5266]">
                  Required
                </span>
              )}
              {question.knockout && (
                <span className="text-[9px] font-bold tracking-[1.2px] uppercase text-amber-900 bg-amber-100 px-1.5 py-0.5">
                  Knockout
                </span>
              )}
              <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-[#3D5266] group-hover:text-ink transition-colors ml-2">
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
            placeholder="How many years have you led a multi-site P&L?"
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
                Options <span className="text-[#3D5266]">*</span>
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
                      className="flex-1 px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-[#3D5266] focus:ring-1 focus:ring-[#3D5266] transition-colors"
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
                className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[1.5px] uppercase text-[#3D5266] hover:text-ink transition-colors"
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
              className="accent-[#3D5266]"
            />
            <span>Required — candidate must answer this to submit.</span>
          </label>

          {/* E2.10 — soft knockout authoring, reused from job-wizard.tsx. */}
          <KnockoutAuthoring question={question} onUpdate={onUpdate} />

          <div className="pt-2 border-t border-[var(--rule)] mt-1">
            <button
              type="button"
              onClick={onToggleExpand}
              className="text-[10px] font-bold tracking-[1.5px] uppercase text-[#3D5266] hover:text-ink transition-colors"
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
      knockout: Boolean(q.knockout),
      knockout_correct_answer: q.knockout
        ? q.knockout_correct_answer ?? null
        : null,
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
      // Status is scope-agnostic — reuse the practice action.
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
                ? "bg-[#3D5266]/[0.08] border-[#3D5266]"
                : "bg-white border-[var(--rule-strong)] hover:bg-cream")
            }
          >
            <input
              type="radio"
              name="status_edit"
              checked={status === opt.value}
              onChange={() => {
                setStatus(opt.value);
                setSaved(false);
              }}
              className="mt-1 accent-[#3D5266]"
            />
            <div className="flex-1">
              <div className="text-[14px] font-bold text-ink flex items-center gap-2">
                {opt.label}
                {status === opt.value && opt.value === "active" && (
                  <Check className="h-3.5 w-3.5 text-[#3D5266]" />
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

/* ───── Reusable inputs (mirror ../edit-sections.tsx) ───── */

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
        {label} {required && <span className="text-[#3D5266]">*</span>}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-[#3D5266] focus:ring-1 focus:ring-[#3D5266] transition-colors"
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
        {label} {required && <span className="text-[#3D5266]">*</span>}
      </label>
      <textarea
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-[#3D5266] focus:ring-1 focus:ring-[#3D5266] transition-colors resize-vertical"
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
        {label} {required && <span className="text-[#3D5266]">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-[#3D5266] focus:ring-1 focus:ring-[#3D5266] transition-colors"
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
