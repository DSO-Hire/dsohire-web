/**
 * Shared constants for the applications kanban + list views.
 *
 * Keep enum values in sync with public.application_status in Supabase
 * (regenerate database.types.ts after each migration that touches it).
 *
 * - KANBAN_STAGES are the columns rendered on the pipeline board.
 * - CLOSED_STAGES collapse into a single "Closed" lane on the board.
 * - STAGE_LABELS is the source of truth for human-readable copy and
 *   covers every application_status enum value (exhaustive).
 * - STAGE_COLORS uses Tailwind v4 utilities. Heritage is defined as a
 *   CSS variable in app/globals.css and exposed as `bg-heritage` etc.
 */

import type { Database } from "@/lib/supabase/database.types";

export type ApplicationStatus =
  Database["public"]["Enums"]["application_status"];

export const KANBAN_STAGES = [
  "new",
  "reviewed",
  "interviewing",
  "offered",
  "hired",
] as const;
export type KanbanStage = (typeof KANBAN_STAGES)[number];

export const CLOSED_STAGES = ["rejected", "withdrawn"] as const;
export type ClosedStage = (typeof CLOSED_STAGES)[number];

export const STAGE_LABELS: Record<ApplicationStatus, string> = {
  new: "New",
  reviewed: "Screening",
  interviewing: "Interview",
  offered: "Offer",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const STAGE_COLORS: Record<
  KanbanStage,
  { bg: string; ring: string; text: string }
> = {
  new:          { bg: "bg-slate-50",    ring: "ring-slate-200",    text: "text-slate-700" },
  reviewed:     { bg: "bg-amber-50",    ring: "ring-amber-200",    text: "text-amber-700" },
  interviewing: { bg: "bg-blue-50",     ring: "ring-blue-200",     text: "text-blue-700" },
  offered:      { bg: "bg-emerald-50",  ring: "ring-emerald-200",  text: "text-emerald-700" },
  hired:        { bg: "bg-heritage/10", ring: "ring-heritage/30",  text: "text-heritage" },
};

export function daysInStage(stageEnteredAt: string | Date): number {
  const entered =
    typeof stageEnteredAt === "string"
      ? new Date(stageEnteredAt)
      : stageEnteredAt;
  const ms = Date.now() - entered.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function stageHeatLevel(days: number): "cool" | "warm" | "hot" {
  if (days < 7) return "cool";
  if (days < 14) return "warm";
  return "hot";
}
