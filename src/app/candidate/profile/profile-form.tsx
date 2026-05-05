"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import { saveCandidateProfile, type ProfileState } from "./actions";

const initial: ProfileState = { ok: false };

export interface ProfileInitial {
  full_name: string;
  phone: string;
  headline: string;
  summary: string;
  current_title: string;
  years_experience: string;
  desired_roles: string;
  desired_locations: string;
  availability: string;
  linkedin_url: string;
  is_searchable: boolean;
  has_resume: boolean;
  resume_filename: string | null;
}

export function CandidateProfileForm({ initial: data }: { initial: ProfileInitial }) {
  const [state, action, pending] = useActionState(saveCandidateProfile, initial);

  return (
    <form action={action} className="space-y-7" encType="multipart/form-data">
      {/* Identity */}
      <section className="space-y-5">
        <SectionHeader>Identity</SectionHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field
            label="Full name"
            name="full_name"
            required
            defaultValue={data.full_name}
            autoComplete="name"
          />
          <Field
            label="Phone"
            name="phone"
            type="tel"
            defaultValue={data.phone}
            placeholder="(913) 555-0142"
            autoComplete="tel"
          />
        </div>
        <Field
          label="Professional headline"
          name="headline"
          defaultValue={data.headline}
          placeholder="RDH with 8 years in pediatric practice — KS, MO"
          helper="One short line that shows up to employers as your hook."
        />
        <Textarea
          label="Summary"
          name="summary"
          defaultValue={data.summary}
          rows={4}
          placeholder="Optional — a few sentences for employers about your experience, what you're looking for, and what makes you stand out."
        />
      </section>

      {/* Experience */}
      <section className="space-y-5 pt-7 border-t border-[var(--rule)]">
        <SectionHeader>Experience</SectionHeader>
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-5">
          <Field
            label="Current title"
            name="current_title"
            defaultValue={data.current_title}
            placeholder="Lead Dental Hygienist"
          />
          <Field
            label="Years of experience"
            name="years_experience"
            type="number"
            min={0}
            max={60}
            defaultValue={data.years_experience}
            placeholder="8"
          />
        </div>
      </section>

      {/* Preferences */}
      <section className="space-y-5 pt-7 border-t border-[var(--rule)]">
        <SectionHeader>Job Preferences</SectionHeader>
        <Field
          label="Open to (comma-separated)"
          name="desired_roles"
          defaultValue={data.desired_roles}
          placeholder="dental_hygienist, office_manager"
          helper="The role categories you'd consider. We'll match you to relevant openings."
        />
        <Field
          label="Locations (comma-separated)"
          name="desired_locations"
          defaultValue={data.desired_locations}
          placeholder="Kansas City, KS · Lawrence, KS · Remote"
        />
        <SelectField
          label="Availability"
          name="availability"
          defaultValue={data.availability}
          options={[
            { value: "", label: "Not specified" },
            { value: "immediate", label: "Available immediately" },
            { value: "2_weeks", label: "2 weeks' notice" },
            { value: "1_month", label: "1 month out" },
            { value: "passive", label: "Just exploring" },
          ]}
        />
      </section>

      {/* Resume + links */}
      <section className="space-y-5 pt-7 border-t border-[var(--rule)]">
        <SectionHeader>Resume & Links</SectionHeader>
        <div>
          <label
            htmlFor="resume"
            className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
          >
            Resume
          </label>
          {data.has_resume && (
            <p className="mb-3 text-[13px] text-slate-body">
              Currently on file: {" "}
              <span className="font-semibold text-ink">
                {data.resume_filename ?? "your saved resume"}
              </span>
              . Upload below to replace it.
            </p>
          )}
          <input
            id="resume"
            type="file"
            name="resume"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="block w-full text-[14px] text-ink file:mr-4 file:px-5 file:py-2.5 file:border-0 file:text-[10px] file:font-bold file:tracking-[1.5px] file:uppercase file:bg-ink file:text-ivory hover:file:bg-ink-soft file:cursor-pointer file:transition-colors"
          />
          <p className="mt-1.5 text-[12px] text-slate-meta">PDF, DOC, or DOCX. Max 10 MB.</p>
        </div>
        <Field
          label="LinkedIn URL"
          name="linkedin_url"
          type="url"
          defaultValue={data.linkedin_url}
          placeholder="https://www.linkedin.com/in/yourname"
        />
      </section>

      {/* Visibility */}
      <section className="pt-7 border-t border-[var(--rule)]">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="is_searchable"
            defaultChecked={data.is_searchable}
            className="mt-1 h-4 w-4 accent-ink"
          />
          <div>
            <div className="text-[14px] font-semibold text-ink">
              Make me discoverable to verified DSOs
            </div>
            <div className="text-[13px] text-slate-body leading-relaxed mt-0.5">
              When on, mid-market DSOs on DSO Hire can reach out about roles you
              haven&apos;t applied to. Off by default. (Candidate search ships in v1.1.)
            </div>
          </div>
        </label>
      </section>

      {state.error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <p className="text-[14px] text-red-900">{state.error}</p>
        </div>
      )}
      {state.ok && state.message && (
        <div className="bg-emerald-50 border-l-4 border-heritage p-4">
          <p className="text-[14px] text-heritage-deep font-semibold">{state.message}</p>
        </div>
      )}

      <div className="pt-4">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Save className="h-4 w-4" />
          {pending ? "Saving…" : "Save Profile"}
        </button>
      </div>
    </form>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
      {children}
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  autoComplete,
  defaultValue,
  placeholder,
  helper,
  min,
  max,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  defaultValue?: string;
  placeholder?: string;
  helper?: string;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <label
        htmlFor={`profile-${name}`}
        className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
      >
        {label} {required && <span className="text-heritage">*</span>}
      </label>
      <input
        id={`profile-${name}`}
        type={type}
        name={name}
        required={required}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        placeholder={placeholder}
        min={min}
        max={max}
        className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
      />
      {helper && (
        <p className="mt-1.5 text-[12px] text-slate-meta leading-relaxed">{helper}</p>
      )}
    </div>
  );
}

function Textarea({
  label,
  name,
  rows = 3,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  rows?: number;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label
        htmlFor={`profile-${name}`}
        className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
      >
        {label}
      </label>
      <textarea
        id={`profile-${name}`}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors leading-relaxed"
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label
        htmlFor={`profile-${name}`}
        className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
      >
        {label}
      </label>
      <select
        id={`profile-${name}`}
        name={name}
        defaultValue={defaultValue}
        className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
