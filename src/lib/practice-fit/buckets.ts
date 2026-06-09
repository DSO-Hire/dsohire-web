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

/**
 * Two-tranche color system (#49/DSOFit). PracticeFit wears a NAVY ramp,
 * DSOFit a HERITAGE-green ramp; in both, a darker shade = a stronger match.
 * So a talent-pool scan reads at a glance: navy chip = practice-level fit,
 * green chip = DSO/corporate fit, deeper color = better. Light/Low fall to
 * neutral slate in both (a weak match isn't "branded"). Always paired with a
 * track label/mark on the chip so color never carries the meaning alone.
 */
const TAGLINES: Record<FitBucket, { label: string; tagline: string }> = {
  excellent: { label: "Excellent fit", tagline: "Hits every must-have." },
  strong: { label: "Strong fit", tagline: "Meets the bar with room to grow." },
  solid: { label: "Solid fit", tagline: "Worth a closer look." },
  light: { label: "Light fit", tagline: "Long shot — context matters." },
  low: { label: "Low fit", tagline: "Likely a poor mutual fit." },
};

export type FitProduct = "practicefit" | "dsofit";

/** PracticeFit — navy ramp (practice-level roles). */
export const PRACTICEFIT_BUCKET_STYLES: Record<FitBucket, BucketStyle> = {
  excellent: { ...TAGLINES.excellent, bgClass: "bg-ink", textClass: "text-ivory", borderClass: "border-ink" },
  strong: { ...TAGLINES.strong, bgClass: "bg-ink/15", textClass: "text-ink", borderClass: "border-ink/40" },
  solid: { ...TAGLINES.solid, bgClass: "bg-ink/5", textClass: "text-ink/80", borderClass: "border-ink/20" },
  light: { ...TAGLINES.light, bgClass: "bg-slate-100", textClass: "text-slate-700", borderClass: "border-slate-200" },
  low: { ...TAGLINES.low, bgClass: "bg-slate-50", textClass: "text-slate-500", borderClass: "border-slate-200" },
};

/** DSOFit — heritage-green ramp (DSO / corporate roles). */
export const DSOFIT_BUCKET_STYLES: Record<FitBucket, BucketStyle> = {
  excellent: { ...TAGLINES.excellent, bgClass: "bg-heritage-deep", textClass: "text-ivory", borderClass: "border-heritage-deep" },
  strong: { ...TAGLINES.strong, bgClass: "bg-heritage/20", textClass: "text-heritage-deep", borderClass: "border-heritage/40" },
  solid: { ...TAGLINES.solid, bgClass: "bg-heritage/10", textClass: "text-heritage-deep", borderClass: "border-heritage/25" },
  light: { ...TAGLINES.light, bgClass: "bg-slate-100", textClass: "text-slate-700", borderClass: "border-slate-200" },
  low: { ...TAGLINES.low, bgClass: "bg-slate-50", textClass: "text-slate-500", borderClass: "border-slate-200" },
};

/** The right ramp for a result's product. Defaults to PracticeFit (navy). */
export function bucketStyle(bucket: FitBucket, product?: FitProduct): BucketStyle {
  return (product === "dsofit" ? DSOFIT_BUCKET_STYLES : PRACTICEFIT_BUCKET_STYLES)[bucket];
}

/**
 * Back-compat alias — surfaces that haven't been made product-aware yet read
 * this and get the PracticeFit (navy) ramp. Migrate them to bucketStyle().
 */
export const BUCKET_STYLES: Record<FitBucket, BucketStyle> = PRACTICEFIT_BUCKET_STYLES;

export function scoreToBucket(score: number): FitBucket {
  if (score >= 75) return "excellent";
  if (score >= 60) return "strong";
  if (score >= 45) return "solid";
  if (score >= 30) return "light";
  return "low";
}
