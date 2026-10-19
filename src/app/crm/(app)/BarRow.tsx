import Link from "next/link";

/*
 * Server-rendered horizontal bar chart rows. Single hue (#4A4AD8 from the
 * brand chart palette), direct labels, no axes: each row is label, bar,
 * value. Bars animate in via CSS (width transition keyed off a custom
 * property), respecting prefers-reduced-motion.
 *
 * Optional, additive: `sub` prints a second line under the value, `href`
 * makes the whole row a link, `ariaLabel` names the chart.
 */

export type BarDatum = { label: string; value: number; display: string; href?: string; sub?: string };

export default function BarRows({
  data,
  unit,
  ariaLabel,
}: {
  data: BarDatum[];
  unit?: string;
  ariaLabel?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const hasSub = data.some((d) => d.sub);
  return (
    <div
      className={`barrows${hasSub ? " has-sub" : ""}`}
      role={ariaLabel ? "group" : undefined}
      aria-label={ariaLabel}
    >
      {data.map((d, i) => {
        const inner = (
          <>
            <span className="bl">{d.label}</span>
            <span className="btrack" aria-hidden="true">
              <span
                className="bfill"
                style={{ ["--w" as string]: `${Math.max((d.value / max) * 100, d.value > 0 ? 3 : 0)}%` }}
              />
            </span>
            <span className="bv num">
              {d.display}
              {unit ? <em>{unit}</em> : null}
              {d.sub ? <small>{d.sub}</small> : null}
            </span>
          </>
        );
        return d.href ? (
          <Link
            className="brow brow-link"
            key={`${d.label}-${i}`}
            href={d.href}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            {inner}
          </Link>
        ) : (
          <div className="brow" key={`${d.label}-${i}`} style={{ animationDelay: `${i * 60}ms` }}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
