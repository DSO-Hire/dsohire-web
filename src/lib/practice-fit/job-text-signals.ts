/**
 * Job free-text signal detectors — extracted VERBATIM from
 * get-or-compute.ts (Lane 6, 2026-06-12) so the wizard's live
 * Matchability meter and the scoring engine read the SAME truth.
 * Pure + client-safe: imports only canonical lists (plain data).
 *
 * If detection rules change, they change HERE — both the engine
 * (get-or-compute) and the meter (matchability) import from this file,
 * so they cannot drift apart.
 */

import { PMS_SYSTEMS } from "@/lib/candidate/canonical-lists";

/**
 * Detect canonical PMS names mentioned in a job's free text (title +
 * requirements + description). The job side has no structured PMS field, so
 * this is how the pms_fluency dimension learns what the practice runs.
 * Word-boundary matched to avoid short names (e.g. "Adit") false-matching
 * inside other words.
 */
export function detectJobPms(
  ...textParts: Array<string | null | undefined>
): string[] {
  const text = textParts.filter(Boolean).join("  ");
  if (!text) return [];
  return PMS_SYSTEMS.map((p) => p.value).filter((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(text);
  });
}

/**
 * Detect certification kinds (CERTIFICATION_KINDS values) named in a job's
 * text. The job side stores only coarse verification categories, so — like
 * PMS — we read the specific certs from the posting text. Keyword → kind.
 */
const CERT_KEYWORDS: Array<{ kind: string; re: RegExp }> = [
  { kind: "cpr_bls", re: /\b(cpr|bls|basic life support)\b/i },
  { kind: "nitrous", re: /\bnitrous\b/i },
  { kind: "radiology", re: /\b(radiolog|x-?ray)\w*/i },
  { kind: "anesthesia_local", re: /\blocal anesthesia\b/i },
  { kind: "anesthesia_general", re: /\bgeneral anesthesia\b/i },
  { kind: "sedation_iv", re: /\biv sedation\b/i },
  { kind: "sedation_oral", re: /\boral sedation\b/i },
  { kind: "osha", re: /\bosha\b/i },
  { kind: "hipaa", re: /\bhipaa\b/i },
  { kind: "infection_control", re: /\binfection control\b/i },
  { kind: "malpractice", re: /\bmalpractice\b/i },
];

export function detectJobCerts(
  ...textParts: Array<string | null | undefined>
): string[] {
  const text = textParts.filter(Boolean).join("  ");
  if (!text) return [];
  return CERT_KEYWORDS.filter((c) => c.re.test(text)).map((c) => c.kind);
}
