/**
 * DSOFit wordmark — sibling to the PracticeFit wordmark, REVERSED palette.
 * PracticeFit = navy "Practice" + heritage "Fit" + heritage sparkle.
 * DSOFit      = heritage "DSO" + navy "Fit" + navy portfolio mark.
 * So the two read as a matched pair but are instantly distinguishable.
 */

import { DsoFitMark } from "@/components/practice-fit/brand/dsofit-mark";

export function DsoFitWordmark({
  tm = false,
  className = "text-2xl",
  showMark = true,
  /** "light" surfaces use the default two-tone; "dark"/"heritage" flip to ivory. */
  surface = "light",
}: {
  /** Show ™ on first use. */
  tm?: boolean;
  /** Size via a text-* class (also scales the mark, sized in em). */
  className?: string;
  showMark?: boolean;
  surface?: "light" | "dark" | "heritage" | "inherit";
}) {
  const dsoClass =
    surface === "dark" || surface === "heritage"
      ? "text-ivory"
      : surface === "inherit"
      ? ""
      : "text-heritage-deep";
  const fitClass =
    surface === "dark"
      ? "text-ivory/80"
      : surface === "heritage"
      ? "text-ink"
      : surface === "inherit"
      ? ""
      : "text-ink";
  const markTone =
    surface === "dark" ? "ivory" : surface === "heritage" ? "heritage-deep" : "navy";

  return (
    <span className="inline-flex items-center gap-1.5">
      {showMark && <DsoFitMark tone={markTone} className="h-[0.95em] w-[0.95em]" />}
      <span className={`inline-flex items-baseline font-extrabold tracking-tight ${className}`}>
        <span className={dsoClass}>DSO</span>
        <span className={fitClass}>Fit</span>
        {tm && (
          <span className="ml-0.5 align-super text-[0.5em] font-semibold text-slate-meta">™</span>
        )}
      </span>
    </span>
  );
}
