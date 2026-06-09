/**
 * <DsoFitWordmark /> — the DSOFit lockup (portfolio mark + two-tone wordmark),
 * the REVERSED-palette sibling of PracticeFit. PracticeFit = navy word + GREEN
 * "Fit" + green sparkle. DSOFit = green "DSO" + BLUE "Fit" + blue portfolio
 * mark, so the two read as a matched pair but the accent colors juxtapose
 * (PracticeFit green ⟷ DSOFit blue). Mirrors PracticeFitWordmark's structure
 * (em-scaled mark, <sup> ™). Server-safe; size with a text-* class.
 */
import { DsoFitMark } from "./dsofit-mark";

export type DsoFitSurface = "light" | "dark" | "heritage" | "inherit";

interface SurfaceColors {
  dso: string;
  fit: string;
  mark: string;
  pillBg: string;
}

const SURFACES: Record<DsoFitSurface, SurfaceColors> = {
  // On light: reversed palette — heritage "DSO", navy "Fit", navy mark.
  light: { dso: "text-heritage-deep", fit: "text-ink", mark: "text-ink", pillBg: "bg-ink/10" },
  // On navy: ivory "DSO", light-blue "Fit" + mark.
  dark: { dso: "text-ivory", fit: "text-blue-400", mark: "text-blue-400", pillBg: "bg-ivory/10" },
  // On heritage/green (the chooser panel): ivory "DSO", light-blue "Fit" + mark
  // — the blue pops against the green, juxtaposing PracticeFit's green-on-navy.
  heritage: { dso: "text-ivory", fit: "text-blue-400", mark: "text-blue-400", pillBg: "bg-ivory/15" },
  inherit: { dso: "", fit: "", mark: "", pillBg: "bg-current/10" },
};

export interface DsoFitWordmarkProps {
  surface?: DsoFitSurface;
  /** Show the ™ — first/most prominent appearance. */
  tm?: boolean;
  /** Chip-style pill emphasis. */
  pill?: boolean;
  /** Size + spacing: pass a text-* class. */
  className?: string;
}

export function DsoFitWordmark({
  surface = "light",
  tm = false,
  pill = false,
  className,
}: DsoFitWordmarkProps) {
  const c = SURFACES[surface];
  const inner = (
    <span className="inline-flex items-center font-sans font-extrabold leading-none tracking-[-0.03em]">
      <span className={`mr-[0.18em] flex ${c.mark}`} aria-hidden>
        <DsoFitMark className="h-[0.66em] w-[0.66em]" />
      </span>
      <span className={c.dso}>DSO</span>
      <span className={c.fit}>
        Fit
        {tm ? (
          <sup className="ml-[0.06em] align-super text-[0.42em] font-bold">™</sup>
        ) : null}
      </span>
    </span>
  );

  return (
    <span
      className={[
        "inline-flex items-center",
        pill ? `rounded-full px-[0.7em] py-[0.32em] ${c.pillBg}` : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="img"
      aria-label={tm ? "DSOFit, trademark" : "DSOFit"}
    >
      {inner}
    </span>
  );
}
