"use client";

/**
 * JobForm — shared form for /employer/jobs/new and /employer/jobs/[id].
 *
 * Wraps the Tiptap editor we built earlier (Q4 spec). Form state is stored
 * in React state for fields the editor controls; the form submits via
 * a server action.
 */

import { useActionState, useState } from "react";
import { ArrowRight, Save } from "lucide-react";
import { JobDescriptionEditor } from "@/components/job-description-editor";
import {
  createJob,
  updateJob,
  type JobActionState,
} from "./actions";

export interface LocationOption {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

export interface JobFormInitial {
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

interface JobFormProps {
  dsoId: string;
  locations: LocationOption[];
  mode: "create" | "edit";
  initial?: JobFormInitial;
}

const initialState: JobActionState = { ok: false };

const ROLE_OPTIONS = [
  { value: "dentist", label: "Dentist" },
  { value: "dental_hygienist", label: "Dental Hygienist" },
  { value: "dental_assistant", label: "Dental Assistant" },
  { value: "front_office", label: "Front Office" },
  { value: "office_manager", label: "Office Manager" },
  { value: "regional_manager", label: "Regional Manager" },
  { value: "specialist", label: "Specialist" },
  { value: "other", label: "Other" },
];

const EMPLOYMENT_OPTIONS = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "contract", label: "Contract" },
  { value: "prn", label: "PRN" },
  { value: "locum", label: "Locum" },
];

const COMP_PERIODS = [
  { value: "", label: "—" },
  { value: "hourly", label: "Per hour" },
  { value: "daily", label: "Per day" },
  { value: "annual", label: "Per year" },
];

export function JobForm({ dsoId, locations, mode, initial }: JobFormProps) {
  const action = mode === "edit" ? updateJob : createJob;
  const [state, formAction, pending] = useActionState(action, initialState);

  const [description, setDescription] = useState(initial?.description ?? "");
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(
    new Set(initial?.location_ids ?? [])
  );

  function toggleLocation(id: string) {
    setSelectedLocationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-8 max-w-[820px]">
      <input type="hidden" name="dso_id" value={dsoId} />
      {mode === "edit" && initial && (
        <input type="hidden" name="job_id" value={initial.id} />
      )}
      {/* Description is React-state managed; submit via hidden input */}
      <input type="hidden" name="description" value={description} />
      {/* Selected locations as repeated hidden inputs */}
      {Array.from(selectedLocationIds).map((id) => (
        <input key={id} type="hidden" name="location_ids" value={id} />
      ))}

      {/* Title */}
      <Field
        label="Job title"
        name="title"
        placeholder="Associate Dentist — General"
        defaultValue={initial?.title}
        required
      />

      {/* Role + employment type */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Select
          label="Role category"
          name="role_category"
          defaultValue={initial?.role_category ?? "other"}
          options={ROLE_OPTIONS}
          required
        />
        <Select
          label="Employment type"
          name="employment_type"
          defaultValue={initial?.employment_type ?? "full_time"}
          options={EMPLOYMENT_OPTIONS}
          required
        />
      </div>

      {/* Description (Tiptap) */}
      <div>
        <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
          Job description <span className="text-heritage">*</span>
        </label>
        <JobDescriptionEditor
          value={description}
          onChange={setDescription}
          placeholder="Describe the role, responsibilities, and what makes this DSO a great place to work..."
        />
        <p className="mt-2 text-[11px] text-slate-meta">
          Headings, bold/italic, lists, links, and blockquotes are supported.
          Skip H1 — that&apos;s reserved for the page title.
        </p>
      </div>

      {/* Locations */}
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
                  onChange={() => toggleLocation(loc.id)}
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

      {/* Compensation */}
      <fieldset className="border border-[var(--rule)] p-6 bg-cream/40">
        <legend className="px-2 text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep">
          Compensation
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-2">
          <Field
            label="Minimum"
            name="compensation_min"
            type="number"
            placeholder="190000"
            defaultValue={initial?.compensation_min ?? undefined}
          />
          <Field
            label="Maximum"
            name="compensation_max"
            type="number"
            placeholder="240000"
            defaultValue={initial?.compensation_max ?? undefined}
          />
          <Select
            label="Period"
            name="compensation_period"
            defaultValue={initial?.compensation_period ?? ""}
            options={COMP_PERIODS}
          />
        </div>
        <label className="mt-4 flex items-center gap-2.5 text-[13px] text-ink cursor-pointer">
          <input
            type="checkbox"
            name="compensation_visible"
            defaultChecked={initial?.compensation_visible ?? true}
            className="accent-heritage"
          />
          <span>
            Show pay range publicly. Required in CA, CO, WA, NY, and other
            states with pay-transparency laws.
          </span>
        </label>
      </fieldset>

      {/* Skills + benefits */}
      <Field
        label="Required skills (comma-separated)"
        name="skills"
        placeholder="implant placement, scaling and root planing, intraoral camera"
        defaultValue={initial?.skills?.join(", ")}
      />
      <Field
        label="Benefits (comma-separated)"
        name="benefits"
        placeholder="health, dental, 401k match, PTO, CE allowance"
        defaultValue={initial?.benefits?.join(", ")}
      />

      <Field
        label="Requirements (one per line)"
        name="requirements"
        as="textarea"
        rows={4}
        placeholder="DDS or DMD &#10;Active state license &#10;Comfortable with implant cases"
        defaultValue={initial?.requirements ?? undefined}
      />

      {/* Status */}
      <Select
        label="Status"
        name="status"
        defaultValue={initial?.status ?? "draft"}
        options={[
          { value: "draft", label: "Draft (only you can see)" },
          { value: "active", label: "Active (publicly visible)" },
          ...(mode === "edit"
            ? [
                { value: "paused", label: "Paused" },
                { value: "filled", label: "Filled" },
              ]
            : []),
        ]}
      />

      {state.error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <p className="text-[13px] text-red-900">{state.error}</p>
        </div>
      )}

      {state.ok && mode === "edit" && (
        <div className="bg-cream border-l-4 border-heritage p-4">
          <p className="text-[13px] text-ink font-semibold">Saved.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-3 pt-4 border-t border-[var(--rule)]">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending
            ? mode === "create"
              ? "Posting…"
              : "Saving…"
            : mode === "create"
              ? "Post Job"
              : "Save Changes"}
          {!pending && (mode === "create" ? <ArrowRight className="h-4 w-4" /> : <Save className="h-4 w-4" />)}
        </button>
      </div>
    </form>
  );
}

/* ───── small inputs ───── */

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  defaultValue,
  as,
  rows,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number;
  as?: "textarea";
  rows?: number;
}) {
  return (
    <div>
      <label
        htmlFor={`job-${name}`}
        className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
      >
        {label} {required && <span className="text-heritage">*</span>}
      </label>
      {as === "textarea" ? (
        <textarea
          id={`job-${name}`}
          name={name}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue}
          rows={rows}
          className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors resize-vertical"
        />
      ) : (
        <input
          id={`job-${name}`}
          type={type}
          name={name}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue}
          className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
        />
      )}
    </div>
  );
}

function Select({
  label,
  name,
  defaultValue,
  options,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={`job-${name}`}
        className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
      >
        {label} {required && <span className="text-heritage">*</span>}
      </label>
      <select
        id={`job-${name}`}
        name={name}
        defaultValue={defaultValue}
        required={required}
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
