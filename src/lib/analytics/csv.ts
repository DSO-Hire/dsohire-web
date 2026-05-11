/**
 * CSV helpers for analytics exports (Phase 5C / E6.11, shipped 2026-05-11).
 *
 * Minimal-dependency CSV writer. Handles the three escape cases that
 * matter — embedded comma, embedded quote, embedded newline — by
 * wrapping the cell in double quotes and doubling internal quotes.
 * Anything more elaborate (UTF-8 BOM, Excel locale quirks, formula-
 * injection guards) lands as we hit it.
 */

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) =>
      headers.map((h) => escapeCell(row[h])).join(",")
    ),
  ];
  return lines.join("\r\n") + "\r\n";
}

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (v instanceof Date) {
    s = v.toISOString();
  } else if (typeof v === "object") {
    s = JSON.stringify(v);
  } else {
    s = String(v);
  }
  // Guard against CSV-formula injection in Excel: if a cell begins with
  // =, +, -, @, or tab, prefix a single quote.
  if (/^[=+\-@\t]/.test(s)) {
    s = "'" + s;
  }
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function csvFilename(prefix: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${prefix}-${yyyy}-${mm}-${dd}.csv`;
}
