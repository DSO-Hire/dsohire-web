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

/** Tailwind chip classes per color — core utilities only (no JIT-only values). */
export const TAG_COLOR_CLASSES: Record<TagColor, string> = {
  slate: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-400/15 dark:text-slate-300 dark:border-slate-400/30",
  green: "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30",
  blue: "bg-sky-50 text-sky-800 border-sky-300 dark:bg-sky-500/15 dark:text-sky-200 dark:border-sky-500/30",
  amber: "bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30",
  rose: "bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-500/30",
  purple: "bg-violet-50 text-violet-800 border-violet-300 dark:bg-violet-500/15 dark:text-violet-200 dark:border-violet-500/30",
};

/** Solid swatch classes for the color picker dots. */
export const TAG_SWATCH_CLASSES: Record<TagColor, string> = {
  slate: "bg-slate-400",
  green: "bg-emerald-500",
  blue: "bg-sky-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  purple: "bg-violet-500",
};

export function isTagColor(v: string): v is TagColor {
  return (TAG_COLORS as string[]).includes(v);
}

export const MAX_TAGS_PER_APPLICATION = 12;
export const MAX_TAG_LABEL_LENGTH = 40;
