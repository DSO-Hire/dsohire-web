/**
 * Reference-check shared data (Phase 5A Track D).
 *
 * Single source of truth for the v1 reference-check question set + the
 * status enum + the URL pattern. Imported by:
 *   • the public form (/r/[token]) to render fields
 *   • the public form's submit action to validate payloads
 *   • the employer-side ReferencesSection to render completed responses
 *
 * No async exports — this file is a sibling of reference-actions.ts
 * (which is `"use server"` and must contain async exports only per
 * feedback_use_server_only_async.md).
 */

export const REFERENCE_REQUEST_STATUSES = [
  "pending",
  "sent",
  "completed",
  "declined",
] as const;

export type ReferenceRequestStatus =
  (typeof REFERENCE_REQUEST_STATUSES)[number];

/* ───────────────────────────────────────────────────────────────
 * Question schema
 * Locked content per Cam 2026-05-12. 7 fields, no sensitive data
 * (no SSN, DOB, federal identifiers). One optional field at the end.
 * ───────────────────────────────────────────────────────────── */

export type ReferenceFieldKind =
  | "text"
  | "long_text"
  | "scale_1_5"
  | "yes_no_maybe";

export interface ReferenceFieldDef {
  /** Stable key written into response_data[key]. */
  key: string;
  /** Field type — drives both rendering + validation. */
  kind: ReferenceFieldKind;
  /**
   * Prompt template. {candidate_name} is interpolated at render +
   * read time. We keep the raw template here so the same definition
   * powers the form prompt + the employer-side "View response" label.
   */
  promptTemplate: string;
  /** Optional one-liner under the prompt. */
  helperText?: string;
  /** Required by default; one field opts out. */
  required: boolean;
  /** Render hint — number of rows for long_text. */
  rows?: number;
}

export const REFERENCE_FIELDS: readonly ReferenceFieldDef[] = [
  {
    key: "relationship_duration",
    kind: "text",
    promptTemplate: "How long have you worked with {candidate_name}?",
    helperText: "1 sentence — e.g., 'I was their direct supervisor for 3 years at Smile Dental.'",
    required: true,
  },
  {
    key: "quality_of_work",
    kind: "scale_1_5",
    promptTemplate:
      "How would you rate {candidate_name}'s quality of clinical/professional work?",
    helperText: "1 = Poor · 5 = Excellent",
    required: true,
  },
  {
    key: "reliability",
    kind: "scale_1_5",
    promptTemplate: "Reliability and attendance",
    helperText: "1 = Poor · 5 = Excellent",
    required: true,
  },
  {
    key: "team_collaboration",
    kind: "scale_1_5",
    promptTemplate: "Teamwork and communication with colleagues",
    helperText: "1 = Poor · 5 = Excellent",
    required: true,
  },
  {
    key: "would_rehire",
    kind: "yes_no_maybe",
    promptTemplate:
      "If you had the opportunity, would you hire {candidate_name} again?",
    required: true,
  },
  {
    key: "strengths",
    kind: "long_text",
    promptTemplate: "What are {candidate_name}'s biggest strengths?",
    helperText: "3-5 sentences. Specific examples are great.",
    required: true,
    rows: 5,
  },
  {
    key: "concerns",
    kind: "long_text",
    promptTemplate:
      "Any concerns or areas for growth you'd want a future employer to know?",
    helperText: "Optional — you can leave this blank.",
    required: false,
    rows: 4,
  },
] as const;

/**
 * Response shape — keyed by REFERENCE_FIELDS[i].key. Values are
 * stringly-typed for scale + yes/no/maybe because the form posts
 * FormData; the server action narrows + validates.
 */
export type ReferenceResponse = Record<string, string | null>;

/* ───────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

/** Interpolate {candidate_name} into a prompt template. */
export function renderPrompt(
  template: string,
  candidateName: string | null
): string {
  return template.replaceAll("{candidate_name}", candidateName ?? "the candidate");
}

/**
 * Validate a submitted response against the field defs. Used by the
 * public submit action; the form's client-side validation is a courtesy
 * — this is the source of truth.
 */
export function validateReferenceResponse(
  raw: Record<string, unknown>
): { ok: true; data: ReferenceResponse } | { ok: false; error: string } {
  const out: ReferenceResponse = {};
  for (const field of REFERENCE_FIELDS) {
    const rawValue = raw[field.key];
    const value =
      typeof rawValue === "string" ? rawValue.trim() : rawValue == null ? "" : "";

    if (!value && !field.required) {
      out[field.key] = null;
      continue;
    }
    if (!value && field.required) {
      return {
        ok: false,
        error: `Please answer every required question (missing: ${field.key}).`,
      };
    }

    switch (field.kind) {
      case "scale_1_5": {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 5) {
          return {
            ok: false,
            error: "Please pick a rating between 1 and 5 for every scale question.",
          };
        }
        out[field.key] = String(n);
        break;
      }
      case "yes_no_maybe": {
        if (value !== "yes" && value !== "no" && value !== "maybe") {
          return {
            ok: false,
            error: "Please pick Yes, Maybe, or No.",
          };
        }
        out[field.key] = value;
        break;
      }
      case "text": {
        if (value.length > 500) {
          return {
            ok: false,
            error: "Short text answers must be 500 characters or fewer.",
          };
        }
        out[field.key] = value;
        break;
      }
      case "long_text": {
        if (value.length > 4000) {
          return {
            ok: false,
            error: "Long text answers must be 4000 characters or fewer.",
          };
        }
        out[field.key] = value;
        break;
      }
    }
  }
  return { ok: true, data: out };
}

/**
 * Pretty-print a stored value back to display copy for the employer-side
 * "View response" expander. Returns null for missing answers so the
 * caller can render an italic placeholder.
 */
export function formatReferenceAnswer(
  field: ReferenceFieldDef,
  value: string | null | undefined
): string | null {
  if (!value) return null;
  switch (field.kind) {
    case "scale_1_5":
      return `${value} / 5`;
    case "yes_no_maybe":
      if (value === "yes") return "Yes";
      if (value === "no") return "No";
      if (value === "maybe") return "Maybe";
      return value;
    case "text":
    case "long_text":
      return value;
  }
}

/** Build the canonical public URL for a reference token. Apex domain. */
export function referenceUrlForToken(token: string): string {
  return `https://dsohire.com/r/${token}`;
}
