/**
 * Research charts: pure HTML/CSS server components, no chart library.
 *
 * Why HTML instead of SVG: every label and value is real text that wraps
 * at phone width and scales with the site's text-size toggle (rem type).
 * Bars are positioned with percentages, so the layout is fluid with no
 * fixed viewBox.
 *
 * Accessibility: each chart body is role="img" with a full-sentence
 * aria-label that states every value, and ChartFigure renders the same
 * numbers as a real <table> under a "View the data" disclosure.
 *
 * Rules (house + dataviz): one hue per series, direct labels, zero-based
 * linear axes, no dual axes. Charts never compute or invent figures; the
 * page passes in numbers that are already cited in the text.
 */

import { Eyebrow } from "@/components/brand/eyebrow";
import { cn } from "@/lib/utils";
import { DataTable, type DataColumn } from "./data-table";

export type ChartTone = "ink" | "heritage" | "brick" | "bronze" | "muted";

const TONE_BG: Record<ChartTone, string> = {
  ink: "bg-ink",
  heritage: "bg-heritage",
  brick: "bg-stage-brick",
  bronze: "bg-stage-bronze",
  muted: "bg-slate-meta/45",
};

const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;

/* ── Figure frame ─────────────────────────────────────────────── */

export function ChartFigure({
  kicker,
  title,
  children,
  note,
  table,
  legend,
}: {
  kicker: string;
  title: string;
  children: React.ReactNode;
  note?: React.ReactNode;
  legend?: readonly { label: string; tone: ChartTone; hatched?: boolean }[];
  table: { caption: string; columns: readonly DataColumn[]; rows: readonly (readonly React.ReactNode[])[] };
}) {
  return (
    <figure className="my-12 bg-card border border-[var(--rule-strong)] px-5 sm:px-8 pt-6 sm:pt-8 pb-5">
      <Eyebrow className="text-heritage-deep mb-1.5">{kicker}</Eyebrow>
      <figcaption className="text-lg sm:text-xl font-extrabold tracking-[-0.02em] leading-[1.25] text-ink mb-5 text-balance">
        {title}
      </figcaption>
      {legend && legend.length > 0 && (
        <ul className="list-none flex flex-wrap gap-x-5 gap-y-1.5 mb-5" aria-hidden>
          {legend.map((l) => (
            <li key={l.label} className="inline-flex items-center gap-2 text-xs text-slate-body">
              <span
                className={cn("inline-block h-2.5 w-4", TONE_BG[l.tone])}
                style={l.hatched ? HATCH : undefined}
              />
              {l.label}
            </li>
          ))}
        </ul>
      )}
      {children}
      {note && (
        <div className="mt-6 pt-4 border-t border-[var(--rule)] text-xs text-slate-meta leading-[1.6]">
          {note}
        </div>
      )}
      <details className="mt-4 group">
        <summary className="cursor-pointer select-none text-xs font-bold text-heritage-deep hover:text-ink">
          View the data as a table
        </summary>
        <DataTable
          caption={table.caption}
          columns={table.columns}
          rows={table.rows}
          minWidth="28rem"
          className="my-4"
        />
      </details>
    </figure>
  );
}

const HATCH: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, var(--card) 55%, transparent) 4px 7px)",
};

/* ── Shared row + axis ────────────────────────────────────────── */

function Row({
  label,
  sub,
  value,
  children,
}: {
  label: React.ReactNode;
  sub?: React.ReactNode;
  value: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] gap-x-5 gap-y-1.5 py-3 border-t border-[var(--rule)] first:border-t-0">
      <div className="min-w-0">
        <div className="text-sm font-bold text-ink leading-snug">{label}</div>
        <div className="text-xs text-slate-body tabular leading-snug mt-0.5">
          {value}
          {sub && <span className="text-slate-meta"> · {sub}</span>}
        </div>
      </div>
      <div className="relative self-center h-5">{children}</div>
    </div>
  );
}

function Gridlines({ ticks, max }: { ticks: readonly number[]; max: number }) {
  return (
    <>
      {ticks.map((t) => (
        <span
          key={t}
          aria-hidden
          className="absolute -inset-y-3 w-px bg-[var(--rule)]"
          style={{ left: pct(t, max) }}
        />
      ))}
    </>
  );
}

function Axis({
  ticks,
  max,
  format,
}: {
  ticks: readonly number[];
  max: number;
  format: (n: number) => string;
}) {
  return (
    <div aria-hidden className="grid grid-cols-1 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] gap-x-5 pt-2">
      <div className="hidden sm:block" />
      <div className="relative h-4">
        {ticks.map((t, i) => (
          <span
            key={t}
            className={cn(
              "absolute top-0 text-2xs text-slate-meta tabular whitespace-nowrap",
              i === 0 ? "" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2",
            )}
            style={{ left: pct(t, max) }}
          >
            {format(t)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Horizontal bar ───────────────────────────────────────────── */

export interface HBarRow {
  label: string;
  value: number;
  display: string;
  sub?: string;
  tone?: ChartTone;
}

export function HBarChart({
  rows,
  max,
  ticks,
  formatTick,
  ariaLabel,
}: {
  rows: readonly HBarRow[];
  max: number;
  ticks: readonly number[];
  formatTick: (n: number) => string;
  ariaLabel: string;
}) {
  return (
    <div role="img" aria-label={ariaLabel}>
      {rows.map((r) => (
        <Row key={r.label} label={r.label} value={r.display} sub={r.sub}>
          <Gridlines ticks={ticks} max={max} />
          <span
            className={cn("absolute inset-y-0 left-0 min-w-[3px]", TONE_BG[r.tone ?? "ink"])}
            style={{ width: pct(r.value, max) }}
          />
        </Row>
      ))}
      <Axis ticks={ticks} max={max} format={formatTick} />
    </div>
  );
}

/* ── Range (floating) bar ─────────────────────────────────────── */

export interface RangeRow {
  label: string;
  low: number;
  high: number;
  display: string;
  sub?: string;
  tone?: ChartTone;
}

export function RangeBarChart({
  rows,
  max,
  ticks,
  formatTick,
  ariaLabel,
}: {
  rows: readonly RangeRow[];
  max: number;
  ticks: readonly number[];
  formatTick: (n: number) => string;
  ariaLabel: string;
}) {
  return (
    <div role="img" aria-label={ariaLabel}>
      {rows.map((r) => (
        <Row key={r.label} label={r.label} value={r.display} sub={r.sub}>
          <Gridlines ticks={ticks} max={max} />
          {/* faint baseline from zero so the floating bar reads against the axis */}
          <span
            aria-hidden
            className="absolute top-1/2 left-0 h-px bg-[var(--rule-strong)]"
            style={{ width: pct(r.low, max) }}
          />
          <span
            className={cn("absolute inset-y-0", TONE_BG[r.tone ?? "ink"])}
            style={{ left: pct(r.low, max), width: pct(r.high - r.low, max) }}
          />
        </Row>
      ))}
      <Axis ticks={ticks} max={max} format={formatTick} />
    </div>
  );
}

/* ── Stacked bar ──────────────────────────────────────────────── */

export interface StackSegment {
  value: number;
  tone: ChartTone;
  /** Draw hatched: used for an "up to" portion of a range. */
  hatched?: boolean;
}

export interface StackRow {
  label: string;
  display: string;
  sub?: string;
  segments: readonly StackSegment[];
}

export function StackedBarChart({
  rows,
  max,
  ticks,
  formatTick,
  ariaLabel,
}: {
  rows: readonly StackRow[];
  max: number;
  ticks: readonly number[];
  formatTick: (n: number) => string;
  ariaLabel: string;
}) {
  return (
    <div role="img" aria-label={ariaLabel}>
      {rows.map((r) => {
        let offset = 0;
        return (
          <Row key={r.label} label={r.label} value={r.display} sub={r.sub}>
            <Gridlines ticks={ticks} max={max} />
            {r.segments.map((s, i) => {
              const left = offset;
              offset += s.value;
              return (
                <span
                  key={i}
                  className={cn(
                    "absolute inset-y-0",
                    TONE_BG[s.tone],
                    i > 0 && "border-l-2 border-[var(--card)]",
                  )}
                  style={{
                    left: pct(left, max),
                    width: pct(s.value, max),
                    ...(s.hatched ? HATCH : {}),
                  }}
                />
              );
            })}
          </Row>
        );
      })}
      <Axis ticks={ticks} max={max} format={formatTick} />
    </div>
  );
}

/* ── Column chart (time series) ───────────────────────────────── */

export interface ColumnSeries {
  label: string;
  tone: ChartTone;
  /** One value per category; null leaves a gap (no data for that period). */
  values: readonly (number | null)[];
}

/**
 * Vertical columns for a short time series (quarters, years). Up to a few
 * series per category, each column directly labeled with its value.
 * Zero-based linear y axis. Below `minWidth` the plot scrolls sideways
 * inside its own focusable region rather than squeezing the labels.
 */
export function ColumnChart({
  categories,
  series,
  max,
  ticks,
  formatTick,
  formatValue,
  ariaLabel,
  minWidth = "28rem",
}: {
  categories: readonly string[];
  series: readonly ColumnSeries[];
  max: number;
  ticks: readonly number[];
  formatTick: (n: number) => string;
  formatValue: (n: number) => string;
  ariaLabel: string;
  minWidth?: string;
}) {
  return (
    <div
      role="region"
      aria-label="Chart (scrolls sideways on small screens)"
      tabIndex={0}
      className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-heritage"
    >
      <div role="img" aria-label={ariaLabel} style={{ minWidth }}>
        <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2">
          {/* y-axis labels */}
          <div aria-hidden className="relative mt-6 h-52">
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute right-0 translate-y-1/2 text-2xs text-slate-meta tabular whitespace-nowrap"
                style={{ bottom: pct(t, max) }}
              >
                {formatTick(t)}
              </span>
            ))}
          </div>
          {/* plot */}
          <div className="relative mt-6 h-52 border-b border-[var(--rule-strong)]">
            {ticks.map((t) => (
              <span
                key={t}
                aria-hidden
                className="absolute inset-x-0 h-px bg-[var(--rule)]"
                style={{ bottom: pct(t, max) }}
              />
            ))}
            <div className="absolute inset-0 flex">
              {categories.map((c, ci) => (
                <div
                  key={c}
                  className="h-full px-1.5"
                  /* fixed padding: a % padding here resolves against the whole plot width and left the bars 0px wide */
                  style={{
                    flex: "1 1 0%",
                    minWidth: 0,
                    display: "grid",
                    gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))`,
                    alignItems: "end",
                    columnGap: "2px",
                  }}
                >
                  {series.map((s) => {
                    const v = s.values[ci];
                    return (
                      <div key={s.label} className="relative h-full" style={{ display: "flex", alignItems: "flex-end" }}>
                        {v != null && (
                          <span
                            className={cn("relative block", TONE_BG[s.tone])}
                            style={{ height: pct(v, max), width: "100%" }}
                          >
                            <span
                              aria-hidden
                              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 text-2xs font-bold text-ink tabular whitespace-nowrap"
                            >
                              {formatValue(v)}
                            </span>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          {/* x-axis labels */}
          <div aria-hidden />
          <div aria-hidden className="flex pt-2">
            {categories.map((c) => (
              <span
                key={c}
                className="flex-1 min-w-0 text-center text-2xs text-slate-meta tabular leading-tight"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
