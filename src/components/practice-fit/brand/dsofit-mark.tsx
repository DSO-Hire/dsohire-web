/**
 * DSOFitMark — the DSOFit glyph, sibling to the PracticeFit sparkle but
 * deliberately DISTINCT: a 2×2 cluster of rounded tiles = a portfolio of
 * practices / multi-site DSO network (the corporate side of dental). Palette is
 * REVERSED vs PracticeFit — PracticeFit leads heritage-on-navy (sparkle), DSOFit
 * leads navy-on-heritage (this mark), so the two read as clear siblings at a
 * glance. Pure SVG; tone via the `tone` prop.
 */

export function DsoFitMark({
  tone = "navy",
  className = "h-4 w-4",
}: {
  tone?: "navy" | "heritage" | "heritage-deep" | "ivory" | "current";
  className?: string;
}) {
  const fill =
    tone === "current"
      ? "currentColor"
      : tone === "heritage"
      ? "var(--color-heritage)"
      : tone === "heritage-deep"
      ? "var(--color-heritage-deep)"
      : tone === "ivory"
      ? "var(--color-ivory)"
      : "var(--color-ink)";
  return (
    <svg viewBox="0 0 24 24" className={className} fill={fill} aria-hidden="true">
      <rect x="2.5" y="2.5" width="8.5" height="8.5" rx="2.2" />
      <rect x="13" y="2.5" width="8.5" height="8.5" rx="2.2" />
      <rect x="2.5" y="13" width="8.5" height="8.5" rx="2.2" />
      <rect x="13" y="13" width="8.5" height="8.5" rx="2.2" />
    </svg>
  );
}
