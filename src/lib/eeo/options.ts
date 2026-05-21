/**
 * Voluntary EEO / demographic self-identification option sets (E2.17).
 *
 * Shared by the apply-screen self-ID card and (later) the E6.8 aggregate
 * diversity report. `value` strings are stable slugs persisted to
 * `application_eeo_responses` and mirrored by the table's CHECK
 * constraints; `label` is display-only.
 *
 * This is a plain data module — it is intentionally NOT a "use server"
 * file, so it can be imported by both the client card and the server
 * action without tripping the "use server only exports async functions"
 * boundary rule.
 *
 * Option sets follow standard ATS voluntary self-ID norms (Greenhouse /
 * Lever). Every field carries an explicit "decline to self-identify"
 * value — answering is always voluntary and never gates the application.
 */

export const EEO_DECLINE = "decline" as const;

export interface EeoOption {
  value: string;
  label: string;
}

export const EEO_GENDER_OPTIONS: readonly EeoOption[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non_binary", label: "Non-binary" },
  { value: "decline", label: "I don't wish to answer" },
];

export const EEO_RACE_OPTIONS: readonly EeoOption[] = [
  { value: "hispanic_latino", label: "Hispanic or Latino" },
  { value: "white", label: "White" },
  { value: "black_african_american", label: "Black or African American" },
  {
    value: "native_hawaiian_pacific_islander",
    label: "Native Hawaiian or Other Pacific Islander",
  },
  { value: "asian", label: "Asian" },
  {
    value: "american_indian_alaska_native",
    label: "American Indian or Alaska Native",
  },
  { value: "two_or_more_races", label: "Two or more races" },
  { value: "decline", label: "I don't wish to answer" },
];

export const EEO_VETERAN_OPTIONS: readonly EeoOption[] = [
  {
    value: "protected_veteran",
    label: "I identify as one or more classifications of a protected veteran",
  },
  { value: "not_protected_veteran", label: "I am not a protected veteran" },
  { value: "decline", label: "I don't wish to answer" },
];

export const EEO_DISABILITY_OPTIONS: readonly EeoOption[] = [
  { value: "yes", label: "Yes, I have a disability (or have had one)" },
  { value: "no", label: "No, I do not have a disability" },
  { value: "decline", label: "I don't wish to answer" },
];

/** Stable column key for each EEO field. Matches the table columns. */
export type EeoFieldKey =
  | "gender"
  | "race_ethnicity"
  | "veteran_status"
  | "disability_status";

export interface EeoField {
  key: EeoFieldKey;
  label: string;
  options: readonly EeoOption[];
}

/** Ordered list driving both the apply card and (later) reporting. */
export const EEO_FIELDS: readonly EeoField[] = [
  { key: "gender", label: "Gender", options: EEO_GENDER_OPTIONS },
  { key: "race_ethnicity", label: "Race / ethnicity", options: EEO_RACE_OPTIONS },
  { key: "veteran_status", label: "Veteran status", options: EEO_VETERAN_OPTIONS },
  {
    key: "disability_status",
    label: "Disability status",
    options: EEO_DISABILITY_OPTIONS,
  },
];

const VALID_VALUES: Record<EeoFieldKey, ReadonlySet<string>> = {
  gender: new Set(EEO_GENDER_OPTIONS.map((o) => o.value)),
  race_ethnicity: new Set(EEO_RACE_OPTIONS.map((o) => o.value)),
  veteran_status: new Set(EEO_VETERAN_OPTIONS.map((o) => o.value)),
  disability_status: new Set(EEO_DISABILITY_OPTIONS.map((o) => o.value)),
};

/**
 * Validate a submitted value for a field. `null`/`""` is always valid
 * (the field was left blank — voluntary). Unknown slugs are rejected so
 * a malformed post can't slip past the table CHECK and 500.
 */
export function isValidEeoValue(
  key: EeoFieldKey,
  value: string | null | undefined
): boolean {
  if (value == null || value === "") return true;
  return VALID_VALUES[key].has(value);
}
