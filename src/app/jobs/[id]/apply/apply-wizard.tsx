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
  Check,
  Pencil,
  ExternalLink,
  Plus,
  X,
} from "lucide-react";
import { applyToJob } from "./actions";
import {
  addInlineCredential,
  refreshCandidateCredentials,
} from "./credential-actions";
import {
  parseResumeAction,
  saveParsedResumeAction,
} from "@/app/candidate/(app)/profile/import/actions";
import type { ParsedResume } from "@/lib/resume/parse";
import { EeoSelfId } from "./eeo-self-id";
import type {
  AnswerValue,
  CandidateCredential,
  CandidatePrefill,
  ExistingAnswer,
  ExistingVerification,
  JobVerificationRequirement,
  ScreeningQuestion,
  VerificationValue,
  WizardDraft,
} from "./types";
import { getVerificationType } from "@/lib/verifications/types";
import {
  LICENSE_TYPES,
  CERTIFICATION_KINDS,
} from "@/lib/candidate/canonical-lists";
import { composeName, splitFullName } from "@/lib/candidate/name";
import {
  WizardShell,
  FieldShell,
  OptionCards,
  MultiChips,
  ScaleSlider,
  TextField,
  TextAreaField,
  FileField,
  CheckCard,
} from "@/components/wizard";
import { BrandMark } from "@/components/brand/brand-mark";
import { BrandLockup } from "@/components/brand/brand-lockup";

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
  /** 5G.e Tier 2 — verification requirements the recruiter set on this job. */
  verificationRequirements: JobVerificationRequirement[];
  /** Candidate's profile credentials, normalized for the link-as-proof picker. */
  candidateCredentials: CandidateCredential[];
  /** Prior application_verifications rows (edit/re-apply rehydration). */
  existingVerifications: ExistingVerification[];
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
  /** Phase 5C — attribution channel from ?source= on the apply URL. */
  sourceTag?: string | null;
}

export function ApplyWizard(props: ApplyWizardProps) {
  const {
    jobId,
    jobTitle,
    dsoName,
    questions,
    verificationRequirements,
    candidateCredentials,
    existingVerifications,
    candidate,
    savedResumeUrl,
    savedResumeName,
    existingApplication,
    existingAnswers,
    userEmail,
  } = props;

  const hasScreening = questions.length > 0;
  const hasVerifications = verificationRequirements.length > 0;
  const hasSavedResume = Boolean(savedResumeUrl);
  const draftKey = `dsohire:apply-draft:${jobId}:${candidate.id}`;

  // Build the dynamic step list. ids let us key + track without index drift.
  const steps = useMemo(() => {
    const list: { id: StepId; label: string }[] = [
      { id: "intro", label: "Get started" },
    ];
    // Résumé first (after intro) — Cam 2026-06-05: surface it before screening
    // + verifications so we can eventually parse it and pre-fill later steps (#70).
    list.push({ id: "resume", label: "Resume" });
    if (hasScreening) list.push({ id: "screening", label: "Screening" });
    if (hasVerifications)
      list.push({ id: "verifications", label: "Verifications" });
    list.push({ id: "cover", label: "Cover letter" });
    list.push({ id: "review", label: "Review" });
    return list;
  }, [hasScreening, hasVerifications]);

  // ── Draft state seeding ─────────────────────────────────────
  // Priority on first paint: existing application > localStorage > empty.
  // We hydrate sync (so the first paint matches localStorage if present)
  // by reading from localStorage in a useState initializer.
  const initial = useMemo<WizardDraft>(() => {
    return {
      firstName: candidate.first_name ?? "",
      lastName: candidate.last_name ?? "",
      coverLetter: existingApplication?.cover_letter ?? "",
      answers: seedAnswersFromExisting(questions, existingAnswers),
      verifications: seedVerificationsFromExisting(
        verificationRequirements,
        existingVerifications,
        candidateCredentials
      ),
      resumeChoice: hasSavedResume ? "saved" : "upload",
    };
  }, [
    candidate.first_name,
    candidate.last_name,
    existingApplication,
    existingAnswers,
    questions,
    verificationRequirements,
    existingVerifications,
    candidateCredentials,
    hasSavedResume,
  ]);

  const [draft, setDraft] = useState<WizardDraft>(initial);
  const [stepIdx, setStepIdx] = useState(0);
  const [restorePromptOpen, setRestorePromptOpen] = useState(false);
  const [savedDraft, setSavedDraft] = useState<WizardDraft | null>(null);

  // Mobile sweep 2026-06-18 — return to the top on EVERY step change (next,
  // back, jump, restore-to-saved-step). next() already scrolled, but back and
  // jump did not, so some transitions left phone users stranded mid-page.
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [stepIdx]);

  // Candidate's linkable profile credentials. Seeded from the server prop,
  // but mutable: the Verifications step can furnish a new credential inline
  // (5G.e Tier 2 #2), which appends here so it's immediately pickable.
  const [credentials, setCredentials] = useState<CandidateCredential[]>(
    candidateCredentials
  );

  // A credential furnished inline lands on the candidate's profile, gets
  // appended to the picker list, and auto-links itself to the verification
  // it was added for (the candidate still chooses whether to attest).
  const handleCredentialAdded = (
    verificationType: string,
    cred: CandidateCredential
  ) => {
    setCredentials((prev) =>
      prev.some((c) => c.id === cred.id && c.source === cred.source)
        ? prev
        : [...prev, cred]
    );
    setDraft((d) => {
      const current = d.verifications[verificationType] ?? emptyVerification();
      if (current.linkedCredentialIds.includes(cred.id)) return d;
      return {
        ...d,
        verifications: {
          ...d.verifications,
          [verificationType]: {
            ...current,
            linkedCredentialIds: [...current.linkedCredentialIds, cred.id],
          },
        },
      };
    });
  };

  // Resume file cannot be serialized — held outside draft.
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);

  // #87b.3 — returning from the free résumé builder (?built=1). The freshly
  // built résumé is now saved to the profile, so prefer it over the stale
  // "upload" choice the draft may still hold from before the détour.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const built = new URLSearchParams(window.location.search).get("built");
    if (built === "1" && hasSavedResume) {
      setDraft((d) => ({ ...d, resumeChoice: "saved" }));
    }
    // mount-only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // #70 — opt-in "autofill from résumé". Parses the uploaded file (reusing the
  // profile-import LLM parser, which also saves the file on file) and fills the
  // draft name. Never silent: the candidate taps the button and reviews at
  // submit. Degrades gracefully on the 1/day parse cap.
  const [autofilling, setAutofilling] = useState(false);
  const [autofillNote, setAutofillNote] = useState<string | null>(null);
  // #76 — the résumé parsed in-session; lets us offer to add any licenses /
  // certs / education it found to the candidate's profile (explicit tap only —
  // respects the locked R8 no-silent-fill rule).
  const [parsedResume, setParsedResume] = useState<ParsedResume | null>(null);
  const [addingCreds, setAddingCreds] = useState(false);

  const autofillFromResume = () => {
    if (!resumeFile || autofilling) return;
    setAutofillNote(null);
    setAutofilling(true);
    const fd = new FormData();
    fd.set("resume", resumeFile);
    void parseResumeAction(fd)
      .then((res) => {
        if (!res.ok) {
          setAutofillNote(
            res.errorCode === "cap_exceeded"
              ? "You've imported a résumé recently — your saved details are already on your profile."
              : res.error || "We couldn't read that résumé. You can fill the fields in manually."
          );
          return;
        }
        setParsedResume(res.parsed);
        const fullName = res.parsed.basics.full_name.value?.trim();
        if (fullName) {
          const { first_name, last_name } = splitFullName(fullName);
          setDraft((d) => ({
            ...d,
            firstName: first_name || d.firstName,
            lastName: last_name || d.lastName,
          }));
          setAutofillNote(
            `Filled your name from your résumé (${fullName}). Double-check everything before you submit.`
          );
        } else {
          setAutofillNote(
            "We read your résumé and saved it. Add your name on the first step if it's blank."
          );
        }
      })
      .catch(() =>
        setAutofillNote("Something went wrong reading that résumé.")
      )
      .finally(() => setAutofilling(false));
  };

  // Licenses / certs / education the parsed résumé surfaced.
  const resumeCredCount = parsedResume
    ? parsedResume.licenses.filter((l) => l.license_type.value).length +
      parsedResume.certifications.filter((c) => c.kind.value).length +
      parsedResume.education.filter((e) => e.school_name.value).length
    : 0;
  // Only offer to add when the candidate has NO profile credentials yet —
  // avoids duplicate inserts (saveParsedResumeAction is additive). Candidates
  // who already have credentials get them pre-linked by #70 Part A.
  const canAddResumeCreds = resumeCredCount > 0 && credentials.length === 0;

  const addResumeCredentials = () => {
    if (!parsedResume || addingCreds) return;
    const count = resumeCredCount;
    setAddingCreds(true);
    void saveParsedResumeAction(parsedResume)
      .then(async (res) => {
        if (!res.ok) {
          setAutofillNote(res.error || "Couldn't add those to your profile.");
          return;
        }
        const fresh = await refreshCandidateCredentials();
        setCredentials(fresh);
        setParsedResume(null);
        setAutofillNote(
          `Added ${count} credential${count === 1 ? "" : "s"} to your profile — attach them in the Verifications step.`
        );
      })
      .catch(() => setAutofillNote("Couldn't add those to your profile."))
      .finally(() => setAddingCreds(false));
  };

  // ── Hydrate from localStorage on mount, ask if found ────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<WizardDraft> & {
        fullName?: string;
      };
      // Backfill first/last for older drafts: pre-split drafts stored a
      // single `fullName` string — split it; pre-name drafts had neither.
      const legacyName = parsed.fullName ? splitFullName(parsed.fullName) : null;
      const normalized: WizardDraft = {
        firstName:
          parsed.firstName ?? legacyName?.first_name ?? initial.firstName,
        lastName: parsed.lastName ?? legacyName?.last_name ?? initial.lastName,
        coverLetter: parsed.coverLetter ?? "",
        answers: parsed.answers ?? initial.answers,
        // Normalize verification values — older drafts (pre migration ...004)
        // stored a single linkedCredentialType/Id pair; the field shape is
        // now linkedCredentialIds[]. normalizeVerifications coerces either.
        verifications: parsed.verifications
          ? normalizeVerifications(parsed.verifications)
          : initial.verifications,
        resumeChoice: parsed.resumeChoice ?? initial.resumeChoice,
      };
      // Only show resume prompt if it's actually different from server state
      const isMeaningfullyDifferent =
        normalized.coverLetter !== initial.coverLetter ||
        JSON.stringify(normalized.answers) !== JSON.stringify(initial.answers) ||
        JSON.stringify(normalized.verifications) !==
          JSON.stringify(initial.verifications);
      if (isMeaningfullyDifferent) {
        setSavedDraft(normalized);
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
    applicationId?: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = () => {
    setSubmitError(null);

    // Name gate. Required so the employer never sees an anonymous-looking
    // row; server enforces this too.
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      setSubmitError(
        "Please enter your first and last name on the first step before submitting."
      );
      setStepIdx(0);
      return;
    }

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

    // Required-verification gate (client-side; server enforces too)
    const missingVerification = findMissingRequiredVerification(
      verificationRequirements,
      draft.verifications
    );
    if (missingVerification) {
      const vt = getVerificationType(missingVerification.verification_type);
      setSubmitError(
        `Please confirm the required verification: "${
          vt?.label ?? missingVerification.verification_type
        }"`
      );
      const verIdx = steps.findIndex((s) => s.id === "verifications");
      if (verIdx >= 0) setStepIdx(verIdx);
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
    formData.set("first_name", draft.firstName.trim());
    formData.set("last_name", draft.lastName.trim());
    formData.set("cover_letter", draft.coverLetter);
    if (props.sourceTag) formData.set("source", props.sourceTag);
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

    // Encode verification attestations — see actions.ts for the matching
    // parser. One set of fields per required verification type:
    //   v__${type}          — "1" when attested, else omitted
    //   v__${type}__cred_id — linked credential row id (repeated, 0..N)
    //   v__${type}__note    — free-text note (optional)
    // The credential source table is re-derived server-side from the
    // verification type, so it isn't carried in the form.
    for (const req of verificationRequirements) {
      const v = draft.verifications[req.verification_type];
      if (!v) continue;
      if (v.attested) {
        formData.set(`v__${req.verification_type}`, "1");
      }
      for (const credId of v.linkedCredentialIds) {
        if (credId) {
          formData.append(`v__${req.verification_type}__cred_id`, credId);
        }
      }
      if (v.note.trim()) {
        formData.set(`v__${req.verification_type}__note`, v.note.trim());
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
        applicationId: result.applicationId,
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
            {submitted.applicationId && (
              <Link
                href={`/candidate/applications/${submitted.applicationId}`}
                className="inline-flex items-center gap-2 px-5 py-3 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
              >
                View Your Application
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
            <Link
              href="/candidate/dashboard"
              className={
                "inline-flex items-center gap-2 px-5 py-3 text-[12px] font-bold tracking-[2px] uppercase transition-colors " +
                (submitted.applicationId
                  ? "border border-[var(--rule-strong)] text-ink hover:bg-cream"
                  : "bg-ink text-ivory hover:bg-ink-soft")
              }
            >
              View Dashboard
              {!submitted.applicationId && (
                <ArrowRight className="h-3.5 w-3.5" />
              )}
            </Link>
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 px-5 py-3 border border-[var(--rule-strong)] text-ink text-[12px] font-bold tracking-[2px] uppercase hover:bg-cream transition-colors"
            >
              Browse More Jobs
            </Link>
          </div>
        </div>
        {/* #94/#106 (Day 28) — apply-origin candidates go straight to applying
            (we don't interrupt them), then the success screen routes them to
            the PracticeFit assessment with a quick explanation. Only on a fresh
            application, not a re-submit. */}
        {!submitted.alreadyApplied && (
          <div className="mt-6 border border-heritage/40 bg-heritage/[0.06] p-6">
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
              Next: get matched
            </div>
            <h3 className="text-[17px] font-bold text-ink leading-snug">
              See which roles fit you best with PracticeFit
            </h3>
            <p className="mt-1.5 text-[14px] text-slate-body leading-relaxed">
              Take our quick ~5-minute assessment — we&apos;ll score how well
              every role and practice fits you and surface your best matches. It
              also helps practices find you by fit, not just keywords.
            </p>
            <Link
              href="/candidate/assessment"
              className="mt-4 inline-flex items-center gap-2 px-5 py-3 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
            >
              Take the PracticeFit assessment
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
        {/* E2.17 — voluntary EEO self-ID, post-application (success screen only). */}
        {submitted.applicationId && !submitted.alreadyApplied && (
          <EeoSelfId applicationId={submitted.applicationId} />
        )}
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
            <div className="text-[14px] font-semibold text-ink leading-snug mb-1">
              Resume your draft from earlier?
            </div>
            <div className="text-[13px] text-slate-body leading-relaxed mb-3">
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

      <WizardShell
        steps={steps.map((s) => ({ id: s.id, label: s.label }))}
        currentIndex={stepIdx}
        maxWidthClass="max-w-full"
        stickyTopClass="top-[80px]"
        eyebrow={
          <>
            <BrandLockup height={28} />
            <span className="text-[12px] font-bold uppercase tracking-[2px] text-slate-meta">
              application
            </span>
          </>
        }
        meterIcon={<BrandMark className="h-3.5 w-3.5" />}
        onBack={() => setStepIdx(Math.max(0, stepIdx - 1))}
        onNext={() => {
          if (stepIdx < steps.length - 1) {
            setStepIdx(Math.min(steps.length - 1, stepIdx + 1));
            if (typeof window !== "undefined")
              window.scrollTo({ top: 0, behavior: "smooth" });
          } else {
            handleSubmit();
          }
        }}
        nextLabel={
          stepIdx < steps.length - 1
            ? "Continue"
            : existingApplication
              ? "Update application"
              : "Submit application"
        }
        busy={pending}
        error={submitError}
        canJumpTo={(i) => i !== stepIdx}
        onJump={(i) => setStepIdx(i)}
      >
        {currentStep.id === "intro" && (
          <IntroStep
            jobTitle={jobTitle}
            dsoName={dsoName}
            candidate={candidate}
            userEmail={userEmail}
            existingApplication={existingApplication}
            firstName={draft.firstName}
            lastName={draft.lastName}
            onFirstNameChange={(firstName) =>
              setDraft({ ...draft, firstName })
            }
            onLastNameChange={(lastName) => setDraft({ ...draft, lastName })}
          />
        )}

        {currentStep.id === "screening" && (
          <ScreeningStep
            questions={questions}
            answers={draft.answers}
            onChange={(answers) => setDraft({ ...draft, answers })}
          />
        )}

        {currentStep.id === "verifications" && (
          <VerificationStep
            requirements={verificationRequirements}
            credentials={credentials}
            values={draft.verifications}
            onChange={(verifications) =>
              setDraft({ ...draft, verifications })
            }
            onCredentialAdded={handleCredentialAdded}
          />
        )}

        {currentStep.id === "resume" && (
          <ResumeStep
            hasSavedResume={hasSavedResume}
            savedResumeName={savedResumeName}
            buildHref={`/candidate/resume/build?return=${encodeURIComponent(
              `/jobs/${jobId}/apply?built=1`
            )}`}
            resumeChoice={draft.resumeChoice}
            onResumeChoice={(c) => setDraft({ ...draft, resumeChoice: c })}
            resumeFile={resumeFile}
            onResumeFile={(f, err) => {
              setResumeFile(f);
              setResumeError(err);
              setAutofillNote(null);
            }}
            resumeError={resumeError}
            onAutofill={autofillFromResume}
            autofilling={autofilling}
            autofillNote={autofillNote}
            canAddResumeCreds={canAddResumeCreds}
            resumeCredCount={resumeCredCount}
            onAddCredentials={addResumeCredentials}
            addingCreds={addingCreds}
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
            firstName={draft.firstName}
            lastName={draft.lastName}
            questions={questions}
            answers={draft.answers}
            verificationRequirements={verificationRequirements}
            verifications={draft.verifications}
            credentials={credentials}
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

      </WizardShell>

      <p className="text-[13px] text-slate-meta leading-relaxed">
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

type StepId =
  | "intro"
  | "screening"
  | "verifications"
  | "resume"
  | "cover"
  | "review";

/* ───────────────────────────────────────────────────────────────
 * Step 1 — Intro
 * ───────────────────────────────────────────────────────────── */

function IntroStep({
  jobTitle,
  dsoName,
  candidate,
  userEmail,
  existingApplication,
  firstName,
  lastName,
  onFirstNameChange,
  onLastNameChange,
}: {
  jobTitle: string;
  dsoName: string;
  candidate: CandidatePrefill;
  userEmail: string | null;
  existingApplication: { status: string } | null;
  firstName: string;
  lastName: string;
  onFirstNameChange: (name: string) => void;
  onLastNameChange: (name: string) => void;
}) {
  const composedName = composeName({
    first_name: firstName,
    last_name: lastName,
  });
  const prefill = buildPrefillSummary({
    ...candidate,
    full_name: composedName || candidate.full_name,
  });
  const trimmedName = composedName.trim();
  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Before you begin
        </div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-[-0.4px] text-ink leading-tight mb-3">
          You're applying as {trimmedName || userEmail || "yourself"}.
        </h2>
        <p className="text-[14px] text-slate-body leading-relaxed">
          {existingApplication
            ? `You already have an application on file for ${jobTitle} at ${dsoName}. Walking through these steps will update your existing application — it won't create a duplicate.`
            : `This wizard will walk you through screening questions, your resume, and a quick cover note for the hiring team at ${dsoName}.`}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <FieldShell
          label={
            <>
              First name <span className="text-heritage">*</span>
            </>
          }
        >
          <TextField
            value={firstName}
            onChange={onFirstNameChange}
            placeholder="Jordan"
          />
        </FieldShell>
        <FieldShell
          label={
            <>
              Last name <span className="text-heritage">*</span>
            </>
          }
        >
          <TextField
            value={lastName}
            onChange={onLastNameChange}
            placeholder="Rivera"
          />
        </FieldShell>
        <p className="text-[12px] leading-relaxed text-slate-meta sm:col-span-2">
          Required — the hiring team needs a real name on your application.
          We&apos;ll save this back to your profile.
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
                <dt className="text-[12px] font-semibold tracking-[1px] uppercase text-slate-meta">
                  {row.label}
                </dt>
                <dd className="text-[14px] text-ink mt-0.5">{row.value}</dd>
              </div>
            ))}
          </dl>
          <Link
            href="/candidate/profile"
            target="_blank"
            className="inline-flex items-center gap-1.5 mt-4 text-[12px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink transition-colors"
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
        <h2 className="text-xl sm:text-2xl font-bold tracking-[-0.4px] text-ink leading-tight">
          A few quick questions from the hiring team.
        </h2>
      </div>

      {questions.map((q, idx) => (
        <div key={q.id} className="space-y-2">
          <label className="block text-[14px] font-semibold text-ink leading-snug">
            <span className="text-slate-meta font-bold mr-2">{idx + 1}.</span>
            {q.prompt}
            {q.required && <span className="text-heritage ml-1">*</span>}
          </label>
          {q.helper_text && (
            <p className="text-[12px] text-slate-meta leading-relaxed">
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
  switch (question.kind) {
    case "short_text":
      return (
        <TextField
          value={value?.kind === "text" ? value.value : ""}
          onChange={(v) => onChange({ kind: "text", value: v })}
        />
      );
    case "long_text":
      return (
        <TextAreaField
          rows={4}
          value={value?.kind === "text" ? value.value : ""}
          onChange={(v) => onChange({ kind: "text", value: v })}
        />
      );
    case "number":
      return (
        <TextField
          type="number"
          inputMode="numeric"
          widthClass="w-44"
          value={value?.kind === "number" ? value.value : ""}
          onChange={(v) => onChange({ kind: "number", value: v })}
        />
      );
    case "yes_no":
      return (
        <OptionCards
          columns={2}
          value={value?.kind === "yes_no" ? value.value : ""}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
          onChange={(v) =>
            onChange({ kind: "yes_no", value: v as "yes" | "no" })
          }
        />
      );
    case "single_select":
      return (
        <OptionCards
          value={value?.kind === "single" ? value.value : ""}
          options={(question.options ?? []).map((opt) => ({
            value: opt.id,
            label: opt.label,
          }))}
          onChange={(v) => onChange({ kind: "single", value: v })}
        />
      );
    case "multi_select":
      return (
        <MultiChips
          value={value?.kind === "multi" ? value.value : []}
          options={(question.options ?? []).map((opt) => ({
            value: opt.id,
            label: opt.label,
          }))}
          onChange={(v) => onChange({ kind: "multi", value: v })}
        />
      );
    case "scale": {
      // The two end labels live in options ([{id:'low'},{id:'high'}]). The
      // answer is a 1–5 number, reusing the "number" AnswerValue shape.
      const opts = question.options ?? [];
      const low =
        opts.find((o) => o.id === "low")?.label || opts[0]?.label || "1";
      const high =
        opts.find((o) => o.id === "high")?.label || opts[1]?.label || "5";
      const num =
        value?.kind === "number" && value.value !== ""
          ? Number(value.value)
          : null;
      return (
        <ScaleSlider
          value={num !== null && Number.isFinite(num) ? num : null}
          onChange={(n) => onChange({ kind: "number", value: String(n) })}
          low={low}
          high={high}
        />
      );
    }
  }
}

/* ───────────────────────────────────────────────────────────────
 * Step — Verifications (5G.e Tier 2 — multi-credential + inline upload)
 *
 * For each recruiter-set verification requirement: show the
 * candidate-facing hint, an attest checkbox, and — when the type has a
 * credentialSource — a checklist of the candidate's matching profile
 * credentials to optionally link as proof (0..N), an inline "furnish a
 * credential" form for candidates who have none yet, and an optional note.
 * Mirrors the ScreeningStep structure + styling.
 * ───────────────────────────────────────────────────────────── */

const VERIFICATION_BASE_INPUT =
  "w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors leading-relaxed";

function VerificationStep({
  requirements,
  credentials,
  values,
  onChange,
  onCredentialAdded,
}: {
  requirements: JobVerificationRequirement[];
  credentials: CandidateCredential[];
  values: Record<string, VerificationValue>;
  onChange: (values: Record<string, VerificationValue>) => void;
  onCredentialAdded: (
    verificationType: string,
    cred: CandidateCredential
  ) => void;
}) {
  const update = (type: string, value: VerificationValue) => {
    onChange({ ...values, [type]: value });
  };

  return (
    <div className="space-y-7">
      <div>
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Verifications
        </div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-[-0.4px] text-ink leading-tight">
          Confirm what this role requires.
        </h2>
        <p className="text-[14px] text-slate-body leading-relaxed mt-2">
          The hiring team asked applicants to confirm the items below. Check
          each one you can attest to — and, where it helps, link one or more
          credentials as proof. The hiring team reviews what you provide; we
          don&apos;t verify it for them.
        </p>
      </div>

      {requirements.map((req, idx) => {
        const vt = getVerificationType(req.verification_type);
        const value = values[req.verification_type] ?? emptyVerification();
        // Filter the candidate's credentials to the source that backs
        // this verification type (null source → attestation only).
        const linkable = vt?.credentialSource
          ? credentials.filter((c) => c.source === vt.credentialSource)
          : [];
        const toggleCredential = (id: string) => {
          const next = value.linkedCredentialIds.includes(id)
            ? value.linkedCredentialIds.filter((x) => x !== id)
            : [...value.linkedCredentialIds, id];
          update(req.verification_type, {
            ...value,
            linkedCredentialIds: next,
          });
        };

        return (
          <div
            key={req.verification_type}
            className="space-y-3 border border-[var(--rule)] p-5"
          >
            <div className="text-[14px] font-semibold text-ink leading-snug">
              <span className="text-slate-meta font-bold mr-2">
                {idx + 1}.
              </span>
              {vt?.label ?? req.verification_type}
              {req.required && <span className="text-heritage ml-1">*</span>}
            </div>

            <CheckCard
              checked={value.attested}
              onChange={(c) =>
                update(req.verification_type, { ...value, attested: c })
              }
              label={vt?.candidateHint ?? "I confirm this requirement."}
            />

            {/* Multi-select credential linking — only for types backed by a
                profile credential source. */}
            {vt?.credentialSource && (
              <div>
                <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
                  Link credentials as proof{" "}
                  <span className="text-slate-meta font-medium normal-case tracking-normal text-[11px]">
                    (optional · pick any that apply)
                  </span>
                </label>

                {linkable.length > 0 ? (
                  <div className="space-y-2">
                    {linkable.map((c) => (
                      <CheckCard
                        key={c.id}
                        checked={value.linkedCredentialIds.includes(c.id)}
                        onChange={() => toggleCredential(c.id)}
                        label={c.label}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-slate-meta leading-relaxed">
                    No matching credential on your profile yet — you can still
                    attest above, or add one below without leaving this page.
                  </p>
                )}

                <InlineCredentialForm
                  credentialSource={vt.credentialSource}
                  onAdded={(cred) =>
                    onCredentialAdded(req.verification_type, cred)
                  }
                />
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
                Note{" "}
                <span className="text-slate-meta font-medium normal-case tracking-normal text-[11px]">
                  (optional)
                </span>
              </label>
              <TextAreaField
                rows={2}
                value={value.note}
                onChange={(v) =>
                  update(req.verification_type, { ...value, note: v })
                }
                placeholder="Anything the hiring team should know about this."
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Inline credential form (5G.e Tier 2 #2)
 *
 * Collapsible "+ Add a credential" affordance inside a verification card.
 * Lets a candidate furnish a credential — license / certification /
 * education — without leaving the apply flow. On success the new row
 * lands on their own profile and is appended to the picker + linked.
 *
 * Posture: this furnishes the candidate's OWN first-party credential. It
 * never asserts a verification outcome — the row is created unverified;
 * only the employer's diligence (or a sanctioned third-party service)
 * ever flips a verification status.
 * ───────────────────────────────────────────────────────────── */

function InlineCredentialForm({
  credentialSource,
  onAdded,
}: {
  credentialSource: NonNullable<CandidateCredential["source"]>;
  onAdded: (cred: CandidateCredential) => void;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-kind field state. Only the subset for the active kind is read on
  // submit, so a single flat object is fine.
  const [licenseType, setLicenseType] = useState("");
  const [licenseState, setLicenseState] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [certKind, setCertKind] = useState("");
  const [certLevel, setCertLevel] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [degree, setDegree] = useState("");
  const [fieldOfStudy, setFieldOfStudy] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const kind =
    credentialSource === "candidate_license"
      ? "license"
      : credentialSource === "candidate_certification"
        ? "certification"
        : "education";
  const supportsFile = kind === "license" || kind === "certification";

  const reset = () => {
    setLicenseType("");
    setLicenseState("");
    setLicenseNumber("");
    setCertKind("");
    setCertLevel("");
    setSchoolName("");
    setDegree("");
    setFieldOfStudy("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    setError(null);
  };

  const addLabel =
    kind === "license"
      ? "Add a license"
      : kind === "certification"
        ? "Add a certification"
        : "Add an education entry";

  const handleSubmit = async () => {
    setError(null);

    // Client-side required-field gate (server re-validates).
    if (kind === "license" && !licenseType.trim()) {
      setError("Choose a license type.");
      return;
    }
    if (kind === "certification" && !certKind.trim()) {
      setError("Choose a certification type.");
      return;
    }
    if (kind === "education" && !schoolName.trim()) {
      setError("Enter a school name.");
      return;
    }

    const fd = new FormData();
    fd.set("kind", kind);
    if (kind === "license") {
      fd.set("license_type", licenseType.trim());
      fd.set("state", licenseState.trim());
      fd.set("license_number", licenseNumber.trim());
    } else if (kind === "certification") {
      fd.set("cert_kind", certKind.trim());
      fd.set("cert_level", certLevel.trim());
    } else {
      fd.set("school_name", schoolName.trim());
      fd.set("degree", degree.trim());
      fd.set("field_of_study", fieldOfStudy.trim());
    }
    if (supportsFile && file) fd.set("file", file);

    setSubmitting(true);
    try {
      const result = await addInlineCredential(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onAdded(result.credential);
      reset();
      setOpen(false);
    } catch {
      setError("Something went wrong. Please retry.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </button>
    );
  }

  return (
    <div className="mt-3 border border-heritage/30 bg-heritage/[0.05] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep">
          {addLabel}
        </div>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-slate-meta hover:text-ink transition-colors"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {kind === "license" && (
        <>
          <div>
            <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-1.5">
              License type <span className="text-heritage">*</span>
            </label>
            <select
              value={licenseType}
              onChange={(e) => setLicenseType(e.target.value)}
              className={VERIFICATION_BASE_INPUT}
            >
              <option value="">Select a license type…</option>
              {LICENSE_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-1.5">
                State
              </label>
              <input
                type="text"
                value={licenseState}
                onChange={(e) => setLicenseState(e.target.value)}
                maxLength={2}
                placeholder="KS"
                className={VERIFICATION_BASE_INPUT}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-1.5">
                License number
              </label>
              <input
                type="text"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                placeholder="Optional"
                className={VERIFICATION_BASE_INPUT}
              />
            </div>
          </div>
        </>
      )}

      {kind === "certification" && (
        <>
          <div>
            <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-1.5">
              Certification <span className="text-heritage">*</span>
            </label>
            <select
              value={certKind}
              onChange={(e) => setCertKind(e.target.value)}
              className={VERIFICATION_BASE_INPUT}
            >
              <option value="">Select a certification…</option>
              {CERTIFICATION_KINDS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-1.5">
              Level / detail
            </label>
            <input
              type="text"
              value={certLevel}
              onChange={(e) => setCertLevel(e.target.value)}
              placeholder="Optional — e.g. Provider, Instructor"
              className={VERIFICATION_BASE_INPUT}
            />
          </div>
        </>
      )}

      {kind === "education" && (
        <>
          <div>
            <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-1.5">
              School <span className="text-heritage">*</span>
            </label>
            <input
              type="text"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="University of Kansas"
              className={VERIFICATION_BASE_INPUT}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-1.5">
                Degree
              </label>
              <input
                type="text"
                value={degree}
                onChange={(e) => setDegree(e.target.value)}
                placeholder="Optional — e.g. DDS, BS"
                className={VERIFICATION_BASE_INPUT}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-1.5">
                Field of study
              </label>
              <input
                type="text"
                value={fieldOfStudy}
                onChange={(e) => setFieldOfStudy(e.target.value)}
                placeholder="Optional"
                className={VERIFICATION_BASE_INPUT}
              />
            </div>
          </div>
        </>
      )}

      {supportsFile && (
        <div>
          <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-1.5">
            Supporting document{" "}
            <span className="text-slate-meta font-medium normal-case tracking-normal text-[11px]">
              (optional)
            </span>
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-[13px] text-ink file:mr-3 file:px-4 file:py-2 file:border-0 file:text-[10px] file:font-bold file:tracking-[1.5px] file:uppercase file:bg-ink file:text-ivory hover:file:bg-ink-soft file:cursor-pointer file:transition-colors"
          />
          <p className="mt-1 text-[11px] text-slate-meta leading-relaxed">
            PDF, PNG, JPEG, or WebP. Max 10 MB. You can also add this later
            from your profile.
          </p>
        </div>
      )}

      {error && (
        <p className="text-[13px] text-red-700 leading-relaxed">{error}</p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-ink text-ivory text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? "Adding…" : "Add credential"}
          {!submitting && <Check className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="px-4 py-2 border border-[var(--rule-strong)] text-ink text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-cream transition-colors"
        >
          Cancel
        </button>
      </div>
      <p className="text-[11px] text-slate-meta leading-relaxed">
        This is saved to your profile as your own credential. The hiring team
        reviews it — DSO Hire doesn&apos;t verify or score it.
      </p>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Step 3 — Resume
 * ───────────────────────────────────────────────────────────── */

function ResumeStep({
  hasSavedResume,
  savedResumeName,
  buildHref,
  resumeChoice,
  onResumeChoice,
  resumeFile,
  onResumeFile,
  resumeError,
  onAutofill,
  autofilling,
  autofillNote,
  canAddResumeCreds,
  resumeCredCount,
  onAddCredentials,
  addingCreds,
}: {
  hasSavedResume: boolean;
  savedResumeName: string | null;
  buildHref: string;
  resumeChoice: "saved" | "upload";
  onResumeChoice: (c: "saved" | "upload") => void;
  resumeFile: File | null;
  onResumeFile: (f: File | null, err: string | null) => void;
  resumeError: string | null;
  onAutofill: () => void;
  autofilling: boolean;
  autofillNote: string | null;
  canAddResumeCreds: boolean;
  resumeCredCount: number;
  onAddCredentials: () => void;
  addingCreds: boolean;
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
        <h2 className="text-xl sm:text-2xl font-bold tracking-[-0.4px] text-ink leading-tight">
          {hasSavedResume
            ? "Use your saved resume, or upload a fresh one."
            : "Upload your resume."}
        </h2>
      </div>

      {!hasSavedResume && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-heritage/30 bg-heritage/5 px-4 py-3">
          <p className="text-[13px] text-slate-body leading-snug">
            No résumé handy? Build a clean, ATS-safe one free from your
            profile — we&apos;ll save it and attach it here.
          </p>
          <Link
            href={buildHref}
            className="shrink-0 whitespace-nowrap text-[12px] font-bold uppercase tracking-[1px] text-heritage-deep hover:text-ink"
          >
            Build one free →
          </Link>
        </div>
      )}

      {hasSavedResume && (
        <FieldShell label="Which resume?">
          <OptionCards
            value={resumeChoice}
            onChange={(v) => onResumeChoice(v as "saved" | "upload")}
            options={[
              {
                value: "saved",
                label: "Use my saved resume",
                hint: savedResumeName ?? "Stored on your profile",
              },
              {
                value: "upload",
                label: "Upload a different resume for this application",
                hint: "Replace just for this role; doesn't change your saved resume.",
              },
            ]}
          />
        </FieldShell>
      )}

      {(!hasSavedResume || resumeChoice === "upload") && (
        <FieldShell
          label={
            <>
              Resume file{" "}
              {!hasSavedResume && <span className="text-heritage">*</span>}
            </>
          }
          error={resumeError}
        >
          <FileField
            file={resumeFile}
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            hint="PDF, DOC or DOCX · up to 10 MB"
            onFile={(f) => {
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
          />
        </FieldShell>
      )}

      {resumeFile && (
        <div className="border border-[var(--rule)] bg-cream/40 p-4">
          <button
            type="button"
            onClick={onAutofill}
            disabled={autofilling}
            className="inline-flex items-center gap-2 border border-heritage-deep px-4 py-2.5 text-[12px] font-bold uppercase tracking-[1.5px] text-heritage-deep transition-colors hover:bg-heritage/10 disabled:opacity-50"
          >
            <BrandMark className="h-4 w-4" />
            {autofilling
              ? "Reading your résumé…"
              : "Autofill my details from this résumé"}
          </button>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-meta">
            Optional — we&apos;ll read your name from the file to save you
            typing. You review everything before submitting.
          </p>
          {autofillNote && (
            <p className="mt-2 text-[13px] font-semibold leading-relaxed text-heritage-deep">
              {autofillNote}
            </p>
          )}
        </div>
      )}

      {canAddResumeCreds && (
        <div className="border border-heritage/40 bg-heritage/[0.05] p-4">
          <p className="text-[14px] font-semibold text-ink">
            We spotted {resumeCredCount} credential
            {resumeCredCount === 1 ? "" : "s"} on your résumé.
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-meta">
            Add your licenses, certifications, and education to your profile so
            you can attach them as proof in this application.
          </p>
          <button
            type="button"
            onClick={onAddCredentials}
            disabled={addingCreds}
            className="mt-3 inline-flex items-center gap-2 bg-ink px-4 py-2.5 text-[12px] font-bold uppercase tracking-[1.5px] text-ivory transition-colors hover:bg-ink-soft disabled:opacity-50"
          >
            <BrandMark dark className="h-4 w-4" />
            {addingCreds ? "Adding…" : "Add to my profile"}
          </button>
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
        <h2 className="text-xl sm:text-2xl font-bold tracking-[-0.4px] text-ink leading-tight">
          Why are you a fit for this role?
        </h2>
      </div>

      <TextAreaField
        value={value}
        onChange={onChange}
        rows={8}
        placeholder={`A short note to the hiring team. Mention what excites you about this ${jobTitle.toLowerCase()} role and what experience makes you a fit.`}
      />
      <p className="text-[13px] text-slate-meta leading-relaxed">
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
  firstName,
  lastName,
  questions,
  answers,
  verificationRequirements,
  verifications,
  credentials,
  coverLetter,
  resumeChoice,
  resumeFile,
  savedResumeName,
  onJumpTo,
}: {
  jobTitle: string;
  dsoName: string;
  candidate: { id: string } & CandidatePrefill;
  firstName: string;
  lastName: string;
  questions: ScreeningQuestion[];
  answers: Record<string, AnswerValue>;
  verificationRequirements: JobVerificationRequirement[];
  verifications: Record<string, VerificationValue>;
  credentials: CandidateCredential[];
  coverLetter: string;
  resumeChoice: "saved" | "upload";
  resumeFile: File | null;
  savedResumeName: string | null;
  onJumpTo: (s: StepId) => void;
}) {
  // Surface the typed-in name to the completeness widget so it doesn't tell
  // the candidate "your profile is missing your name" after they just typed
  // it on Step 1.
  const composedName = composeName({
    first_name: firstName,
    last_name: lastName,
  });
  const completeness = computeProfileCompleteness({
    ...candidate,
    full_name: composedName || candidate.full_name,
  });
  const trimmedName = composedName.trim();

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Review
        </div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-[-0.4px] text-ink leading-tight">
          Final check before you send.
        </h2>
        <p className="text-[14px] text-slate-body leading-relaxed mt-2">
          You're applying to <span className="font-semibold text-ink">{jobTitle}</span>{" "}
          at <span className="font-semibold text-ink">{dsoName}</span>.
        </p>
      </div>

      <ReviewBlock label="Your name" onEdit={() => onJumpTo("intro")}>
        {trimmedName ? (
          <p className="text-[14px] text-ink">{trimmedName}</p>
        ) : (
          <p className="text-[14px] text-red-700">
            Missing — go back and add your full name before submitting.
          </p>
        )}
      </ReviewBlock>

      {questions.length > 0 && (
        <ReviewBlock
          label="Screening answers"
          onEdit={() => onJumpTo("screening")}
        >
          <ul className="space-y-3">
            {questions.map((q) => (
              <li key={q.id}>
                <div className="text-[12px] font-semibold text-slate-meta mb-0.5">
                  {q.prompt}
                </div>
                <div className="text-[14px] text-ink">
                  {formatAnswer(q, answers[q.id]) || (
                    <span className="text-slate-meta italic">No answer</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </ReviewBlock>
      )}

      {verificationRequirements.length > 0 && (
        <ReviewBlock
          label="Verifications"
          onEdit={() => onJumpTo("verifications")}
        >
          <ul className="space-y-3">
            {verificationRequirements.map((req) => {
              const vt = getVerificationType(req.verification_type);
              const v = verifications[req.verification_type];
              const linkedCreds = (v?.linkedCredentialIds ?? [])
                .map((id) => credentials.find((c) => c.id === id))
                .filter((c): c is CandidateCredential => Boolean(c));
              return (
                <li key={req.verification_type}>
                  <div className="text-[12px] font-semibold text-slate-meta mb-0.5">
                    {vt?.label ?? req.verification_type}
                    {req.required && (
                      <span className="text-heritage ml-1">*</span>
                    )}
                  </div>
                  <div className="text-[14px] text-ink">
                    {v?.attested ? (
                      <>Confirmed</>
                    ) : (
                      <span className="text-slate-meta italic">
                        Not confirmed
                      </span>
                    )}
                  </div>
                  {linkedCreds.length > 0 && (
                    <div className="text-[13px] text-slate-body mt-0.5">
                      Linked proof:{" "}
                      {linkedCreds.map((c) => c.label).join(", ")}
                    </div>
                  )}
                  {v?.note?.trim() && (
                    <div className="text-[13px] text-slate-body mt-0.5 whitespace-pre-wrap">
                      Note: {v.note.trim()}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </ReviewBlock>
      )}

      <ReviewBlock label="Resume" onEdit={() => onJumpTo("resume")}>
        <p className="text-[14px] text-ink">
          {resumeChoice === "upload" && resumeFile
            ? `Uploading: ${resumeFile.name}`
            : resumeChoice === "saved" && savedResumeName
            ? `Using saved resume: ${savedResumeName}`
            : "No resume attached"}
        </p>
      </ReviewBlock>

      <ReviewBlock label="Cover letter" onEdit={() => onJumpTo("cover")}>
        {coverLetter.trim() ? (
          <p className="text-[14px] text-ink whitespace-pre-wrap leading-relaxed">
            {coverLetter}
          </p>
        ) : (
          <p className="text-[14px] text-slate-meta italic">
            No cover letter — you can still submit, but personalized cover
            letters get more interviews.
          </p>
        )}
      </ReviewBlock>

      {completeness.percent < 100 && (
        <div className="border-l-4 border-heritage bg-heritage/[0.06] p-4">
          <div className="text-[12px] font-bold tracking-[1.5px] uppercase text-heritage-deep mb-1">
            Your profile is {completeness.percent}% complete
          </div>
          <p className="text-[13px] text-slate-body leading-relaxed">
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
      case "scale":
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
    case "scale":
      return { kind: "number", value: "" };
  }
}

function emptyVerification(): VerificationValue {
  return {
    attested: false,
    linkedCredentialIds: [],
    note: "",
  };
}

function seedVerificationsFromExisting(
  requirements: JobVerificationRequirement[],
  existing: ExistingVerification[],
  credentials: CandidateCredential[]
): Record<string, VerificationValue> {
  const out: Record<string, VerificationValue> = {};
  for (const req of requirements) {
    const prior = existing.find(
      (e) => e.verification_type === req.verification_type
    );
    if (!prior) {
      // #70 — pre-link any profile credentials that already match this
      // requirement's source (e.g. an on-file license for a license check),
      // so the candidate never re-selects what they've already provided.
      // They still actively attest; only the proof is pre-attached.
      const vt = getVerificationType(req.verification_type);
      const preLinked = vt?.credentialSource
        ? credentials
            .filter((c) => c.source === vt.credentialSource)
            .map((c) => c.id)
        : [];
      out[req.verification_type] = {
        attested: false,
        linkedCredentialIds: preLinked,
        note: "",
      };
      continue;
    }
    out[req.verification_type] = {
      attested: prior.attested,
      linkedCredentialIds: prior.linkedCredentials.map((c) => c.id),
      note: prior.note ?? "",
    };
  }
  return out;
}

/**
 * Coerce a localStorage-hydrated verifications map into the current
 * VerificationValue shape. Older drafts (pre migration ...004) stored a
 * single linkedCredentialType/Id pair; the field is now linkedCredentialIds[].
 * Anything unrecognized falls back to an empty verification.
 */
function normalizeVerifications(
  raw: Record<string, unknown>
): Record<string, VerificationValue> {
  const out: Record<string, VerificationValue> = {};
  for (const [type, val] of Object.entries(raw ?? {})) {
    if (!val || typeof val !== "object") {
      out[type] = emptyVerification();
      continue;
    }
    const v = val as Record<string, unknown>;
    let ids: string[] = [];
    if (Array.isArray(v.linkedCredentialIds)) {
      ids = v.linkedCredentialIds.filter(
        (x): x is string => typeof x === "string" && x.length > 0
      );
    } else if (typeof v.linkedCredentialId === "string" && v.linkedCredentialId) {
      // Legacy single-credential shape.
      ids = [v.linkedCredentialId];
    }
    out[type] = {
      attested: v.attested === true,
      linkedCredentialIds: ids,
      note: typeof v.note === "string" ? v.note : "",
    };
  }
  return out;
}

function findMissingRequiredVerification(
  requirements: JobVerificationRequirement[],
  values: Record<string, VerificationValue>
): JobVerificationRequirement | null {
  for (const req of requirements) {
    if (!req.required) continue;
    const v = values[req.verification_type];
    if (!v || !v.attested) return req;
  }
  return null;
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
