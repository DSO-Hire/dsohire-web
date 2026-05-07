/**
 * Practice Fit bucket mapping (Phase 5D v1.1).
 *
 * Locked decision 2026-05-07 (v0): 5-bucket display ("Excellent /
 * Strong / Solid / Light / Low fit") instead of raw 0-100 numbers or
 * A/B/C/D grades. Less judgment-y, still scannable, color-coded.
 *
 * Cutoffs recalibrated 2026-05-07 PM (v1.1) — v0's 85/70/55/40 made
 * "Excellent" practically unreachable for typical complete profiles.
 * v1.1 normalizes scores over scored dimensions only (no penalty for
 * missing data), which lets realistic data hit higher buckets without
 * inflating the labels.
 *
 * Boundaries:
 *   • 75+   "Excellent" — hits everything we know about
 *   • 60-74 "Strong"    — meets the bar with room to grow
 *   • 45-59 "Solid"     — worth a closer look; some real mismatch
 *   • 30-44 "Light"     — long shot but not impossible
 *   • <30   "Low"       — likely a poor mutual fit; don't auto-screen out
 */

import type { FitBucket } from "./types";

export interface BucketStyle {
  label: string;
  /** Tailwind class string for the chip background. */
  bgClass: string;
  /** Tailwind class string for the chip text. */
  textClass: string;
  /** Tailwind class string for the chip border. */
  borderClass: string;
  /** A short marketing-friendly tagline used in the WhyThisMatch header. */
  tagline: string;
}

export const BUCKET_STYLES: Record<FitBucket, BucketStyle> = {
  excellent: {
    label: "Excellent fit",
    bgClass: "bg-heritage-deep",
    textClass: "text-ivory",
    borderClass: "border-heritage-deep",
    tagline: "Hits every must-have.",
  },
  strong: {
    label: "Strong fit",
    bgClass: "bg-heritage/15",
    textClass: "text-heritage-deep",
    borderClass: "border-heritage/40",
    tagline: "Meets the bar with room to grow.",
  },
  solid: {
    label: "Solid fit",
    bgClass: "bg-amber-50",
    textClass: "text-amber-800",
    borderClass: "border-amber-200",
    tagline: "Worth a closer look.",
  },
  light: {
    label: "Light fit",
    bgClass: "bg-slate-100",
    textClass: "text-slate-700",
    borderClass: "border-slate-200",
    tagline: "Long shot — context matters.",
  },
  low: {
    label: "Low fit",
    bgClass: "bg-slate-50",
    textClass: "text-slate-500",
    borderClass: "border-slate-200",
    tagline: "Likely a poor mutual fit.",
  },
};

export function scoreToBucket(score: number): FitBucket {
  if (score >= 75) return "excellent";
  if (score >= 60) return "strong";
  if (score >= 45) return "solid";
  if (score >= 30) return "light";
  return "low";
}
