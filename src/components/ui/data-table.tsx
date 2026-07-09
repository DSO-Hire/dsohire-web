/**
 * DataTable parts (design-excellence program 2b, 2026-07-09).
 *
 * The house table language, canonized from the 11 hand-rolled tables:
 * tracked-uppercase 2xs headers, hairline row rules, zebra cream wash,
 * .tabular right-aligned numerals, px-6 outer gutters. Composable parts
 * (shadcn-style) rather than a config-driven mega-table — every existing
 * table has bespoke cell content (bar fills, icons, links) that a column
 * schema would fight.
 *
 *   <DataTable>                        ← owns overflow-x + <table>
 *     <DataTableHead>
 *       <DataTableRow header>
 *         <DataTableTH>Location</DataTableTH>
 *         <DataTableTH numeric>Apps</DataTableTH>
 *     <DataTableBody>
 *       <DataTableRow zebra={i}>
 *         <DataTableTD>…</DataTableTD>
 *         <DataTableTD numeric>42</DataTableTD>
 *
 * Sortable headers: <SortableTH> is a client sub-component (own file
 * would force "use client" on all parts; kept here via a plain button +
 * caller-owned sort state so THIS file stays server-safe).
 *
 * Adoption is incremental — new tables start here; existing ones migrate
 * surface-by-surface.
 */

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function DataTable({
  className,
  children,
  ...props
}: React.ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-xs", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function DataTableHead(props: React.ComponentProps<"thead">) {
  return <thead {...props} />;
}

export function DataTableBody(props: React.ComponentProps<"tbody">) {
  return <tbody {...props} />;
}

export function DataTableRow({
  className,
  header = false,
  zebra,
  hover = false,
  ...props
}: React.ComponentProps<"tr"> & {
  /** Header rows get the tracked-uppercase treatment. */
  header?: boolean;
  /** Pass the row index for the cream zebra wash on odd rows. */
  zebra?: number;
  /** Row highlights on hover (use on rows that link somewhere). */
  hover?: boolean;
}) {
  return (
    <tr
      className={cn(
        header
          ? "text-left text-2xs font-bold tracking-[2px] uppercase text-slate-meta border-b border-[var(--rule)]"
          : "border-b border-[var(--rule)] last:border-b-0",
        zebra !== undefined && zebra % 2 === 1 && "bg-cream/20",
        hover && "transition-colors hover:bg-cream/50",
        className
      )}
      {...props}
    />
  );
}

export function DataTableTH({
  className,
  numeric = false,
  ...props
}: React.ComponentProps<"th"> & {
  /** Right-aligns the column (numbers align right, house rule). */
  numeric?: boolean;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-3 py-3 font-bold first:pl-6 last:pr-6",
        numeric && "text-right",
        className
      )}
      {...props}
    />
  );
}

export function DataTableTD({
  className,
  numeric = false,
  ...props
}: React.ComponentProps<"td"> & {
  /** Right-aligned .tabular numerals for figures. */
  numeric?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-3 py-4 first:pl-6 last:pr-6",
        numeric && "text-right tabular text-ink",
        className
      )}
      {...props}
    />
  );
}

/** Shared empty state for tables — one sentence, no "Oops". */
export function DataTableEmpty({
  colSpan,
  children,
}: {
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-6 py-10 text-center text-xs italic text-slate-meta"
      >
        {children}
      </td>
    </tr>
  );
}

export type SortDirection = "asc" | "desc";

/**
 * Sortable header content — a button the CALLER wires to its own sort
 * state (works from client components; this module stays server-safe):
 *
 *   <DataTableTH numeric>
 *     <SortableTHButton
 *       active={sort.key === "apps"} direction={sort.dir}
 *       onClick={() => toggleSort("apps")}
 *     >Apps · 30d</SortableTHButton>
 *   </DataTableTH>
 */
export function SortableTHButton({
  active,
  direction,
  onClick,
  children,
}: {
  active: boolean;
  direction: SortDirection;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const Icon = !active ? ChevronsUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : undefined}
      className={cn(
        "inline-flex items-center gap-1 uppercase tracking-[2px] font-bold transition-colors",
        active ? "text-ink" : "text-slate-meta hover:text-ink"
      )}
    >
      {children}
      <Icon className="size-3 shrink-0" aria-hidden />
    </button>
  );
}
