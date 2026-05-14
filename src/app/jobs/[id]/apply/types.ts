/**
 * Shared types for the apply wizard. Kept in their own file so the page
 * (server component), wizard (client component), and server action all
 * pull from one source.
 */

export type ScreeningQuestionKind =
  | "short_text"
  | "long_text"
  | "yes_no"
  | "single_select"
  | "multi_select"
  | "number";

export interface ScreeningQuestionOption {
  id: string;
  label: string;
}

export interface ScreeningQuestion {
  id: string;
  prompt: string;
  helper_text: string | null;
  kind: ScreeningQuestionKind;
  options: ScreeningQuestionOption[] | null;
  required: boolean;
  sort_order: number;
}

export type CandidateAvailability =
  | "immediate"
  | "2_weeks"
  | "1_month"
  | "passive"
  | null;

export interface CandidatePrefill {
  full_name: string | null;
  headline: string | null;
  summary: string | null;
  years_experience: number | null;
  current_title: string | null;
  availability: CandidateAvailability;
  linkedin_url: string | null;
  phone: string | null;
}

export interface ExistingAnswer {
  question_id: string;
  answer_text: string | null;
  answer_choice: string | null;
  answer_choices: string[] | null;
  answer_number: number | null;
}

/* ───────────────────────────────────────────────────────────────
 * Verifications (5G.e Tier 2)
 *
 * A job can carry recruiter-set verification requirements. When the
 * candidate applies, they self-attest to each required type and may
 * optionally link an existing profile credential as proof. Mirrors
 * the screening-question shape (job-side requirement + per-application
 * row + wizard draft state).
 * ───────────────────────────────────────────────────────────── */

/** A verification the job requires — straight from job_verification_requirements. */
export interface JobVerificationRequirement {
  verification_type: string;
  required: boolean;
}

/**
 * A candidate profile credential the wizard can offer as linkable proof.
 * One normalized shape across licenses / certifications / education so
 * the wizard's dropdown doesn't have to branch per source.
 */
export interface CandidateCredential {
  /** Which profile table this came from — matches VerificationType.credentialSource. */
  source: "candidate_license" | "candidate_certification" | "candidate_education";
  /** The row id in its source table. */
  id: string;
  /** Human-readable label for the dropdown option. */
  label: string;
}

/** A previously-saved application_verifications row (edit/re-apply rehydration). */
export interface ExistingVerification {
  verification_type: string;
  attested: boolean;
  linked_credential_type: string | null;
  linked_credential_id: string | null;
  note: string | null;
}

/** Wizard draft state for one verification requirement. */
export interface VerificationValue {
  attested: boolean;
  /** Source table of the linked credential, or "" when none linked. */
  linkedCredentialType: "" | CandidateCredential["source"];
  /** Row id of the linked credential, or "" when none linked. */
  linkedCredentialId: string;
  note: string;
}

/**
 * Wizard draft state — what we persist to localStorage and submit on the
 * final step. Resume `File` cannot be serialized, so the draft only
 * remembers whether the candidate intended to upload a fresh resume; on
 * resume the file slot starts empty.
 *
 * `fullName` lives in the draft because legacy/imported candidate rows can
 * be missing it; the IntroStep prompts the candidate to confirm/enter their
 * name before continuing, and we persist it back to candidates.full_name on
 * submit.
 */
export interface WizardDraft {
  fullName: string;
  coverLetter: string;
  answers: Record<string, AnswerValue>;
  /** Keyed by verification_type. */
  verifications: Record<string, VerificationValue>;
  resumeChoice: "saved" | "upload";
}

export type AnswerValue =
  | { kind: "text"; value: string }
  | { kind: "yes_no"; value: "yes" | "no" | "" }
  | { kind: "single"; value: string }
  | { kind: "multi"; value: string[] }
  | { kind: "number"; value: string }; // string in form state, parsed at submit
