/**
 * Verification-type vocabulary (5G.e Tier 2, 2026-05-14).
 *
 * The canonical TS source for the five verification types in the v1
 * framework. The DB CHECK constraints on `job_verification_requirements`
 * and `application_verifications` (migration 20260514000003) mirror this
 * exact value set — keep them in sync (and ship a new migration if a value
 * is ever added or renamed; never edit an applied one).
 *
 * Tier 2 is attestation-only: the recruiter requires a type, the candidate
 * self-attests and may link an existing profile credential as proof.
 * `credentialSource` says which candidate-profile table backs that link.
 * Tier 3 (Checkr) later adds a verified-status path — it does not change
 * this vocabulary.
 *
 * Pattern mirrors src/lib/corporate/job-fields.ts.
 */

export interface VerificationType {
  /** Stable slug — used in DB writes + form values. Don't rename casually. */
  value: string;
  /** Display label for chips / checkboxes / headings. */
  label: string;
  /** Shown to the recruiter in the wizard — what they're requiring. */
  recruiterHint: string;
  /** Shown to the candidate in the apply flow — what they're attesting to. */
  candidateHint: string;
  /**
   * Which candidate-profile credential table can back this verification.
   * Drives the "link a credential as proof" picker in the apply flow.
   * null → attestation only, no linkable profile credential.
   */
  credentialSource:
    | "candidate_license"
    | "candidate_certification"
    | "candidate_education"
    | null;
}

export const VERIFICATION_TYPES = [
  {
    value: "professional_license",
    label: "Professional license",
    recruiterHint:
      "An active, unrestricted professional license (dental license, CPA, Bar, etc.).",
    candidateHint:
      "I hold an active, unrestricted professional license for this role.",
    credentialSource: "candidate_license",
  },
  {
    value: "education",
    label: "Education / degree",
    recruiterHint: "A specific degree or educational credential.",
    candidateHint:
      "I hold the degree or educational credential this role requires.",
    credentialSource: "candidate_education",
  },
  {
    value: "certification",
    label: "Professional certification",
    recruiterHint:
      "An industry certification (PHR, PMP, CDA/RDA, Invisalign, etc.).",
    candidateHint:
      "I hold the professional certification this role requires.",
    credentialSource: "candidate_certification",
  },
  {
    value: "right_to_work",
    label: "Right to work",
    recruiterHint: "Legal authorization to work in the U.S. (I-9 eligible).",
    candidateHint: "I am legally authorized to work in the U.S.",
    credentialSource: null,
  },
  {
    value: "background_check_consent",
    label: "Background check",
    recruiterHint:
      "Willingness to complete a background check after a conditional offer.",
    candidateHint:
      "I consent to complete a background check if a conditional offer is extended.",
    credentialSource: null,
  },
] as const;

export type VerificationTypeValue = (typeof VERIFICATION_TYPES)[number]["value"];

/** The credential-source slugs that can populate `linked_credential_type`. */
export type LinkedCredentialType = NonNullable<
  (typeof VERIFICATION_TYPES)[number]["credentialSource"]
>;

export const VERIFICATION_TYPE_VALUES: ReadonlyArray<VerificationTypeValue> =
  VERIFICATION_TYPES.map((v) => v.value);

export const VERIFICATION_TYPE_LABELS: Record<VerificationTypeValue, string> =
  VERIFICATION_TYPES.reduce(
    (acc, v) => {
      acc[v.value] = v.label;
      return acc;
    },
    {} as Record<VerificationTypeValue, string>
  );

export function getVerificationType(
  value: string
): VerificationType | undefined {
  return VERIFICATION_TYPES.find((v) => v.value === value);
}

/** Runtime guard — is `v` a valid verification-type slug? */
export function isVerificationType(v: unknown): v is VerificationTypeValue {
  return (
    typeof v === "string" &&
    VERIFICATION_TYPES.some((t) => t.value === v)
  );
}
