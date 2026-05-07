/**
 * Practice Fit bucket mapping (Phase 5D v0).
 *
 * Locked decision 2026-05-07: 5-bucket display ("Excellent / Strong /
 * Solid / Light / Low fit") instead of raw 0-100 numbers or A/B/C/D
 * grades. Less judgment-y, still scannable, color-coded.
 *
 * Boundaries are calibrated so:
 *   • 85+   "Excellent" — strong on the must-haves (role + comp + location)
 *   • 70-84 "Strong"    — meets the bar but not perfect on every dim
 *   • 55-69 "Solid"     — worth a look; some signal mismatch
 *   • 40-54 "Light"     — long shot but not impossible
 *   • <40   "Low"       — likely a poor mutual fit; don't auto-screen out
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
  if (score >= 85) return "excellent";
  if (score >= 70) return "strong";
  if (score >= 55) return "solid";
  if (score >= 40) return "light";
  return "low";
}
