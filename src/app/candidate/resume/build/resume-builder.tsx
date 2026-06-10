"use client";

/**
 * #87b.2 (+ all-inclusive upgrade) — guided résumé builder with live preview.
 *
 * Builds a COMPLETE résumé from zero: Contact, Summary, Experience (with dates
 * + add/remove jobs), Education (add/remove), Licenses & Certifications
 * (dental-critical, add/remove), and Skills — all with a live preview and a
 * template picker. Writes straight to the canonical profile via the existing
 * section-actions (renderer, not a 4th silo).
 *
 * Persistence model: single-row sections (identity, skills) save per-step.
 * LIST sections (work/education/licenses/certs) reconcile on Finish —
 * delete-diff (originals no longer present) + upsert-all (new entries carry a
 * `tmp_` id → insert; real ids → update). Finish runs once, so no duplicate
 * inserts and no need to change the shared actions.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Plus, Trash2 } from "lucide-react";
import { WizardShell, type WizardStepMeta } from "@/components/wizard/wizard-shell";
import { ResumeDocument } from "@/components/resume/resume-document";
import type {
  ResumeData,
  ResumeEducation,
  ResumeLicense,
  ResumeCert,
} from "@/lib/resume/resume-format";
import {
  upsertIdentity,
  upsertWorkHistoryEntry,
  deleteWorkHistoryEntry,
  upsertEducationEntry,
  deleteEducationEntry,
  upsertLicenseEntry,
  deleteLicenseEntry,
  upsertCertificationEntry,
  deleteCertificationEntry,
  upsertSkillsLanguages,
} from "@/app/candidate/profile/section-actions";
import {
  LICENSE_TYPES,
  CERTIFICATION_KINDS,
} from "@/lib/candidate/canonical-lists";
import {
  RESUME_TEMPLATE_LIST,
  type ResumeTemplateId,
} from "@/lib/resume/resume-templates";
import { saveResumePdf, setResumeTemplate } from "../actions";

type WorkEntry = {
  id: string;
  title: string;
  company_name: string;
  is_dso: boolean;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
  pms_systems_used: string[];
  procedures_performed: string[];
  auto_blocklisted: boolean;
};

export type BuilderData = {
  identity: {
    first_name: string;
    last_name: string;
    salutation: string | null;
    pronouns: string | null;
    headline: string | null;
    summary: string | null;
    phone: string | null;
    city: string | null;
    state: string | null;
    years_experience_dental: number | null;
    linkedin_url: string | null;
    email: string | null;
  };
  work: WorkEntry[];
  education: ResumeEducation[];
  licenses: ResumeLicense[];
  certifications: ResumeCert[];
  skills: string[];
  languages: string[];
  pms_systems: string[];
  desiredRoles: string[];
  specialties: string[];
  email: string | null;
};

const STEPS: WizardStepMeta[] = [
  { id: "contact", label: "Contact" },
  { id: "summary", label: "Summary" },
  { id: "experience", label: "Experience" },
  { id: "education", label: "Education" },
  { id: "credentials", label: "Credentials" },
  { id: "skills", label: "Skills" },
  { id: "finish", label: "Finish" },
];

const inputCls =
  "w-full rounded-md border border-[var(--rule)] bg-white px-3 py-2 text-[14px] text-ink focus:border-heritage-deep focus:outline-none";
const labelCls =
  "block text-[12px] font-bold uppercase tracking-[1px] text-slate-meta mb-1.5";

let _tmp = 0;
const tmpId = () => `tmp_${Date.now()}_${_tmp++}`;
const isTmp = (id: string) => id.startsWith("tmp_");
const toMonth = (d: string | null) => (d ? d.slice(0, 7) : "");

export function ResumeBuilder({
  data,
  returnTo = null,
  initialTemplate = "classic",
}: {
  data: BuilderData;
  returnTo?: string | null;
  initialTemplate?: ResumeTemplateId;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [identity, setIdentity] = useState(data.identity);
  const [work, setWork] = useState<WorkEntry[]>(data.work);
  const [education, setEducation] = useState<ResumeEducation[]>(data.education);
  const [licenses, setLicenses] = useState<ResumeLicense[]>(data.licenses);
  const [certs, setCerts] = useState<ResumeCert[]>(data.certifications);
  const [skillsText, setSkillsText] = useState(data.skills.join(", "));
  const [template, setTemplate] = useState<ResumeTemplateId>(initialTemplate);

  const skills = useMemo(
    () => skillsText.split(",").map((s) => s.trim()).filter(Boolean),
    [skillsText]
  );

  function setIdentityField<K extends keyof BuilderData["identity"]>(
    key: K,
    value: BuilderData["identity"][K]
  ) {
    setIdentity((p) => ({ ...p, [key]: value }));
  }

  // ── live preview (filters out blank in-progress rows) ───────────
  const preview: ResumeData = useMemo(
    () => ({
      name: `${identity.first_name} ${identity.last_name}`.trim(),
      headline: identity.headline,
      summary: identity.summary,
      phone: identity.phone,
      email: identity.email,
      city: identity.city,
      state: identity.state,
      linkedinUrl: identity.linkedin_url,
      yearsExperience: identity.years_experience_dental,
      desiredRoles: data.desiredRoles,
      specialties: data.specialties,
      skills,
      languages: data.languages,
      pmsSystems: data.pms_systems,
      work: work
        .filter((w) => w.title.trim() || w.company_name.trim())
        .map((w) => ({
          id: w.id,
          title: w.title,
          company: w.company_name,
          isDso: w.is_dso,
          start: w.start_date,
          end: w.end_date,
          isCurrent: w.is_current,
          description: w.description,
        })),
      education: education.filter((e) => e.school.trim()),
      licenses: licenses.filter((l) => l.type.trim()),
      certifications: certs.filter((c) => c.kind.trim()),
    }),
    [identity, work, education, licenses, certs, skills, data]
  );

  // ── per-step saves (single-row sections) ────────────────────────
  async function saveIdentity(): Promise<boolean> {
    if (!identity.first_name.trim() || !identity.last_name.trim()) {
      setError("Please add your first and last name.");
      return false;
    }
    const res = await upsertIdentity({
      first_name: identity.first_name,
      last_name: identity.last_name,
      salutation: identity.salutation,
      pronouns: identity.pronouns,
      headline: identity.headline,
      summary: identity.summary,
      phone: identity.phone,
      current_location_city: identity.city,
      current_location_state: identity.state,
      years_experience_dental: identity.years_experience_dental,
      linkedin_url: identity.linkedin_url,
    });
    if (!res.ok) return setError(res.error), false;
    return true;
  }

  async function saveSkills(): Promise<boolean> {
    const res = await upsertSkillsLanguages({
      skills,
      languages: data.languages,
      pms_systems: data.pms_systems,
    });
    if (!res.ok) return setError(res.error), false;
    return true;
  }

  // ── finish-time list reconciliation (delete-diff + upsert-all) ──
  async function reconcileLists(): Promise<boolean> {
    const validWork = work.filter(
      (w) => w.title.trim() && w.company_name.trim()
    );
    for (const w of validWork) {
      const res = await upsertWorkHistoryEntry({
        id: isTmp(w.id) ? undefined : w.id,
        title: w.title,
        company_name: w.company_name,
        is_dso: w.is_dso,
        start_date: w.start_date,
        end_date: w.end_date,
        is_current: w.is_current,
        description: w.description,
        pms_systems_used: w.pms_systems_used,
        procedures_performed: w.procedures_performed,
        auto_blocklisted: w.auto_blocklisted,
      });
      if (!res.ok) return setError(res.error), false;
    }
    const keepWork = new Set(validWork.filter((w) => !isTmp(w.id)).map((w) => w.id));
    for (const o of data.work) {
      if (!keepWork.has(o.id)) {
        const res = await deleteWorkHistoryEntry(o.id);
        if (!res.ok) return setError(res.error), false;
      }
    }

    const validEdu = education.filter((e) => e.school.trim());
    for (const e of validEdu) {
      const res = await upsertEducationEntry({
        id: isTmp(e.id) ? undefined : e.id,
        school_name: e.school,
        degree: e.degree,
        field_of_study: e.field,
        start_year: e.startYear,
        end_year: e.endYear,
        description: e.description,
      });
      if (!res.ok) return setError(res.error), false;
    }
    const keepEdu = new Set(validEdu.filter((e) => !isTmp(e.id)).map((e) => e.id));
    for (const o of data.education) {
      if (!keepEdu.has(o.id)) {
        const res = await deleteEducationEntry(o.id);
        if (!res.ok) return setError(res.error), false;
      }
    }

    const validLic = licenses.filter((l) => l.type.trim());
    for (const l of validLic) {
      const res = await upsertLicenseEntry({
        id: isTmp(l.id) ? undefined : l.id,
        license_type: l.type,
        license_number: l.number,
        state: l.state,
        issued_date: null,
        expires_date: l.expires,
        display_number: l.displayNumber,
      });
      if (!res.ok) return setError(res.error), false;
    }
    const keepLic = new Set(validLic.filter((l) => !isTmp(l.id)).map((l) => l.id));
    for (const o of data.licenses) {
      if (!keepLic.has(o.id)) {
        const res = await deleteLicenseEntry(o.id);
        if (!res.ok) return setError(res.error), false;
      }
    }

    const validCert = certs.filter((c) => c.kind.trim());
    for (const c of validCert) {
      const res = await upsertCertificationEntry({
        id: isTmp(c.id) ? undefined : c.id,
        kind: c.kind,
        level: c.level,
        issued_date: null,
        expires_date: c.expires,
      });
      if (!res.ok) return setError(res.error), false;
    }
    const keepCert = new Set(validCert.filter((c) => !isTmp(c.id)).map((c) => c.id));
    for (const o of data.certifications) {
      if (!keepCert.has(o.id)) {
        const res = await deleteCertificationEntry(o.id);
        if (!res.ok) return setError(res.error), false;
      }
    }
    return true;
  }

  function handleNext() {
    setError(null);
    const id = STEPS[index].id;
    startTransition(async () => {
      if (id === "contact" || id === "summary") {
        if (!(await saveIdentity())) return;
      } else if (id === "skills") {
        if (!(await saveSkills())) return;
      }
      if (id !== "finish") {
        setIndex((i) => i + 1);
        return;
      }
      // Finish: persist identity (in case they jumped), reconcile lists,
      // save template + PDF, then return.
      if (!(await saveIdentity())) return;
      if (!(await reconcileLists())) return;
      await setResumeTemplate(template);
      const res = await saveResumePdf();
      if (!res.ok) return setError(res.error ?? "Couldn't save your résumé PDF.");
      router.push(returnTo ?? "/candidate/resume");
    });
  }

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-8 lg:px-8">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        <WizardShell
          steps={STEPS}
          currentIndex={index}
          progressLabel="built"
          meterIcon={<FileText className="h-4 w-4" />}
          eyebrow={
            <span className="text-[10px] font-bold uppercase tracking-[2.5px] text-heritage-deep">
              Résumé builder
            </span>
          }
          maxWidthClass="max-w-none"
          onBack={() => {
            setError(null);
            setIndex((i) => Math.max(0, i - 1));
          }}
          onNext={handleNext}
          busy={pending}
          error={error}
          nextLabel={index === STEPS.length - 1 ? "Save & view résumé" : "Continue"}
          canJumpTo={(i) => i <= index}
          onJump={(i) => {
            setError(null);
            setIndex(i);
          }}
        >
          {STEPS[index].id === "contact" && (
            <div className="space-y-5">
              <Title>Let&apos;s start with the basics.</Title>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="First name">
                  <input
                    className={inputCls}
                    value={identity.first_name}
                    onChange={(e) => setIdentityField("first_name", e.target.value)}
                  />
                </Field>
                <Field label="Last name">
                  <input
                    className={inputCls}
                    value={identity.last_name}
                    onChange={(e) => setIdentityField("last_name", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Headline">
                <input
                  className={inputCls}
                  placeholder="e.g. Lead Dental Hygienist · 8 years"
                  value={identity.headline ?? ""}
                  onChange={(e) => setIdentityField("headline", e.target.value || null)}
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Phone">
                  <input
                    className={inputCls}
                    value={identity.phone ?? ""}
                    onChange={(e) => setIdentityField("phone", e.target.value || null)}
                  />
                </Field>
                <Field label="City">
                  <input
                    className={inputCls}
                    value={identity.city ?? ""}
                    onChange={(e) => setIdentityField("city", e.target.value || null)}
                  />
                </Field>
                <Field label="State">
                  <input
                    className={inputCls}
                    maxLength={2}
                    value={identity.state ?? ""}
                    onChange={(e) => setIdentityField("state", e.target.value || null)}
                  />
                </Field>
              </div>
              <Field label="LinkedIn URL">
                <input
                  className={inputCls}
                  value={identity.linkedin_url ?? ""}
                  onChange={(e) => setIdentityField("linkedin_url", e.target.value || null)}
                />
              </Field>
            </div>
          )}

          {STEPS[index].id === "summary" && (
            <div className="space-y-4">
              <Title>Your professional summary.</Title>
              <p className="text-[14px] text-slate-body">
                Two to three sentences on who you are and what you do well.
              </p>
              <textarea
                className={inputCls + " min-h-[160px] leading-relaxed"}
                placeholder="Experienced dental professional with…"
                value={identity.summary ?? ""}
                onChange={(e) => setIdentityField("summary", e.target.value || null)}
              />
            </div>
          )}

          {STEPS[index].id === "experience" && (
            <div className="space-y-5">
              <Title>Your experience.</Title>
              {work.map((w) => (
                <div key={w.id} className="rounded-md border border-[var(--rule)] bg-white p-4">
                  <div className="mb-3 flex justify-end">
                    <RemoveBtn onClick={() => setWork((p) => p.filter((x) => x.id !== w.id))} />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Title">
                      <input
                        className={inputCls}
                        value={w.title}
                        onChange={(e) =>
                          setWork((p) => p.map((x) => (x.id === w.id ? { ...x, title: e.target.value } : x)))
                        }
                      />
                    </Field>
                    <Field label="Company">
                      <input
                        className={inputCls}
                        value={w.company_name}
                        onChange={(e) =>
                          setWork((p) => p.map((x) => (x.id === w.id ? { ...x, company_name: e.target.value } : x)))
                        }
                      />
                    </Field>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Start">
                      <input
                        type="month"
                        className={inputCls}
                        value={toMonth(w.start_date)}
                        onChange={(e) =>
                          setWork((p) => p.map((x) => (x.id === w.id ? { ...x, start_date: e.target.value || null } : x)))
                        }
                      />
                    </Field>
                    <Field label="End">
                      <input
                        type="month"
                        className={inputCls + (w.is_current ? " opacity-50" : "")}
                        disabled={w.is_current}
                        value={toMonth(w.end_date)}
                        onChange={(e) =>
                          setWork((p) => p.map((x) => (x.id === w.id ? { ...x, end_date: e.target.value || null } : x)))
                        }
                      />
                      <label className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] text-slate-body">
                        <input
                          type="checkbox"
                          checked={w.is_current}
                          onChange={(e) =>
                            setWork((p) =>
                              p.map((x) =>
                                x.id === w.id
                                  ? { ...x, is_current: e.target.checked, end_date: e.target.checked ? null : x.end_date }
                                  : x
                              )
                            )
                          }
                        />
                        I currently work here
                      </label>
                    </Field>
                  </div>
                  <div className="mt-3">
                    <label className={labelCls}>What you did</label>
                    <textarea
                      className={inputCls + " min-h-[100px] leading-relaxed"}
                      placeholder="Key responsibilities and wins…"
                      value={w.description ?? ""}
                      onChange={(e) =>
                        setWork((p) => p.map((x) => (x.id === w.id ? { ...x, description: e.target.value || null } : x)))
                      }
                    />
                  </div>
                </div>
              ))}
              <AddBtn
                label="Add a job"
                onClick={() =>
                  setWork((p) => [
                    ...p,
                    {
                      id: tmpId(),
                      title: "",
                      company_name: "",
                      is_dso: false,
                      start_date: null,
                      end_date: null,
                      is_current: false,
                      description: null,
                      pms_systems_used: [],
                      procedures_performed: [],
                      auto_blocklisted: false,
                    },
                  ])
                }
              />
            </div>
          )}

          {STEPS[index].id === "education" && (
            <div className="space-y-5">
              <Title>Your education.</Title>
              {education.map((e) => (
                <div key={e.id} className="rounded-md border border-[var(--rule)] bg-white p-4">
                  <div className="mb-3 flex justify-end">
                    <RemoveBtn onClick={() => setEducation((p) => p.filter((x) => x.id !== e.id))} />
                  </div>
                  <Field label="School">
                    <input
                      className={inputCls}
                      value={e.school}
                      onChange={(ev) =>
                        setEducation((p) => p.map((x) => (x.id === e.id ? { ...x, school: ev.target.value } : x)))
                      }
                    />
                  </Field>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Degree">
                      <input
                        className={inputCls}
                        placeholder="e.g. Associate of Applied Science"
                        value={e.degree ?? ""}
                        onChange={(ev) =>
                          setEducation((p) => p.map((x) => (x.id === e.id ? { ...x, degree: ev.target.value || null } : x)))
                        }
                      />
                    </Field>
                    <Field label="Field of study">
                      <input
                        className={inputCls}
                        placeholder="e.g. Dental Hygiene"
                        value={e.field ?? ""}
                        onChange={(ev) =>
                          setEducation((p) => p.map((x) => (x.id === e.id ? { ...x, field: ev.target.value || null } : x)))
                        }
                      />
                    </Field>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Start year">
                      <input
                        type="number"
                        className={inputCls}
                        value={e.startYear ?? ""}
                        onChange={(ev) =>
                          setEducation((p) =>
                            p.map((x) => (x.id === e.id ? { ...x, startYear: ev.target.value ? Number(ev.target.value) : null } : x))
                          )
                        }
                      />
                    </Field>
                    <Field label="End year">
                      <input
                        type="number"
                        className={inputCls}
                        value={e.endYear ?? ""}
                        onChange={(ev) =>
                          setEducation((p) =>
                            p.map((x) => (x.id === e.id ? { ...x, endYear: ev.target.value ? Number(ev.target.value) : null } : x))
                          )
                        }
                      />
                    </Field>
                  </div>
                </div>
              ))}
              <AddBtn
                label="Add education"
                onClick={() =>
                  setEducation((p) => [
                    ...p,
                    { id: tmpId(), school: "", degree: null, field: null, startYear: null, endYear: null, description: null },
                  ])
                }
              />
            </div>
          )}

          {STEPS[index].id === "credentials" && (
            <div className="space-y-6">
              <Title>Licenses &amp; certifications.</Title>

              <div className="space-y-4">
                <h3 className="text-[13px] font-bold uppercase tracking-[1px] text-ink">Licenses</h3>
                {licenses.map((l) => (
                  <div key={l.id} className="rounded-md border border-[var(--rule)] bg-white p-4">
                    <div className="mb-3 flex justify-end">
                      <RemoveBtn onClick={() => setLicenses((p) => p.filter((x) => x.id !== l.id))} />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <Field label="Type">
                        <select
                          className={inputCls}
                          value={l.type}
                          onChange={(e) =>
                            setLicenses((p) => p.map((x) => (x.id === l.id ? { ...x, type: e.target.value } : x)))
                          }
                        >
                          <option value="">Select…</option>
                          {LICENSE_TYPES.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="State">
                        <input
                          className={inputCls}
                          maxLength={2}
                          value={l.state ?? ""}
                          onChange={(e) =>
                            setLicenses((p) => p.map((x) => (x.id === l.id ? { ...x, state: e.target.value || null } : x)))
                          }
                        />
                      </Field>
                      <Field label="Expires">
                        <input
                          type="month"
                          className={inputCls}
                          value={toMonth(l.expires)}
                          onChange={(e) =>
                            setLicenses((p) => p.map((x) => (x.id === l.id ? { ...x, expires: e.target.value || null } : x)))
                          }
                        />
                      </Field>
                    </div>
                  </div>
                ))}
                <AddBtn
                  label="Add license"
                  onClick={() =>
                    setLicenses((p) => [
                      ...p,
                      { id: tmpId(), type: "", state: null, number: null, displayNumber: false, expires: null },
                    ])
                  }
                />
              </div>

              <div className="space-y-4">
                <h3 className="text-[13px] font-bold uppercase tracking-[1px] text-ink">Certifications</h3>
                {certs.map((c) => (
                  <div key={c.id} className="rounded-md border border-[var(--rule)] bg-white p-4">
                    <div className="mb-3 flex justify-end">
                      <RemoveBtn onClick={() => setCerts((p) => p.filter((x) => x.id !== c.id))} />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Type">
                        <select
                          className={inputCls}
                          value={c.kind}
                          onChange={(e) =>
                            setCerts((p) => p.map((x) => (x.id === c.id ? { ...x, kind: e.target.value } : x)))
                          }
                        >
                          <option value="">Select…</option>
                          {CERTIFICATION_KINDS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Expires (optional)">
                        <input
                          type="month"
                          className={inputCls}
                          value={toMonth(c.expires)}
                          onChange={(e) =>
                            setCerts((p) => p.map((x) => (x.id === c.id ? { ...x, expires: e.target.value || null } : x)))
                          }
                        />
                      </Field>
                    </div>
                  </div>
                ))}
                <AddBtn
                  label="Add certification"
                  onClick={() =>
                    setCerts((p) => [...p, { id: tmpId(), kind: "", level: null, expires: null }])
                  }
                />
              </div>
            </div>
          )}

          {STEPS[index].id === "skills" && (
            <div className="space-y-4">
              <Title>Your skills.</Title>
              <p className="text-[14px] text-slate-body">
                Comma-separated. These render as a clean list on your résumé.
              </p>
              <textarea
                className={inputCls + " min-h-[120px] leading-relaxed"}
                placeholder="Invisalign, scaling & root planing, Dentrix, patient education…"
                value={skillsText}
                onChange={(e) => setSkillsText(e.target.value)}
              />
            </div>
          )}

          {STEPS[index].id === "finish" && (
            <div className="space-y-4">
              <Title>You&apos;re ready.</Title>
              <p className="text-[14px] text-slate-body">
                Save your résumé as a PDF to your profile — it&apos;ll be the file
                attached when you apply, and you can download it any time. Your
                live preview is on the right.
              </p>
            </div>
          )}
        </WizardShell>

        {/* Live preview */}
        <div className="lg:sticky lg:top-8 lg:self-start">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[2.5px] text-slate-meta">
            Live preview
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {RESUME_TEMPLATE_LIST.map((tpl) => {
              const active = tpl.id === template;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => setTemplate(tpl.id)}
                  title={tpl.blurb}
                  className={
                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors " +
                    (active
                      ? "border-heritage-deep bg-heritage-deep text-ivory"
                      : "border-[var(--rule)] bg-white text-slate-body hover:border-heritage-deep")
                  }
                >
                  {tpl.name}
                </button>
              );
            })}
          </div>
          <div className="max-h-[80vh] overflow-auto rounded-md border border-[var(--rule)] bg-white shadow-sm">
            <ResumeDocument data={preview} template={template} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <h1 className="text-xl font-bold tracking-[-0.4px] text-ink sm:text-2xl">{children}</h1>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-[var(--rule)] px-3 py-2 text-[13px] font-semibold text-heritage-deep hover:border-heritage-deep transition-colors"
    >
      <Plus className="h-4 w-4" />
      {label}
    </button>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-meta hover:text-red-600 transition-colors"
    >
      <Trash2 className="h-3.5 w-3.5" />
      Remove
    </button>
  );
}
