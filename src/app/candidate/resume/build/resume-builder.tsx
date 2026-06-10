"use client";

/**
 * #87b.2 — guided résumé builder with live preview.
 *
 * Reuses the shared WizardShell + the existing profile section-actions, so it
 * writes straight to the canonical profile (no 4th silo). Saves carry the FULL
 * current values for each row (e.g. a work entry's pms_systems_used) so the
 * upserts never null fields the builder doesn't surface.
 *
 * Scope: edits Contact, Summary, Experience prose, and Skills — the résumé
 * content that matters most — with a live preview. Adding/removing work,
 * education, license, and cert ENTRIES stays in the profile editor (linked);
 * those show read-only in the preview here.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText } from "lucide-react";
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
  upsertSkillsLanguages,
} from "@/app/candidate/profile/section-actions";
import { saveResumePdf } from "../actions";

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
  { id: "skills", label: "Skills" },
  { id: "finish", label: "Finish" },
];

const inputCls =
  "w-full rounded-md border border-[var(--rule)] bg-white px-3 py-2 text-[14px] text-ink focus:border-heritage-deep focus:outline-none";
const labelCls = "block text-[12px] font-bold uppercase tracking-[1px] text-slate-meta mb-1.5";

export function ResumeBuilder({ data }: { data: BuilderData }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ── editable state ──────────────────────────────────────────────
  const [identity, setIdentity] = useState(data.identity);
  const [work, setWork] = useState<WorkEntry[]>(data.work);
  const [skillsText, setSkillsText] = useState(data.skills.join(", "));

  const skills = useMemo(
    () =>
      skillsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [skillsText]
  );

  function setIdentityField<K extends keyof BuilderData["identity"]>(
    key: K,
    value: BuilderData["identity"][K]
  ) {
    setIdentity((prev) => ({ ...prev, [key]: value }));
  }

  function setWorkDescription(id: string, patch: Partial<WorkEntry>) {
    setWork((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  }

  // ── live preview data (derived from current state) ──────────────
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
      work: work.map((w) => ({
        id: w.id,
        title: w.title,
        company: w.company_name,
        isDso: w.is_dso,
        start: w.start_date,
        end: w.end_date,
        isCurrent: w.is_current,
        description: w.description,
      })),
      education: data.education,
      licenses: data.licenses,
      certifications: data.certifications,
    }),
    [identity, work, skills, data]
  );

  // ── saves (full payloads → no nulling) ──────────────────────────
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
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    return true;
  }

  async function saveWork(): Promise<boolean> {
    for (const w of work) {
      const res = await upsertWorkHistoryEntry({
        id: w.id,
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
      if (!res.ok) {
        setError(res.error);
        return false;
      }
    }
    return true;
  }

  async function saveSkills(): Promise<boolean> {
    const res = await upsertSkillsLanguages({
      skills,
      languages: data.languages,
      pms_systems: data.pms_systems,
    });
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    return true;
  }

  function handleNext() {
    setError(null);
    startTransition(async () => {
      let ok = true;
      if (index === 0 || index === 1) ok = await saveIdentity();
      else if (index === 2) ok = await saveWork();
      else if (index === 3) ok = await saveSkills();

      if (!ok) return;

      if (index < STEPS.length - 1) {
        setIndex((i) => i + 1);
        return;
      }
      // Finish: generate + save the PDF, then view it.
      const res = await saveResumePdf();
      if (!res.ok) {
        setError(res.error ?? "Couldn't save your résumé PDF.");
        return;
      }
      router.push("/candidate/resume");
    });
  }

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-8 lg:px-8">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        {/* Wizard */}
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
          {index === 0 && (
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

          {index === 1 && (
            <div className="space-y-4">
              <Title>Your professional summary.</Title>
              <p className="text-[14px] text-slate-body">
                Two to three sentences on who you are and what you do well. This
                sits at the top of your résumé.
              </p>
              <textarea
                className={inputCls + " min-h-[160px] leading-relaxed"}
                placeholder="Experienced dental professional with…"
                value={identity.summary ?? ""}
                onChange={(e) => setIdentityField("summary", e.target.value || null)}
              />
            </div>
          )}

          {index === 2 && (
            <div className="space-y-6">
              <Title>Your experience.</Title>
              {work.length === 0 ? (
                <p className="text-[14px] text-slate-body">
                  No work history yet.{" "}
                  <Link href="/candidate/profile" className="font-bold text-heritage-deep underline">
                    Add jobs in your profile
                  </Link>{" "}
                  and they&apos;ll appear here.
                </p>
              ) : (
                work.map((w) => (
                  <div key={w.id} className="rounded-md border border-[var(--rule)] bg-white p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Title">
                        <input
                          className={inputCls}
                          value={w.title}
                          onChange={(e) => setWorkDescription(w.id, { title: e.target.value })}
                        />
                      </Field>
                      <Field label="Company">
                        <input
                          className={inputCls}
                          value={w.company_name}
                          onChange={(e) =>
                            setWorkDescription(w.id, { company_name: e.target.value })
                          }
                        />
                      </Field>
                    </div>
                    <div className="mt-3">
                      <label className={labelCls}>What you did</label>
                      <textarea
                        className={inputCls + " min-h-[110px] leading-relaxed"}
                        placeholder="Key responsibilities and wins…"
                        value={w.description ?? ""}
                        onChange={(e) =>
                          setWorkDescription(w.id, { description: e.target.value || null })
                        }
                      />
                    </div>
                  </div>
                ))
              )}
              <p className="text-[12px] text-slate-meta">
                Add or remove jobs, dates, and details in your{" "}
                <Link href="/candidate/profile" className="font-semibold underline">
                  profile
                </Link>
                .
              </p>
            </div>
          )}

          {index === 3 && (
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

          {index === 4 && (
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
          <div className="max-h-[80vh] overflow-auto rounded-md border border-[var(--rule)] bg-white shadow-sm">
            <ResumeDocument data={preview} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-xl font-bold tracking-[-0.4px] text-ink sm:text-2xl">{children}</h1>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}
