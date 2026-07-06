/**
 * Candidate tags (E3.22) — shared palette + types for the kanban card chips,
 * the application-detail tag manager, and the tag server actions.
 *
 * Colors are stored as a small fixed key set (CHECK-constrained in the DB) and
 * mapped to Tailwind core utility classes here so the chip looks identical on
 * every surface.
 */

export type TagColor = "slate" | "green" | "blue" | "amber" | "rose" | "purple";

export const TAG_COLORS: TagColor[] = [
  "slate",
  "green",
  "blue",
  "amber",
  "rose",
  "purple",
];

export interface ApplicationTag {
  id: string;
  label: string;
  color: TagColor;
}

/**
 * Chip classes per color — ⚠️ the KEYS are stored in the DB (CHECK
 * constraint); never rename one. 2026-07-06 sweep: VALUES re-pointed
 * from the Tailwind default rainbow to the curated brand stage palette
 * (globals.css `--stage-*`, dark-adaptive — no `dark:` variants
 * needed). Key names are legacy labels for the hue slot, not the
 * rendered color — same convention as STAGE_COLOR_PALETTE.
 */
export const TAG_COLOR_CLASSES: Record<TagColor, string> = {
  slate: "bg-stage-stone/10 text-stage-stone border-stage-stone/30",
  green: "bg-stage-juniper/10 text-stage-juniper border-stage-juniper/30",
  blue: "bg-stage-navy/10 text-stage-navy border-stage-navy/30",
  amber: "bg-stage-bronze/10 text-stage-bronze border-stage-bronze/30",
  rose: "bg-stage-brick/10 text-stage-brick border-stage-brick/30",
  purple: "bg-stage-plum/10 text-stage-plum border-stage-plum/30",
};

/** Solid swatch classes for the color picker dots. */
export const TAG_SWATCH_CLASSES: Record<TagColor, string> = {
  slate: "bg-stage-stone",
  green: "bg-stage-juniper",
  blue: "bg-stage-navy",
  amber: "bg-stage-bronze",
  rose: "bg-stage-brick",
  purple: "bg-stage-plum",
};

export function isTagColor(v: string): v is TagColor {
  return (TAG_COLORS as string[]).includes(v);
}

export const MAX_TAGS_PER_APPLICATION = 12;
export const MAX_TAG_LABEL_LENGTH = 40;
