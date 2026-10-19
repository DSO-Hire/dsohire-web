/**
 * DataTable: accessible, responsive data table for reports.
 *
 * Real <table> semantics (caption, th scope="col", first cell as a row
 * header). On phones the table scrolls horizontally inside a focusable,
 * labeled region instead of pushing the page wider.
 */

import { cn } from "@/lib/utils";

export interface DataColumn {
  header: React.ReactNode;
  /** Numeric columns align right with tabular figures. */
  numeric?: boolean;
}

export function DataTable({
  caption,
  columns,
  rows,
  footnote,
  minWidth = "36rem",
  captionHidden = false,
  className,
}: {
  caption: string;
  columns: readonly DataColumn[];
  rows: readonly (readonly React.ReactNode[])[];
  footnote?: React.ReactNode;
  /** Width below which the table scrolls instead of squeezing. */
  minWidth?: string;
  /** Visually hide the caption when a figure title already names it. */
  captionHidden?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("my-8", className)}>
      <div
        role="region"
        aria-label={caption}
        tabIndex={0}
        className="overflow-x-auto border border-[var(--rule-strong)] bg-card focus-visible:outline-2 focus-visible:outline-heritage"
      >
        <table className="w-full border-collapse text-sm" style={{ minWidth }}>
          <caption
            className={cn(
              "text-left px-4 sm:px-5 pt-4 pb-3 text-xs font-bold text-ink",
              captionHidden && "sr-only",
            )}
          >
            {caption}
          </caption>
          <thead>
            <tr className="bg-hero text-hero-foreground">
              {columns.map((c, i) => (
                <th
                  key={i}
                  scope="col"
                  className={cn(
                    "px-4 sm:px-5 py-3 text-2xs font-bold uppercase tracking-[1.2px] align-bottom",
                    c.numeric ? "text-right" : "text-left",
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-t border-[var(--rule)] align-top">
                {r.map((cell, ci) => {
                  const numeric = columns[ci]?.numeric;
                  const cls = cn(
                    "px-4 sm:px-5 py-3 leading-[1.5]",
                    numeric ? "text-right tabular whitespace-nowrap" : "text-left",
                    ci === 0 ? "font-semibold text-ink" : "text-slate-body",
                  );
                  return ci === 0 ? (
                    <th key={ci} scope="row" className={cls}>
                      {cell}
                    </th>
                  ) : (
                    <td key={ci} className={cls}>
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footnote && <p className="mt-2.5 text-xs text-slate-meta leading-[1.55]">{footnote}</p>}
    </div>
  );
}
