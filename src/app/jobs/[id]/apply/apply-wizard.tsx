"use client";

/**
 * ApplyWizard — multi-step candidate apply flow.
 *
 * Steps: intro → (screening if any) → resume → cover letter → review.
 *
 * State is held in this component and mirrored to localStorage on every
 * change. On mount we hydrate from a prior draft if one exists for this
 * (jobId, candidateId) pair, then prompt the user to resume or start over.
 *
 * Submit posts a single FormData blob to applyToJob — the same server
 * action that powered the old single-page form, now extended to handle
 * screening answers.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  FileUp,
  Pencil,
  ExternalLink,
} from "lucide-react";
import { applyToJob } from "./actions";
import type {
  AnswerValue,
  CandidatePrefill,
  ExistingAnswer,
  ScreeningQuestion,
  WizardDraft,
} from "./types";

const AVAILABILITY_LABEL: Record<string, string> = {
  immediate: "Immediately",
  "2_weeks": "Within 2 weeks",
  "1_month": "Within 1 month",
  passive: "Passively looking",
};

interface ApplyWizardProps {
  jobId: string;
  jobTitle: string;
  dsoName: string;
  questions: ScreeningQuestion[];
  candidate: { id: string } & CandidatePrefill;
  savedResumeUrl: string | null;
  savedResumeName: string | null;
  existingApplication: {
    id: string;
    cover_letter: string | null;
    status: string;
  } | null;
  existingAnswers: ExistingAnswer[];
  userEmail: string | null;
}

export function ApplyWizard(props: ApplyWizardProps) {
  const {
    jobId,
    jobTitle,
    dsoName,
    questions,
    candidate,
    savedResumeUrl,
    savedResumeName,
    existingApplication,
    existingAnswers,
    userEmail,
  } = props;

  const hasScreening = questions.length > 0;
  const hasSavedResume = Boolean(savedResumeUrl);
  const draftKey = `dsohire:apply-draft:${jobId}:${candidate.id}`;

  // Build the dynamic step list. ids let us key + track without index drift.
  const steps = useMemo(() => {
    const list: { id: StepId; label: string }[] = [
      { id: "intro", label: "Get started" },
    ];
    if (hasScreening) list.push({ id: "screening", label: "Screening" });
    list.push({ id: "resume", label: "Resume" });
    list.push({ id: "cover", label: "Cover letter" });
    list.push({ id: "review", label: "Review" });
    return list;
  }, [hasScreening]);

  // ── Draft state seeding ─────────────────────────────────────
  // Priority on first paint: existing application > localStorage > empty.
  // We hydrate sync (so the first paint matches localStorage if present)
  // by reading from localStorage in a useState initializer.
  const initial = useMemo<WizardDraft>(() => {
    return {
      coverLetter: existingApplication?.cover_letter ?? "",
      answers: seedAnswersFromExisting(questions, existingAnswers),
      resumeChoice: hasSavedResume ? "saved" : "upload",
    };
  }, [existingApplication, existingAnswers, questions, hasSavedResume]);

  const [draft, setDraft] = useState<WizardDraft>(initial);
  const [stepIdx, setStepIdx] = useState(0);
  const [restorePromptOpen, setRestorePromptOpen] = useState(false);
  const [savedDraft, setSavedDraft] = useState<WizardDraft | null>(null);

  // Resume file cannot be serialized — held outside draft.
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Hydrate from localStorage on mount, ask if found ────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as WizardDraft;
      // Only show resume prompt if it's actually different from server state
      const isMeaningfullyDifferent =
        parsed.coverLetter !== initial.coverLetter ||
        JSON.stringify(parsed.answers) !== JSON.stringify(initial.answers);
      if (isMeaningfullyDifferent) {
        setSavedDraft(parsed);
        setRestorePromptOpen(true);
      }
    } catch {
      /* corrupted draft — ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // ── Persist draft on change ─────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      /* quota exceeded or unavailable — non-fatal */
    }
  }, [draft, draftKey]);

  const clearDraft = () => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  };

  // ── Submit ──────────────────────────────────────────────────
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{
    alreadyApplied: boolean;
    message: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = () => {
    setSubmitError(null);

    // Required-question gate (client-side; server enforces too)
    const missing = findMissingRequired(questions, draft.answers);
    if (missing) {
      setSubmitError(
        `Please answer the required question: "${truncate(missing.prompt, 80)}"`
      );
      const screeningIdx = steps.findIndex((s) => s.id === "screening");
      if (screeningIdx >= 0) setStepIdx(screeningIdx);
      return;
    }

    // Resume gate
    if (!hasSavedResume && draft.resumeChoice === "upload" && !resumeFile) {
      setSubmitError("Please upload a resume before submitting.");
      const resumeIdx = steps.findIndex((s) => s.id === "resume");
      if (resumeIdx >= 0) setStepIdx(resumeIdx);
      return;
    }

    const formData = new FormData();
    formData.set("job_id", jobId);
    formData.set("cover_letter", draft.coverLetter);
    if (resumeFile) formData.set("resume", resumeFile);

    // Encode answers — see actions.ts for the matching parser.
    for (const q of questions) {
      const answer = draft.answers[q.id];
      if (!answer) continue;
      if (answer.kind === "text" && answer.value) {
        formData.set(`q__${q.id}`, answer.value);
      } else if (answer.kind === "yes_no" && answer.value) {
        formData.set(`q__${q.id}`, answer.value);
      } else if (answer.kind === "single" && answer.value) {
        formData.set(`q__${q.id}`, answer.value);
      } else if (answer.kind === "multi" && answer.value.length > 0) {
        for (const v of answer.value) formData.append(`q__${q.id}`, v);
      } else if (answer.kind === "number" && answer.value !== "") {
        formData.set(`q__${q.id}`, answer.value);
      }
    }

    startTransition(async () => {
      const result = await applyToJob({ ok: false }, formData);
      if (!result.ok) {
        setSubmitError(result.error ?? "Something went wrong.");
        return;
      }
      clearDraft();
      setSubmitted({
        alreadyApplied: Boolean(result.alreadyApplied),
        message: result.message ?? "Application submitted.",
      });
    });
  };

  // ── Submitted view ──────────────────────────────────────────
  if (submitted) {
    return (
      <div className="border border-[var(--rule)] bg-white p-8 sm:p-10">
        <div className="border-l-4 border-heritage bg-cream p-6">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
            {submitted.alreadyApplied ? "Application updated" : "Application sent"}
          </div>
          <p className="text-[15px] text-ink leading-relaxed mb-4">
            {submitted.message}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/candidate/dashboard"
              className="inline-flex items-center gap-2 px-5 py-3 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
            >
              View Dashboard
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 px-5 py-3 border border-[var(--rule-strong)] text-ink text-[11px] font-bold tracking-[2px] uppercase hover:bg-cream transition-colors"
            >
              Browse More Jobs
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const currentStep = steps[stepIdx];

  return (
    <div className="space-y-8">
      {/* ── Resume-prior-draft prompt ── */}
      {restorePromptOpen && savedDraft && (
        <div className="border border-heritage/30 bg-heritage/[0.06] p-5 flex items-start gap-4">
          <Pencil className="h-4 w-4 text-heritage-deep flex-shrink-0 mt-1" />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-ink leading-snug mb-1">
              Resume your draft from earlier?
            </div>
            <div className="text-[12px] text-slate-body leading-relaxed mb-3">
              We saved what you started typing on this device. You'll need to
              re-attach a resume if you uploaded one.
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft(savedDraft);
                  setRestorePromptOpen(false);
                }}
                className="px-4 py-2 bg-ink text-ivory text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors"
              >
                Resume draft
              </button>
              <button
                type="button"
                onClick={() => {
                  clearDraft();
                  setRestorePromptOpen(false);
                  setSavedDraft(null);
                }}
                className="px-4 py-2 border border-[var(--rule-strong)] text-ink text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-cream transition-colors"
              >
                Start fresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stepper ── */}
      <Stepper steps={steps} currentIdx={stepIdx} />

      <div className="border border-[var(--rule)] bg-white p-8 sm:p-10">
        {currentStep.id === "intro" && (
          <IntroStep
            jobTitle={jobTitle}
            dsoName={dsoName}
            candidate={candidate}
            userEmail={userEmail}
            existingApplication={existingApplication}
          />
        )}

        {currentStep.id === "screening" && (
          <ScreeningStep
            questions={questions}
            answers={draft.answers}
            onChange={(answers) => setDraft({ ...draft, answers })}
          />
        )}

        {currentStep.id === "resume" && (
          <ResumeStep
            hasSavedResume={hasSavedResume}
            savedResumeName={savedResumeName}
            resumeChoice={draft.resumeChoice}
            onResumeChoice={(c) => setDraft({ ...draft, resumeChoice: c })}
            resumeFile={resumeFile}
            onResumeFile={(f, err) => {
              setResumeFile(f);
              setResumeError(err);
            }}
            resumeError={resumeError}
            fileInputRef={fileInputRef}
          />
        )}

        {currentStep.id === "cover" && (
          <CoverLetterStep
            jobTitle={jobTitle}
            value={draft.coverLetter}
            onChange={(coverLetter) => setDraft({ ...draft, coverLetter })}
          />
        )}

        {currentStep.id === "review" && (
          <ReviewStep
            jobTitle={jobTitle}
            dsoName={dsoName}
            candidate={candidate}
            questions={questions}
            answers={draft.answers}
            coverLetter={draft.coverLetter}
            resumeChoice={draft.resumeChoice}
            resumeFile={resumeFile}
            savedResumeName={savedResumeName}
            onJumpTo={(stepId) => {
              const idx = steps.findIndex((s) => s.id === stepId);
              if (idx >= 0) setStepIdx(idx);
            }}
          />
        )}

        {submitError && (
          <div className="mt-6 bg-red-50 border-l-4 border-red-500 p-4">
            <p className="text-[13px] text-red-900">{submitError}</p>
          </div>
        )}

        {/* ── Step nav ── */}
        <div className="mt-8 pt-6 border-t border-[var(--rule)] flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}
            disabled={stepIdx === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-[10px] font-bold tracking-[1.5px] uppercase text-ink hover:bg-cream transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>

          {stepIdx < steps.length - 1 ? (
            <button
              type="button"
              onClick={() => setStepIdx(Math.min(steps.length - 1, stepIdx + 1))}
              className="inline-flex items-center gap-2 px-6 py-3 bg-ink text-ivory text-[10px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
            >
              Continue
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={pending}
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {pending
                ? "Submitting…"
                : existingApplication
                ? "Update Application"
                : "Submit Application"}
              {!pending && <ArrowRight className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      <p className="text-[12px] text-slate-meta leading-relaxed">
        Your draft saves automatically on this device. Your application goes
        directly to the hiring team at this DSO. By submitting you agree to our{" "}
        <a
          href="/legal/candidate-terms"
          className="text-heritage underline underline-offset-2 hover:text-heritage-deep"
        >
          Candidate Terms
        </a>
        .
      </p>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Stepper
 * ───────────────────────────────────────────────────────────── */

type StepId = "intro" | "screening" | "resume" | "cover" | "review";

function Stepper({
  steps,
  currentIdx,
}: {
  steps: { id: StepId; label: string }[];
  currentIdx: number;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
          Step {currentIdx + 1} of {steps.length}
        </span>
        <span className="text-[10px] font-bold tracking-[2px] uppercase text-slate-meta">
          ·
        </span>
        <span className="text-[10px] font-bold tracking-[2.5px] uppercase text-ink">
          {steps[currentIdx].label}
        </span>
      </div>
      <div className="flex gap-1.5">
        {steps.map((s, i) => (
          <div
            key={s.id}
            className={
              "h-1 flex-1 transition-colors " +
              (i < currentIdx
                ? "bg-heritage"
                : i === currentIdx
                ? "bg-ink"
                : "bg-[var(--rule-strong)]")
            }
          />
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Step 1 — Intro
 * ───────────────────────────────────────────────────────────── */

function IntroStep({
  jobTitle,
  dsoName,
  candidate,
  userEmail,
  existingApplication,
}: {
  jobTitle: string;
  dsoName: string;
  candidate: CandidatePrefill;
  userEmail: string | null;
  existingApplication: { status: string } | null;
}) {
  const prefill = buildPrefillSummary(candidate);
  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Before you begin
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.5px] text-ink leading-tight mb-3">
          You're applying as {candidate.full_name ?? userEmail ?? "yourself"}.
        </h2>
        <p className="text-[14px] text-slate-body leading-relaxed">
          {existingApplication
            ? `You already have an application on file for ${jobTitle} at ${dsoName}. Walking through these steps will update your existing application — it won't create a duplicate.`
            : `This wizard will walk you through screening questions, your resume, and a quick cover note for the hiring team at ${dsoName}.`}
        </p>
      </div>

      {prefill.length > 0 && (
        <div className="bg-cream border border-[var(--rule)] p-5">
          <div className="text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-3">
            From your profile
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            {prefill.map((row) => (
              <div key={row.label}>
                <dt className="text-[11px] font-semibold tracking-[1px] uppercase text-slate-meta">
                  {row.label}
                </dt>
                <dd className="text-[14px] text-ink mt-0.5">{row.value}</dd>
              </div>
            ))}
          </dl>
          <Link
            href="/candidate/profile"
            target="_blank"
            className="inline-flex items-center gap-1.5 mt-4 text-[11px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink transition-colors"
          >
            Update profile
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Step 2 — Screening questions
 * ───────────────────────────────────────────────────────────── */

function ScreeningStep({
  questions,
  answers,
  onChange,
}: {
  questions: ScreeningQuestion[];
  answers: Record<string, AnswerValue>;
  onChange: (answers: Record<string, AnswerValue>) => void;
}) {
  const update = (id: string, value: AnswerValue) => {
    onChange({ ...answers, [id]: value });
  };

  return (
    <div className="space-y-7">
      <div>
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Screening
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.5px] text-ink leading-tight">
          A few quick questions from the hiring team.
        </h2>
      </div>

      {questions.map((q, idx) => (
        <div key={q.id} className="space-y-2">
          <label className="block text-[13px] font-semibold text-ink leading-snug">
            <span className="text-slate-meta font-bold mr-2">{idx + 1}.</span>
            {q.prompt}
            {q.required && <span className="text-heritage ml-1">*</span>}
          </label>
          {q.helper_text && (
            <p className="text-[11px] text-slate-meta leading-relaxed">
              {q.helper_text}
            </p>
          )}
          <QuestionInput
            question={q}
            value={answers[q.id]}
            onChange={(v) => update(q.id, v)}
          />
        </div>
      ))}
    </div>
  );
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: ScreeningQuestion;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
}) {
  const baseInput =
    "w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors leading-relaxed";

  switch (question.kind) {
    case "short_text":
      return (
        <input
          type="text"
          value={value?.kind === "text" ? value.value : ""}
          onChange={(e) =>
            onChange({ kind: "text", value: e.target.value })
          }
          className={baseInput}
        />
      );
    case "long_text":
      return (
        <textarea
          rows={4}
          value={value?.kind === "text" ? value.value : ""}
          onChange={(e) =>
            onChange({ kind: "text", value: e.target.value })
          }
          className={baseInput}
        />
      );
    case "number":
      return (
        <input
          type="number"
          inputMode="numeric"
          step="any"
          value={value?.kind === "number" ? value.value : ""}
          onChange={(e) =>
            onChange({ kind: "number", value: e.target.value })
          }
          className={baseInput + " max-w-[180px]"}
        />
      );
    case "yes_no": {
      const v = value?.kind === "yes_no" ? value.value : "";
      return (
        <div className="flex gap-2">
          {(["yes", "no"] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => onChange({ kind: "yes_no", value: choice })}
              className={
                "px-5 py-2.5 border text-[11px] font-bold tracking-[1.5px] uppercase transition-colors " +
                (v === choice
                  ? "bg-ink text-ivory border-ink"
                  : "bg-cream text-ink border-[var(--rule-strong)] hover:bg-white")
              }
            >
              {choice}
            </button>
          ))}
        </div>
      );
    }
    case "single_select": {
      const v = value?.kind === "single" ? value.value : "";
      return (
        <div className="space-y-1.5">
          {(question.options ?? []).map((opt) => (
            <label
              key={opt.id}
              className={
                "flex items-center gap-3 px-4 py-2.5 border cursor-pointer transition-colors " +
                (v === opt.id
                  ? "bg-heritage/[0.08] border-heritage"
                  : "bg-cream border-[var(--rule-strong)] hover:bg-white")
              }
            >
              <input
                type="radio"
                name={`q_${question.id}`}
                checked={v === opt.id}
                onChange={() => onChange({ kind: "single", value: opt.id })}
                className="accent-heritage"
              />
              <span className="text-[13px] text-ink">{opt.label}</span>
            </label>
          ))}
        </div>
      );
    }
    case "multi_select": {
      const v = value?.kind === "multi" ? value.value : [];
      const toggle = (id: string) => {
        const next = v.includes(id) ? v.filter((x) => x !== id) : [...v, id];
        onChange({ kind: "multi", value: next });
      };
      return (
        <div className="space-y-1.5">
          {(question.options ?? []).map((opt) => {
            const checked = v.includes(opt.id);
            return (
              <label
                key={opt.id}
                className={
                  "flex items-center gap-3 px-4 py-2.5 border cursor-pointer transition-colors " +
                  (checked
                    ? "bg-heritage/[0.08] border-heritage"
                    : "bg-cream border-[var(--rule-strong)] hover:bg-white")
                }
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(opt.id)}
                  className="accent-heritage"
                />
                <span className="text-[13px] text-ink">{opt.label}</span>
              </label>
            );
          })}
        </div>
      );
    }
  }
}

/* ───────────────────────────────────────────────────────────────
 * Step 3 — Resume
 * ───────────────────────────────────────────────────────────── */

function ResumeStep({
  hasSavedResume,
  savedResumeName,
  resumeChoice,
  onResumeChoice,
  resumeFile,
  onResumeFile,
  resumeError,
  fileInputRef,
}: {
  hasSavedResume: boolean;
  savedResumeName: string | null;
  resumeChoice: "saved" | "upload";
  onResumeChoice: (c: "saved" | "upload") => void;
  resumeFile: File | null;
  onResumeFile: (f: File | null, err: string | null) => void;
  resumeError: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const RESUME_MIME = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);
  const RESUME_MAX = 10 * 1024 * 1024;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Resume
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.5px] text-ink leading-tight">
          {hasSavedResume
            ? "Use your saved resume, or upload a fresh one."
            : "Upload your resume."}
        </h2>
      </div>

      {hasSavedResume && (
        <div className="space-y-2">
          <label
            className={
              "flex items-start gap-3 p-4 border cursor-pointer transition-colors " +
              (resumeChoice === "saved"
                ? "bg-heritage/[0.08] border-heritage"
                : "bg-cream border-[var(--rule-strong)] hover:bg-white")
            }
          >
            <input
              type="radio"
              name="resume_choice"
              checked={resumeChoice === "saved"}
              onChange={() => onResumeChoice("saved")}
              className="mt-1 accent-heritage"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-ink leading-snug">
                Use my saved resume
              </div>
              <div className="text-[11px] text-slate-body leading-snug mt-0.5">
                {savedResumeName ?? "Stored on your profile"}
              </div>
            </div>
            <FileUp className="h-4 w-4 text-heritage-deep flex-shrink-0 mt-1" />
          </label>

          <label
            className={
              "flex items-start gap-3 p-4 border cursor-pointer transition-colors " +
              (resumeChoice === "upload"
                ? "bg-heritage/[0.08] border-heritage"
                : "bg-cream border-[var(--rule-strong)] hover:bg-white")
            }
          >
            <input
              type="radio"
              name="resume_choice"
              checked={resumeChoice === "upload"}
              onChange={() => onResumeChoice("upload")}
              className="mt-1 accent-heritage"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-ink leading-snug">
                Upload a different resume for this application
              </div>
              <div className="text-[11px] text-slate-body leading-snug mt-0.5">
                Replace just for this role; doesn't change your saved resume.
              </div>
            </div>
          </label>
        </div>
      )}

      {(!hasSavedResume || resumeChoice === "upload") && (
        <div>
          <label
            htmlFor="resume"
            className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
          >
            Resume file {!hasSavedResume && <span className="text-heritage">*</span>}
          </label>
          <input
            id="resume"
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (!f) {
                onResumeFile(null, null);
                return;
              }
              if (!RESUME_MIME.has(f.type)) {
                onResumeFile(
                  null,
                  "Resume must be a PDF or Word document (.pdf, .doc, .docx)."
                );
                return;
              }
              if (f.size > RESUME_MAX) {
                onResumeFile(null, "File too large. Max 10 MB.");
                return;
              }
              onResumeFile(f, null);
            }}
            className="block w-full text-[13px] text-ink file:mr-4 file:px-5 file:py-2.5 file:border-0 file:text-[10px] file:font-bold file:tracking-[1.5px] file:uppercase file:bg-ink file:text-ivory hover:file:bg-ink-soft file:cursor-pointer file:transition-colors"
          />
          <p className="mt-1.5 text-[11px] text-slate-meta leading-relaxed">
            PDF, DOC, or DOCX. Max 10 MB.
          </p>
          {resumeFile && (
            <p className="mt-2 text-[12px] text-heritage-deep font-semibold">
              <Check className="inline h-3.5 w-3.5 mr-1" />
              {resumeFile.name} attached
            </p>
          )}
          {resumeError && (
            <p className="mt-2 text-[12px] text-red-700">{resumeError}</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Step 4 — Cover letter
 * ───────────────────────────────────────────────────────────── */

function CoverLetterStep({
  jobTitle,
  value,
  onChange,
}: {
  jobTitle: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Cover letter
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.5px] text-ink leading-tight">
          Why are you a fit for this role?
        </h2>
      </div>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        placeholder={`A short note to the hiring team. Mention what excites you about this ${jobTitle.toLowerCase()} role and what experience makes you a fit.`}
        className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors leading-relaxed"
      />
      <p className="text-[12px] text-slate-meta leading-relaxed">
        Optional, but recommended — personalized cover letters typically get
        2–3× more interview requests than generic applications.
      </p>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Step 5 — Review
 * ───────────────────────────────────────────────────────────── */

function ReviewStep({
  jobTitle,
  dsoName,
  candidate,
  questions,
  answers,
  coverLetter,
  resumeChoice,
  resumeFile,
  savedResumeName,
  onJumpTo,
}: {
  jobTitle: string;
  dsoName: string;
  candidate: { id: string } & CandidatePrefill;
  questions: ScreeningQuestion[];
  answers: Record<string, AnswerValue>;
  coverLetter: string;
  resumeChoice: "saved" | "upload";
  resumeFile: File | null;
  savedResumeName: string | null;
  onJumpTo: (s: StepId) => void;
}) {
  const completeness = computeProfileCompleteness(candidate);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Review
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.5px] text-ink leading-tight">
          Final check before you send.
        </h2>
        <p className="text-[14px] text-slate-body leading-relaxed mt-2">
          You're applying to <span className="font-semibold text-ink">{jobTitle}</span>{" "}
          at <span className="font-semibold text-ink">{dsoName}</span>.
        </p>
      </div>

      {questions.length > 0 && (
        <ReviewBlock
          label="Screening answers"
          onEdit={() => onJumpTo("screening")}
        >
          <ul className="space-y-3">
            {questions.map((q) => (
              <li key={q.id}>
                <div className="text-[11px] font-semibold text-slate-meta mb-0.5">
                  {q.prompt}
                </div>
                <div className="text-[13px] text-ink">
                  {formatAnswer(q, answers[q.id]) || (
                    <span className="text-slate-meta italic">No answer</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </ReviewBlock>
      )}

      <ReviewBlock label="Resume" onEdit={() => onJumpTo("resume")}>
        <p className="text-[13px] text-ink">
          {resumeChoice === "upload" && resumeFile
            ? `Uploading: ${resumeFile.name}`
            : resumeChoice === "saved" && savedResumeName
            ? `Using saved resume: ${savedResumeName}`
            : "No resume attached"}
        </p>
      </ReviewBlock>

      <ReviewBlock label="Cover letter" onEdit={() => onJumpTo("cover")}>
        {coverLetter.trim() ? (
          <p className="text-[13px] text-ink whitespace-pre-wrap leading-relaxed">
            {coverLetter}
          </p>
        ) : (
          <p className="text-[13px] text-slate-meta italic">
            No cover letter — you can still submit, but personalized cover
            letters get more interviews.
          </p>
        )}
      </ReviewBlock>

      {completeness.percent < 100 && (
        <div className="border-l-4 border-heritage bg-heritage/[0.06] p-4">
          <div className="text-[11px] font-bold tracking-[1.5px] uppercase text-heritage-deep mb-1">
            Your profile is {completeness.percent}% complete
          </div>
          <p className="text-[12px] text-slate-body leading-relaxed">
            Adding {completeness.missing.join(", ")} to your profile lets future
            applications autofill in seconds.{" "}
            <Link
              href="/candidate/profile"
              target="_blank"
              className="text-heritage-deep underline underline-offset-2 hover:text-ink font-semibold"
            >
              Update profile →
            </Link>
          </p>
        </div>
      )}
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
        <div className="text-[10px] font-bold tracking-[2px] uppercase text-slate-body">
          {label}
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink transition-colors"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
      </div>
      {children}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

function seedAnswersFromExisting(
  questions: ScreeningQuestion[],
  existing: ExistingAnswer[]
): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  for (const q of questions) {
    const prior = existing.find((e) => e.question_id === q.id);
    if (!prior) {
      out[q.id] = emptyAnswer(q);
      continue;
    }
    switch (q.kind) {
      case "short_text":
      case "long_text":
        out[q.id] = { kind: "text", value: prior.answer_text ?? "" };
        break;
      case "yes_no":
        out[q.id] = {
          kind: "yes_no",
          value:
            prior.answer_choice === "yes" || prior.answer_choice === "no"
              ? prior.answer_choice
              : "",
        };
        break;
      case "single_select":
        out[q.id] = { kind: "single", value: prior.answer_choice ?? "" };
        break;
      case "multi_select":
        out[q.id] = { kind: "multi", value: prior.answer_choices ?? [] };
        break;
      case "number":
        out[q.id] = {
          kind: "number",
          value: prior.answer_number !== null ? String(prior.answer_number) : "",
        };
        break;
    }
  }
  return out;
}

function emptyAnswer(q: ScreeningQuestion): AnswerValue {
  switch (q.kind) {
    case "short_text":
    case "long_text":
      return { kind: "text", value: "" };
    case "yes_no":
      return { kind: "yes_no", value: "" };
    case "single_select":
      return { kind: "single", value: "" };
    case "multi_select":
      return { kind: "multi", value: [] };
    case "number":
      return { kind: "number", value: "" };
  }
}

function findMissingRequired(
  questions: ScreeningQuestion[],
  answers: Record<string, AnswerValue>
): ScreeningQuestion | null {
  for (const q of questions) {
    if (!q.required) continue;
    const a = answers[q.id];
    if (!a) return q;
    if (a.kind === "text" && !a.value.trim()) return q;
    if (a.kind === "yes_no" && !a.value) return q;
    if (a.kind === "single" && !a.value) return q;
    if (a.kind === "multi" && a.value.length === 0) return q;
    if (a.kind === "number" && a.value.trim() === "") return q;
  }
  return null;
}

function formatAnswer(
  q: ScreeningQuestion,
  a: AnswerValue | undefined
): string {
  if (!a) return "";
  switch (a.kind) {
    case "text":
      return a.value;
    case "yes_no":
      return a.value === "yes" ? "Yes" : a.value === "no" ? "No" : "";
    case "number":
      return a.value;
    case "single": {
      const opt = q.options?.find((o) => o.id === a.value);
      return opt?.label ?? "";
    }
    case "multi": {
      const labels = (q.options ?? [])
        .filter((o) => a.value.includes(o.id))
        .map((o) => o.label);
      return labels.join(", ");
    }
  }
}

function buildPrefillSummary(
  c: CandidatePrefill
): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (c.current_title) rows.push({ label: "Current title", value: c.current_title });
  if (typeof c.years_experience === "number")
    rows.push({
      label: "Experience",
      value: `${c.years_experience} year${c.years_experience === 1 ? "" : "s"}`,
    });
  if (c.availability && AVAILABILITY_LABEL[c.availability])
    rows.push({
      label: "Availability",
      value: AVAILABILITY_LABEL[c.availability],
    });
  if (c.headline) rows.push({ label: "Headline", value: c.headline });
  return rows;
}

function computeProfileCompleteness(
  c: CandidatePrefill
): { percent: number; missing: string[] } {
  const fields: { key: keyof CandidatePrefill; label: string }[] = [
    { key: "full_name", label: "name" },
    { key: "headline", label: "headline" },
    { key: "summary", label: "professional summary" },
    { key: "years_experience", label: "years of experience" },
    { key: "current_title", label: "current title" },
    { key: "availability", label: "availability" },
    { key: "phone", label: "phone" },
  ];
  const missing: string[] = [];
  for (const f of fields) {
    const v = c[f.key];
    if (v === null || v === undefined || v === "") missing.push(f.label);
  }
  const total = fields.length;
  const filled = total - missing.length;
  const percent = Math.round((filled / total) * 100);
  return { percent, missing };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
