"use client";

/**
 * Section-by-section profile editor (Phase 4.2.b — LinkedIn pattern).
 *
 * Replaces the old single-form scroll with section cards + pencil-edit
 * modals. Each section preview reads from server-fetched data; the edit
 * sheet is a controlled UI that on save calls a server action and we
 * `router.refresh()` to pull the fresh row.
 *
 * Sections in order:
 *   1. Identity
 *   2. Role & Specialty
 *   3. Skills, Languages & PMS
 *   4. Work history (multi-entry)
 *   5. Education (multi-entry)
 *   6. Licenses (multi-entry)
 *   7. Certifications (multi-entry)
 *   8. Job Preferences
 *   9. PracticeFit (placeholder, Phase 5D)
 *
 * Each card shows the strongest preview we can render from the available
 * data; the locked rule is "no shame state" — empty fields read as a
 * gentle nudge, not a missing-data warning. Photo upload + completeness
 * meter live above this component on the page.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Pencil,
  Plus,
  Trash2,
  Lock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Paperclip,
  Upload,
  Eye,
  X,
  ShieldCheck,
} from "lucide-react";
import { PracticeFitWordmark } from "@/components/practice-fit/brand/practice-fit-wordmark";
import { DsoFitWordmark } from "@/components/practice-fit/brand/dsofit-wordmark";
import {
  EditSheet,
  TextField,
  TextAreaField,
  ChipArrayInput,
  ComboboxField,
  InlineError,
} from "./edit-sheet";
import {
  LocationAutocompleteInput,
  LocationAutocompleteField,
} from "@/components/ui/location-autocomplete-input";
import { PRONOUN_OPTIONS } from "@/lib/candidate/name";
import {
  ROLE_CATEGORIES,
  SPECIALTIES,
  LICENSE_TYPES,
  PMS_SYSTEMS,
  CERTIFICATION_KINDS,
  COMMON_LANGUAGES,
  CV_VISIBILITY_OPTIONS,
  TEMP_OR_PERM_OPTIONS,
  SALARY_UNIT_OPTIONS,
  WEEKDAY_KEYS,
  getSkillSuggestions,
  type SchedulePreferences,
  type CanonicalOption,
} from "@/lib/candidate/canonical-lists";
import {
  upsertIdentity,
  upsertRolePreferences,
  upsertSkillsLanguages,
  upsertJobPreferences,
  upsertWorkHistoryEntry,
  deleteWorkHistoryEntry,
  upsertEducationEntry,
  deleteEducationEntry,
  upsertLicenseEntry,
  deleteLicenseEntry,
  upsertCertificationEntry,
  deleteCertificationEntry,
  uploadCredentialFile,
  removeCredentialFile,
  getCredentialFileSignedUrl,
  type IdentityInput,
  type WorkHistoryInput,
  type EducationInput,
  type LicenseInput,
  type CertificationInput,
  type CredentialKind,
} from "./section-actions";
import { composeName, SALUTATIONS } from "@/lib/candidate/name";
import { CompletenessMeter } from "./completeness-meter";
import {
  computeCompleteness,
  type ProfileSectionModal,
} from "@/lib/candidate/completeness";
import { AiWriteHelper } from "./ai-write-helper";
import type { ProfileContext } from "./ai-write-actions";

// ─────────────────────────────────────────────────────────────────────
// Data shapes coming from the server page
// ─────────────────────────────────────────────────────────────────────

export interface ProfileData {
  identity: {
    first_name: string;
    last_name: string;
    salutation: string | null;
    pronouns: string | null;
    headline: string | null;
    summary: string | null;
    phone: string | null;
    current_location_city: string | null;
    current_location_state: string | null;
    years_experience_dental: number | null;
    linkedin_url: string | null;
  };
  rolePreferences: {
    desired_roles: string[];
    desired_specialty: string[];
    temp_or_perm: "temp" | "perm" | "either" | null;
  };
  skillsLanguages: {
    skills: string[];
    languages: string[];
    pms_systems: string[];
  };
  jobPreferences: {
    desired_locations: string[];
    min_salary: number | null;
    salary_unit: "hourly" | "yearly" | "per_visit" | "per_day" | null;
    schedule_preferences: SchedulePreferences;
    cv_visibility: "hidden" | "recruiters_only" | "open_to_work";
    availability: string | null;
  };
  workHistory: Array<{
    id: string;
    title: string;
    company_name: string;
    is_dso: boolean | null;
    start_date: string | null;
    end_date: string | null;
    is_current: boolean;
    description: string | null;
    pms_systems_used: string[];
    procedures_performed: string[];
    auto_blocklisted: boolean;
  }>;
  education: Array<{
    id: string;
    school_name: string;
    degree: string | null;
    field_of_study: string | null;
    start_year: number | null;
    end_year: number | null;
    description: string | null;
  }>;
  licenses: Array<{
    id: string;
    license_type: string;
    license_number: string | null;
    state: string | null;
    issued_date: string | null;
    expires_date: string | null;
    display_number: boolean;
    document_path: string | null;
    verification_status: string;
  }>;
  certifications: Array<{
    id: string;
    kind: string;
    level: string | null;
    issued_date: string | null;
    expires_date: string | null;
    document_path: string | null;
    verification_status: string;
  }>;
}

type OpenModal =
  | { kind: "identity" }
  | { kind: "rolePreferences" }
  | { kind: "skillsLanguages" }
  | { kind: "jobPreferences" }
  | { kind: "workHistory"; entryId: string | null }
  | { kind: "education"; entryId: string | null }
  | { kind: "license"; entryId: string | null }
  | { kind: "certification"; entryId: string | null }
  | null;

// ─────────────────────────────────────────────────────────────────────
// Main orchestrator
// ─────────────────────────────────────────────────────────────────────

export function ProfileSections({
  data,
  photoUrl,
  fitProduct = "practicefit",
}: {
  data: ProfileData;
  photoUrl: string | null;
  /** Which fit sibling to show in the bottom card (#54 — navy PF / heritage DSOFit). */
  fitProduct?: "practicefit" | "dsofit";
}) {
  const [open, setOpen] = useState<OpenModal>(null);
  const completeness = computeCompleteness(data, photoUrl);

  // The completeness meter emits ProfileSectionModal — a subset of OpenModal.
  // The two unions overlap exactly on the kinds the meter knows about, so
  // a direct cast is safe + cheap. Keeping the types separate so the meter
  // can't request modal kinds that don't make sense as quick-add CTAs
  // (education + certification + role preferences are reachable from the
  // section cards themselves, not via the meter).
  const handleMeterCta = (modal: ProfileSectionModal) => {
    setOpen(modal as OpenModal);
  };

  return (
    <>
      <div className="grid max-w-[820px] gap-4">
        <CompletenessMeter
          report={completeness}
          onOpenModal={handleMeterCta}
        />
        <IdentityCard
          data={data.identity}
          onEdit={() => setOpen({ kind: "identity" })}
        />
        <RolePreferencesCard
          data={data.rolePreferences}
          onEdit={() => setOpen({ kind: "rolePreferences" })}
        />
        <SkillsLanguagesCard
          data={data.skillsLanguages}
          onEdit={() => setOpen({ kind: "skillsLanguages" })}
        />
        <WorkHistoryCard
          entries={data.workHistory}
          onAdd={() => setOpen({ kind: "workHistory", entryId: null })}
          onEdit={(id) => setOpen({ kind: "workHistory", entryId: id })}
        />
        <EducationCard
          entries={data.education}
          onAdd={() => setOpen({ kind: "education", entryId: null })}
          onEdit={(id) => setOpen({ kind: "education", entryId: id })}
        />
        <LicensesCard
          entries={data.licenses}
          onAdd={() => setOpen({ kind: "license", entryId: null })}
          onEdit={(id) => setOpen({ kind: "license", entryId: id })}
        />
        <CertificationsCard
          entries={data.certifications}
          onAdd={() => setOpen({ kind: "certification", entryId: null })}
          onEdit={(id) => setOpen({ kind: "certification", entryId: id })}
        />
        <JobPreferencesCard
          data={data.jobPreferences}
          onEdit={() => setOpen({ kind: "jobPreferences" })}
        />
        {/* References intentionally NOT surfaced candidate-side (2026-05-22).
            Per ATS norms (Greenhouse/Lever/Workday) references are an
            employer-initiated, consent-based, late-stage step — not something
            candidates pre-store. Keeps us off a third-party-PII surface
            (legal-first). The employer-side reference-check flow remains. */}
        <PracticeFitCard product={fitProduct} />
      </div>

      {open?.kind === "identity" && (
        <IdentityModal
          initial={data.identity}
          aiContext={buildAiContext(data)}
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === "rolePreferences" && (
        <RolePreferencesModal
          initial={data.rolePreferences}
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === "skillsLanguages" && (
        <SkillsLanguagesModal
          initial={data.skillsLanguages}
          desiredRoles={data.rolePreferences.desired_roles}
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === "jobPreferences" && (
        <JobPreferencesModal
          initial={data.jobPreferences}
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === "workHistory" && (
        <WorkHistoryModal
          entry={
            open.entryId
              ? data.workHistory.find((e) => e.id === open.entryId) ?? null
              : null
          }
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === "education" && (
        <EducationModal
          entry={
            open.entryId
              ? data.education.find((e) => e.id === open.entryId) ?? null
              : null
          }
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === "license" && (
        <LicenseModal
          entry={
            open.entryId
              ? data.licenses.find((e) => e.id === open.entryId) ?? null
              : null
          }
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === "certification" && (
        <CertificationModal
          entry={
            open.entryId
              ? data.certifications.find((e) => e.id === open.entryId) ?? null
              : null
          }
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section card shell
// ─────────────────────────────────────────────────────────────────────

function SectionCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-slate-200 bg-white p-6 sm:p-8">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[#14233F]">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p>
          )}
        </div>
        {action}
      </header>
      <div>{children}</div>
    </section>
  );
}

function EditButton({ onClick, label = "Edit" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      <Pencil className="size-3.5" />
      {label}
    </button>
  );
}

function AddButton({ onClick, label = "Add" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      <Plus className="size-3.5" />
      {label}
    </button>
  );
}

function EmptyHint({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-500">
      {icon ?? <Sparkles className="size-4 text-[#4D7A60]" />}
      <span>{text}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 1. Identity
// ─────────────────────────────────────────────────────────────────────

function IdentityCard({
  data,
  onEdit,
}: {
  data: ProfileData["identity"];
  onEdit: () => void;
}) {
  const location = [
    data.current_location_city,
    data.current_location_state,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <div id="section-identity" className="scroll-mt-24">
    <SectionCard
      title="Identity"
      subtitle="Name, headline, contact, location."
      action={<EditButton onClick={onEdit} />}
    >
      <div className="space-y-1.5 text-sm">
        <p className="text-base font-semibold text-[#14233F]">
          {composeName({
            salutation: data.salutation,
            first_name: data.first_name,
            last_name: data.last_name,
          }) || (
            <span className="italic text-slate-400">No name set</span>
          )}
          {data.pronouns && (
            <span className="ml-2 text-sm font-normal text-slate-500">
              ({data.pronouns})
            </span>
          )}
        </p>
        {data.headline && <p className="text-slate-700">{data.headline}</p>}
        {data.summary && (
          <p className="whitespace-pre-line text-slate-600">{data.summary}</p>
        )}
        <dl className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-500 sm:grid-cols-2">
          {location && (
            <Field label="Location" value={location} />
          )}
          {data.years_experience_dental !== null && (
            <Field
              label="Dental experience"
              value={`${data.years_experience_dental} year${data.years_experience_dental === 1 ? "" : "s"}`}
            />
          )}
          {data.phone && <Field label="Phone" value={data.phone} />}
          {data.linkedin_url && (
            <Field label="LinkedIn" value={data.linkedin_url} />
          )}
        </dl>
      </div>
    </SectionCard>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd className="text-slate-700">{value}</dd>
    </div>
  );
}

function IdentityModal({
  initial,
  aiContext,
  onClose,
}: {
  initial: ProfileData["identity"];
  aiContext: ProfileContext;
  onClose: () => void;
}) {
  const router = useRouter();
  const [, startSaving] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState<IdentityInput>({
    first_name: initial.first_name ?? "",
    last_name: initial.last_name ?? "",
    salutation: initial.salutation ?? "",
    pronouns: initial.pronouns ?? "",
    headline: initial.headline ?? "",
    summary: initial.summary ?? "",
    phone: initial.phone ?? "",
    current_location_city: initial.current_location_city ?? "",
    current_location_state: initial.current_location_state ?? "",
    years_experience_dental: initial.years_experience_dental,
    linkedin_url: initial.linkedin_url ?? "",
  });

  const onSave = () => {
    setError(null);
    setSaving(true);
    startSaving(async () => {
      const result = await upsertIdentity(v);
      setSaving(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  };

  return (
    <EditSheet
      open
      onClose={onClose}
      onSave={onSave}
      saving={saving}
      title="Edit identity"
      description="Name, headline, and how to reach you."
    >
      <div className="grid gap-4 sm:grid-cols-[7rem_1fr_1fr]">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-800">
            Title
          </span>
          <select
            value={v.salutation ?? ""}
            onChange={(e) =>
              setV((p) => ({ ...p, salutation: e.target.value || null }))
            }
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#4D7A60] focus:outline-none focus:ring-1 focus:ring-[#4D7A60]"
          >
            <option value="">—</option>
            {SALUTATIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <TextField
          label="First name"
          required
          value={v.first_name}
          onChange={(x) => setV((p) => ({ ...p, first_name: x }))}
          autoComplete="given-name"
        />
        <TextField
          label="Last name"
          required
          value={v.last_name}
          onChange={(x) => setV((p) => ({ ...p, last_name: x }))}
          autoComplete="family-name"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-800">
            Pronouns
          </span>
          <select
            value={v.pronouns ?? ""}
            onChange={(e) =>
              setV((p) => ({ ...p, pronouns: e.target.value || null }))
            }
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#4D7A60] focus:outline-none focus:ring-1 focus:ring-[#4D7A60]"
          >
            <option value="">—</option>
            {PRONOUN_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
            {/* Legacy custom pronoun value preserved as a current
                selection so a candidate's existing choice never silently
                disappears from the picker. */}
            {v.pronouns &&
              !(PRONOUN_OPTIONS as readonly string[]).includes(v.pronouns) && (
                <option value={v.pronouns}>{v.pronouns} (current)</option>
              )}
          </select>
        </label>
        <TextField
          label="Phone"
          type="tel"
          value={v.phone ?? ""}
          onChange={(x) => setV((p) => ({ ...p, phone: x }))}
          autoComplete="tel"
        />
      </div>
      <div>
        <TextField
          label="Professional headline"
          helper="One short line shown to employers."
          value={v.headline ?? ""}
          onChange={(x) => setV((p) => ({ ...p, headline: x }))}
          maxLength={140}
        />
        <AiWriteHelper
          kind="headline"
          context={{ ...aiContext, current_headline: v.headline ?? null }}
          onPick={(text) => setV((p) => ({ ...p, headline: text }))}
        />
      </div>
      <div>
        <TextAreaField
          label="Summary"
          helper="2-4 sentences about your experience and what you're looking for."
          rows={4}
          value={v.summary ?? ""}
          onChange={(x) => setV((p) => ({ ...p, summary: x }))}
          maxLength={1500}
        />
        <AiWriteHelper
          kind="summary"
          context={{ ...aiContext, current_summary: v.summary ?? null }}
          onPick={(text) => setV((p) => ({ ...p, summary: text }))}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <LocationAutocompleteField
            label="Current location"
            defaultCity={v.current_location_city ?? ""}
            defaultState={v.current_location_state ?? ""}
            placeholder="Start typing your city…"
            onSelect={(city, state) =>
              setV((p) => ({
                ...p,
                current_location_city: city || null,
                current_location_state: state || null,
              }))
            }
          />
        </div>
        <TextField
          label="Years (dental)"
          type="number"
          value={
            v.years_experience_dental === null ||
            v.years_experience_dental === undefined
              ? ""
              : String(v.years_experience_dental)
          }
          onChange={(x) =>
            setV((p) => ({
              ...p,
              years_experience_dental: x === "" ? null : Number.parseInt(x, 10),
            }))
          }
        />
      </div>
      <TextField
        label="LinkedIn URL"
        type="url"
        value={v.linkedin_url ?? ""}
        onChange={(x) => setV((p) => ({ ...p, linkedin_url: x }))}
      />
      <InlineError message={error} />
    </EditSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 2. Role & Specialty
// ─────────────────────────────────────────────────────────────────────

function RolePreferencesCard({
  data,
  onEdit,
}: {
  data: ProfileData["rolePreferences"];
  onEdit: () => void;
}) {
  const tempLabel = TEMP_OR_PERM_OPTIONS.find(
    (o) => o.value === data.temp_or_perm
  )?.label;
  return (
    <div id="section-role-specialty" className="scroll-mt-24">
    <SectionCard
      title="Role & specialty"
      subtitle="What you're looking for."
      action={<EditButton onClick={onEdit} />}
    >
      <div className="space-y-3 text-sm">
        <ChipPreview
          label="Roles"
          values={data.desired_roles}
          options={ROLE_CATEGORIES}
          empty="Add the roles you're open to so employers can find you."
        />
        <ChipPreview
          label="Specialties"
          values={data.desired_specialty}
          options={SPECIALTIES}
          empty="Add any specialty focus."
        />
        {tempLabel && (
          <Field label="Engagement type" value={tempLabel} />
        )}
      </div>
    </SectionCard>
    </div>
  );
}

function ChipPreview({
  label,
  values,
  options,
  empty,
}: {
  label: string;
  values: string[];
  options?: ReadonlyArray<CanonicalOption>;
  empty: string;
}) {
  const lookup = (v: string) =>
    options?.find((o) => o.value === v)?.label ?? v;
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      {values.length === 0 ? (
        <EmptyHint text={empty} />
      ) : (
        <div className="flex flex-wrap gap-2">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center rounded-full bg-[#4D7A60]/10 px-3 py-1 text-xs text-[#14233F]"
            >
              {lookup(v)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RolePreferencesModal({
  initial,
  onClose,
}: {
  initial: ProfileData["rolePreferences"];
  onClose: () => void;
}) {
  const router = useRouter();
  const [, startSaving] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>(initial.desired_roles);
  const [specialty, setSpecialty] = useState<string[]>(initial.desired_specialty);
  const [tempOrPerm, setTempOrPerm] = useState<
    "temp" | "perm" | "either" | null
  >(initial.temp_or_perm);

  const onSave = () => {
    setError(null);
    setSaving(true);
    startSaving(async () => {
      const result = await upsertRolePreferences({
        desired_roles: roles,
        desired_specialty: specialty,
        temp_or_perm: tempOrPerm,
      });
      setSaving(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  };

  const labelFor = (value: string, options: ReadonlyArray<CanonicalOption>) =>
    options.find((o) => o.value === value)?.label ?? value;

  return (
    <EditSheet
      open
      onClose={onClose}
      onSave={onSave}
      saving={saving}
      title="Edit role & specialty"
      description="Choose from the canonical list — typos in free text would silently exclude you from search."
    >
      <ChipArrayInput
        label="Desired roles"
        values={roles}
        onChange={setRoles}
        options={ROLE_CATEGORIES}
        labelFor={(v) => labelFor(v, ROLE_CATEGORIES)}
        restrictToOptions
        placeholder="Search roles…"
        helper="Pick from the dropdown so employers' searches match you."
      />
      <ChipArrayInput
        label="Specialties"
        values={specialty}
        onChange={setSpecialty}
        options={SPECIALTIES}
        labelFor={(v) => labelFor(v, SPECIALTIES)}
        restrictToOptions
        placeholder="Search specialties…"
      />
      <div>
        <p className="mb-2 text-sm font-medium text-slate-800">
          Engagement type
        </p>
        <div className="flex flex-wrap gap-2">
          {TEMP_OR_PERM_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() =>
                setTempOrPerm((cur) => (cur === opt.value ? null : opt.value))
              }
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                tempOrPerm === opt.value
                  ? "border-[#4D7A60] bg-[#4D7A60]/10 text-[#14233F]"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <InlineError message={error} />
    </EditSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 3. Skills, Languages & PMS
// ─────────────────────────────────────────────────────────────────────

function SkillsLanguagesCard({
  data,
  onEdit,
}: {
  data: ProfileData["skillsLanguages"];
  onEdit: () => void;
}) {
  return (
    <div id="section-skills" className="scroll-mt-24">
    <SectionCard
      title="Skills, languages & systems"
      subtitle="Skills, languages spoken, and the practice-management software you've used."
      action={<EditButton onClick={onEdit} />}
    >
      <div className="space-y-3 text-sm">
        <ChipPreview
          label="Skills"
          values={data.skills}
          empty="No skills listed yet."
        />
        <ChipPreview
          label="Languages"
          values={data.languages}
          empty="Add any languages you speak."
        />
        <ChipPreview
          label="PMS systems"
          values={data.pms_systems}
          options={PMS_SYSTEMS}
          empty="Add the practice-management systems you've worked in."
        />
      </div>
    </SectionCard>
    </div>
  );
}

function SkillsLanguagesModal({
  initial,
  desiredRoles,
  onClose,
}: {
  initial: ProfileData["skillsLanguages"];
  desiredRoles: ReadonlyArray<string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [, startSaving] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skills, setSkills] = useState<string[]>(initial.skills);
  const [languages, setLanguages] = useState<string[]>(initial.languages);
  const [pms, setPms] = useState<string[]>(initial.pms_systems);

  // Suggestions are role-aware — pulled from SKILLS_BY_ROLE for each
  // desired role + universal skills as the tail. When no roles are
  // selected yet, falls back to the universal list.
  const skillSuggestions = getSkillSuggestions(desiredRoles);

  const helperCopy =
    desiredRoles.length === 0
      ? "Free-form. Set your desired roles first to get role-specific quick-add suggestions."
      : "Quick-adds match your desired roles. Type to add custom skills too.";

  const onSave = () => {
    setError(null);
    setSaving(true);
    startSaving(async () => {
      const result = await upsertSkillsLanguages({
        skills,
        languages,
        pms_systems: pms,
      });
      setSaving(false);
      if (!result.ok) return setError(result.error);
      router.refresh();
      onClose();
    });
  };

  return (
    <EditSheet
      open
      onClose={onClose}
      onSave={onSave}
      saving={saving}
      title="Edit skills, languages & systems"
    >
      <ChipArrayInput
        label="Skills"
        values={skills}
        onChange={setSkills}
        options={skillSuggestions}
        placeholder="Add a skill — type and press Enter"
        helper={helperCopy}
      />
      <ChipArrayInput
        label="Languages"
        values={languages}
        onChange={setLanguages}
        options={COMMON_LANGUAGES}
        restrictToOptions
        placeholder="Search languages…"
      />
      <ChipArrayInput
        label="Practice-management systems"
        values={pms}
        onChange={setPms}
        options={PMS_SYSTEMS}
        placeholder="Dentrix, Eaglesoft, Open Dental, …"
        helper="Used for matching with employers' tech stack."
      />
      <InlineError message={error} />
    </EditSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 4. Work history (multi-entry)
// ─────────────────────────────────────────────────────────────────────

function WorkHistoryCard({
  entries,
  onAdd,
  onEdit,
}: {
  entries: ProfileData["workHistory"];
  onAdd: () => void;
  onEdit: (id: string) => void;
}) {
  return (
    <SectionCard
      title={`Work history${entries.length ? ` (${entries.length})` : ""}`}
      subtitle="Where you've worked — most recent first."
      action={<AddButton onClick={onAdd} label="Add role" />}
    >
      {entries.length === 0 ? (
        <EmptyHint text="Add your roles to give employers context." />
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-slate-50/40 p-4"
            >
              <div className="flex-1 text-sm">
                <p className="font-semibold text-[#14233F]">{e.title}</p>
                <p className="text-slate-700">{e.company_name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatDateRange(e.start_date, e.end_date, e.is_current)}
                </p>
                {e.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                    {e.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onEdit(e.id)}
                className="text-slate-500 hover:text-slate-900"
                aria-label="Edit role"
              >
                <Pencil className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function WorkHistoryModal({
  entry,
  onClose,
}: {
  entry: ProfileData["workHistory"][number] | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [, startSaving] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState<WorkHistoryInput>({
    id: entry?.id,
    title: entry?.title ?? "",
    company_name: entry?.company_name ?? "",
    is_dso: entry?.is_dso ?? null,
    start_date: entry?.start_date ?? null,
    end_date: entry?.end_date ?? null,
    is_current: entry?.is_current ?? false,
    description: entry?.description ?? null,
    pms_systems_used: entry?.pms_systems_used ?? [],
    procedures_performed: entry?.procedures_performed ?? [],
    auto_blocklisted: entry?.auto_blocklisted ?? false,
  });

  const onSave = () => {
    setError(null);
    setSaving(true);
    startSaving(async () => {
      const result = await upsertWorkHistoryEntry(v);
      setSaving(false);
      if (!result.ok) return setError(result.error);
      router.refresh();
      onClose();
    });
  };

  const onDelete = () => {
    if (!entry) return;
    if (!confirm("Remove this role from your work history?")) return;
    setSaving(true);
    startSaving(async () => {
      const result = await deleteWorkHistoryEntry(entry.id);
      setSaving(false);
      if (!result.ok) return setError(result.error);
      router.refresh();
      onClose();
    });
  };

  return (
    <EditSheet
      open
      onClose={onClose}
      onSave={onSave}
      saving={saving}
      title={entry ? "Edit role" : "Add a role"}
      footerLeft={
        entry && (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving}
            className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:text-red-900 disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
            Remove
          </button>
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Title"
          required
          value={v.title}
          onChange={(x) => setV((p) => ({ ...p, title: x }))}
        />
        <TextField
          label="Company"
          required
          value={v.company_name}
          onChange={(x) => setV((p) => ({ ...p, company_name: x }))}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Start (YYYY-MM)"
          placeholder="2021-06"
          value={v.start_date ?? ""}
          onChange={(x) => setV((p) => ({ ...p, start_date: x || null }))}
        />
        <TextField
          label="End (YYYY-MM)"
          placeholder="2024-12"
          value={v.end_date ?? ""}
          onChange={(x) => setV((p) => ({ ...p, end_date: x || null }))}
        />
      </div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={v.is_current}
          onChange={(e) =>
            setV((p) => ({
              ...p,
              is_current: e.target.checked,
              end_date: e.target.checked ? null : p.end_date,
            }))
          }
          className="size-4 rounded border-slate-300"
        />
        I currently work here
      </label>
      {v.is_current && (
        <label className="ml-6 inline-flex items-start gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={v.auto_blocklisted}
            onChange={(e) =>
              setV((p) => ({ ...p, auto_blocklisted: e.target.checked }))
            }
            className="mt-0.5 size-4 rounded border-slate-300"
          />
          <span>
            Hide my profile from this employer (privacy default — recommended).
          </span>
        </label>
      )}
      <div>
        <p className="mb-2 text-sm font-medium text-slate-800">Was this a DSO?</p>
        <div className="flex gap-2">
          {[
            { value: true, label: "Yes" },
            { value: false, label: "No / private practice" },
            { value: null, label: "Not sure" },
          ].map((o) => (
            <button
              key={String(o.value)}
              type="button"
              onClick={() => setV((p) => ({ ...p, is_dso: o.value }))}
              className={`rounded-full border px-3 py-1 text-sm ${
                v.is_dso === o.value
                  ? "border-[#4D7A60] bg-[#4D7A60]/10 text-[#14233F]"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <TextAreaField
        label="What you did"
        rows={3}
        value={v.description ?? ""}
        onChange={(x) => setV((p) => ({ ...p, description: x || null }))}
      />
      <ChipArrayInput
        label="PMS systems used"
        values={v.pms_systems_used}
        onChange={(next) => setV((p) => ({ ...p, pms_systems_used: next }))}
        options={PMS_SYSTEMS}
      />
      <ChipArrayInput
        label="Procedures performed"
        values={v.procedures_performed}
        onChange={(next) =>
          setV((p) => ({ ...p, procedures_performed: next }))
        }
        placeholder="Crowns, SRP, implant placement, …"
      />
      <InlineError message={error} />
    </EditSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 5. Education (multi-entry)
// ─────────────────────────────────────────────────────────────────────

function EducationCard({
  entries,
  onAdd,
  onEdit,
}: {
  entries: ProfileData["education"];
  onAdd: () => void;
  onEdit: (id: string) => void;
}) {
  return (
    <SectionCard
      title={`Education${entries.length ? ` (${entries.length})` : ""}`}
      action={<AddButton onClick={onAdd} label="Add school" />}
    >
      {entries.length === 0 ? (
        <EmptyHint text="Add your dental school + any related education." />
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-slate-50/40 p-4"
            >
              <div className="flex-1 text-sm">
                <p className="font-semibold text-[#14233F]">
                  {e.school_name}
                </p>
                {(e.degree || e.field_of_study) && (
                  <p className="text-slate-700">
                    {[e.degree, e.field_of_study].filter(Boolean).join(" · ")}
                  </p>
                )}
                {(e.start_year || e.end_year) && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {e.start_year ?? "?"}–{e.end_year ?? "present"}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onEdit(e.id)}
                aria-label="Edit education"
                className="text-slate-500 hover:text-slate-900"
              >
                <Pencil className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function EducationModal({
  entry,
  onClose,
}: {
  entry: ProfileData["education"][number] | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [, startSaving] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState<EducationInput>({
    id: entry?.id,
    school_name: entry?.school_name ?? "",
    degree: entry?.degree ?? null,
    field_of_study: entry?.field_of_study ?? null,
    start_year: entry?.start_year ?? null,
    end_year: entry?.end_year ?? null,
    description: entry?.description ?? null,
  });

  const onSave = () => {
    setError(null);
    setSaving(true);
    startSaving(async () => {
      const result = await upsertEducationEntry(v);
      setSaving(false);
      if (!result.ok) return setError(result.error);
      router.refresh();
      onClose();
    });
  };

  const onDelete = () => {
    if (!entry) return;
    if (!confirm("Remove this education entry?")) return;
    setSaving(true);
    startSaving(async () => {
      const result = await deleteEducationEntry(entry.id);
      setSaving(false);
      if (!result.ok) return setError(result.error);
      router.refresh();
      onClose();
    });
  };

  return (
    <EditSheet
      open
      onClose={onClose}
      onSave={onSave}
      saving={saving}
      title={entry ? "Edit education" : "Add education"}
      footerLeft={
        entry && (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving}
            className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:text-red-900 disabled:opacity-50"
          >
            <Trash2 className="size-3.5" /> Remove
          </button>
        )
      }
    >
      <TextField
        label="School"
        required
        value={v.school_name}
        onChange={(x) => setV((p) => ({ ...p, school_name: x }))}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Degree"
          placeholder="DDS, BS, etc."
          value={v.degree ?? ""}
          onChange={(x) => setV((p) => ({ ...p, degree: x || null }))}
        />
        <TextField
          label="Field of study"
          value={v.field_of_study ?? ""}
          onChange={(x) =>
            setV((p) => ({ ...p, field_of_study: x || null }))
          }
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Start year"
          type="number"
          value={v.start_year !== null ? String(v.start_year) : ""}
          onChange={(x) =>
            setV((p) => ({
              ...p,
              start_year: x === "" ? null : Number.parseInt(x, 10),
            }))
          }
        />
        <TextField
          label="End year"
          type="number"
          value={v.end_year !== null ? String(v.end_year) : ""}
          onChange={(x) =>
            setV((p) => ({
              ...p,
              end_year: x === "" ? null : Number.parseInt(x, 10),
            }))
          }
        />
      </div>
      <TextAreaField
        label="Description"
        rows={3}
        value={v.description ?? ""}
        onChange={(x) => setV((p) => ({ ...p, description: x || null }))}
      />
      <InlineError message={error} />
    </EditSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 6. Licenses (multi-entry)
// ─────────────────────────────────────────────────────────────────────

function LicensesCard({
  entries,
  onAdd,
  onEdit,
}: {
  entries: ProfileData["licenses"];
  onAdd: () => void;
  onEdit: (id: string) => void;
}) {
  return (
    <div id="section-licenses" className="scroll-mt-24">
    <SectionCard
      title={`Licenses${entries.length ? ` (${entries.length})` : ""}`}
      subtitle="License numbers stay private by default — opt in per license to display."
      action={<AddButton onClick={onAdd} label="Add license" />}
    >
      {entries.length === 0 ? (
        <EmptyHint text="Add the licenses you hold so employers can see your scope of practice." />
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => {
            const typeLabel =
              LICENSE_TYPES.find((o) => o.value === e.license_type)?.label ??
              e.license_type;
            return (
              <li
                key={e.id}
                className="rounded-md border border-slate-200 bg-slate-50/40 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 text-sm">
                    <p className="font-semibold text-[#14233F]">{typeLabel}</p>
                    <p className="text-slate-700">
                      {e.state ? `Licensed in ${e.state}` : "State not set"}
                      {e.display_number && e.license_number
                        ? ` · #${e.license_number}`
                        : ""}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                      {e.expires_date ? (
                        <>
                          Expires {formatDate(e.expires_date)}
                        </>
                      ) : (
                        "No expiry on file"
                      )}
                      {!e.display_number && (
                        <>
                          <span aria-hidden>·</span>
                          <Lock className="size-3" />
                          Number hidden
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEdit(e.id)}
                    aria-label="Edit license"
                    className="text-slate-500 hover:text-slate-900"
                  >
                    <Pencil className="size-4" />
                  </button>
                </div>
                <CredentialFileControls
                  kind="license"
                  rowId={e.id}
                  hasFile={!!e.document_path}
                  verificationStatus={e.verification_status}
                />
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
    </div>
  );
}

function LicenseModal({
  entry,
  onClose,
}: {
  entry: ProfileData["licenses"][number] | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [, startSaving] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState<LicenseInput>({
    id: entry?.id,
    license_type: entry?.license_type ?? "",
    license_number: entry?.license_number ?? null,
    state: entry?.state ?? null,
    issued_date: entry?.issued_date ?? null,
    expires_date: entry?.expires_date ?? null,
    display_number: entry?.display_number ?? false,
  });

  const onSave = () => {
    setError(null);
    setSaving(true);
    startSaving(async () => {
      const result = await upsertLicenseEntry(v);
      setSaving(false);
      if (!result.ok) return setError(result.error);
      router.refresh();
      onClose();
    });
  };
  const onDelete = () => {
    if (!entry) return;
    if (!confirm("Remove this license?")) return;
    setSaving(true);
    startSaving(async () => {
      const result = await deleteLicenseEntry(entry.id);
      setSaving(false);
      if (!result.ok) return setError(result.error);
      router.refresh();
      onClose();
    });
  };

  return (
    <EditSheet
      open
      onClose={onClose}
      onSave={onSave}
      saving={saving}
      title={entry ? "Edit license" : "Add license"}
      banner={
        <p className="text-xs text-slate-600">
          License numbers stay private by default — toggle below to display.
        </p>
      }
      footerLeft={
        entry && (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving}
            className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:text-red-900 disabled:opacity-50"
          >
            <Trash2 className="size-3.5" /> Remove
          </button>
        )
      }
    >
      <ComboboxField
        label="License type"
        required
        value={v.license_type}
        options={LICENSE_TYPES}
        onChange={(x) => setV((p) => ({ ...p, license_type: x }))}
        allowCustom
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="State (2-letter)"
          value={v.state ?? ""}
          onChange={(x) =>
            setV((p) => ({
              ...p,
              state: x.toUpperCase().slice(0, 2) || null,
            }))
          }
          maxLength={2}
        />
        <TextField
          label="State license number"
          helper="Your state board number only — not DEA, NPI, or federal IDs. Stays private unless you toggle below."
          value={v.license_number ?? ""}
          onChange={(x) =>
            setV((p) => ({ ...p, license_number: x || null }))
          }
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Issued"
          type="date"
          value={v.issued_date ?? ""}
          onChange={(x) => setV((p) => ({ ...p, issued_date: x || null }))}
        />
        <TextField
          label="Expires"
          type="date"
          value={v.expires_date ?? ""}
          onChange={(x) =>
            setV((p) => ({ ...p, expires_date: x || null }))
          }
        />
      </div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={v.display_number}
          onChange={(e) =>
            setV((p) => ({ ...p, display_number: e.target.checked }))
          }
          className="size-4 rounded border-slate-300"
        />
        Show my license number publicly
      </label>
      <InlineError message={error} />
    </EditSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 7. Certifications (multi-entry)
// ─────────────────────────────────────────────────────────────────────

function CertificationsCard({
  entries,
  onAdd,
  onEdit,
}: {
  entries: ProfileData["certifications"];
  onAdd: () => void;
  onEdit: (id: string) => void;
}) {
  return (
    <SectionCard
      title={`Certifications${entries.length ? ` (${entries.length})` : ""}`}
      action={<AddButton onClick={onAdd} label="Add certification" />}
    >
      {entries.length === 0 ? (
        <EmptyHint text="CPR/BLS, anesthesia, sedation, OSHA, HIPAA, etc." />
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => {
            const kindLabel =
              CERTIFICATION_KINDS.find((o) => o.value === e.kind)?.label ??
              e.kind;
            return (
              <li
                key={e.id}
                className="rounded-md border border-slate-200 bg-slate-50/40 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 text-sm">
                    <p className="font-semibold text-[#14233F]">{kindLabel}</p>
                    {(e.level || e.expires_date) && (
                      <p className="text-xs text-slate-500">
                        {e.level && <span>{e.level}</span>}
                        {e.level && e.expires_date && " · "}
                        {e.expires_date && (
                          <span>Expires {formatDate(e.expires_date)}</span>
                        )}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onEdit(e.id)}
                    aria-label="Edit certification"
                    className="text-slate-500 hover:text-slate-900"
                  >
                    <Pencil className="size-4" />
                  </button>
                </div>
                <CredentialFileControls
                  kind="certification"
                  rowId={e.id}
                  hasFile={!!e.document_path}
                  verificationStatus={e.verification_status}
                />
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

function CertificationModal({
  entry,
  onClose,
}: {
  entry: ProfileData["certifications"][number] | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [, startSaving] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState<CertificationInput>({
    id: entry?.id,
    kind: entry?.kind ?? "",
    level: entry?.level ?? null,
    issued_date: entry?.issued_date ?? null,
    expires_date: entry?.expires_date ?? null,
  });

  const onSave = () => {
    setError(null);
    setSaving(true);
    startSaving(async () => {
      const result = await upsertCertificationEntry(v);
      setSaving(false);
      if (!result.ok) return setError(result.error);
      router.refresh();
      onClose();
    });
  };
  const onDelete = () => {
    if (!entry) return;
    if (!confirm("Remove this certification?")) return;
    setSaving(true);
    startSaving(async () => {
      const result = await deleteCertificationEntry(entry.id);
      setSaving(false);
      if (!result.ok) return setError(result.error);
      router.refresh();
      onClose();
    });
  };

  return (
    <EditSheet
      open
      onClose={onClose}
      onSave={onSave}
      saving={saving}
      title={entry ? "Edit certification" : "Add certification"}
      footerLeft={
        entry && (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving}
            className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:text-red-900 disabled:opacity-50"
          >
            <Trash2 className="size-3.5" /> Remove
          </button>
        )
      }
    >
      <ComboboxField
        label="Type"
        required
        value={v.kind}
        options={CERTIFICATION_KINDS}
        onChange={(x) => setV((p) => ({ ...p, kind: x }))}
        allowCustom
      />
      <TextField
        label="Level"
        placeholder="Provider, Instructor, etc."
        value={v.level ?? ""}
        onChange={(x) => setV((p) => ({ ...p, level: x || null }))}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Issued"
          type="date"
          value={v.issued_date ?? ""}
          onChange={(x) =>
            setV((p) => ({ ...p, issued_date: x || null }))
          }
        />
        <TextField
          label="Expires"
          type="date"
          value={v.expires_date ?? ""}
          onChange={(x) =>
            setV((p) => ({ ...p, expires_date: x || null }))
          }
        />
      </div>
      <InlineError message={error} />
    </EditSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Credential file controls (Phase 5B v1)
//
// Inline, per-row file management on each license/certification row.
// Three states:
//   • No file        → "Upload" button (file picker)
//   • File present   → "View" (signed URL) + "Replace" + "Remove"
//   • Pending        → disabled controls with spinner label
//
// The signed-URL view opens in a new tab; the bucket is private so we
// mint a 60s URL on each click rather than caching.
// ─────────────────────────────────────────────────────────────────────

function CredentialFileControls({
  kind,
  rowId,
  hasFile,
  verificationStatus,
}: {
  kind: CredentialKind;
  rowId: string;
  hasFile: boolean;
  verificationStatus: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePick = () => fileRef.current?.click();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    const result = await uploadCredentialFile(kind, rowId, fd);
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  const handleView = async () => {
    setError(null);
    setBusy(true);
    const result = await getCredentialFileSignedUrl(kind, rowId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  };

  const handleRemove = async () => {
    if (!confirm("Remove this file?")) return;
    setError(null);
    setBusy(true);
    const result = await removeCredentialFile(kind, rowId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        onChange={handleUpload}
        className="hidden"
        aria-hidden
      />
      {hasFile ? (
        <>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
            <Paperclip className="size-3" />
            Document on file
          </span>
          <button
            type="button"
            onClick={handleView}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Eye className="size-3" />
            View
          </button>
          <button
            type="button"
            onClick={handlePick}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Upload className="size-3" />
            Replace
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <X className="size-3" />
            Remove
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={handlePick}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 font-medium text-slate-600 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
        >
          <Upload className="size-3" />
          Upload document
        </button>
      )}
      <VerificationBadge status={verificationStatus} />
      {busy && <span className="text-slate-400">Working…</span>}
      {error && <span className="text-red-700">{error}</span>}
    </div>
  );
}

function VerificationBadge({ status }: { status: string }) {
  if (status === "verified") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
        <ShieldCheck className="size-3" />
        Verified
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
        Pending review
      </span>
    );
  }
  if (status === "revoked") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
        Revoked
      </span>
    );
  }
  if (status === "expired") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
        Expired
      </span>
    );
  }
  // 'unverified' → no chip; the absence reads as the default and avoids
  // cluttering every new row with a "not yet verified" badge.
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// 8. Job Preferences
// ─────────────────────────────────────────────────────────────────────

function JobPreferencesCard({
  data,
  onEdit,
}: {
  data: ProfileData["jobPreferences"];
  onEdit: () => void;
}) {
  const visibility = CV_VISIBILITY_OPTIONS.find(
    (o) => o.value === data.cv_visibility
  );
  const salaryUnit = SALARY_UNIT_OPTIONS.find(
    (o) => o.value === data.salary_unit
  );
  const days = WEEKDAY_KEYS.filter(
    (k) => data.schedule_preferences[k.key]
  ).map((k) => k.label);
  // Anchor target for the /candidate/settings/job-preferences redirect.
  // scroll-mt-24 keeps the card off the top edge once scrolled into view.
  return (
    <div id="section-job-preferences" className="scroll-mt-24">
    <SectionCard
      title="Job preferences"
      subtitle="Where, when, and how you want to work."
      action={<EditButton onClick={onEdit} />}
    >
      <div className="space-y-3 text-sm">
        {visibility && (
          <div className="rounded-md bg-[#F7F4ED] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4D7A60]">
              Visibility
            </p>
            <p className="mt-0.5 font-medium text-[#14233F]">{visibility.label}</p>
            <p className="mt-0.5 text-xs text-slate-600">
              {visibility.description}
            </p>
          </div>
        )}
        <ChipPreview
          label="Locations"
          values={data.desired_locations}
          empty="Add cities/states you'd consider."
        />
        {(data.min_salary !== null && salaryUnit) && (
          <Field
            label="Minimum compensation"
            value={`$${data.min_salary.toLocaleString()} ${salaryUnit.label.toLowerCase()}`}
          />
        )}
        {days.length > 0 && (
          <Field label="Available days" value={days.join(", ")} />
        )}
        {data.schedule_preferences.willing_to_relocate && (
          <p className="text-xs text-[#4D7A60]">
            <CheckCircle2 className="mr-1 inline size-3" />
            Willing to relocate.
          </p>
        )}
      </div>
    </SectionCard>
    </div>
  );
}

function JobPreferencesModal({
  initial,
  onClose,
}: {
  initial: ProfileData["jobPreferences"];
  onClose: () => void;
}) {
  const router = useRouter();
  const [, startSaving] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locations, setLocations] = useState<string[]>(initial.desired_locations);
  const [minSalary, setMinSalary] = useState<number | null>(initial.min_salary);
  const [salaryUnit, setSalaryUnit] = useState(initial.salary_unit);
  const [schedule, setSchedule] = useState<SchedulePreferences>(
    initial.schedule_preferences
  );
  const [visibility, setVisibility] = useState(initial.cv_visibility);
  const [availability, setAvailability] = useState<string | null>(
    initial.availability
  );

  const onSave = () => {
    setError(null);
    setSaving(true);
    startSaving(async () => {
      const result = await upsertJobPreferences({
        desired_locations: locations,
        min_salary: minSalary,
        salary_unit: salaryUnit,
        schedule_preferences: schedule,
        cv_visibility: visibility,
        availability,
      });
      setSaving(false);
      if (!result.ok) return setError(result.error);
      router.refresh();
      onClose();
    });
  };

  const toggleDay = (key: keyof SchedulePreferences) =>
    setSchedule((p) => ({ ...p, [key]: !p[key] }));

  return (
    <EditSheet
      open
      onClose={onClose}
      onSave={onSave}
      saving={saving}
      title="Edit job preferences"
    >
      <div>
        <p className="mb-2 text-sm font-medium text-slate-800">Visibility</p>
        <div className="space-y-2">
          {CV_VISIBILITY_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`block cursor-pointer rounded-md border p-3 text-sm transition ${
                visibility === opt.value
                  ? "border-[#4D7A60] bg-[#4D7A60]/10"
                  : "border-slate-300 bg-white hover:border-slate-400"
              }`}
            >
              <input
                type="radio"
                name="cv_visibility"
                checked={visibility === opt.value}
                onChange={() => setVisibility(opt.value)}
                className="sr-only"
              />
              <span className="block font-medium text-[#14233F]">
                {opt.label}
              </span>
              <span className="mt-0.5 block text-xs text-slate-600">
                {opt.description}
              </span>
            </label>
          ))}
        </div>
      </div>
      <LocationAutocompleteInput
        label="Desired locations"
        values={locations}
        onChange={setLocations}
        placeholder="Start typing a city — e.g. Prairie Village…"
        helper="Pick from the list so we match you accurately. One city per chip."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Minimum compensation"
          type="number"
          value={minSalary !== null ? String(minSalary) : ""}
          onChange={(x) =>
            setMinSalary(x === "" ? null : Number.parseInt(x, 10))
          }
        />
        <div>
          <p className="mb-1 block text-sm font-medium text-slate-800">
            Compensation unit
          </p>
          <div className="flex flex-wrap gap-2">
            {SALARY_UNIT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  setSalaryUnit((cur) => (cur === opt.value ? null : opt.value))
                }
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  salaryUnit === opt.value
                    ? "border-[#4D7A60] bg-[#4D7A60]/10 text-[#14233F]"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-slate-800">Available days</p>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_KEYS.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => toggleDay(d.key)}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                schedule[d.key]
                  ? "border-[#4D7A60] bg-[#4D7A60]/10 text-[#14233F]"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!schedule.evenings}
          onChange={(e) =>
            setSchedule((p) => ({ ...p, evenings: e.target.checked }))
          }
          className="size-4 rounded border-slate-300"
        />
        Available evenings
      </label>
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!schedule.willing_to_relocate}
          onChange={(e) =>
            setSchedule((p) => ({
              ...p,
              willing_to_relocate: e.target.checked,
            }))
          }
          className="size-4 rounded border-slate-300"
        />
        Willing to relocate for the right role
      </label>
      <div>
        <p className="mb-1 block text-sm font-medium text-slate-800">
          Availability
        </p>
        <select
          value={availability ?? ""}
          onChange={(e) => setAvailability(e.target.value || null)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#4D7A60] focus:outline-none focus:ring-1 focus:ring-[#4D7A60]"
        >
          <option value="">Not set</option>
          <option value="immediate">Immediately</option>
          <option value="2_weeks">Within 2 weeks</option>
          <option value="1_month">Within 1 month</option>
          <option value="passive">Passively looking</option>
        </select>
      </div>
      <InlineError message={error} />
    </EditSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────
// 9. PracticeFit / DSOFit (product-aware — #54). A corporate candidate
//    (primary_fit_product = "dsofit") sees the DSOFit sibling here, not
//    PracticeFit, so their profile reads consistently with the rest of
//    their experience.
// ─────────────────────────────────────────────────────────────────────

function PracticeFitCard({
  product = "practicefit",
}: {
  product?: "practicefit" | "dsofit";
}) {
  const isDso = product === "dsofit";
  return (
    <section className="border border-slate-200 bg-[#F7F4ED] p-6 sm:p-8">
      <header className="mb-3">
        <h2 className="leading-none">
          {isDso ? (
            <DsoFitWordmark surface="light" tm className="text-2xl" />
          ) : (
            <PracticeFitWordmark surface="light" tm className="text-2xl" />
          )}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {isDso ? (
            <>
              DSOs already see how well you match their open roles — DSOFit is
              scored from your profile and your DSOFit assessment (your
              function, level, multi-site experience, and how you want to
              work). The more complete your profile, the sharper your matches.
            </>
          ) : (
            <>
              Employers already see how well you match their open roles —
              PracticeFit is scored automatically from your profile (your role,
              skills, schedule, and preferences). The more complete your
              profile, the sharper your matches.
            </>
          )}
        </p>
      </header>
      <div className="flex items-center gap-2 rounded-md bg-white px-4 py-3 text-xs text-slate-500">
        <AlertCircle className="size-4 text-[#4D7A60]" />
        {isDso ? (
          <>
            Nothing to fill in here — keep your profile up to date and take
            your DSOFit assessment to sharpen it.
          </>
        ) : (
          <>
            Nothing to fill in here — keep your profile up to date and
            PracticeFit follows. An optional work-style assessment to fine-tune
            it is coming later.
          </>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function formatDateRange(
  start: string | null,
  end: string | null,
  isCurrent: boolean
): string {
  const s = start ? formatYearMonth(start) : "?";
  const e = isCurrent ? "Present" : end ? formatYearMonth(end) : "?";
  return `${s} — ${e}`;
}

/**
 * Build the AI Write context from the full ProfileData so headline +
 * summary suggestions ground in the candidate's actual data. Most
 * recent role is taken from the first item in workHistory (the page
 * query orders by is_current desc + start_date desc nulls last).
 */
function buildAiContext(data: ProfileData): ProfileContext {
  const top = data.workHistory[0] ?? null;
  return {
    full_name:
      composeName({
        first_name: data.identity.first_name,
        last_name: data.identity.last_name,
      }) || null,
    current_headline: data.identity.headline,
    current_summary: data.identity.summary,
    pronouns: data.identity.pronouns,
    years_experience_dental: data.identity.years_experience_dental,
    desired_roles: data.rolePreferences.desired_roles,
    desired_specialty: data.rolePreferences.desired_specialty,
    top_skills: data.skillsLanguages.skills,
    most_recent_role: top
      ? {
          title: top.title,
          company: top.company_name,
          is_current: top.is_current,
        }
      : null,
  };
}

function formatYearMonth(d: string): string {
  // Accepts YYYY-MM-DD; returns "Mar 2024".
  const date = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDate(d: string): string {
  const date = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
