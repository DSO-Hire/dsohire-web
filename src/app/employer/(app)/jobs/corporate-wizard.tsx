"use client";

/**
 * CorporateJobWizard — multi-step corporate job posting flow (Phase 5G.d).
 *
 * The corporate analogue of job-wizard.tsx. Scope is locked to "corporate"
 * (the route IS the scope — there is no scope picker). The field set
 * deliberately diverges from the dental-clinical wizard: no specialty /
 * Practice-Fit schedule fields / role_category; instead the 16-column
 * corporate sandbox (work mode, travel, reporting structure, authority
 * level, education, industry experience, comp extras, equity).
 *
 * Steps:
 *   1. Basics                  — title, employment type, corporate function,
 *                                anchor location(s) (OPTIONAL), authority level
 *   2. Description             — Tiptap editor (P3 corporate JD generator seam)
 *   3. Compensation & sandbox  — comp machinery + the corporate sandbox fields
 *   4. Screening               — custom screening-question CRUD (P3 corporate
 *                                recommended-question library seam)
 *   5. Preview & publish       — summary + status select + publish button
 *
 * Same component handles create + edit via `mode` / `initial` props.
 * Submit posts FormData to createCorporateJob / updateCorporateJob (in
 * corporate-actions.ts) — see that file's header for the FormData contract.
 *
 * Reused from job-wizard.tsx: KnockoutAuthoring, the WizardScreeningQuestion
 * shape, ScreeningQuestionKind/Option, CompensationType. JobDescriptionEditor,
 * ExternalLinksField are reused from their own modules. The Input / Textarea /
 * Select primitives are intentionally re-declared here (job-wizard.tsx does
 * NOT export them and the edit-sections file re-declares them too — matching
 * the existing pattern rather than exporting a shared primitive set mid-5G.d).
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Pencil,
  Check,
} from "lucide-react";
import {
  WizardShell,
  FieldShell,
  TextField,
  SelectField,
} from "@/components/wizard";
import { BrandMark } from "@/components/brand/brand-mark";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { JobDescriptionEditor } from "@/components/job-description-editor";
import {
  ConfidentialSearchFields,
  type TeammateOption,
} from "@/components/employer/confidential-search-fields";
import { createCorporateJob, updateCorporateJob } from "./corporate-actions";
// JobActionState comes straight from ./actions — never re-exported through a
// "use server" module (that ReferenceErrors at request time).
import type { JobActionState } from "./actions";
import { PostingPreview } from "./posting-preview";
import { MatchabilityMeter } from "./matchability-meter";
import { computeCorporateMatchability } from "@/lib/practice-fit/matchability";
import {
  KnockoutAuthoring,
  type LocationOption,
  type WizardScreeningQuestion,
  type ScreeningQuestionKind,
  type ScreeningQuestionOption,
  type CompensationType,
} from "./job-wizard";
import {
  ExternalLinksField,
  type ExternalLinkPair,
} from "@/components/external-links-field";
import { CORPORATE_FUNCTIONS } from "@/lib/corporate/functions";
import {
  WORK_MODES,
  TRAVEL_EXPECTATIONS,
  DIRECT_REPORTS_BANDS,
  INDIRECT_REPORTS_BANDS,
  AUTHORITY_LEVELS,
  EDUCATION_REQUIREMENTS,
  INDUSTRY_EXPERIENCES,
  WORK_MODE_LABELS,
  TRAVEL_EXPECTATION_LABELS,
  DIRECT_REPORTS_BAND_LABELS,
  INDIRECT_REPORTS_BAND_LABELS,
  AUTHORITY_LEVEL_LABELS,
  EDUCATION_REQUIREMENT_LABELS,
  INDUSTRY_EXPERIENCE_LABELS,
} from "@/lib/corporate/job-fields";
import { JdGeneratorCorporatePanel } from "./jd-generator-corporate-panel";
import { CorporateRecommendedQuestionsPanel } from "./corporate-recommended-questions-panel";
import { CompensationSection } from "./compensation-section";
import { VerificationRequirements } from "./verification-requirements";
import type { VerificationTypeValue } from "@/lib/verifications/types";
import { ChipArrayInput } from "@/app/candidate/(app)/profile/edit-sheet";
import {
  getJobRequirementsPrioritized,
  BENEFITS,
} from "@/lib/candidate/canonical-lists";
import {
  evaluateJobPosting,
  describeRequirement,
  describeJurisdictions,
} from "@/lib/compliance/pay-transparency";

/* ───── Types ───── */

// 5G.d — relative-time helper for the draft banner (mirrors job-wizard.tsx).
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

// Comp-type option vocabulary now lives inside the shared
// <CompensationSection> — the corporate wizard no longer renders its own
// inline comp-type picker.

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

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "draft", label: "Draft (only you can see)" },
  { value: "active", label: "Active (publicly visible)" },
];

const STATUS_OPTIONS_EDIT: Array<{ value: string; label: string }> = [
  ...STATUS_OPTIONS,
  { value: "paused", label: "Paused" },
  { value: "filled", label: "Filled" },
];

// 5G.d — US state codes for the remote-restrictions multi-select.
const US_STATES: string[] = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
];

const STEPS = [
  { id: "basics", label: "Basics", short: "Basics" },
  // Comp + role details BEFORE description so the AI JD generator can use the
  // job's actual pay/role data to influence the copy (mirrors the practice
  // wizard order).
  { id: "details", label: "Compensation & sandbox", short: "Pay & role" },
  { id: "description", label: "Description", short: "Description" },
  { id: "screening", label: "Screening", short: "Screening" },
  { id: "preview", label: "Preview & publish", short: "Review" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

/**
 * Initial-state shape for edit mode. Mirrors the corporate columns the
 * corporate edit route projects out of public.jobs.
 */
export interface CorporateWizardInitial {
  id: string;
  title: string;
  description: string;
  employment_type: string;
  openings?: number | null;
  corporate_function: string | null;
  authority_level: string | null;
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_period: string | null;
  compensation_type: CompensationType | null;
  compensation_visible: boolean;
  requirements: string | null;
  status: string;
  location_ids: string[];
  hide_stages_from_candidate: boolean;
  external_links: Array<{ label: string; url: string }>;
  // 16-column corporate sandbox.
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
  variable_comp_enabled: boolean;
  variable_comp_target: number | null;
  variable_comp_structure: string | null;
  bonus_enabled: boolean;
  bonus_target: number | null;
  bonus_structure: string | null;
  equity_offered: boolean;
  equity_note: string | null;
  // 5G.e Tier 2 — verification requirements (job_verification_requirements).
  verification_requirements: string[];
}

interface CorporateWizardProps {
  dsoId: string;
  locations: LocationOption[];
  mode: "create" | "edit";
  initial?: CorporateWizardInitial;
  initialQuestions?: WizardScreeningQuestion[];
  /** #83 Phase 4 — team roster for the confidential-search assignee picker. */
  teammates?: TeammateOption[];
}

/* ───── Component ───── */

export function CorporateJobWizard({
  dsoId,
  locations,
  mode,
  initial,
  initialQuestions,
  teammates = [],
}: CorporateWizardProps) {
  const [stepIdx, setStepIdx] = useState(0);
  // #97 (Day 28) — gate forward stepper jumps to the furthest validated step
  // so the tab nav can't skip past unfilled required fields (Continue blocks
  // them; tab-jump shouldn't be a loophole). Edit mode starts fully unlocked.
  const [maxStepReached, setMaxStepReached] = useState(
    mode === "edit" ? STEPS.length - 1 : 0
  );

  // 5G.d — draft autosave (create mode only). Key per DSO. Keyed
  // dsohire-corporate-wizard-draft-${dsoId} so it never collides with the
  // practice wizard's draft.
  const draftKey =
    mode === "create" ? `dsohire-corporate-wizard-draft-${dsoId}` : null;
  const [draftFound, setDraftFound] = useState<{ savedAt: string } | null>(
    null
  );
  const [draftDismissed, setDraftDismissed] = useState(false);

  // Every step change scrolls to top.
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [stepIdx]);

  /* ── Form state ── */
  const [title, setTitle] = useState(initial?.title ?? "");
  const [employmentType, setEmploymentType] = useState(
    initial?.employment_type ?? "full_time"
  );
  const [openings, setOpenings] = useState(String(initial?.openings ?? 1));
  const [corporateFunction, setCorporateFunction] = useState<string>(
    initial?.corporate_function ?? ""
  );
  const [authorityLevel, setAuthorityLevel] = useState<string>(
    initial?.authority_level ?? ""
  );
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(
    new Set(initial?.location_ids ?? [])
  );
  const [description, setDescription] = useState(initial?.description ?? "");

  // Compensation — same machinery as the practice wizard.
  const [compType, setCompType] = useState<CompensationType>(
    (initial?.compensation_type as CompensationType | undefined) ?? "range"
  );
  const [compMin, setCompMin] = useState(
    initial?.compensation_min !== null &&
      initial?.compensation_min !== undefined
      ? String(initial.compensation_min)
      : ""
  );
  const [compMax, setCompMax] = useState(
    initial?.compensation_max !== null &&
      initial?.compensation_max !== undefined
      ? String(initial.compensation_max)
      : ""
  );
  const [compPeriod, setCompPeriod] = useState(
    initial?.compensation_period ?? ""
  );
  const [compVisible, setCompVisible] = useState(
    initial?.compensation_visible ?? true
  );

  // 16-column corporate sandbox.
  const [workMode, setWorkMode] = useState<string>(initial?.work_mode ?? "");
  const [workModeDetail, setWorkModeDetail] = useState(
    initial?.work_mode_detail ?? ""
  );
  const [remoteStates, setRemoteStates] = useState<Set<string>>(
    new Set(initial?.remote_state_restrictions ?? [])
  );
  const [travelExpectation, setTravelExpectation] = useState<string>(
    initial?.travel_expectation ?? ""
  );
  const [travelTerritory, setTravelTerritory] = useState(
    initial?.travel_territory ?? ""
  );
  const [reportsTo, setReportsTo] = useState(initial?.reports_to ?? "");
  const [directReportsBand, setDirectReportsBand] = useState<string>(
    initial?.direct_reports_band ?? ""
  );
  const [indirectReportsBand, setIndirectReportsBand] = useState<string>(
    initial?.indirect_reports_band ?? ""
  );
  const [educationRequirement, setEducationRequirement] = useState<string>(
    initial?.education_requirement ?? ""
  );
  const [industryExperience, setIndustryExperience] = useState<string>(
    initial?.industry_experience ?? ""
  );
  const [minYears, setMinYears] = useState(
    initial?.min_years_corporate_experience !== null &&
      initial?.min_years_corporate_experience !== undefined
      ? String(initial.min_years_corporate_experience)
      : ""
  );
  const [maxYears, setMaxYears] = useState(
    initial?.max_years_corporate_experience !== null &&
      initial?.max_years_corporate_experience !== undefined
      ? String(initial.max_years_corporate_experience)
      : ""
  );
  // Composable compensation components (numeric values are STRINGS in state,
  // mirroring compMin). variable_comp_* + bonus_* are migration 20260514000002;
  // bonus_structure + equity_offered + equity_note pre-date it.
  const [variableCompEnabled, setVariableCompEnabled] = useState(
    initial?.variable_comp_enabled ?? false
  );
  const [variableCompTarget, setVariableCompTarget] = useState(
    initial?.variable_comp_target !== null &&
      initial?.variable_comp_target !== undefined
      ? String(initial.variable_comp_target)
      : ""
  );
  const [variableCompStructure, setVariableCompStructure] = useState(
    initial?.variable_comp_structure ?? ""
  );
  const [bonusEnabled, setBonusEnabled] = useState(
    initial?.bonus_enabled ?? false
  );
  const [bonusTarget, setBonusTarget] = useState(
    initial?.bonus_target !== null && initial?.bonus_target !== undefined
      ? String(initial.bonus_target)
      : ""
  );
  const [bonusStructure, setBonusStructure] = useState(
    initial?.bonus_structure ?? ""
  );
  const [equityOffered, setEquityOffered] = useState(
    initial?.equity_offered ?? false
  );
  const [equityNote, setEquityNote] = useState(initial?.equity_note ?? "");
  // Day 24 — benefits chip list + pay-transparency exemption self-cert.
  const [benefits, setBenefits] = useState<string[]>(
    (initial as { benefits?: string[] } | undefined)?.benefits ?? []
  );
  const [payExempt, setPayExempt] = useState(false);

  // Day 24 — pay-transparency. Corporate roles are often remote/multi-state,
  // so workMode + remoteStates drive most coverage here (plus any anchor
  // locations). Mirrors the server guard.
  const payAssessment = useMemo(() => {
    const locs = locations
      .filter((l) => selectedLocationIds.has(l.id))
      .map((l) => ({ state: l.state, city: l.city }));
    return evaluateJobPosting({
      locations: locs,
      workMode,
      remoteStates: Array.from(remoteStates),
      compType,
      compMin: compMin.trim() ? Number(compMin) : null,
      compMax: compMax.trim() ? Number(compMax) : null,
      compVisible,
      hasBenefits: benefits.length > 0,
    });
  }, [
    locations,
    selectedLocationIds,
    workMode,
    remoteStates,
    compType,
    compMin,
    compMax,
    compVisible,
    benefits,
  ]);
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

  // 5G.e Tier 2 — verification requirements. Held as a Set<string>, mirroring
  // selectedLocationIds / remoteStates.
  const [verificationRequirements, setVerificationRequirements] = useState<
    Set<string>
  >(new Set(initial?.verification_requirements ?? []));
  const toggleVerificationRequirement = (value: VerificationTypeValue) => {
    setVerificationRequirements((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const [externalLinks, setExternalLinks] = useState<ExternalLinkPair[]>(
    initial?.external_links ?? []
  );
  const [requirements, setRequirements] = useState(
    initial?.requirements ?? ""
  );
  const [hideStagesFromCandidate, setHideStagesFromCandidate] = useState(
    initial?.hide_stages_from_candidate ?? false
  );
  // #83 Phase 4 — confidential search (create-mode only; the edit page
  // uses the standalone ConfidentialSearchCard).
  const [confidential, setConfidential] = useState(false);
  const [confidentialAssigneeIds, setConfidentialAssigneeIds] = useState<
    string[]
  >([]);
  const [questions, setQuestions] = useState<WizardScreeningQuestion[]>(
    initialQuestions ?? []
  );
  const [status, setStatus] = useState(initial?.status ?? "draft");

  const [error, setError] = useState<string | null>(null);

  /* ── Draft autosave ── */
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
        employmentType,
        openings,
        corporateFunction,
        authorityLevel,
        selectedLocationIds: [...selectedLocationIds],
        description,
        compType,
        compMin,
        compMax,
        compPeriod,
        compVisible,
        workMode,
        workModeDetail,
        remoteStates: [...remoteStates],
        travelExpectation,
        travelTerritory,
        reportsTo,
        directReportsBand,
        indirectReportsBand,
        educationRequirement,
        industryExperience,
        minYears,
        maxYears,
        variableCompEnabled,
        variableCompTarget,
        variableCompStructure,
        bonusEnabled,
        bonusTarget,
        bonusStructure,
        equityOffered,
        equityNote,
        verificationRequirements: [...verificationRequirements],
        externalLinks,
        requirements,
        hideStagesFromCandidate,
        questions,
        status,
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
    employmentType,
    openings,
    corporateFunction,
    authorityLevel,
    selectedLocationIds,
    description,
    compType,
    compMin,
    compMax,
    compPeriod,
    compVisible,
    workMode,
    workModeDetail,
    remoteStates,
    travelExpectation,
    travelTerritory,
    reportsTo,
    directReportsBand,
    indirectReportsBand,
    educationRequirement,
    industryExperience,
    minYears,
    maxYears,
    variableCompEnabled,
    variableCompTarget,
    variableCompStructure,
    bonusEnabled,
    bonusTarget,
    bonusStructure,
    equityOffered,
    equityNote,
    verificationRequirements,
    externalLinks,
    requirements,
    hideStagesFromCandidate,
    questions,
    status,
    stepIdx,
  ]);

  function restoreDraft() {
    if (!draftKey || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw) as Record<string, unknown>;
      setTitle((d.title as string) ?? "");
      setEmploymentType((d.employmentType as string) ?? "full_time");
      setOpenings(String(d.openings ?? 1));
      setCorporateFunction((d.corporateFunction as string) ?? "");
      setAuthorityLevel((d.authorityLevel as string) ?? "");
      setSelectedLocationIds(
        new Set((d.selectedLocationIds as string[]) ?? [])
      );
      setDescription((d.description as string) ?? "");
      setCompType(((d.compType as CompensationType) ?? "range"));
      setCompMin((d.compMin as string) ?? "");
      setCompMax((d.compMax as string) ?? "");
      setCompPeriod((d.compPeriod as string) ?? "");
      setCompVisible(Boolean(d.compVisible));
      setWorkMode((d.workMode as string) ?? "");
      setWorkModeDetail((d.workModeDetail as string) ?? "");
      setRemoteStates(new Set((d.remoteStates as string[]) ?? []));
      setTravelExpectation((d.travelExpectation as string) ?? "");
      setTravelTerritory((d.travelTerritory as string) ?? "");
      setReportsTo((d.reportsTo as string) ?? "");
      setDirectReportsBand((d.directReportsBand as string) ?? "");
      setIndirectReportsBand((d.indirectReportsBand as string) ?? "");
      setEducationRequirement((d.educationRequirement as string) ?? "");
      setIndustryExperience((d.industryExperience as string) ?? "");
      setMinYears((d.minYears as string) ?? "");
      setMaxYears((d.maxYears as string) ?? "");
      setVariableCompEnabled(Boolean(d.variableCompEnabled));
      setVariableCompTarget((d.variableCompTarget as string) ?? "");
      setVariableCompStructure((d.variableCompStructure as string) ?? "");
      setBonusEnabled(Boolean(d.bonusEnabled));
      setBonusTarget((d.bonusTarget as string) ?? "");
      setBonusStructure((d.bonusStructure as string) ?? "");
      setEquityOffered(Boolean(d.equityOffered));
      setEquityNote((d.equityNote as string) ?? "");
      setVerificationRequirements(
        new Set((d.verificationRequirements as string[]) ?? [])
      );
      setExternalLinks(
        Array.isArray(d.externalLinks)
          ? (d.externalLinks as ExternalLinkPair[])
          : []
      );
      setRequirements((d.requirements as string) ?? "");
      setHideStagesFromCandidate(Boolean(d.hideStagesFromCandidate));
      setQuestions((d.questions as WizardScreeningQuestion[]) ?? []);
      setStatus((d.status as string) ?? "draft");
      if (typeof d.stepIdx === "number") {
        const clamped = Math.min(
          STEPS.length - 1,
          Math.max(0, d.stepIdx as number)
        );
        setStepIdx(clamped);
        // #97 — unlock stepper jumps up to the restored step.
        setMaxStepReached((m) => Math.max(m, clamped));
      }
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
  const [savedFlash, setSavedFlash] = useState<number | null>(null);

  /* ───── Step navigation + per-step validation ───── */

  function tryAdvance() {
    const stepId = STEPS[stepIdx].id;
    setError(null);

    if (stepId === "basics") {
      if (!title.trim())
        return setError("Add a job title before continuing.");
      if (!corporateFunction)
        return setError("Pick a corporate function for this role.");
      if (!authorityLevel)
        return setError("Pick an authority level for this role.");
      // Anchor location is OPTIONAL for corporate jobs — 0/1/N all valid.
    }
    if (stepId === "description") {
      const stripped = description.replace(/<[^>]*>/g, "").trim();
      if (!stripped)
        return setError("Add a job description before continuing.");
    }
    if (stepId === "details") {
      if (!workMode)
        return setError("Pick a work mode for this role.");
      if (minYears && maxYears && Number(minYears) > Number(maxYears))
        return setError("Min years of experience can't be greater than max.");
    }
    if (stepId === "screening") {
      const validation = validateQuestions(questions);
      if (validation) return setError(validation);
    }
    const nextIdx = Math.min(STEPS.length - 1, stepIdx + 1);
    setStepIdx(nextIdx);
    // #97 — unlock the validated step for stepper jumps.
    setMaxStepReached((m) => Math.max(m, nextIdx));
  }

  function back() {
    setError(null);
    setStepIdx((i) => Math.max(0, i - 1));
  }

  /* ───── Submit ───── */

  function handleSubmit() {
    setError(null);

    if (!title.trim()) {
      setStepIdx(0);
      return setError("Add a job title.");
    }
    if (!corporateFunction) {
      setStepIdx(0);
      return setError("Pick a corporate function for this role.");
    }
    if (!authorityLevel) {
      setStepIdx(0);
      return setError("Pick an authority level for this role.");
    }
    const strippedDesc = description.replace(/<[^>]*>/g, "").trim();
    if (!strippedDesc) {
      setStepIdx(1);
      return setError("Add a job description.");
    }
    if (!workMode) {
      setStepIdx(2);
      return setError("Pick a work mode for this role.");
    }
    if (minYears && maxYears && Number(minYears) > Number(maxYears)) {
      setStepIdx(2);
      return setError("Min years of experience can't be greater than max.");
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
    formData.set("employment_type", employmentType);
    formData.set("openings", openings || "1");
    formData.set("corporate_function", corporateFunction);
    formData.set("authority_level", authorityLevel);
    for (const id of selectedLocationIds) {
      formData.append("location_ids", id);
    }

    // Compensation — normalize per type (same logic as job-wizard.tsx).
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
      formData.set("compensation_max", compMin);
    } else {
      formData.set("compensation_min", "");
      formData.set("compensation_max", "");
    }
    formData.set("compensation_period", compType === "doe" ? "" : compPeriod);
    if (compVisible || (payTransparency?.requiresRange && !payExempt))
      formData.set("compensation_visible", "on");
    if (payExempt) formData.set("pay_transparency_exempt", "on");
    for (const b of benefits) formData.append("benefits", b);

    // 16-column corporate sandbox.
    formData.set("work_mode", workMode);
    if (workMode === "hybrid" && workModeDetail.trim())
      formData.set("work_mode_detail", workModeDetail);
    if (workMode === "remote") {
      for (const s of remoteStates)
        formData.append("remote_state_restrictions", s);
    }
    if (travelExpectation)
      formData.set("travel_expectation", travelExpectation);
    if (travelTerritory.trim())
      formData.set("travel_territory", travelTerritory);
    if (reportsTo.trim()) formData.set("reports_to", reportsTo);
    if (directReportsBand)
      formData.set("direct_reports_band", directReportsBand);
    if (indirectReportsBand)
      formData.set("indirect_reports_band", indirectReportsBand);
    if (educationRequirement)
      formData.set("education_requirement", educationRequirement);
    if (industryExperience)
      formData.set("industry_experience", industryExperience);
    formData.set("min_years_corporate_experience", minYears);
    formData.set("max_years_corporate_experience", maxYears);

    // Composable compensation components — IDENTICAL contract to the
    // practice side. Enable flags emit "on" only when enabled; the value
    // fields are always emitted (may be "").
    if (variableCompEnabled) formData.set("variable_comp_enabled", "on");
    formData.set("variable_comp_target", variableCompTarget);
    formData.set("variable_comp_structure", variableCompStructure);
    if (bonusEnabled) formData.set("bonus_enabled", "on");
    formData.set("bonus_target", bonusTarget);
    formData.set("bonus_structure", bonusStructure);
    if (equityOffered) formData.set("equity_offered", "on");
    formData.set("equity_note", equityNote);

    // External links — paired arrays + Slice B sentinel.
    for (const link of externalLinks) {
      formData.append("external_link_label", link.label);
      formData.append("external_link_url", link.url);
    }
    formData.set("external_links_submitted", "1");

    formData.set("requirements", requirements);
    if (hideStagesFromCandidate)
      formData.set("hide_stages_from_candidate", "on");
    // #83 Phase 4 — confidential search (sentinel-gated; create mode only).
    if (mode === "create") {
      formData.set("confidential_submitted", "1");
      if (confidential) {
        formData.set("confidential", "on");
        for (const id of confidentialAssigneeIds) {
          formData.append("confidential_assignee_ids", id);
        }
      }
    }

    // 5G.e Tier 2 — verification requirements. One entry per ticked type;
    // IDENTICAL contract to the practice side.
    for (const v of verificationRequirements)
      formData.append("verification_requirements", v);

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
            // #71 fix (Day 28): scale stores its two end labels in `options`;
            // DB constraint screening_options_present REQUIRES options for
            // single_select | multi_select | scale. Scale was serializing as
            // null → "couldn't save screening questions" on the corporate
            // wizard (the IT-manager role Cam hit in the Day 28 stress test).
            q.kind === "single_select" ||
            q.kind === "multi_select" ||
            q.kind === "scale"
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
      const action =
        mode === "edit" ? updateCorporateJob : createCorporateJob;
      const result: JobActionState = await action({ ok: false }, formData);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      // Clear the draft on a successful create (createCorporateJob
      // redirects, so this is the last chance before nav).
      if (draftKey && typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(draftKey);
        } catch {
          /* noop */
        }
      }
      if (mode === "edit") {
        setQuestions((qs) => qs.map((q) => ({ ...q, persisted: true })));
        setError(null);
        setSavedFlash(Date.now());
      }
    });
  }

  const currentStep = STEPS[stepIdx];

  // Lane 6 — live preview + DSOFit matchability (xl+), mirrors the
  // clinical wizard. Pure derivations from existing state.
  // P0 (Cam, Day 33): mask anonymized location names exactly like the
  // public page — the preview pane is candidate-eye, not employer-eye.
  const selectedLocationNames = locations
    .filter((l) => selectedLocationIds.has(l.id))
    .map((l) =>
      l.anonymizeName
        ? l.city
          ? `Dental Office in ${l.city}`
          : "A dental office"
        : l.name
    );
  const employmentLabelForPreview =
    EMPLOYMENT_OPTIONS.find((e) => e.value === employmentType)?.label ??
    employmentType;
  const matchability = useMemo(
    () =>
      computeCorporateMatchability({
        corporateFunction,
        locationCount: locations.length,
        authorityLevel,
        industryExperience,
        directReportsBand,
        indirectReportsBand,
        workMode,
        travelExpectation,
        compType,
        compMin,
        compMax,
        minYears,
        benefits,
      }),
    [
      corporateFunction,
      locations.length,
      authorityLevel,
      industryExperience,
      directReportsBand,
      indirectReportsBand,
      workMode,
      travelExpectation,
      compType,
      compMin,
      compMax,
      minYears,
      benefits,
    ]
  );
  const STEP_INDEX: Record<string, number> = {
    basics: 0,
    details: 1,
    description: 2,
  };

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-8 xl:items-start">
    <div className="space-y-8 max-w-[820px]">
      {draftFound && !draftDismissed && (
        <div className="border border-[#3D5266]/50 bg-[#3D5266]/[0.08] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-bold text-ink mb-0.5">
              We saved a draft of an in-progress corporate job posting.
            </p>
            <p className="text-[12px] text-slate-meta">
              Last edit {timeAgoShort(new Date(draftFound.savedAt))} ago.
              Resume where you left off?
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={restoreDraft}
              className="px-4 py-2 bg-primary text-primary-foreground text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-primary/90 transition-colors"
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
      <WizardShell
        steps={STEPS.map((s) => ({ id: s.id, label: s.short }))}
        currentIndex={stepIdx}
        maxWidthClass="max-w-[820px]"
        stickyTopClass="top-[64px] lg:top-0"
        eyebrow={
          <>
            <BrandLockup height={28} />
            <span className="text-[12px] font-bold uppercase tracking-[2px] text-slate-meta">
              post a corporate role
            </span>
          </>
        }
        meterIcon={<BrandMark className="h-3.5 w-3.5" />}
        canJumpTo={(i) => i !== stepIdx && i <= maxStepReached}
        onJump={(i) => {
          setError(null);
          setStepIdx(i);
        }}
        onBack={back}
        onNext={() => {
          if (stepIdx < STEPS.length - 1) tryAdvance();
          else handleSubmit();
        }}
        nextLabel={
          stepIdx < STEPS.length - 1
            ? "Continue"
            : mode === "create"
              ? status === "active"
                ? "Publish job"
                : "Save draft"
              : "Save changes"
        }
        busy={pending}
        error={error}
      >
        {currentStep.id === "basics" && (
          <>
            <BasicsStep
              title={title}
              onTitle={setTitle}
              employmentType={employmentType}
              onEmploymentType={setEmploymentType}
              openings={openings}
              onOpenings={setOpenings}
              corporateFunction={corporateFunction}
              onCorporateFunction={setCorporateFunction}
              authorityLevel={authorityLevel}
              onAuthorityLevel={setAuthorityLevel}
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
            {/* #83 Phase 4 — confidential search. The DSOFit C-suite
                differentiator: a quiet CFO/COO search visible only to
                owner/admin + assigned teammates. */}
            {mode === "create" && (
              <div className="mt-6">
                <ConfidentialSearchFields
                  teammates={teammates}
                  confidential={confidential}
                  onConfidentialChange={setConfidential}
                  assigneeIds={confidentialAssigneeIds}
                  onAssigneeIdsChange={setConfidentialAssigneeIds}
                />
              </div>
            )}
          </>
        )}

        {currentStep.id === "description" && (
          <DescriptionStep
            description={description}
            onChange={setDescription}
            title={title}
            onTitle={setTitle}
            corporateFunction={corporateFunction}
            authorityLevel={authorityLevel}
            workMode={workMode}
            locationIds={Array.from(selectedLocationIds)}
            compMin={compMin}
            compMax={compMax}
            compPeriod={compPeriod}
            benefits={benefits}
            reportsTo={reportsTo}
            educationRequirement={educationRequirement}
            industryExperience={industryExperience}
            minYears={minYears}
            maxYears={maxYears}
            travelExpectation={travelExpectation}
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
            workMode={workMode}
            onWorkMode={setWorkMode}
            workModeDetail={workModeDetail}
            onWorkModeDetail={setWorkModeDetail}
            remoteStates={remoteStates}
            onRemoteStates={setRemoteStates}
            travelExpectation={travelExpectation}
            onTravelExpectation={setTravelExpectation}
            travelTerritory={travelTerritory}
            onTravelTerritory={setTravelTerritory}
            reportsTo={reportsTo}
            onReportsTo={setReportsTo}
            directReportsBand={directReportsBand}
            onDirectReportsBand={setDirectReportsBand}
            indirectReportsBand={indirectReportsBand}
            onIndirectReportsBand={setIndirectReportsBand}
            minYears={minYears}
            onMinYears={setMinYears}
            maxYears={maxYears}
            onMaxYears={setMaxYears}
            educationRequirement={educationRequirement}
            onEducationRequirement={setEducationRequirement}
            industryExperience={industryExperience}
            onIndustryExperience={setIndustryExperience}
            variableCompEnabled={variableCompEnabled}
            onVariableCompEnabled={setVariableCompEnabled}
            variableCompTarget={variableCompTarget}
            onVariableCompTarget={setVariableCompTarget}
            variableCompStructure={variableCompStructure}
            onVariableCompStructure={setVariableCompStructure}
            bonusEnabled={bonusEnabled}
            onBonusEnabled={setBonusEnabled}
            bonusTarget={bonusTarget}
            onBonusTarget={setBonusTarget}
            bonusStructure={bonusStructure}
            onBonusStructure={setBonusStructure}
            equityOffered={equityOffered}
            onEquityOffered={setEquityOffered}
            equityNote={equityNote}
            onEquityNote={setEquityNote}
            externalLinks={externalLinks}
            onExternalLinks={setExternalLinks}
            requirements={requirements}
            onRequirements={setRequirements}
            hideStagesFromCandidate={hideStagesFromCandidate}
            onHideStagesFromCandidate={setHideStagesFromCandidate}
            verificationRequirements={verificationRequirements}
            onToggleVerificationRequirement={toggleVerificationRequirement}
            benefits={benefits}
            onBenefits={setBenefits}
            payTransparency={payTransparency}
            payExempt={payExempt}
            onPayExempt={setPayExempt}
          />
        )}

        {currentStep.id === "screening" && (
          <ScreeningStep
            questions={questions}
            onChange={setQuestions}
            corporateFunction={corporateFunction}
          />
        )}

        {currentStep.id === "preview" && (
          <PreviewStep
            mode={mode}
            title={title}
            employmentType={employmentType}
            corporateFunction={corporateFunction}
            authorityLevel={authorityLevel}
            locations={locations}
            selectedLocationIds={selectedLocationIds}
            description={description}
            compType={compType}
            compMin={compMin}
            compMax={compMax}
            compPeriod={compPeriod}
            compVisible={compVisible}
            workMode={workMode}
            workModeDetail={workModeDetail}
            remoteStates={remoteStates}
            travelExpectation={travelExpectation}
            travelTerritory={travelTerritory}
            reportsTo={reportsTo}
            directReportsBand={directReportsBand}
            indirectReportsBand={indirectReportsBand}
            minYears={minYears}
            maxYears={maxYears}
            educationRequirement={educationRequirement}
            industryExperience={industryExperience}
            bonusStructure={bonusStructure}
            equityOffered={equityOffered}
            equityNote={equityNote}
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

        {savedFlash && mode === "edit" && (
          <div className="mt-6 bg-cream border-l-4 border-[#3D5266] p-4">
            <p className="text-[14px] text-ink font-semibold">
              Saved. Changes are live.
            </p>
          </div>
        )}
      </WizardShell>
    </div>

      {/* Lane 6 — corporate studio pane (xl+). Same chain rule: no
          overflow wrappers around the sticky aside. */}
      <aside className="hidden xl:block sticky top-6 space-y-4">
        <PostingPreview
          title={title}
          roleLabel={corporateFunction || "Corporate role"}
          employmentTypeLabel={employmentLabelForPreview}
          locationNames={selectedLocationNames}
          compVisible={compVisible}
          compType={compType}
          compMin={compMin}
          compMax={compMax}
          compPeriod={compPeriod}
          scheduleDays={[]}
          scheduleEvenings={false}
          scheduleWeekends={false}
          benefits={benefits}
          skills={[]}
          descriptionHtml={description}
          questionCount={questions.length}
        />
        <MatchabilityMeter
          result={matchability}
          product="dsofit"
          onJumpToStep={(step) => {
            setError(null);
            setStepIdx(STEP_INDEX[step] ?? 0);
          }}
          canJumpToStep={(step) =>
            (STEP_INDEX[step] ?? 0) <= maxStepReached
          }
        />
      </aside>
    </div>
  );
}

/* ───── Step 1 — Basics ───── */

function BasicsStep({
  title,
  onTitle,
  employmentType,
  onEmploymentType,
  openings,
  onOpenings,
  corporateFunction,
  onCorporateFunction,
  authorityLevel,
  onAuthorityLevel,
  locations,
  selectedLocationIds,
  onToggleLocation,
}: {
  title: string;
  onTitle: (v: string) => void;
  employmentType: string;
  onEmploymentType: (v: string) => void;
  openings: string;
  onOpenings: (v: string) => void;
  corporateFunction: string;
  onCorporateFunction: (v: string) => void;
  authorityLevel: string;
  onAuthorityLevel: (v: string) => void;
  locations: LocationOption[];
  selectedLocationIds: Set<string>;
  onToggleLocation: (id: string) => void;
}) {
  return (
    <div className="space-y-7">
      <div>
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-[#3D5266] mb-2">
          Basics
        </div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-[-0.4px] text-ink leading-tight">
          What corporate role are you hiring for?
        </h2>
        <p className="mt-3 text-[14px] text-slate-body leading-relaxed">
          Corporate roles are DSO-wide — they post to the Corporate Roles tab
          on the public job board, not a single practice listing.
        </p>
      </div>

      <Input
        label="Job title"
        required
        placeholder="VP of Finance — Multi-Practice DSO"
        value={title}
        onChange={onTitle}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Select
          label="Corporate function"
          required
          value={corporateFunction}
          onChange={onCorporateFunction}
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
          onChange={onEmploymentType}
          options={EMPLOYMENT_OPTIONS}
        />
        <Input
          label="Number of openings"
          type="number"
          placeholder="1"
          value={openings}
          onChange={onOpenings}
        />
      </div>
      <p className="-mt-3 text-[12px] text-slate-meta">
        The corporate function powers the Corporate Roles tab filter on the
        public job board and the role-family landing pages.
      </p>

      <div>
        <label className="block text-[13px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
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
                  : "bg-card border-[var(--rule-strong)] hover:bg-cream")
              }
            >
              <input
                type="radio"
                name="authority_level"
                checked={authorityLevel === opt.value}
                onChange={() => onAuthorityLevel(opt.value)}
                className="accent-[#3D5266]"
              />
              <span className="text-[14px] text-ink font-semibold">
                {opt.label}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-slate-meta">
          The primary candidate-side filter signal for corporate roles —
          candidates browse by seniority band.
        </p>
      </div>

      <div>
        <label className="block text-[13px] font-bold tracking-[2px] uppercase text-slate-body mb-3">
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
                    checked ? "bg-cream" : "bg-card hover:bg-cream/60"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-[#3D5266] flex-shrink-0"
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
        ) : (
          <p className="text-[13px] text-slate-meta italic border border-dashed border-[var(--rule-strong)] p-4 bg-cream/40">
            No practice locations on file. That&apos;s fine — corporate roles
            don&apos;t require one.
          </p>
        )}
        <p className="mt-2 text-[12px] text-slate-meta">
          Corporate roles are DSO-wide. Pick one or more anchor practices if
          the role reports out of them, or leave blank for fully remote /
          floating roles. Zero, one, or several are all valid.
        </p>
      </div>
    </div>
  );
}

/* ───── Step 2 — Description ───── */

function DescriptionStep({
  description,
  onChange,
  title,
  onTitle,
  corporateFunction,
  authorityLevel,
  workMode,
  locationIds,
  compMin,
  compMax,
  compPeriod,
  benefits,
  reportsTo,
  educationRequirement,
  industryExperience,
  minYears,
  maxYears,
  travelExpectation,
}: {
  description: string;
  onChange: (v: string) => void;
  title: string;
  onTitle: (v: string) => void;
  corporateFunction: string;
  authorityLevel: string;
  workMode: string;
  locationIds: string[];
  compMin: string;
  compMax: string;
  compPeriod: string;
  benefits: string[];
  reportsTo: string;
  educationRequirement: string;
  industryExperience: string;
  minYears: string;
  maxYears: string;
  travelExpectation: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-[#3D5266] mb-2">
          Description
        </div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-[-0.4px] text-ink leading-tight">
          Tell candidates about the role.
        </h2>
      </div>

      {/* 5G.d P3 — corporate-tuned AI JD generator. Built against the
          corporate field set (corporate_function + authority_level +
          work_mode), NOT the dental role_category-keyed generator. */}
      <JdGeneratorCorporatePanel
        corporateFunction={corporateFunction}
        authorityLevel={authorityLevel}
        workMode={workMode}
        locationIds={locationIds}
        compMin={compMin.trim() ? Number(compMin) : null}
        compMax={compMax.trim() ? Number(compMax) : null}
        compPeriod={compPeriod}
        benefits={benefits}
        reportsTo={reportsTo}
        educationRequirement={educationRequirement}
        industryExperience={industryExperience}
        minYears={minYears.trim() ? Number(minYears) : null}
        maxYears={maxYears.trim() ? Number(maxYears) : null}
        travelExpectation={travelExpectation}
        onApplyTitle={onTitle}
        onApplyDescription={onChange}
        onApplyAll={({ title: t, descriptionHtml }) => {
          onTitle(t);
          onChange(descriptionHtml);
        }}
      />

      {title.trim() && (
        <p className="text-[12px] text-slate-meta">
          Job title is currently:{" "}
          <span className="font-bold text-ink">{title}</span>. Edit it from
          the Basics step.
        </p>
      )}

      <div data-jd-editor-anchor="true" className="scroll-mt-24">
        <JobDescriptionEditor
          value={description}
          onChange={onChange}
          placeholder="Describe the role, scope, what success looks like, and what makes this DSO worth joining at the corporate level…"
        />
      </div>
      <p className="text-[12px] text-slate-meta">
        Headings, bold/italic, lists, links, and blockquotes are supported.
        Skip H1 — that&apos;s reserved for the page title.
      </p>
    </div>
  );
}

/* ───── Step 3 — Compensation & sandbox ───── */

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
  workMode,
  onWorkMode,
  workModeDetail,
  onWorkModeDetail,
  remoteStates,
  onRemoteStates,
  travelExpectation,
  onTravelExpectation,
  travelTerritory,
  onTravelTerritory,
  reportsTo,
  onReportsTo,
  directReportsBand,
  onDirectReportsBand,
  indirectReportsBand,
  onIndirectReportsBand,
  minYears,
  onMinYears,
  maxYears,
  onMaxYears,
  educationRequirement,
  onEducationRequirement,
  industryExperience,
  onIndustryExperience,
  variableCompEnabled,
  onVariableCompEnabled,
  variableCompTarget,
  onVariableCompTarget,
  variableCompStructure,
  onVariableCompStructure,
  bonusEnabled,
  onBonusEnabled,
  bonusTarget,
  onBonusTarget,
  bonusStructure,
  onBonusStructure,
  equityOffered,
  onEquityOffered,
  equityNote,
  onEquityNote,
  externalLinks,
  onExternalLinks,
  requirements,
  onRequirements,
  hideStagesFromCandidate,
  onHideStagesFromCandidate,
  verificationRequirements,
  onToggleVerificationRequirement,
  benefits,
  onBenefits,
  payTransparency,
  payExempt,
  onPayExempt,
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
  workMode: string;
  onWorkMode: (v: string) => void;
  workModeDetail: string;
  onWorkModeDetail: (v: string) => void;
  remoteStates: Set<string>;
  onRemoteStates: (v: Set<string>) => void;
  travelExpectation: string;
  onTravelExpectation: (v: string) => void;
  travelTerritory: string;
  onTravelTerritory: (v: string) => void;
  reportsTo: string;
  onReportsTo: (v: string) => void;
  directReportsBand: string;
  onDirectReportsBand: (v: string) => void;
  indirectReportsBand: string;
  onIndirectReportsBand: (v: string) => void;
  minYears: string;
  onMinYears: (v: string) => void;
  maxYears: string;
  onMaxYears: (v: string) => void;
  educationRequirement: string;
  onEducationRequirement: (v: string) => void;
  industryExperience: string;
  onIndustryExperience: (v: string) => void;
  variableCompEnabled: boolean;
  onVariableCompEnabled: (v: boolean) => void;
  variableCompTarget: string;
  onVariableCompTarget: (v: string) => void;
  variableCompStructure: string;
  onVariableCompStructure: (v: string) => void;
  bonusEnabled: boolean;
  onBonusEnabled: (v: boolean) => void;
  bonusTarget: string;
  onBonusTarget: (v: string) => void;
  bonusStructure: string;
  onBonusStructure: (v: string) => void;
  equityOffered: boolean;
  onEquityOffered: (v: boolean) => void;
  equityNote: string;
  onEquityNote: (v: string) => void;
  externalLinks: ExternalLinkPair[];
  onExternalLinks: (v: ExternalLinkPair[]) => void;
  requirements: string;
  onRequirements: (v: string) => void;
  hideStagesFromCandidate: boolean;
  onHideStagesFromCandidate: (v: boolean) => void;
  verificationRequirements: Set<string>;
  onToggleVerificationRequirement: (value: VerificationTypeValue) => void;
  benefits: string[];
  onBenefits: (v: string[]) => void;
  payTransparency: {
    requiresRange: boolean;
    requiresBenefits: boolean;
    coveredLabel: string;
    message: string;
    remoteRisk: boolean;
    remoteRiskLabel: string;
  } | null;
  payExempt: boolean;
  onPayExempt: (v: boolean) => void;
}) {
  const [reportingOpen, setReportingOpen] = useState(
    Boolean(reportsTo || directReportsBand || indirectReportsBand)
  );

  return (
    <div className="space-y-7">
      <div>
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-[#3D5266] mb-2">
          Compensation & sandbox
        </div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-[-0.4px] text-ink leading-tight">
          Pay, work mode, and the role&apos;s shape.
        </h2>
      </div>

      {/* ── Compensation (unified composable editor) ──
          Base comp + Commission/variable + Bonus + Equity + live OTE note,
          all in the ONE shared CompensationSection. The scattered bonus_
          structure / equity_offered / equity_note sandbox fields used to
          live further down this step — they've been pulled up here. */}
      <CompensationSection
        accent="corporate"
        enforcement={
          payTransparency
            ? { ...payTransparency, exempt: payExempt, onExempt: onPayExempt }
            : undefined
        }
        compType={compType}
        onCompType={onCompType}
        compMin={compMin}
        onCompMin={onCompMin}
        compMax={compMax}
        onCompMax={onCompMax}
        compPeriod={compPeriod}
        onCompPeriod={onCompPeriod}
        compVisible={compVisible}
        onCompVisible={onCompVisible}
        variableCompEnabled={variableCompEnabled}
        onVariableCompEnabled={onVariableCompEnabled}
        variableCompTarget={variableCompTarget}
        onVariableCompTarget={onVariableCompTarget}
        variableCompStructure={variableCompStructure}
        onVariableCompStructure={onVariableCompStructure}
        bonusEnabled={bonusEnabled}
        onBonusEnabled={onBonusEnabled}
        bonusTarget={bonusTarget}
        onBonusTarget={onBonusTarget}
        bonusStructure={bonusStructure}
        onBonusStructure={onBonusStructure}
        equityOffered={equityOffered}
        onEquityOffered={onEquityOffered}
        equityNote={equityNote}
        onEquityNote={onEquityNote}
      />

      {/* Day 24 — Benefits chip picker. Several pay-transparency states
          (CO, WA, IL, MN, MD, NJ, VT) require a general benefits description
          on covered postings, so corporate jobs need this field too. */}
      <ChipArrayInput
        label="Benefits"
        values={benefits}
        onChange={onBenefits}
        options={BENEFITS}
        placeholder="Search benefits — type and press Enter for custom"
        helper="Health, retirement, PTO, and other perks. Several states (CO, WA, IL, MN, MD, NJ, VT) require a general benefits description on covered job posts."
      />

      {/* ── Work mode ── */}
      <fieldset className="border border-[var(--rule)] p-6 bg-cream/40">
        <legend className="px-2 text-[10px] font-bold tracking-[2px] uppercase text-[#3D5266]">
          Work mode <span className="text-[#3D5266]">*</span>
        </legend>
        <div className="mt-2 space-y-2">
          {WORK_MODES.map((opt) => (
            <label
              key={opt.value}
              className={
                "flex items-start gap-3 px-4 py-3 border cursor-pointer transition-colors " +
                (workMode === opt.value
                  ? "bg-[#3D5266]/[0.08] border-[#3D5266]"
                  : "bg-card border-[var(--rule-strong)] hover:bg-cream")
              }
            >
              <input
                type="radio"
                name="work_mode"
                checked={workMode === opt.value}
                onChange={() => onWorkMode(opt.value)}
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
          <div className="mt-4">
            <Input
              label="Hybrid detail (optional)"
              placeholder="3 days in office Mon/Wed/Fri"
              value={workModeDetail}
              onChange={onWorkModeDetail}
            />
          </div>
        )}

        {workMode === "remote" && (
          <div className="mt-4">
            <label className="block text-[13px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
              State restrictions{" "}
              <span className="text-slate-meta font-normal normal-case tracking-[0.3px]">
                (optional)
              </span>
            </label>
            <p className="text-[12px] text-slate-meta leading-relaxed mb-3">
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
                      onRemoteStates(next);
                    }}
                    className={`px-2.5 py-1 text-[11px] font-bold tracking-[0.5px] border transition-colors ${
                      checked
                        ? "bg-[#3D5266] text-ivory border-[#3D5266]"
                        : "bg-card text-ink border-[var(--rule)] hover:border-[#3D5266]"
                    }`}
                  >
                    {st}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </fieldset>

      {/* ── Travel ── */}
      <fieldset className="border border-[var(--rule)] p-6 bg-cream/40">
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
              onClick={() => onTravelExpectation("")}
              className={`px-3 py-1.5 text-[12px] font-medium border transition-colors ${
                travelExpectation === ""
                  ? "bg-[#3D5266] text-ivory border-[#3D5266]"
                  : "bg-card text-ink border-[var(--rule)] hover:border-[#3D5266]"
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
                  onClick={() => onTravelExpectation(opt.value)}
                  className={`px-3 py-1.5 text-[12px] font-medium border transition-colors ${
                    checked
                      ? "bg-[#3D5266] text-ivory border-[#3D5266]"
                      : "bg-card text-ink border-[var(--rule)] hover:border-[#3D5266]"
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
            onChange={onTravelTerritory}
          />
        </div>
      </fieldset>

      {/* ── Reporting structure (collapsible) ── */}
      <fieldset className="border border-[var(--rule)] p-6 bg-cream/40">
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
              onChange={onReportsTo}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Direct reports (optional)"
                value={directReportsBand}
                onChange={onDirectReportsBand}
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
                onChange={onIndirectReportsBand}
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
      <fieldset className="border border-[var(--rule)] p-6 bg-cream/40">
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
            onChange={onMinYears}
          />
          <Input
            label="Max years experience"
            type="number"
            placeholder="e.g. 12"
            value={maxYears}
            onChange={onMaxYears}
          />
          <Select
            label="Education requirement"
            value={educationRequirement}
            onChange={onEducationRequirement}
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
                  : "bg-card border-[var(--rule-strong)] hover:bg-cream")
              }
            >
              <input
                type="radio"
                name="industry_experience"
                checked={industryExperience === ""}
                onChange={() => onIndustryExperience("")}
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
                    : "bg-card border-[var(--rule-strong)] hover:bg-cream")
                }
              >
                <input
                  type="radio"
                  name="industry_experience"
                  checked={industryExperience === opt.value}
                  onChange={() => onIndustryExperience(opt.value)}
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

      {/* Bonus & equity fields moved UP into <CompensationSection> above. */}

      {/* ── External links ── */}
      <ExternalLinksField initial={externalLinks} onChange={onExternalLinks} />

      {/* Note 6 (Dave 2026-05-21) — role-aware Requirements chip picker, same
          pattern as the clinical wizard. Corporate jobs are role_category
          "other" → seeded with the DSO-corporate requirement set. Stored value
          stays a newline-joined string (text column unchanged; listing renders
          whitespace-pre-wrap). Custom typing still allowed (Enter to add). */}
      <ChipArrayInput
        label="Requirements"
        values={requirements
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)}
        onChange={(vals) => onRequirements(vals.join("\n"))}
        options={getJobRequirementsPrioritized("dso_corporate")}
        placeholder="Search requirements — type and press Enter for custom"
        helper="Must-haves for the role — education, experience, credentials. Pick from suggestions or type your own; each becomes one line on the listing."
      />

      {/* ── Candidate visibility ── */}
      <fieldset className="border border-[var(--rule)] p-6 bg-cream/40">
        <legend className="px-2 text-[10px] font-bold tracking-[2px] uppercase text-[#3D5266]">
          Candidate visibility
        </legend>
        <label className="mt-2 flex items-start gap-2.5 text-[14px] text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={hideStagesFromCandidate}
            onChange={(e) => onHideStagesFromCandidate(e.target.checked)}
            className="mt-1 accent-[#3D5266]"
          />
          <div>
            <div className="font-bold mb-1">
              Hide pipeline stages from candidates
            </div>
            <div className="text-[13px] text-slate-body leading-relaxed">
              By default, candidates see exactly where they sit in the
              pipeline — Submitted, Screening, Interview, Offer. Turn this on
              for a sensitive executive search and candidates will see an
              abstracted &ldquo;In review&rdquo; label until they reach Offer
              or Hired.
            </div>
          </div>
        </label>
      </fieldset>

      {/* ── Verification requirements (5G.e Tier 2) ── */}
      <VerificationRequirements
        accent="corporate"
        selected={verificationRequirements}
        onToggle={onToggleVerificationRequirement}
      />
    </div>
  );
}

/* ───── Step 4 — Screening questions ───── */

function ScreeningStep({
  questions,
  onChange,
  corporateFunction,
}: {
  questions: WizardScreeningQuestion[];
  onChange: (qs: WizardScreeningQuestion[]) => void;
  corporateFunction: string;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
          : kind === "scale"
            ? [
                { id: "low", label: "" },
                { id: "high", label: "" },
              ]
            : null,
      required: false,
      sort_order: questions.length,
    };
    onChange([...questions, newQ]);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(newQ.id);
      return next;
    });
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

  // #73 — drag-to-reorder (collapsed cards); arrows stay as fallback.
  const dragIndex = useRef<number | null>(null);
  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const next = [...questions];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-[#3D5266] mb-2">
          Screening questions
        </div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-[-0.4px] text-ink leading-tight">
          What do you want to know up front?
        </h2>
        <p className="mt-3 text-[14px] text-slate-body leading-relaxed">
          Optional. Candidates answer these as part of their application —
          pick the ones that actually filter. You can add more later.
        </p>
      </div>

      {/* 5G.d P3 — corporate recommended-question library, keyed by
          corporate_function. Separate from the dental clinical library. */}
      <CorporateRecommendedQuestionsPanel
        corporateFunction={corporateFunction}
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
              onUpdate={(patch) => updateQ(q.id, patch)}
              onRemove={() => removeQ(q.id)}
              onMove={(dir) => move(q.id, dir)}
              expanded={expandedIds.has(q.id)}
              onToggleExpand={() => toggleExpand(q.id)}
            />
          </div>
        );
      })}

      <div>
        <div className="text-[13px] font-bold tracking-[2px] uppercase text-slate-body mb-3">
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
  );
}

function QuestionCard({
  question,
  index,
  total,
  onUpdate,
  onRemove,
  onMove,
  expanded,
  onToggleExpand,
}: {
  question: WizardScreeningQuestion;
  index: number;
  total: number;
  onUpdate: (patch: Partial<WizardScreeningQuestion>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  expanded: boolean;
  onToggleExpand: () => void;
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
      className="border border-[var(--rule)] p-5 bg-card"
    >
      <div className="flex items-center justify-between mb-4">
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
            className="p-1.5 text-danger hover:text-danger hover:bg-danger-bg transition-colors"
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
                <span className="text-[9px] font-bold tracking-[1.2px] uppercase text-warning bg-warning-bg px-1.5 py-0.5">
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
              <label className="block text-[13px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
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
                      className="p-2 text-danger hover:text-danger hover:bg-danger-bg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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

          {isScale && (
            <div>
              <label className="block text-[13px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
                Slider end labels <span className="text-heritage">*</span>
              </label>
              <p className="mb-2 text-[13px] text-slate-meta">
                Candidates drag a <strong>1–5</strong> slider between these two
                ends — best for attitude or comfort-level questions. For a count
                or amount (e.g. &ldquo;locations managed&rdquo;), use a{" "}
                <strong>Number</strong> question instead.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  value={scaleLabel("low")}
                  onChange={(e) => updateOption("low", e.target.value)}
                  placeholder="Left end (1) — e.g. Individual contributor"
                  className="px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
                />
                <input
                  type="text"
                  value={scaleLabel("high")}
                  onChange={(e) => updateOption("high", e.target.value)}
                  placeholder="Right end (5) — e.g. Enterprise leadership"
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
              className="accent-[#3D5266]"
            />
            <span>Required — candidate must answer this to submit.</span>
          </label>

          {/* E2.10 — soft knockout authoring. Reused from job-wizard.tsx
              (exported there specifically to live in one place). */}
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

/* ───── Step 5 — Preview ───── */

function PreviewStep({
  mode,
  title,
  employmentType,
  corporateFunction,
  authorityLevel,
  locations,
  selectedLocationIds,
  description,
  compType,
  compMin,
  compMax,
  compPeriod,
  compVisible,
  workMode,
  workModeDetail,
  remoteStates,
  travelExpectation,
  travelTerritory,
  reportsTo,
  directReportsBand,
  indirectReportsBand,
  minYears,
  maxYears,
  educationRequirement,
  industryExperience,
  bonusStructure,
  equityOffered,
  equityNote,
  requirements,
  questions,
  status,
  onStatus,
  onJumpTo,
}: {
  mode: "create" | "edit";
  title: string;
  employmentType: string;
  corporateFunction: string;
  authorityLevel: string;
  locations: LocationOption[];
  selectedLocationIds: Set<string>;
  description: string;
  compType: CompensationType;
  compMin: string;
  compMax: string;
  compPeriod: string;
  compVisible: boolean;
  workMode: string;
  workModeDetail: string;
  remoteStates: Set<string>;
  travelExpectation: string;
  travelTerritory: string;
  reportsTo: string;
  directReportsBand: string;
  indirectReportsBand: string;
  minYears: string;
  maxYears: string;
  educationRequirement: string;
  industryExperience: string;
  bonusStructure: string;
  equityOffered: boolean;
  equityNote: string;
  requirements: string;
  questions: WizardScreeningQuestion[];
  status: string;
  onStatus: (v: string) => void;
  onJumpTo: (id: StepId) => void;
}) {
  const employment =
    EMPLOYMENT_OPTIONS.find((e) => e.value === employmentType)?.label ??
    employmentType;
  const fnLabel =
    CORPORATE_FUNCTIONS.find((f) => f.slug === corporateFunction)?.label ??
    "—";
  const authorityLabel = authorityLevel
    ? AUTHORITY_LEVEL_LABELS[
        authorityLevel as keyof typeof AUTHORITY_LEVEL_LABELS
      ] ?? authorityLevel
    : "—";
  const selectedLocations = locations.filter((l) =>
    selectedLocationIds.has(l.id)
  );

  // #78 — view-as-candidate toggle (mirrors the practice wizard).
  const [viewAsCandidate, setViewAsCandidate] = useState(false);
  const candidateEmployerLabel = (() => {
    const anon = selectedLocations.find((l) => l.anonymizeName);
    if (anon) return `Dental practice in ${anon.city ?? "your area"}`;
    const priv = selectedLocations.find((l) => l.publicDsoAffiliation === false);
    if (priv) return priv.name;
    return selectedLocations[0]?.name ?? "Your organization · corporate role";
  })();

  // Build the sandbox rows, only the populated ones.
  const sandboxRows: Array<{ label: string; value: string }> = [];
  if (workMode) {
    let wmVal =
      WORK_MODE_LABELS[workMode as keyof typeof WORK_MODE_LABELS] ?? workMode;
    if (workMode === "hybrid" && workModeDetail.trim())
      wmVal += ` — ${workModeDetail.trim()}`;
    sandboxRows.push({ label: "Work mode", value: wmVal });
  }
  if (workMode === "remote" && remoteStates.size > 0) {
    sandboxRows.push({
      label: "State restrictions",
      value: [...remoteStates].sort().join(", "),
    });
  }
  if (travelExpectation) {
    sandboxRows.push({
      label: "Travel",
      value:
        TRAVEL_EXPECTATION_LABELS[
          travelExpectation as keyof typeof TRAVEL_EXPECTATION_LABELS
        ] ?? travelExpectation,
    });
  }
  if (travelTerritory.trim()) {
    sandboxRows.push({ label: "Travel territory", value: travelTerritory });
  }
  if (reportsTo.trim()) {
    sandboxRows.push({ label: "Reports to", value: reportsTo });
  }
  if (directReportsBand) {
    sandboxRows.push({
      label: "Direct reports",
      value:
        DIRECT_REPORTS_BAND_LABELS[
          directReportsBand as keyof typeof DIRECT_REPORTS_BAND_LABELS
        ] ?? directReportsBand,
    });
  }
  if (indirectReportsBand) {
    sandboxRows.push({
      label: "Indirect reports",
      value:
        INDIRECT_REPORTS_BAND_LABELS[
          indirectReportsBand as keyof typeof INDIRECT_REPORTS_BAND_LABELS
        ] ?? indirectReportsBand,
    });
  }
  if (minYears || maxYears) {
    const exp =
      minYears && maxYears
        ? `${minYears}–${maxYears} yrs`
        : minYears
          ? `${minYears}+ yrs`
          : `up to ${maxYears} yrs`;
    sandboxRows.push({ label: "Experience", value: exp });
  }
  if (educationRequirement) {
    sandboxRows.push({
      label: "Education",
      value:
        EDUCATION_REQUIREMENT_LABELS[
          educationRequirement as keyof typeof EDUCATION_REQUIREMENT_LABELS
        ] ?? educationRequirement,
    });
  }
  if (industryExperience) {
    sandboxRows.push({
      label: "Industry experience",
      value:
        INDUSTRY_EXPERIENCE_LABELS[
          industryExperience as keyof typeof INDUSTRY_EXPERIENCE_LABELS
        ] ?? industryExperience,
    });
  }
  if (bonusStructure.trim()) {
    sandboxRows.push({ label: "Bonus", value: bonusStructure });
  }
  if (equityOffered) {
    sandboxRows.push({
      label: "Equity",
      value: equityNote.trim() ? equityNote : "Offered",
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-[#3D5266] mb-2">
          Preview & publish
        </div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-[-0.4px] text-ink leading-tight">
          Final check before it goes live.
        </h2>
      </div>

      <div className="inline-flex rounded-full border border-[var(--rule)] bg-cream p-1 text-[12px] font-bold uppercase tracking-[1px]">
        <button
          type="button"
          onClick={() => setViewAsCandidate(false)}
          className={
            "rounded-full px-3.5 py-1.5 transition-colors " +
            (!viewAsCandidate
              ? "bg-primary text-primary-foreground"
              : "text-slate-body hover:text-ink")
          }
        >
          Employer review
        </button>
        <button
          type="button"
          onClick={() => setViewAsCandidate(true)}
          className={
            "rounded-full px-3.5 py-1.5 transition-colors " +
            (viewAsCandidate
              ? "bg-primary text-primary-foreground"
              : "text-slate-body hover:text-ink")
          }
        >
          View as candidate
        </button>
      </div>

      {viewAsCandidate && (
        <CorporateCandidatePreview
          employerLabel={candidateEmployerLabel}
          title={title}
          fnLabel={fnLabel}
          authorityLabel={authorityLabel}
          employment={employment}
          locationLabel={
            selectedLocations
              .map((l) => [l.city, l.state].filter(Boolean).join(", "))
              .filter(Boolean)
              .join(" · ") || null
          }
          comp={
            compVisible
              ? formatComp(compType, compMin, compMax, compPeriod)
              : null
          }
          sandboxRows={sandboxRows}
          description={description}
          requirements={requirements}
          questionCount={questions.length}
        />
      )}

      {!viewAsCandidate && (
        <>
      <ReviewBlock label="Basics" onEdit={() => onJumpTo("basics")}>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
          <Row label="Title" value={title || "—"} />
          <Row label="Corporate function" value={fnLabel} />
          <Row label="Authority level" value={authorityLabel} />
          <Row label="Employment" value={employment} />
          <Row
            label="Anchor location(s)"
            value={
              selectedLocations.length > 0
                ? selectedLocations.map((l) => l.name).join(", ")
                : "None (DSO-wide)"
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

      <ReviewBlock
        label="Compensation & sandbox"
        onEdit={() => onJumpTo("details")}
      >
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
          <Row
            label="Pay"
            value={formatComp(compType, compMin, compMax, compPeriod)}
          />
          <Row label="Public" value={compVisible ? "Yes" : "Hidden"} />
          {sandboxRows.map((r) => (
            <Row key={r.label} label={r.label} value={r.value} />
          ))}
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
                <span className="text-ink">
                  {q.prompt || "(empty prompt)"}
                </span>
                {q.required && (
                  <span className="ml-2 text-[10px] font-bold tracking-[1.5px] uppercase text-[#3D5266]">
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
        </>
      )}

      <div className="border border-[var(--rule)] p-5 bg-cream/40">
        <label className="block text-[13px] font-bold tracking-[2px] uppercase text-slate-body mb-3">
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
                    ? "bg-[#3D5266]/[0.08] border-[#3D5266]"
                    : "bg-card border-[var(--rule-strong)] hover:bg-cream")
                }
              >
                <input
                  type="radio"
                  name="status"
                  checked={status === opt.value}
                  onChange={() => onStatus(opt.value)}
                  className="accent-[#3D5266]"
                />
                <span className="text-[14px] text-ink">{opt.label}</span>
                {opt.value === "active" && status === opt.value && (
                  <Check className="h-3.5 w-3.5 text-[#3D5266] ml-auto" />
                )}
              </label>
            )
          )}
        </div>
      </div>
    </div>
  );
}

/* #78 — candidate-eye-view of a corporate posting, from in-memory state. */
function CorporateCandidatePreview({
  employerLabel,
  title,
  fnLabel,
  authorityLabel,
  employment,
  locationLabel,
  comp,
  sandboxRows,
  description,
  requirements,
  questionCount,
}: {
  employerLabel: string;
  title: string;
  fnLabel: string;
  authorityLabel: string;
  employment: string;
  locationLabel: string | null;
  comp: string | null;
  sandboxRows: Array<{ label: string; value: string }>;
  description: string;
  requirements: string;
  questionCount: number;
}) {
  const hasDesc = description.replace(/<[^>]*>/g, "").trim().length > 0;
  const chip =
    "rounded-full bg-cream px-3 py-1 text-[12px] font-semibold text-slate-body";
  return (
    <div className="border border-[var(--rule)] bg-card p-6 sm:p-8">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[2px] text-[#3D5266]">
        How candidates see this
      </div>
      <div className="text-[13px] font-semibold text-slate-meta">
        {employerLabel}
      </div>
      <h3 className="mt-1 text-2xl font-extrabold leading-tight tracking-[-0.5px] text-ink">
        {title || "Untitled role"}
      </h3>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className={chip}>{fnLabel}</span>
        {authorityLabel && authorityLabel !== "—" && (
          <span className={chip}>{authorityLabel}</span>
        )}
        <span className={chip}>{employment}</span>
        {locationLabel && <span className={chip}>{locationLabel}</span>}
        {comp && (
          <span className="rounded-full bg-[#3D5266]/10 px-3 py-1 text-[12px] font-semibold text-[#3D5266]">
            {comp}
          </span>
        )}
      </div>
      {hasDesc ? (
        <div
          className="dso-prose mt-5 text-[14px]"
          dangerouslySetInnerHTML={{ __html: description }}
        />
      ) : (
        <p className="mt-5 text-[14px] italic text-slate-meta">
          No description yet — candidates would see an empty role description.
        </p>
      )}
      {sandboxRows.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[1.5px] text-slate-meta">
            Role details
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {sandboxRows.map((r) => (
              <div key={r.label}>
                <dt className="text-[12px] text-slate-meta">{r.label}</dt>
                <dd className="text-[14px] text-ink">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {requirements.trim() && (
        <div className="mt-5">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[1.5px] text-slate-meta">
            Requirements
          </div>
          <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-ink">
            {requirements}
          </pre>
        </div>
      )}
      <p className="mt-6 border-t border-[var(--rule)] pt-4 text-[13px] text-slate-meta">
        {questionCount > 0
          ? `${questionCount} screening question${questionCount === 1 ? "" : "s"} on apply.`
          : "Candidates apply with just résumé + cover letter."}
      </p>
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
        <div className="text-[13px] font-bold tracking-[2px] uppercase text-slate-body">
          {label}
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 text-[10px] font-bold tracking-[1.5px] uppercase text-[#3D5266] hover:text-ink transition-colors"
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

function formatComp(
  type: CompensationType,
  min: string,
  max: string,
  period: string
): string {
  if (type === "doe") return "DOE / discussed at offer";
  if (!min && !max) return "—";
  const periodLabel: Record<string, string> = {
    hourly: "/hr",
    daily: "/day",
    annual: "/yr",
  };
  const suffix = period ? periodLabel[period] ?? "" : "";
  const fmt = (s: string) => {
    const d = s.replace(/[^\d]/g, "");
    return d ? Number(d).toLocaleString("en-US") : s;
  };
  if (type === "exact") return `$${fmt(min)}${suffix}`;
  if (type === "starting_at" || !max) return `$${fmt(min)}+${suffix}`;
  if (type === "up_to" || !min) return `up to $${fmt(max)}${suffix}`;
  return `$${fmt(min)}–$${fmt(max)}${suffix}`;
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
    // #90 (Day 28) — scale stores its two end labels in options; catch a
    // missing label with a numbered, human message instead of the raw DB
    // screening_options_present constraint error.
    if (q.kind === "scale") {
      const opts = q.options ?? [];
      const low = (opts.find((o) => o.id === "low")?.label ?? opts[0]?.label ?? "").trim();
      const high = (opts.find((o) => o.id === "high")?.label ?? opts[1]?.label ?? "").trim();
      if (!low || !high) {
        return `Question ${i + 1} (scale): add a label for both the low and high end of the slider.`;
      }
    }
  }
  return null;
}

/* ───── Reusable inputs (mirror job-wizard.tsx — not exported there) ───── */

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
    <FieldShell
      label={
        <>
          {label} {required && <span className="text-heritage">*</span>}
        </>
      }
    >
      <TextField
        value={value}
        onChange={onChange}
        type={type === "number" ? "number" : "text"}
        inputMode={type === "number" ? "numeric" : undefined}
        placeholder={placeholder}
      />
    </FieldShell>
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
    <FieldShell
      label={
        <>
          {label} {required && <span className="text-heritage">*</span>}
        </>
      }
    >
      <SelectField
        value={value}
        onChange={onChange}
        options={options}
        widthClass="w-full"
      />
    </FieldShell>
  );
}
