"use client";

/**
 * ReviewForm — confidence-aware sectioned editor for the parsed resume.
 *
 * Sections (matching the parser output):
 *   • Basics                — name, headline, summary, contact, location, years, LinkedIn
 *   • Work history          — multi-entry, collapsible
 *   • Education             — multi-entry
 *   • Licenses              — multi-entry
 *   • Certifications        — multi-entry
 *   • Skills, Languages, Desired roles, Specialties — chip-style adders
 *
 * Edits land in local state. On "Save to my profile" we hand the whole
 * `ParsedResume` payload to `saveParsedResumeAction` — the server is the
 * single source of truth for what gets written, and we revalidate
 * /candidate/profile so the editor renders the new rows.
 */

import { useState } from "react";
import { ShieldCheck, Sparkles, Save, X, Plus, Trash2 } from "lucide-react";
import type { ParsedResume } from "@/lib/resume/parse";
import { ConfidencePill } from "./import-wizard";
// #93 (Day 28) — canonical pickers for roles/specialties/languages so the
// résumé-review step can't seed free-text typos that exclude the candidate
// from employers' structured search.
import { ChipArrayInput } from "@/app/candidate/(app)/profile/edit-sheet";
import {
  ROLE_CATEGORIES,
  SPECIALTIES,
  COMMON_LANGUAGES,
} from "@/lib/candidate/canonical-lists";

interface ReviewFormProps {
  parsed: ParsedResume;
  warnings: string[];
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: (edited: ParsedResume) => void;
}

export function ReviewForm({
  parsed: initial,
  warnings,
  isSaving,
  onCancel,
  onConfirm,
}: ReviewFormProps) {
  const [parsed, setParsed] = useState<ParsedResume>(initial);

  // ── Basics field updater ───────────────────────────────────────────
  const updateBasic = <K extends keyof ParsedResume["basics"]>(
    key: K,
    value: ParsedResume["basics"][K]["value"]
  ) => {
    setParsed((prev) => ({
      ...prev,
      basics: {
        ...prev.basics,
        [key]: { ...prev.basics[key], value },
      },
    }));
  };

  // ── String[] field updater ─────────────────────────────────────────
  const updateStringArray = (
    key: "skills" | "languages" | "desired_roles" | "desired_specialty",
    next: string[]
  ) => {
    setParsed((prev) => ({ ...prev, [key]: next }));
  };

  // ── Work / education / licenses / certifications array updater ────
  const updateEntry = <
    K extends "work_history" | "education" | "licenses" | "certifications"
  >(
    key: K,
    index: number,
    patch: Partial<ParsedResume[K][number]>
  ) => {
    setParsed((prev) => {
      const next = [...prev[key]];
      next[index] = { ...next[index], ...patch } as ParsedResume[K][number];
      return { ...prev, [key]: next as ParsedResume[K] };
    });
  };

  const removeEntry = <
    K extends "work_history" | "education" | "licenses" | "certifications"
  >(
    key: K,
    index: number
  ) => {
    setParsed((prev) => ({
      ...prev,
      [key]: prev[key].filter((_, i) => i !== index) as ParsedResume[K],
    }));
  };

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-foreground">
        Review and confirm
      </h1>
      <p className="mt-2 text-base text-muted-foreground">
        We&apos;ve filled in what we found. Edit anything that&apos;s off,
        then save to your profile.
      </p>

      {warnings.length > 0 && (
        <div className="mt-4 rounded-md border border-warning bg-warning-bg px-4 py-3 text-sm text-warning">
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      {parsed.flagged_redactions.length > 0 && (
        <div className="mt-4 flex items-start gap-3 rounded-md border border-heritage/30 bg-muted px-4 py-3 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-heritage" />
          <div>
            <p className="font-semibold text-foreground">
              We ignored {parsed.flagged_redactions.length} private item
              {parsed.flagged_redactions.length === 1 ? "" : "s"} on purpose
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {summarizeRedactions(parsed.flagged_redactions)}
            </p>
          </div>
        </div>
      )}

      {/* ── Basics ────────────────────────────────────────────────── */}
      <Section title="Basics">
        <FieldRow
          label="Full name"
          confidence={parsed.basics.full_name.confidence}
        >
          <TextInput
            value={parsed.basics.full_name.value ?? ""}
            onChange={(v) => updateBasic("full_name", v || null)}
          />
        </FieldRow>
        <FieldRow
          label="Headline"
          confidence={parsed.basics.headline.confidence}
          hint="A 1-line professional headline. Shown on your profile + applications."
        >
          <TextInput
            value={parsed.basics.headline.value ?? ""}
            onChange={(v) => updateBasic("headline", v || null)}
          />
        </FieldRow>
        <FieldRow
          label="Professional summary"
          confidence={parsed.basics.summary.confidence}
        >
          <TextArea
            rows={4}
            value={parsed.basics.summary.value ?? ""}
            onChange={(v) => updateBasic("summary", v || null)}
          />
        </FieldRow>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow
            label="Phone"
            confidence={parsed.basics.phone.confidence}
          >
            <TextInput
              value={parsed.basics.phone.value ?? ""}
              onChange={(v) => updateBasic("phone", v || null)}
            />
          </FieldRow>
          <FieldRow
            label="LinkedIn URL"
            confidence={parsed.basics.linkedin_url.confidence}
          >
            <TextInput
              value={parsed.basics.linkedin_url.value ?? ""}
              onChange={(v) => updateBasic("linkedin_url", v || null)}
            />
          </FieldRow>
          <FieldRow
            label="City"
            confidence={parsed.basics.current_location_city.confidence}
          >
            <TextInput
              value={parsed.basics.current_location_city.value ?? ""}
              onChange={(v) =>
                updateBasic("current_location_city", v || null)
              }
            />
          </FieldRow>
          <FieldRow
            label="State (2-letter)"
            confidence={parsed.basics.current_location_state.confidence}
          >
            <TextInput
              value={parsed.basics.current_location_state.value ?? ""}
              onChange={(v) =>
                updateBasic(
                  "current_location_state",
                  v ? v.toUpperCase().slice(0, 2) : null
                )
              }
              maxLength={2}
            />
          </FieldRow>
          <FieldRow
            label="Years of dental experience"
            confidence={parsed.basics.years_experience_dental.confidence}
          >
            <TextInput
              type="number"
              value={
                parsed.basics.years_experience_dental.value !== null
                  ? String(parsed.basics.years_experience_dental.value)
                  : ""
              }
              onChange={(v) =>
                updateBasic(
                  "years_experience_dental",
                  v === "" ? null : Number.parseInt(v, 10) || 0
                )
              }
            />
          </FieldRow>
        </div>
      </Section>

      {/* ── Work history ─────────────────────────────────────────── */}
      <Section title={`Work history (${parsed.work_history.length})`}>
        {parsed.work_history.length === 0 && (
          <EmptyHint text="No work history found in the resume." />
        )}
        {parsed.work_history.map((w, i) => (
          <EntryCard
            key={i}
            onRemove={() => removeEntry("work_history", i)}
            confidence={lowestConfidence([
              w.title.confidence,
              w.company_name.confidence,
              w.start_date.confidence,
            ])}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldRow label="Title" compact>
                <TextInput
                  value={w.title.value ?? ""}
                  onChange={(v) =>
                    updateEntry("work_history", i, {
                      title: { ...w.title, value: v || null },
                    })
                  }
                />
              </FieldRow>
              <FieldRow label="Company" compact>
                <TextInput
                  value={w.company_name.value ?? ""}
                  onChange={(v) =>
                    updateEntry("work_history", i, {
                      company_name: {
                        ...w.company_name,
                        value: v || null,
                      },
                    })
                  }
                />
              </FieldRow>
              <FieldRow label="Start (YYYY-MM)" compact>
                <TextInput
                  value={w.start_date.value ?? ""}
                  onChange={(v) =>
                    updateEntry("work_history", i, {
                      start_date: { ...w.start_date, value: v || null },
                    })
                  }
                  placeholder="2021-06"
                />
              </FieldRow>
              <FieldRow label="End (YYYY-MM)" compact>
                <TextInput
                  value={w.end_date.value ?? ""}
                  onChange={(v) =>
                    updateEntry("work_history", i, {
                      end_date: { ...w.end_date, value: v || null },
                      // Toggle is_current to false if user types an end date
                      is_current: {
                        ...w.is_current,
                        value: v ? false : w.is_current.value,
                      },
                    })
                  }
                  placeholder="2024-12"
                  disabled={w.is_current.value === true}
                />
              </FieldRow>
            </div>
            <label className="mt-3 inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={w.is_current.value === true}
                onChange={(e) =>
                  updateEntry("work_history", i, {
                    is_current: {
                      ...w.is_current,
                      value: e.target.checked,
                    },
                    end_date: e.target.checked
                      ? { ...w.end_date, value: null }
                      : w.end_date,
                  })
                }
                className="size-4 rounded border-border"
              />
              I currently work here
            </label>
            <FieldRow label="Description" compact>
              <TextArea
                rows={3}
                value={w.description.value ?? ""}
                onChange={(v) =>
                  updateEntry("work_history", i, {
                    description: { ...w.description, value: v || null },
                  })
                }
              />
            </FieldRow>
          </EntryCard>
        ))}
      </Section>

      {/* ── Education ────────────────────────────────────────────── */}
      <Section title={`Education (${parsed.education.length})`}>
        {parsed.education.length === 0 && (
          <EmptyHint text="No education entries found." />
        )}
        {parsed.education.map((e, i) => (
          <EntryCard
            key={i}
            onRemove={() => removeEntry("education", i)}
            confidence={lowestConfidence([
              e.school_name.confidence,
              e.degree.confidence,
            ])}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldRow label="School" compact>
                <TextInput
                  value={e.school_name.value ?? ""}
                  onChange={(v) =>
                    updateEntry("education", i, {
                      school_name: { ...e.school_name, value: v || null },
                    })
                  }
                />
              </FieldRow>
              <FieldRow label="Degree" compact>
                <TextInput
                  value={e.degree.value ?? ""}
                  onChange={(v) =>
                    updateEntry("education", i, {
                      degree: { ...e.degree, value: v || null },
                    })
                  }
                />
              </FieldRow>
              <FieldRow label="Field" compact>
                <TextInput
                  value={e.field_of_study.value ?? ""}
                  onChange={(v) =>
                    updateEntry("education", i, {
                      field_of_study: {
                        ...e.field_of_study,
                        value: v || null,
                      },
                    })
                  }
                />
              </FieldRow>
              <div className="grid grid-cols-2 gap-3">
                <FieldRow label="Start year" compact>
                  <TextInput
                    type="number"
                    value={
                      e.start_year.value !== null
                        ? String(e.start_year.value)
                        : ""
                    }
                    onChange={(v) =>
                      updateEntry("education", i, {
                        start_year: {
                          ...e.start_year,
                          value: v ? Number.parseInt(v, 10) : null,
                        },
                      })
                    }
                  />
                </FieldRow>
                <FieldRow label="End year" compact>
                  <TextInput
                    type="number"
                    value={
                      e.end_year.value !== null
                        ? String(e.end_year.value)
                        : ""
                    }
                    onChange={(v) =>
                      updateEntry("education", i, {
                        end_year: {
                          ...e.end_year,
                          value: v ? Number.parseInt(v, 10) : null,
                        },
                      })
                    }
                  />
                </FieldRow>
              </div>
            </div>
          </EntryCard>
        ))}
      </Section>

      {/* ── Licenses ─────────────────────────────────────────────── */}
      <Section title={`Licenses (${parsed.licenses.length})`}>
        {parsed.licenses.length === 0 && (
          <EmptyHint text="No licenses found." />
        )}
        <p className="-mt-2 mb-3 text-xs text-muted-foreground">
          License numbers stay private by default. You can opt to display
          them in your privacy settings later.
        </p>
        {parsed.licenses.map((l, i) => (
          <EntryCard
            key={i}
            onRemove={() => removeEntry("licenses", i)}
            confidence={lowestConfidence([
              l.license_type.confidence,
              l.state.confidence,
            ])}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldRow label="License type" compact>
                <TextInput
                  value={l.license_type.value ?? ""}
                  onChange={(v) =>
                    updateEntry("licenses", i, {
                      license_type: {
                        ...l.license_type,
                        value: v || null,
                      },
                    })
                  }
                  placeholder="DDS, RDH, CDA…"
                />
              </FieldRow>
              <FieldRow label="State" compact>
                <TextInput
                  value={l.state.value ?? ""}
                  onChange={(v) =>
                    updateEntry("licenses", i, {
                      state: {
                        ...l.state,
                        value: v ? v.toUpperCase().slice(0, 2) : null,
                      },
                    })
                  }
                  maxLength={2}
                  placeholder="KS"
                />
              </FieldRow>
              <FieldRow label="License number (private)" compact>
                <TextInput
                  value={l.license_number.value ?? ""}
                  onChange={(v) =>
                    updateEntry("licenses", i, {
                      license_number: {
                        ...l.license_number,
                        value: v || null,
                      },
                    })
                  }
                />
              </FieldRow>
              <FieldRow label="Expires" compact>
                <TextInput
                  value={l.expires_date.value ?? ""}
                  onChange={(v) =>
                    updateEntry("licenses", i, {
                      expires_date: {
                        ...l.expires_date,
                        value: v || null,
                      },
                    })
                  }
                  placeholder="2027-12-31"
                />
              </FieldRow>
            </div>
          </EntryCard>
        ))}
      </Section>

      {/* ── Certifications ───────────────────────────────────────── */}
      <Section
        title={`Certifications (${parsed.certifications.length})`}
      >
        {parsed.certifications.length === 0 && (
          <EmptyHint text="No certifications found." />
        )}
        {parsed.certifications.map((c, i) => (
          <EntryCard
            key={i}
            onRemove={() => removeEntry("certifications", i)}
            confidence={c.kind.confidence}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldRow label="Type" compact>
                <TextInput
                  value={c.kind.value ?? ""}
                  onChange={(v) =>
                    updateEntry("certifications", i, {
                      kind: { ...c.kind, value: v || null },
                    })
                  }
                  placeholder="cpr_bls, anesthesia_local…"
                />
              </FieldRow>
              <FieldRow label="Level" compact>
                <TextInput
                  value={c.level.value ?? ""}
                  onChange={(v) =>
                    updateEntry("certifications", i, {
                      level: { ...c.level, value: v || null },
                    })
                  }
                />
              </FieldRow>
              <FieldRow label="Expires" compact>
                <TextInput
                  value={c.expires_date.value ?? ""}
                  onChange={(v) =>
                    updateEntry("certifications", i, {
                      expires_date: {
                        ...c.expires_date,
                        value: v || null,
                      },
                    })
                  }
                  placeholder="2027-06-30"
                />
              </FieldRow>
            </div>
          </EntryCard>
        ))}
      </Section>

      {/* ── Chip arrays ──────────────────────────────────────────── */}
      <Section title="Skills">
        <ChipArrayEditor
          values={parsed.skills}
          onChange={(next) => updateStringArray("skills", next)}
          placeholder="Add a skill"
        />
      </Section>
      <Section title="Languages">
        <ChipArrayInput
          label=""
          values={parsed.languages}
          onChange={(next) => updateStringArray("languages", next)}
          options={COMMON_LANGUAGES}
          labelFor={(v) =>
            COMMON_LANGUAGES.find((o) => o.value === v)?.label ?? v
          }
          restrictToOptions
          placeholder="Search languages…"
          helper="Pick from the list so employers' filters match you."
        />
      </Section>
      <Section title="Desired roles">
        <ChipArrayInput
          label=""
          values={parsed.desired_roles}
          onChange={(next) => updateStringArray("desired_roles", next)}
          options={ROLE_CATEGORIES}
          labelFor={(v) =>
            ROLE_CATEGORIES.find((o) => o.value === v)?.label ?? v
          }
          restrictToOptions
          placeholder="Search roles…"
          helper="Pick from the list so employers' searches match you."
        />
      </Section>
      <Section title="Specialties">
        <ChipArrayInput
          label=""
          values={parsed.desired_specialty}
          onChange={(next) => updateStringArray("desired_specialty", next)}
          options={SPECIALTIES}
          labelFor={(v) => SPECIALTIES.find((o) => o.value === v)?.label ?? v}
          restrictToOptions
          placeholder="Search specialties…"
        />
      </Section>

      {/* ── Sticky save bar ──────────────────────────────────────── */}
      <div className="sticky bottom-4 mt-10 flex items-center justify-between rounded-lg border border-border bg-card/95 px-5 py-4 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(parsed)}
          disabled={isSaving}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
        >
          {isSaving ? (
            <>
              <Sparkles className="size-4 animate-pulse" />
              Saving…
            </>
          ) : (
            <>
              <Save className="size-4" />
              Save to my profile
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 rounded-lg border border-border bg-card p-6">
      <h2 className="font-display text-xl font-bold text-foreground">
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function FieldRow({
  label,
  confidence,
  hint,
  compact,
  children,
}: {
  label: string;
  confidence?: "high" | "medium" | "low";
  hint?: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={compact ? "" : "space-y-1.5"}>
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium text-foreground">{label}</label>
        {confidence && <ConfidencePill confidence={confidence} />}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

function TextInput(props: {
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "number";
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <input
      type={props.type ?? "text"}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      placeholder={props.placeholder}
      maxLength={props.maxLength}
      disabled={props.disabled}
      className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm focus:border-heritage focus:outline-none focus:ring-1 focus:ring-heritage disabled:bg-muted disabled:text-muted-foreground"
    />
  );
}

function TextArea(props: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <textarea
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      rows={props.rows ?? 3}
      className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm focus:border-heritage focus:outline-none focus:ring-1 focus:ring-heritage"
    />
  );
}

function EntryCard({
  children,
  onRemove,
  confidence,
}: {
  children: React.ReactNode;
  onRemove: () => void;
  confidence?: "high" | "medium" | "low";
}) {
  return (
    <div className="rounded-md border border-border bg-muted p-4">
      <div className="mb-3 flex items-center justify-between">
        {confidence ? (
          <ConfidencePill confidence={confidence} />
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-danger"
          aria-label="Remove entry"
        >
          <Trash2 className="size-3.5" />
          Remove
        </button>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-sm italic text-muted-foreground">{text}</p>;
}

function ChipArrayEditor(props: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (props.values.includes(v)) {
      setDraft("");
      return;
    }
    props.onChange([...props.values, v]);
    setDraft("");
  };
  const remove = (idx: number) => {
    props.onChange(props.values.filter((_, i) => i !== idx));
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {props.values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center gap-1 rounded-full bg-heritage/10 px-3 py-1 text-sm text-foreground"
          >
            {v}
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-heritage hover:text-foreground"
              aria-label={`Remove ${v}`}
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
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
          placeholder={props.placeholder}
          className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm focus:border-heritage focus:outline-none focus:ring-1 focus:ring-heritage"
        />
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          <Plus className="size-4" />
          Add
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function lowestConfidence(
  cs: ("high" | "medium" | "low")[]
): "high" | "medium" | "low" {
  if (cs.includes("low")) return "low";
  if (cs.includes("medium")) return "medium";
  return "high";
}

function summarizeRedactions(
  flags: ParsedResume["flagged_redactions"]
): string {
  const labels: Record<string, string> = {
    ssn: "Social Security number",
    dob: "date of birth",
    dea: "DEA registration number",
    other: "other identifier",
  };
  const kinds = flags.map((f) => labels[f.kind] ?? "identifier");
  const unique = Array.from(new Set(kinds));
  return `Skipped: ${unique.join(", ")}. DSO Hire never collects these fields.`;
}
