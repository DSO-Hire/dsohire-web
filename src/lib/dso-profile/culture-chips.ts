/**
 * Curated culture-chip taxonomy for the public DSO profile (Phase 4.5.d).
 *
 * Why a curated list (vs. free text):
 *   • Candidates can compare DSOs apples-to-apples — "founder-led + 4-day
 *     week + strong CE budget" reads instantly across profiles.
 *   • Filterable downstream — these become structured filters on /companies
 *     and /jobs once a critical mass of DSOs has profiles filled out.
 *   • Stops generic platitudes ("we have a great culture!") and forces
 *     specificity.
 *
 * Per the Reach-over-upsell feedback: this list is public to all tiers,
 * no gating. Per Founding-protection feedback, the taxonomy is broad
 * enough that every DSO can find ~5-10 chips that fit them.
 *
 * Grouped for readability in the editor; the picker UI shows them grouped
 * but server validation just checks chip ∈ ALL_CULTURE_CHIPS. A DSO can
 * select up to 12 (enforced by the dsos_culture_chips_count_chk constraint
 * shipped in the 4.5.d migration).
 *
 * To add a chip: append to the appropriate group below. To remove: don't
 * delete — leave it in the taxonomy and let DSOs that selected it keep
 * their selection. Deletion would require a data-migration step.
 */

export interface CultureChipGroup {
  id: string;
  label: string;
  chips: readonly string[];
}

export const CULTURE_CHIP_GROUPS = [
  {
    id: "philosophy",
    label: "Philosophy",
    chips: [
      "Mentorship-driven",
      "Quality-over-volume",
      "Doctor-led leadership",
      "Founder-led",
      "PE-backed",
      "Fee-for-service / PPO-free",
    ],
  },
  {
    id: "growth",
    label: "Growth & compensation",
    chips: [
      "Path to partnership",
      "Strong CE budget",
      "Production-based comp",
      "Daily guarantee",
      "Sign-on bonuses available",
      "Loan repayment help",
      "Relocation support",
    ],
  },
  {
    id: "technology",
    label: "Technology",
    chips: [
      "Modern equipment",
      "Digital workflow",
      "CBCT in-house",
      "Same-day crowns",
      "Paperless office",
    ],
  },
  {
    id: "lifestyle",
    label: "Schedule & lifestyle",
    chips: [
      "4-day work week",
      "No weekends",
      "Predictable schedule",
      "Generous PTO",
      "401(k) match",
      "Parental leave",
    ],
  },
  {
    id: "patient-mix",
    label: "Patient mix & community",
    chips: [
      "High case complexity",
      "Pediatric-friendly",
      "Spanish-speaking team",
      "Underserved community focus",
      "Cosmetic-heavy",
    ],
  },
  {
    id: "team",
    label: "Team",
    chips: ["Tight-knit team", "Recent-grad welcome"],
  },
] as const satisfies readonly CultureChipGroup[];

/** Flat list of every valid chip — the source of truth for server validation. */
export const ALL_CULTURE_CHIPS: readonly string[] = CULTURE_CHIP_GROUPS.flatMap(
  (g) => g.chips
);

/** Server-side: returns true iff every chip in the input is in the taxonomy. */
export function areCultureChipsValid(input: readonly string[]): boolean {
  const set = new Set(ALL_CULTURE_CHIPS);
  return input.every((c) => set.has(c));
}

/** Hard cap matches the dsos_culture_chips_count_chk constraint (12). */
export const MAX_CULTURE_CHIPS = 12;
