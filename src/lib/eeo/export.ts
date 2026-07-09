/**
 * EEO applicant-flow export helpers (Compliance hub spec, 2026-07-09).
 *
 * Pure module — no server imports — shared by the eeo.view-gated CSV route
 * and the Compliance hub's aggregate table. This is the ONE sanctioned
 * surface where individual EEO categories are read for employer reporting
 * (to a compliance-authorized user, for the DSO's own AAP / adverse-impact
 * analysis). Never import these into any pipeline/candidate view — the
 * application_eeo_responses firewall (default-deny RLS, no employer
 * policy) stays intact; the route reads via service role only AFTER the
 * eeo.view + DSO-scope checks pass.
 *
 * Voluntariness semantics (spec §1): an explicit "decline" answer exports
 * as "Declined" — never blank-as-if-missing. A question the applicant
 * never answered (no row / null field) exports as "Not provided".
 */

import { EEO_FIELDS, type EeoFieldKey } from "./options";

export const EEO_DECLINED_LABEL = "Declined";
export const EEO_NOT_PROVIDED_LABEL = "Not provided";

/**
 * Small-cell suppression threshold for AGGREGATE reporting — any
 * demographic group with fewer applicants than this is masked to prevent
 * re-identification (matches the application_eeo_responses migration
 * comment: "hide any bucket with < 5 responses").
 */
export const EEO_SMALL_CELL_THRESHOLD = 5;

const LABEL_BY_FIELD: Record<EeoFieldKey, ReadonlyMap<string, string>> =
  Object.fromEntries(
    EEO_FIELDS.map((f) => [
      f.key,
      new Map(f.options.map((o) => [o.value, o.label])),
    ])
  ) as unknown as Record<EeoFieldKey, ReadonlyMap<string, string>>;

/**
 * The export label for one stored EEO value. "decline" → "Declined";
 * null/empty/no-row → "Not provided"; anything else → its option label
 * (unknown slugs fall back to the raw value rather than dropping data).
 */
export function eeoExportLabel(
  field: EeoFieldKey,
  value: string | null | undefined
): string {
  if (value == null || value === "") return EEO_NOT_PROVIDED_LABEL;
  if (value === "decline") return EEO_DECLINED_LABEL;
  return LABEL_BY_FIELD[field].get(value) ?? value;
}

// ─────────────────────────────────────────────────────────────────────
// Adverse-impact aggregate (spec §4) — aggregate-only, suppressed cells
// ─────────────────────────────────────────────────────────────────────

export interface AdverseImpactRow {
  /** Display label of the demographic group ("Asian", "Declined", …). */
  group: string;
  /** Applicants in scope, or null when suppressed. */
  applicants: number | null;
  /** Hires among those applicants, or null when suppressed. */
  hired: number | null;
  /** hired / applicants (0..1), or null when suppressed or 0 applicants. */
  selectionRate: number | null;
  /** True when the cell was masked for small-n re-identification risk. */
  suppressed: boolean;
}

/**
 * Group applicants by one EEO field's answer and compute per-group
 * selection rates — the input to a 4/5ths (impact-ratio) analysis. Groups
 * under EEO_SMALL_CELL_THRESHOLD applicants are suppressed: the row is
 * kept (so the reader knows the group exists) but all numbers are masked.
 * Ordering follows the field's option order, with "Not provided" last.
 */
export function adverseImpactTable(
  field: EeoFieldKey,
  applicants: Array<{ value: string | null | undefined; hired: boolean }>
): AdverseImpactRow[] {
  const byLabel = new Map<string, { applicants: number; hired: number }>();
  for (const a of applicants) {
    const label = eeoExportLabel(field, a.value);
    const cell = byLabel.get(label) ?? { applicants: 0, hired: 0 };
    cell.applicants += 1;
    if (a.hired) cell.hired += 1;
    byLabel.set(label, cell);
  }

  // Field option order (Declined rides its option position), then
  // "Not provided" at the end. Only emit groups that actually occur.
  const fieldDef = EEO_FIELDS.find((f) => f.key === field);
  const orderedLabels = [
    ...(fieldDef?.options.map((o) =>
      o.value === "decline" ? EEO_DECLINED_LABEL : o.label
    ) ?? []),
    EEO_NOT_PROVIDED_LABEL,
  ];
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const l of orderedLabels) {
    if (byLabel.has(l) && !seen.has(l)) {
      labels.push(l);
      seen.add(l);
    }
  }
  // Any unknown-slug fallbacks not covered by the option order.
  for (const l of byLabel.keys()) {
    if (!seen.has(l)) {
      labels.push(l);
      seen.add(l);
    }
  }

  return labels.map((label) => {
    const cell = byLabel.get(label)!;
    if (cell.applicants < EEO_SMALL_CELL_THRESHOLD) {
      return {
        group: label,
        applicants: null,
        hired: null,
        selectionRate: null,
        suppressed: true,
      };
    }
    return {
      group: label,
      applicants: cell.applicants,
      hired: cell.hired,
      selectionRate:
        cell.applicants > 0 ? cell.hired / cell.applicants : null,
      suppressed: false,
    };
  });
}
