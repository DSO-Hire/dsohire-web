"use client";

/**
 * Job Preferences form (Phase 4.3.c).
 *
 * Five independent section cards, each with its own save bar (mirrors the
 * privacy-tab pattern). Built on shared subcomponents from this file —
 * RadioGroup, ChipMultiSelect, MultiStateChips, ChipArrayInput, SaveBar.
 *
 * Inputs that gate matching use combobox/chip controls per the locked
 * input-safety-rails feedback (memory: feedback_input_safety_rails). No
 * free-text where a typo could silently exclude the candidate.
 */

import { useMemo, useState, useTransition } from "react";
import {
  Briefcase,
  MapPin,
  ShieldCheck,
  Calendar,
  DollarSign,
  X,
  AlertCircle,
  Sparkles,
  Save,
  Plus,
  Search,
} from "lucide-react";
import {
  ROLE_CATEGORIES,
  SPECIALTIES,
  TEMP_OR_PERM_OPTIONS,
  SALARY_UNIT_OPTIONS,
  WEEKDAY_KEYS,
  type SchedulePreferences,
} from "@/lib/candidate/canonical-lists";
import { US_STATES } from "@/lib/us-states";
import {
  saveRolesAndSpecialty,
  saveLicenseStatesAndDsoSize,
  saveLocations,
  saveSchedule,
  saveCompensation,
} from "./actions";

type DsoSize = "small" | "mid" | "large" | "any" | null;
type TempOrPerm = "temp" | "perm" | "either" | null;
type SalaryUnit = "hourly" | "yearly" | "per_visit" | "per_day" | null;

export interface JobPreferencesFormProps {
  initial: {
    desired_roles: string[];
    desired_specialty: string[];
    license_states: string[];
    dso_size_preference: DsoSize;
    desired_locations: string[];
    schedule_preferences: SchedulePreferences;
    temp_or_perm: TempOrPerm;
    availability: string | null;
    min_salary: number | null;
    salary_unit: SalaryUnit;
  };
}

export function JobPreferencesForm({ initial }: JobPreferencesFormProps) {
  return (
    <div className="space-y-6">
      <RolesSection initial={initial} />
      <LicenseStatesSection initial={initial} />
      <LocationsSection initial={initial} />
      <ScheduleSection initial={initial} />
      <CompensationSection initial={initial} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section 1 — Roles + specialty
// ─────────────────────────────────────────────────────────────────────

function RolesSection({ initial }: JobPreferencesFormProps) {
  const [roles, setRoles] = useState<string[]>(initial.desired_roles);
  const [specialty, setSpecialty] = useState<string[]>(initial.desired_specialty);
  const [, startSaving] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const dirty =
    !arraysEqual(roles, initial.desired_roles) ||
    !arraysEqual(specialty, initial.desired_specialty);

  const onSave = () => {
    setError(null);
    setSavedFlash(null);
    setSaving(true);
    startSaving(async () => {
      const r = await saveRolesAndSpecialty({
        desired_roles: roles,
        desired_specialty: specialty,
      });
      setSaving(false);
      if (!r.ok) return setError(r.error);
      setSavedFlash("Saved.");
      window.setTimeout(() => setSavedFlash(null), 2500);
    });
  };

  return (
    <SectionCard
      icon={<Briefcase className="size-5 text-heritage" />}
      title="Roles + specialty"
      description="The role buckets you'd accept and any specialty match. Used for both job matching and Talent Pool browse."
    >
      <ChipMultiSelect
        legend="Roles I'd accept"
        options={ROLE_CATEGORIES.map((r) => ({ value: r.value, label: r.label }))}
        values={roles}
        onChange={setRoles}
      />
      <ChipMultiSelect
        legend="Specialty interest"
        options={SPECIALTIES.map((s) => ({ value: s.value, label: s.label }))}
        values={specialty}
        onChange={setSpecialty}
      />
      <SaveBar
        dirty={dirty}
        saving={saving}
        error={error}
        savedFlash={savedFlash}
        onSave={onSave}
      />
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section 2 — License states + DSO size
// ─────────────────────────────────────────────────────────────────────

const DSO_SIZE_OPTIONS: ReadonlyArray<{
  value: NonNullable<DsoSize>;
  label: string;
  description: string;
}> = [
  {
    value: "small",
    label: "Small (1–9 practices)",
    description: "Closer-knit teams, owner-operator culture.",
  },
  {
    value: "mid",
    label: "Mid (10–49 practices)",
    description: "Established processes with room to grow into leadership.",
  },
  {
    value: "large",
    label: "Large (50+ practices)",
    description: "Big-org infrastructure, more formal career ladders.",
  },
  {
    value: "any",
    label: "Any size",
    description: "Open to all. We'll show you everything.",
  },
];

function LicenseStatesSection({ initial }: JobPreferencesFormProps) {
  const [states, setStates] = useState<string[]>(initial.license_states);
  const [size, setSize] = useState<DsoSize>(initial.dso_size_preference);
  const [, startSaving] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const dirty =
    !arraysEqual(states, initial.license_states) ||
    size !== initial.dso_size_preference;

  const onSave = () => {
    setError(null);
    setSavedFlash(null);
    setSaving(true);
    startSaving(async () => {
      const r = await saveLicenseStatesAndDsoSize({
        license_states: states,
        dso_size_preference: size,
      });
      setSaving(false);
      if (!r.ok) return setError(r.error);
      setSavedFlash("Saved.");
      window.setTimeout(() => setSavedFlash(null), 2500);
    });
  };

  return (
    <SectionCard
      icon={<ShieldCheck className="size-5 text-heritage" />}
      title="Licensure + DSO size"
      description="States you're licensed in (or willing to apply for) — picks the jobs where you can practice. DSO size is a fit preference."
    >
      <MultiStateChips
        legend="Licensed in"
        values={states}
        onChange={setStates}
      />
      <RadioGroup
        legend="Preferred DSO size"
        value={size}
        onChange={(next) => setSize(next as DsoSize)}
        options={DSO_SIZE_OPTIONS}
        allowClear
      />
      <SaveBar
        dirty={dirty}
        saving={saving}
        error={error}
        savedFlash={savedFlash}
        onSave={onSave}
      />
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section 3 — Locations
// ─────────────────────────────────────────────────────────────────────

function LocationsSection({ initial }: JobPreferencesFormProps) {
  const [locations, setLocations] = useState<string[]>(initial.desired_locations);
  const [, startSaving] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const dirty = !arraysEqual(locations, initial.desired_locations);

  const onSave = () => {
    setError(null);
    setSavedFlash(null);
    setSaving(true);
    startSaving(async () => {
      const r = await saveLocations({ desired_locations: locations });
      setSaving(false);
      if (!r.ok) return setError(r.error);
      setSavedFlash("Saved.");
      window.setTimeout(() => setSavedFlash(null), 2500);
    });
  };

  return (
    <SectionCard
      icon={<MapPin className="size-5 text-heritage" />}
      title="Locations"
      description="Cities or metros you'd consider. We use these as a soft match — jobs anywhere are still browsable."
    >
      <ChipArrayInput
        legend="Cities + metros"
        values={locations}
        onChange={setLocations}
        placeholder="Wichita, KS · Kansas City, MO · …"
        helper="One per chip. City + state for best match."
      />
      <SaveBar
        dirty={dirty}
        saving={saving}
        error={error}
        savedFlash={savedFlash}
        onSave={onSave}
      />
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section 4 — Schedule + temp/perm + availability
// ─────────────────────────────────────────────────────────────────────

function ScheduleSection({ initial }: JobPreferencesFormProps) {
  const [schedule, setSchedule] = useState<SchedulePreferences>(
    initial.schedule_preferences
  );
  const [tempOrPerm, setTempOrPerm] = useState<TempOrPerm>(initial.temp_or_perm);
  const [availability, setAvailability] = useState<string | null>(
    initial.availability
  );
  const [, startSaving] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const dirty =
    JSON.stringify(schedule) !== JSON.stringify(initial.schedule_preferences) ||
    tempOrPerm !== initial.temp_or_perm ||
    availability !== initial.availability;

  const onSave = () => {
    setError(null);
    setSavedFlash(null);
    setSaving(true);
    startSaving(async () => {
      const r = await saveSchedule({
        schedule_preferences: schedule,
        temp_or_perm: tempOrPerm,
        availability,
      });
      setSaving(false);
      if (!r.ok) return setError(r.error);
      setSavedFlash("Saved.");
      window.setTimeout(() => setSavedFlash(null), 2500);
    });
  };

  const toggleDay = (key: keyof SchedulePreferences) =>
    setSchedule((p) => ({ ...p, [key]: !p[key] }));

  return (
    <SectionCard
      icon={<Calendar className="size-5 text-heritage" />}
      title="Schedule + availability"
      description="Days you'd work, evenings, willingness to relocate, when you're free to start."
    >
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Available days</p>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_KEYS.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => toggleDay(d.key)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                schedule[d.key]
                  ? "border-heritage bg-heritage/10 text-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-start gap-2 rounded-md border border-border bg-card p-3 hover:bg-muted">
          <input
            type="checkbox"
            checked={Boolean(schedule.evenings)}
            onChange={() => toggleDay("evenings")}
            className="mt-0.5 size-4 rounded border-border"
          />
          <span className="flex-1 text-sm">
            <span className="block font-medium text-foreground">
              Evenings OK
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              We&apos;ll surface jobs with evening shifts.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 rounded-md border border-border bg-card p-3 hover:bg-muted">
          <input
            type="checkbox"
            checked={Boolean(schedule.willing_to_relocate)}
            onChange={() => toggleDay("willing_to_relocate")}
            className="mt-0.5 size-4 rounded border-border"
          />
          <span className="flex-1 text-sm">
            <span className="block font-medium text-foreground">
              Willing to relocate
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Lets jobs outside your locations match you.
            </span>
          </span>
        </label>
      </div>
      <RadioGroup
        legend="Permanent or temp"
        value={tempOrPerm}
        onChange={(next) => setTempOrPerm(next as TempOrPerm)}
        options={TEMP_OR_PERM_OPTIONS.map((o) => ({
          value: o.value,
          label: o.label,
          description: "",
        }))}
        allowClear
        compact
      />
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-foreground">
          When you&apos;re free to start
        </span>
        <input
          type="text"
          value={availability ?? ""}
          onChange={(e) =>
            setAvailability(e.target.value === "" ? null : e.target.value)
          }
          placeholder="Immediately · 2 weeks · After May 30 · …"
          maxLength={50}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm focus:border-heritage focus:outline-none focus:ring-1 focus:ring-heritage"
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          Free text, but employers will see this. Keep it brief.
        </span>
      </label>
      <SaveBar
        dirty={dirty}
        saving={saving}
        error={error}
        savedFlash={savedFlash}
        onSave={onSave}
      />
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section 5 — Compensation
// ─────────────────────────────────────────────────────────────────────

function CompensationSection({ initial }: JobPreferencesFormProps) {
  const [minSalary, setMinSalary] = useState<number | null>(initial.min_salary);
  const [unit, setUnit] = useState<SalaryUnit>(initial.salary_unit);
  const [, startSaving] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const dirty =
    minSalary !== initial.min_salary || unit !== initial.salary_unit;

  const onSave = () => {
    setError(null);
    setSavedFlash(null);
    setSaving(true);
    startSaving(async () => {
      const r = await saveCompensation({
        min_salary: minSalary,
        salary_unit: unit,
      });
      setSaving(false);
      if (!r.ok) return setError(r.error);
      setSavedFlash("Saved.");
      window.setTimeout(() => setSavedFlash(null), 2500);
    });
  };

  return (
    <SectionCard
      icon={<DollarSign className="size-5 text-heritage" />}
      title="Compensation"
      description="Your minimum acceptable comp. Used to filter jobs whose posted range is below your floor — never shown to employers."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">
            Minimum
          </span>
          <input
            type="number"
            inputMode="numeric"
            value={minSalary !== null ? String(minSalary) : ""}
            onChange={(e) =>
              setMinSalary(
                e.target.value === "" ? null : Number.parseInt(e.target.value, 10)
              )
            }
            placeholder="50"
            min={0}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm focus:border-heritage focus:outline-none focus:ring-1 focus:ring-heritage"
          />
        </label>
        <div>
          <span className="mb-1 block text-sm font-medium text-foreground">
            Unit
          </span>
          <div className="flex flex-wrap gap-2">
            {SALARY_UNIT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  setUnit((cur) => (cur === opt.value ? null : opt.value))
                }
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  unit === opt.value
                    ? "border-heritage bg-heritage/10 text-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        error={error}
        savedFlash={savedFlash}
        onSave={onSave}
      />
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shared subcomponents
// ─────────────────────────────────────────────────────────────────────

function arraysEqual(a: ReadonlyArray<string>, b: ReadonlyArray<string>) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-[var(--rule)] bg-card p-6 sm:p-8">
      <header className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-heritage/10">
          {icon}
        </div>
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function ChipMultiSelect({
  legend,
  options,
  values,
  onChange,
}: {
  legend: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (val: string) => {
    if (values.includes(val)) {
      onChange(values.filter((v) => v !== val));
    } else {
      onChange([...values, val]);
    }
  };

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-foreground">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = values.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                active
                  ? "border-heritage bg-heritage/10 text-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * MultiStateChips — chip-based 50-state selector with type-ahead filter.
 *
 * Inline multi-select since the StateCombobox primitive is single-select.
 * Selected states render as removable chips above the search input. The
 * input filters the dropdown by code or name; clicking a row adds it.
 */
function MultiStateChips({
  legend,
  values,
  onChange,
}: {
  legend: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = US_STATES.filter((s) => !values.includes(s.code));
    if (!f) return list.slice(0, 50);
    return list
      .filter(
        (s) =>
          s.code.toLowerCase().startsWith(f) ||
          s.name.toLowerCase().includes(f)
      )
      .slice(0, 50);
  }, [filter, values]);

  const add = (code: string) => {
    if (values.includes(code)) return;
    onChange([...values, code]);
    setFilter("");
  };

  const remove = (code: string) =>
    onChange(values.filter((v) => v !== code));

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-foreground">
        {legend}
      </legend>
      {values.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {values.map((code) => {
            const state = US_STATES.find((s) => s.code === code);
            return (
              <li key={code}>
                <span className="inline-flex items-center gap-1 rounded-full bg-heritage/10 px-3 py-1 text-sm text-foreground">
                  {state ? state.name : code}{" "}
                  <span className="text-muted-foreground">({code})</span>
                  <button
                    type="button"
                    onClick={() => remove(code)}
                    className="text-muted-foreground hover:text-danger"
                    aria-label={`Remove ${state?.name ?? code}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="relative">
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm focus-within:border-heritage focus-within:ring-1 focus-within:ring-heritage">
          <Search className="size-4 text-meta-foreground" />
          <input
            type="text"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              // Delay close so onMouseDown on a row registers first.
              window.setTimeout(() => setOpen(false), 150);
            }}
            placeholder="Search states…"
            className="flex-1 outline-none placeholder:text-meta-foreground"
          />
        </div>
        {open && filtered.length > 0 && (
          <div className="absolute z-20 mt-1 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-xl">
            <ul className="max-h-64">
              {filtered.map((s) => (
                <li key={s.code}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      add(s.code);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="font-medium text-foreground">
                      {s.name}
                    </span>
                    <span className="text-xs text-muted-foreground">{s.code}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </fieldset>
  );
}

function ChipArrayInput({
  legend,
  values,
  onChange,
  placeholder,
  helper,
}: {
  legend: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  helper?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed || values.includes(trimmed)) {
      setDraft("");
      return;
    }
    onChange([...values, trimmed]);
    setDraft("");
  };

  const remove = (val: string) => onChange(values.filter((v) => v !== val));

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-foreground">
        {legend}
      </legend>
      {values.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <li key={v}>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm text-foreground">
                {v}
                <button
                  type="button"
                  onClick={() => remove(v)}
                  className="text-muted-foreground hover:text-danger"
                  aria-label={`Remove ${v}`}
                >
                  <X className="size-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm focus:border-heritage focus:outline-none focus:ring-1 focus:ring-heritage"
        />
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground hover:border-heritage hover:text-foreground"
        >
          <Plus className="size-4" />
          Add
        </button>
      </div>
      {helper && (
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      )}
    </fieldset>
  );
}

function RadioGroup<T extends string | null>({
  legend,
  value,
  onChange,
  options,
  allowClear,
  compact,
}: {
  legend: string;
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{
    value: NonNullable<T>;
    label: string;
    description: string;
  }>;
  allowClear?: boolean;
  compact?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-foreground">
        {legend}
      </legend>
      <div className={compact ? "flex flex-wrap gap-2" : "space-y-2"}>
        {options.map((opt) =>
          compact ? (
            <button
              key={opt.value}
              type="button"
              onClick={() =>
                onChange(
                  (value === opt.value && allowClear
                    ? null
                    : opt.value) as T
                )
              }
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                value === opt.value
                  ? "border-heritage bg-heritage/10 text-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              {opt.label}
            </button>
          ) : (
            <label
              key={opt.value}
              className={`block cursor-pointer rounded-md border p-3 text-sm transition ${
                value === opt.value
                  ? "border-heritage bg-heritage/10"
                  : "border-border bg-card hover:border-border-2"
              }`}
            >
              <input
                type="radio"
                checked={value === opt.value}
                onChange={() => onChange(opt.value as T)}
                className="sr-only"
              />
              <span className="block font-medium text-foreground">
                {opt.label}
              </span>
              {opt.description && (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {opt.description}
                </span>
              )}
            </label>
          )
        )}
      </div>
    </fieldset>
  );
}

function SaveBar({
  dirty,
  saving,
  error,
  savedFlash,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  error: string | null;
  savedFlash: string | null;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-border pt-4">
      <div className="text-xs">
        {error ? (
          <span className="inline-flex items-center gap-1 text-danger">
            <AlertCircle className="size-3.5" /> {error}
          </span>
        ) : savedFlash ? (
          <span className="inline-flex items-center gap-1 text-heritage">
            <Sparkles className="size-3.5" /> {savedFlash}
          </span>
        ) : dirty ? (
          <span className="text-muted-foreground">Unsaved changes</span>
        ) : (
          <span className="text-meta-foreground">Saved.</span>
        )}
      </div>
      <button
        type="button"
        onClick={onSave}
        disabled={!dirty || saving}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? "Saving…" : (
          <>
            <Save className="size-3.5" /> Save
          </>
        )}
      </button>
    </div>
  );
}
