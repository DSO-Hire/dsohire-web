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

/**
 * Wizard draft state — what we persist to localStorage and submit on the
 * final step. Resume `File` cannot be serialized, so the draft only
 * remembers whether the candidate intended to upload a fresh resume; on
 * resume the file slot starts empty.
 */
export interface WizardDraft {
  coverLetter: string;
  answers: Record<string, AnswerValue>;
  resumeChoice: "saved" | "upload";
}

export type AnswerValue =
  | { kind: "text"; value: string }
  | { kind: "yes_no"; value: "yes" | "no" | "" }
  | { kind: "single"; value: string }
  | { kind: "multi"; value: string[] }
  | { kind: "number"; value: string }; // string in form state, parsed at submit
