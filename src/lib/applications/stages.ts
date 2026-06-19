/**
 * Shared constants + helpers for the configurable per-DSO pipeline
 * (Phase 5A Track B, Path B — replaced the hardcoded
 * application_status enum 2026-05-12).
 *
 * Model:
 *   • `StageKind` is the system-level category. Bounded set; safe to
 *     branch on for logic that needs "is this terminal?" / "is this
 *     past offer?" / "is this rejected?" semantics.
 *   • `dso_pipeline_stages` is the per-DSO list of stages. Each row
 *     has a `kind` (one of StageKind) + a DSO-customized `label`,
 *     `sort_order`, `color_class`, `is_hidden`, `is_default`.
 *   • The kanban renders one column per visible stage row in
 *     sort_order. The "closed lane" subsection is computed from
 *     stages whose kind is in TERMINAL_KINDS.
 *
 * Why kind-text instead of FK-uuid for filters: most read-side logic
 * (analytics, inbox, rejection emails, Practice Fit) only cares about
 * the *category* of a stage, not the specific row. Using `kind` lets
 * those consumers keep working when a DSO renames "Interview" to
 * "Phone Screen" — same kind, different label.
 *
 * Why fallback labels + colors live here: a fresh DSO is seeded with
 * the canonical 7 stages so this lib is purely a fallback for
 * non-seeded or programmatically-created data paths. The kanban
 * itself always reads labels from the live row, not from these maps.
 *
 * Keep STAGE_KINDS in sync with the CHECK constraint on
 * dso_pipeline_stages.kind + application_status_events.to_stage_kind.
 */

import type { Database } from "@/lib/supabase/database.types";

// ─────────────────────────────────────────────────────────────────────
// Kinds — the system-level category bounded set
// ─────────────────────────────────────────────────────────────────────

export const STAGE_KINDS = [
  "open",
  "screen",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
] as const;
export type StageKind = (typeof STAGE_KINDS)[number];

/**
 * Kinds that render in the main kanban lanes. Order maps directly to
 * the default sort_order seeding so a fresh DSO sees the canonical
 * left-to-right pipeline. The actual on-screen order is driven by
 * the DSO's `sort_order` column.
 */
export const KANBAN_KINDS = [
  "open",
  "screen",
  "interview",
  "offer",
  "hired",
] as const satisfies readonly StageKind[];

/**
 * Kinds that collapse into the right-hand "Closed" lane on the kanban.
 * Rejected stages are a drop target (employer can drop a card here to
 * reject); withdrawn stages are read-only (candidate-driven only).
 */
export const TERMINAL_KINDS = ["rejected", "withdrawn"] as const satisfies readonly StageKind[];
export type TerminalKind = (typeof TERMINAL_KINDS)[number];

export function isTerminalKind(kind: StageKind): kind is TerminalKind {
  return (TERMINAL_KINDS as readonly StageKind[]).includes(kind);
}

// ─────────────────────────────────────────────────────────────────────
// Fallback labels + colors (DSO-customizable on row, these are only
// used when no row data is available — e.g., synthesizing a label for
// a kind in analytics output)
// ─────────────────────────────────────────────────────────────────────

export const KIND_DEFAULT_LABELS: Record<StageKind, string> = {
  open: "New",
  screen: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

/**
 * Candidate-friendly labels keyed by stage kind. Used on EVERY
 * candidate-facing surface (applications list, application detail,
 * inbox previews, etc.). Per-DSO custom labels are intentionally NOT
 * surfaced to candidates — they see a canonical funnel regardless of
 * how each DSO renamed their stages. This protects against leaking
 * employer hiring-process internals (e.g., "Phone Screening" vs
 * "On-site Interview" as separate DSO stages of kind=interview both
 * read as "Interviewing" to the candidate).
 *
 * Decision locked 2026-05-12 PM after Cam spotted the inconsistency
 * between candidate applications list (was rendering DSO labels) and
 * detail page (was rendering canonical labels). Option A wins:
 * canonical funnel everywhere on the candidate side.
 */
export const CANDIDATE_KIND_LABELS: Record<StageKind, string> = {
  open: "Submitted",
  screen: "Reviewed",
  interview: "Interviewing",
  offer: "Offer extended",
  hired: "Hired",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
};

export interface StageColorTriple {
  bg: string;
  ring: string;
  text: string;
}

/**
 * Default Tailwind color triples keyed by kind. Used as the fallback
 * when a stage row's `color_class` is null. `heritage` is exposed in
 * app/globals.css as a Tailwind v4 CSS variable.
 */
export const KIND_DEFAULT_COLORS: Record<StageKind, StageColorTriple> = {
  open:       { bg: "bg-slate-50 dark:bg-slate-400/15",    ring: "ring-slate-200 dark:ring-slate-400/30",    text: "text-slate-700 dark:text-slate-300" },
  screen:     { bg: "bg-amber-50 dark:bg-amber-500/15",    ring: "ring-amber-200 dark:ring-amber-500/30",    text: "text-amber-700 dark:text-amber-200" },
  interview:  { bg: "bg-blue-50 dark:bg-blue-500/15",     ring: "ring-blue-200 dark:ring-blue-500/30",     text: "text-blue-700 dark:text-blue-200" },
  offer:      { bg: "bg-emerald-50 dark:bg-emerald-500/15",  ring: "ring-emerald-200 dark:ring-emerald-500/30",  text: "text-emerald-700 dark:text-emerald-200" },
  hired:      { bg: "bg-heritage/10", ring: "ring-heritage/30",  text: "text-heritage" },
  rejected:   { bg: "bg-rose-50 dark:bg-rose-500/15",     ring: "ring-rose-200 dark:ring-rose-500/30",     text: "text-rose-700 dark:text-rose-200" },
  withdrawn:  { bg: "bg-slate-50 dark:bg-slate-400/15",    ring: "ring-slate-200 dark:ring-slate-400/30",    text: "text-slate-500 dark:text-slate-400" },
};

/**
 * Resolve a stage row to a color triple. Pure function — accepts the
 * row's color_class (one of the palette names: slate, amber, blue,
 * emerald, heritage, rose, sky, violet, etc.) and its kind. Falls
 * back to the kind-default if color_class is null/unknown.
 */
export function colorTripleFor(
  colorClass: string | null | undefined,
  kind: StageKind
): StageColorTriple {
  if (!colorClass) return KIND_DEFAULT_COLORS[kind];
  const palette = STAGE_COLOR_PALETTE[colorClass as StageColorPaletteName];
  return palette ?? KIND_DEFAULT_COLORS[kind];
}

/**
 * Palette of color names a DSO can pick from in the settings UI.
 * Keep this list short and intentional — too many choices makes the
 * picker fatiguing. Heritage is the brand green and is the "ours"
 * pick for the Hired stage by default.
 */
export const STAGE_COLOR_OPTIONS = [
  "slate",
  "amber",
  "blue",
  "emerald",
  "heritage",
  "rose",
  "sky",
  "violet",
  "fuchsia",
  "teal",
] as const;
export type StageColorPaletteName = (typeof STAGE_COLOR_OPTIONS)[number];

export const STAGE_COLOR_PALETTE: Record<StageColorPaletteName, StageColorTriple> = {
  slate:     { bg: "bg-slate-50 dark:bg-slate-400/15",    ring: "ring-slate-200 dark:ring-slate-400/30",    text: "text-slate-700 dark:text-slate-300" },
  amber:     { bg: "bg-amber-50 dark:bg-amber-500/15",    ring: "ring-amber-200 dark:ring-amber-500/30",    text: "text-amber-700 dark:text-amber-200" },
  blue:      { bg: "bg-blue-50 dark:bg-blue-500/15",     ring: "ring-blue-200 dark:ring-blue-500/30",     text: "text-blue-700 dark:text-blue-200" },
  emerald:   { bg: "bg-emerald-50 dark:bg-emerald-500/15",  ring: "ring-emerald-200 dark:ring-emerald-500/30",  text: "text-emerald-700 dark:text-emerald-200" },
  heritage:  { bg: "bg-heritage/10", ring: "ring-heritage/30",  text: "text-heritage" },
  rose:      { bg: "bg-rose-50 dark:bg-rose-500/15",     ring: "ring-rose-200 dark:ring-rose-500/30",     text: "text-rose-700 dark:text-rose-200" },
  sky:       { bg: "bg-sky-50 dark:bg-sky-500/15",      ring: "ring-sky-200 dark:ring-sky-500/30",      text: "text-sky-700 dark:text-sky-200" },
  violet:    { bg: "bg-violet-50 dark:bg-violet-500/15",   ring: "ring-violet-200 dark:ring-violet-500/30",   text: "text-violet-700 dark:text-violet-200" },
  fuchsia:   { bg: "bg-fuchsia-50 dark:bg-fuchsia-500/15",  ring: "ring-fuchsia-200 dark:ring-fuchsia-500/30",  text: "text-fuchsia-700 dark:text-fuchsia-200" },
  teal:      { bg: "bg-teal-50 dark:bg-teal-500/15",     ring: "ring-teal-200 dark:ring-teal-500/30",     text: "text-teal-700 dark:text-teal-200" },
};

// ─────────────────────────────────────────────────────────────────────
// Stage row shape (re-exported from generated DB types when available;
// hand-typed here as a fallback because the regen is intentionally
// lazy on this repo — see project_2026_05_07_phase_4_3_shipped.md)
// ─────────────────────────────────────────────────────────────────────

export interface PipelineStage {
  id: string;
  dso_id: string;
  kind: StageKind;
  label: string;
  slug: string;
  sort_order: number;
  is_hidden: boolean;
  is_default: boolean;
  color_class: string | null;
}

// ─────────────────────────────────────────────────────────────────────
// Cap (enforced at server-action level; advisory here so client UI
// can disable the "Add stage" button at the limit too)
// ─────────────────────────────────────────────────────────────────────

export const MAX_STAGES_PER_DSO = 12;

// ─────────────────────────────────────────────────────────────────────
// Helpers — pure functions, can be called from server or client
// ─────────────────────────────────────────────────────────────────────

/**
 * Return the visible (non-hidden) stages in sort order for kanban
 * rendering. Pass the full row list (from getDsoStages) and this
 * returns the lanes you actually render.
 */
export function visibleStages(stages: PipelineStage[]): PipelineStage[] {
  return stages
    .filter((s) => !s.is_hidden)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Partition stages into kanban lanes (non-terminal kinds) and
 * terminal lanes (rejected + withdrawn) for the dual-column kanban
 * layout. Both groups are sort_order-respecting.
 */
export function partitionStagesForKanban(stages: PipelineStage[]): {
  kanban: PipelineStage[];
  terminal: PipelineStage[];
} {
  const visible = visibleStages(stages);
  return {
    kanban: visible.filter((s) => !isTerminalKind(s.kind)),
    terminal: visible.filter((s) => isTerminalKind(s.kind)),
  };
}

/**
 * Resolve a stage_id to its current row. Returns undefined if the
 * stage was hidden or deleted — callers should fall back gracefully
 * (typically display the kind's default label).
 */
export function findStage(
  stages: PipelineStage[],
  stageId: string | null | undefined
): PipelineStage | undefined {
  if (!stageId) return undefined;
  return stages.find((s) => s.id === stageId);
}

/**
 * Compose a label for a stage_id, falling back to the kind default
 * when the row isn't found. `fallbackKind` is what we know about the
 * application's kind from a denormalized field (e.g.,
 * application_status_events.to_stage_kind) when the stage_id row is
 * gone.
 */
export function labelForStage(
  stages: PipelineStage[],
  stageId: string | null | undefined,
  fallbackKind: StageKind
): string {
  const row = findStage(stages, stageId);
  return row?.label ?? KIND_DEFAULT_LABELS[fallbackKind];
}

// ─────────────────────────────────────────────────────────────────────
// Days-in-stage heat
//
// Lane 5 (Kanban 2.0, Model 04): thresholds tightened 7/14 → 4/10 —
// hiring moves in days, and a candidate sitting 10+ days IS the
// bottleneck. Single source of truth: the card pill, the card's left
// aging edge, and the mobile stage tabs all read the same level.
// ─────────────────────────────────────────────────────────────────────

export function daysInStage(stageEnteredAt: string | Date): number {
  const entered =
    typeof stageEnteredAt === "string"
      ? new Date(stageEnteredAt)
      : stageEnteredAt;
  const ms = Date.now() - entered.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function stageHeatLevel(days: number): "cool" | "warm" | "hot" {
  if (days < 4) return "cool";
  if (days < 10) return "warm";
  return "hot";
}

/**
 * Tailwind classes for the days-in-stage heat pill. Single source of
 * truth so desktop kanban + mobile stage tabs render identical
 * treatments.
 */
export const STAGE_HEAT_CLASSES: Record<
  ReturnType<typeof stageHeatLevel>,
  string
> = {
  cool: "bg-slate-100 text-slate-600 dark:bg-slate-400/15 dark:text-slate-300",
  warm: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200",
  hot: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200 animate-pulse",
};

/**
 * Left-edge aging treatment for kanban cards (Model 04's "visible from
 * across the room" layer). Same level source as the pill; heritage
 * green = moving, amber = warming, rust = stuck.
 */
export const STAGE_AGE_EDGE_CLASSES: Record<
  ReturnType<typeof stageHeatLevel>,
  string
> = {
  cool: "border-l-[3px] border-l-heritage/70",
  warm: "border-l-[3px] border-l-amber-500",
  hot: "border-l-[3px] border-l-[#b3543f]",
};

// ─────────────────────────────────────────────────────────────────────
// LEGACY EXPORTS — temporarily re-exported so the 18-file consumer
// rewrite can land incrementally instead of as one atomic change.
// Remove these once every consumer reads PipelineStage rows directly.
// ─────────────────────────────────────────────────────────────────────

/**
 * @deprecated Use `StageKind` (text union) instead. Kept so old
 * imports keep compiling during the Path B rollout; will be removed
 * once consumers migrate.
 */
export type ApplicationStatus = StageKind;

/**
 * @deprecated Use `KANBAN_KINDS` for category checks, or read the live
 * stage list and call `partitionStagesForKanban`. Kept so the kanban
 * board can compile while it migrates.
 */
export const KANBAN_STAGES = KANBAN_KINDS;
export type KanbanStage = (typeof KANBAN_STAGES)[number];

/**
 * @deprecated Use `TERMINAL_KINDS` or read the live stage list.
 */
export const CLOSED_STAGES = TERMINAL_KINDS;
export type ClosedStage = TerminalKind;

/**
 * @deprecated Use `KIND_DEFAULT_LABELS` (keyed by kind) or read the
 * live stage row's `label`. Kept so legacy callers can resolve a kind
 * to a human label without code changes.
 */
export const STAGE_LABELS: Record<StageKind, string> = KIND_DEFAULT_LABELS;

/**
 * @deprecated Use `KIND_DEFAULT_COLORS` or `colorTripleFor(row)`.
 */
export const STAGE_COLORS: Record<KanbanStage, StageColorTriple> = {
  open: KIND_DEFAULT_COLORS.open,
  screen: KIND_DEFAULT_COLORS.screen,
  interview: KIND_DEFAULT_COLORS.interview,
  offer: KIND_DEFAULT_COLORS.offer,
  hired: KIND_DEFAULT_COLORS.hired,
};

// Note: the Database["public"]["Enums"]["application_status"] type
// import was dropped — that enum no longer exists post-migration.
// Keep the import line referenced from a type-only utility so future
// regens don't accidentally re-introduce a stale reference.
type _UnusedDatabase = Database;
export type _StageMigrationGuard = _UnusedDatabase;
