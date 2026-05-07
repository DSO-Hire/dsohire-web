/**
 * LLM-driven resume parsing (Phase 4.1.c, parity sprint).
 *
 * Takes plain text from `./extract.ts` and asks Haiku 4.5 to return a
 * structured `ParsedResume` payload that the review-and-confirm UI
 * renders inline. Per locked rule R8 we NEVER silent-fill; the candidate
 * always reviews + confirms before writes hit the structured profile
 * tables.
 *
 * Design notes
 * ─────────────
 * • Single-shot, no streaming. Resumes are short enough.
 * • Structured-output mode via system-prompt JSON-schema constraint
 *   (same pattern as `jd-generator-action.ts`). When Haiku gains a true
 *   tool-use / structured-output API we can swap it in here without
 *   changing the public type contract.
 * • Per-field confidence tier (`high` | `medium` | `low`) — the review
 *   UI uses this to pre-flag low-confidence fields red so the candidate
 *   knows what to double-check.
 * • Privacy redaction (locked rule R1): the prompt explicitly tells the
 *   model NOT to emit SSN, DOB, or DEA numbers even if the resume
 *   contains them. If detected, the model raises a flag in
 *   `flagged_redactions` so the UI can surface a "we ignored these
 *   fields on purpose" disclosure.
 * • Controlled enums (specialty, PMS systems, license types) live in
 *   the system prompt rather than the schema. Free-text fallback if the
 *   model surfaces something we don't yet recognize — we'd rather
 *   capture the data and let the candidate correct it than drop it.
 *
 * Server-only — never import from a "use client" file.
 */

import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import {
  getAnthropic,
  HAIKU_MODEL,
  estimateHaikuCostUsd,
} from "@/lib/ai/anthropic";
import { logAiUsage } from "@/lib/ai/usage";
import { extractJson } from "@/lib/ai/extract-json";

// ─────────────────────────────────────────────────────────────────────
// Output schema
// ─────────────────────────────────────────────────────────────────────

const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export type ConfidenceTier = z.infer<typeof ConfidenceSchema>;

const FieldSchema = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value: value.nullable(),
    confidence: ConfidenceSchema,
  });

const WorkHistoryEntrySchema = z.object({
  title: FieldSchema(z.string()),
  company_name: FieldSchema(z.string()),
  is_dso: FieldSchema(z.boolean()),
  start_date: FieldSchema(z.string()),         // ISO 8601 (YYYY-MM-DD or YYYY-MM)
  end_date: FieldSchema(z.string()),
  is_current: FieldSchema(z.boolean()),
  description: FieldSchema(z.string()),
  pms_systems_used: FieldSchema(z.array(z.string())),
  procedures_performed: FieldSchema(z.array(z.string())),
});

const EducationEntrySchema = z.object({
  school_name: FieldSchema(z.string()),
  degree: FieldSchema(z.string()),
  field_of_study: FieldSchema(z.string()),
  start_year: FieldSchema(z.number().int()),
  end_year: FieldSchema(z.number().int()),
  description: FieldSchema(z.string()),
});

const LicenseEntrySchema = z.object({
  // Free-form; combobox in UI restricts to canonical types
  // (DDS, DMD, RDH, CDA, EFDA, etc.)
  license_type: FieldSchema(z.string()),
  license_number: FieldSchema(z.string()),
  state: FieldSchema(z.string()),              // 2-letter US state code
  issued_date: FieldSchema(z.string()),
  expires_date: FieldSchema(z.string()),
});

const CertificationEntrySchema = z.object({
  // 'cpr_bls', 'anesthesia_local', 'anesthesia_general', 'nitrous',
  // 'sedation_oral', 'sedation_iv', 'radiology', 'osha', etc.
  kind: FieldSchema(z.string()),
  level: FieldSchema(z.string()),
  issued_date: FieldSchema(z.string()),
  expires_date: FieldSchema(z.string()),
});

export const ParsedResumeSchema = z.object({
  basics: z.object({
    full_name: FieldSchema(z.string()),
    headline: FieldSchema(z.string()),         // suggested 1-line headline
    summary: FieldSchema(z.string()),          // 2–4 sentence professional summary
    email: FieldSchema(z.string()),
    phone: FieldSchema(z.string()),
    pronouns: FieldSchema(z.string()),
    current_location_city: FieldSchema(z.string()),
    current_location_state: FieldSchema(z.string()),
    years_experience_dental: FieldSchema(z.number().int()),
    linkedin_url: FieldSchema(z.string()),
  }),
  work_history: z.array(WorkHistoryEntrySchema),
  education: z.array(EducationEntrySchema),
  licenses: z.array(LicenseEntrySchema),
  certifications: z.array(CertificationEntrySchema),
  skills: z.array(z.string()),
  languages: z.array(z.string()),
  desired_roles: z.array(z.string()),
  desired_specialty: z.array(z.string()),
  /**
   * Items the model deliberately did NOT extract per privacy rules:
   * { kind: 'ssn' | 'dob' | 'dea' | 'other', note?: string }[]
   * Surfaced in the review UI as "we ignored these on purpose."
   */
  flagged_redactions: z.array(
    z.object({
      kind: z.enum(["ssn", "dob", "dea", "other"]),
      note: z.string().nullable(),
    })
  ),
});

export type ParsedResume = z.infer<typeof ParsedResumeSchema>;

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

export type ParseResumeResult =
  | {
      ok: true;
      parsed: ParsedResume;
      usage: { input_tokens: number; output_tokens: number; cost_usd: number };
    }
  | { ok: false; error: string; errorCode: ParseErrorCode };

export type ParseErrorCode =
  | "ai_request_failed"
  | "ai_parse_failed"
  | "input_too_short"
  | "input_too_long";

/** Soft input bounds; defensive against pathological inputs. */
const MIN_INPUT_CHARS = 80;
const MAX_INPUT_CHARS = 60_000;

export interface ParseResumeWithAIInput {
  /** Plain-text resume body from `extract.ts`. */
  text: string;
  /** auth.users.id of the candidate. Used for usage logging. */
  userId: string;
}

export async function parseResumeWithAI(
  input: ParseResumeWithAIInput
): Promise<ParseResumeResult> {
  const text = input.text.trim();
  if (text.length < MIN_INPUT_CHARS) {
    return {
      ok: false,
      errorCode: "input_too_short",
      error:
        "We couldn't pull enough text from this resume. Try a different file or paste your summary manually.",
    };
  }
  if (text.length > MAX_INPUT_CHARS) {
    return {
      ok: false,
      errorCode: "input_too_long",
      error:
        "This resume is too long for the parser. Trim to the most recent 8 pages and try again.",
    };
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(text);

  let response: Anthropic.Messages.Message;
  try {
    response = await getAnthropic().messages.create({
      model: HAIKU_MODEL,
      // Resumes are bounded; 4000 covers a long parsed payload comfortably.
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    await logAiUsage({
      dsoId: null,
      userId: input.userId,
      feature: "resume_parse",
      model: HAIKU_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      costUsdEstimate: 0,
      requestMetadata: { error: message, input_chars: text.length },
      succeeded: false,
      errorMessage: message,
    });
    return {
      ok: false,
      errorCode: "ai_request_failed",
      error: "We couldn't reach the parsing service. Try again in a moment.",
    };
  }

  const rawText = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  let parsed: ParsedResume;
  try {
    const json = extractJson(rawText);
    parsed = ParsedResumeSchema.parse(json);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not parse AI response";
    await logAiUsage({
      dsoId: null,
      userId: input.userId,
      feature: "resume_parse",
      model: HAIKU_MODEL,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costUsdEstimate: estimateHaikuCostUsd(
        response.usage.input_tokens,
        response.usage.output_tokens
      ),
      requestMetadata: {
        parse_error: message,
        raw_preview: rawText.slice(0, 500),
        input_chars: text.length,
      },
      succeeded: false,
      errorMessage: message,
    });
    return {
      ok: false,
      errorCode: "ai_parse_failed",
      error:
        "The parser hit an unexpected response shape. Try again or paste your details manually.",
    };
  }

  const cost = estimateHaikuCostUsd(
    response.usage.input_tokens,
    response.usage.output_tokens
  );

  await logAiUsage({
    dsoId: null,
    userId: input.userId,
    feature: "resume_parse",
    model: HAIKU_MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    costUsdEstimate: cost,
    requestMetadata: {
      input_chars: text.length,
      work_entries: parsed.work_history.length,
      license_entries: parsed.licenses.length,
      had_redactions: parsed.flagged_redactions.length > 0,
    },
  });

  return {
    ok: true,
    parsed,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cost_usd: cost,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// Prompts
// ─────────────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are a dental-industry resume parser for the DSO Hire job board. You read a candidate's resume (raw text) and emit a strict JSON object describing what the resume says.

────────────────────────────────────────────────────────
PRIVACY REDACTION (NON-NEGOTIABLE)
────────────────────────────────────────────────────────
NEVER emit any of the following, even if the resume contains them:
  • Social Security Numbers (SSN) — any 9-digit pattern with dashes or otherwise
  • Date of birth (DOB) — month + day + year of birth
  • DEA registration numbers — DSO Hire never collects DEA, full stop

If the resume contains any of these, add an entry to "flagged_redactions"
with the matching kind ('ssn' | 'dob' | 'dea' | 'other'). Do NOT include
the actual value in the note field — just describe its location ("listed
in the header line above contact info").

────────────────────────────────────────────────────────
OUTPUT FORMAT
────────────────────────────────────────────────────────
Output ONLY a single JSON object. No prose, no code fences, no commentary.
Use null for any field you cannot extract — do NOT guess. Confidence
tiers:
  • high   — the value is explicitly stated in the resume
  • medium — the value is inferable from context (one reasonable reading)
  • low    — the value is a best-guess that the candidate should review
            (use this whenever you are uncertain)

Every field is wrapped in { "value": ..., "confidence": "high"|"medium"|"low" }.
For arrays of strings (skills, languages, desired_roles, desired_specialty),
emit a clean array of trimmed strings — no confidence wrapper at the array
level. For arrays of objects (work_history, education, licenses,
certifications), each property inside each object IS confidence-wrapped.

Schema (every property is REQUIRED in the output; use null when unknown):
{
  "basics": {
    "full_name":               { "value": string|null, "confidence": ... },
    "headline":                { "value": string|null, "confidence": ... },   // a 1-line professional headline you SUGGEST based on the resume
    "summary":                 { "value": string|null, "confidence": ... },   // 2–4 sentence summary, professional voice, no marketing fluff
    "email":                   { "value": string|null, "confidence": ... },
    "phone":                   { "value": string|null, "confidence": ... },
    "pronouns":                { "value": string|null, "confidence": ... },
    "current_location_city":   { "value": string|null, "confidence": ... },
    "current_location_state":  { "value": string|null, "confidence": ... },   // 2-letter US state code (e.g., "KS")
    "years_experience_dental": { "value": number|null, "confidence": ... },   // integer, derived from work history dates
    "linkedin_url":            { "value": string|null, "confidence": ... }
  },
  "work_history": [
    {
      "title":                { "value": string|null, ... },
      "company_name":         { "value": string|null, ... },
      "is_dso":               { "value": boolean|null, ... },                 // true if the employer is a DSO
      "start_date":           { "value": "YYYY-MM"|"YYYY-MM-DD"|null, ... },
      "end_date":             { "value": "YYYY-MM"|"YYYY-MM-DD"|null, ... },
      "is_current":           { "value": boolean|null, ... },
      "description":          { "value": string|null, ... },
      "pms_systems_used":     { "value": string[]|null, ... },                // see canonical list below
      "procedures_performed": { "value": string[]|null, ... }
    }
  ],
  "education": [
    {
      "school_name":     { "value": string|null, ... },
      "degree":          { "value": string|null, ... },                       // "DDS", "DMD", "BS Dental Hygiene", etc.
      "field_of_study":  { "value": string|null, ... },
      "start_year":      { "value": number|null, ... },
      "end_year":        { "value": number|null, ... },
      "description":     { "value": string|null, ... }
    }
  ],
  "licenses": [
    {
      "license_type":   { "value": string|null, ... },                        // canonical types below
      "license_number": { "value": string|null, ... },
      "state":          { "value": string|null, ... },                        // 2-letter US state code
      "issued_date":    { "value": "YYYY-MM-DD"|null, ... },
      "expires_date":   { "value": "YYYY-MM-DD"|null, ... }
    }
  ],
  "certifications": [
    {
      "kind":         { "value": string|null, ... },                          // canonical kinds below
      "level":        { "value": string|null, ... },                          // "Provider", "Instructor", etc.
      "issued_date":  { "value": "YYYY-MM-DD"|null, ... },
      "expires_date": { "value": "YYYY-MM-DD"|null, ... }
    }
  ],
  "skills":            string[],                                              // dental-relevant skills only; deduped
  "languages":         string[],                                              // ISO English names ("Spanish", not "es")
  "desired_roles":     string[],                                              // canonical role categories below
  "desired_specialty": string[],                                              // canonical specialties below
  "flagged_redactions": [{ "kind": "ssn"|"dob"|"dea"|"other", "note": string|null }]
}

────────────────────────────────────────────────────────
CANONICAL ENUMS (prefer these values when applicable)
────────────────────────────────────────────────────────

Role categories (desired_roles):
  associate_dentist, specialist_dentist, hygienist, assistant,
  front_desk, office_manager, regional_manager, dso_corporate

Specialties (desired_specialty):
  general_dentistry, pediatric_dentistry, orthodontics, endodontics,
  periodontics, prosthodontics, oral_surgery, oral_medicine,
  dental_anesthesiology, public_health_dentistry

License types (licenses[].license_type):
  DDS, DMD, RDH, CDA, RDA, EFDA, EFODA, RDAEF, OMS, NDB, NDH

PMS systems (work_history[].pms_systems_used items):
  Dentrix, Eaglesoft, Open Dental, Curve Dental, Carestream Soft Dent,
  Practice-Web, ABELDent, Denticon, MOGO, Tab32, Adit, Dentolus

Certification kinds (certifications[].kind):
  cpr_bls, anesthesia_local, anesthesia_general, nitrous,
  sedation_oral, sedation_iv, radiology, osha, hipaa, infection_control

If you encounter something not in the canonical list, emit the resume's
own phrasing as a free-text string and let the candidate canonicalize it
in the review UI.

────────────────────────────────────────────────────────
GUIDANCE
────────────────────────────────────────────────────────
• If the resume reads "Currently at" or there is no end_date, set
  is_current.value = true and end_date.value = null.
• years_experience_dental: sum of years across all dental-relevant work
  history. Round to a whole number. If the resume is brand-new (e.g. a
  recent grad), emit 0 with confidence 'high'.
• summary should reflect the candidate's voice from the resume — DO NOT
  add achievements that aren't in the source.
• If the resume contains a clinical specialty (e.g. "perio"), prefer the
  canonical English term ("periodontics") in desired_specialty, but
  preserve original phrasing as a skill if it's specific.
• Confidence is YOUR judgment of correctness, not the candidate's.
  Default to 'medium' when unsure; reserve 'high' for explicit values.`;
}

function buildUserPrompt(text: string): string {
  return `Parse the following resume into the JSON schema specified in the system prompt. Output only the JSON object — no surrounding prose.

──── RESUME BEGIN ────
${text}
──── RESUME END ────

Return only the JSON object.`;
}

// extractJson lives in src/lib/ai/extract-json.ts — shared across every
// AI surface so the parser fix from 2026-05-07 (Haiku adding preamble
// breaking the naive fenced-block matcher) covers everything at once.
