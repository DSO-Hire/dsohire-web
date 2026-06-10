/**
 * <FitWordmark /> / <FitMark /> — product-aware fit branding.
 *
 * Picks the PracticeFit lockup (navy + sparkle) or the DSOFit lockup
 * (heritage + portfolio mark) from a FitResult's `product`. Use these on any
 * surface that renders a fit result that COULD be corporate (job detail,
 * "why this match", dashboard fit roll-ups), so a DSOFit match never shows
 * PracticeFit branding. Server-safe; both underlying lockups are
 * dependency-free.
 */
import { PracticeFitWordmark } from "./practice-fit-wordmark";
import { DsoFitWordmark } from "./dsofit-wordmark";
import { PracticeFitMark } from "./practice-fit-mark";
import { DsoFitMark } from "./dsofit-mark";

export type FitProduct = "practicefit" | "dsofit";

/** Surfaces shared by BOTH lockups (DSOFit also has "heritage", PF-only). */
type SharedSurface = "light" | "dark" | "inherit";

export function FitWordmark({
  product,
  surface = "light",
  className,
  tm = false,
}: {
  product?: FitProduct | null;
  surface?: SharedSurface;
  className?: string;
  tm?: boolean;
}) {
  return product === "dsofit" ? (
    <DsoFitWordmark surface={surface} className={className} tm={tm} />
  ) : (
    <PracticeFitWordmark surface={surface} className={className} tm={tm} />
  );
}

export function FitMark({
  product,
  className,
}: {
  product?: FitProduct | null;
  className?: string;
}) {
  return product === "dsofit" ? (
    <DsoFitMark className={className} />
  ) : (
    <PracticeFitMark className={className} />
  );
}
