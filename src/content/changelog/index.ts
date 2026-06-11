/**
 * /changelog content source — the self-maintaining design (Day 32, Model 04).
 *
 * One TS module per month (2026-06.ts, 2026-05.ts, …) exporting entries;
 * this index aggregates and sorts. TS modules instead of YAML on purpose:
 * typed, zero parser dependency, and the page stays a plain server component.
 *
 * THE MAINTENANCE RULE (extends the session-closeout hard rule):
 * any commit that ships a USER-VISIBLE change appends one entry to the
 * current month's module in the same commit — date, kind, title, one
 * customer-language sentence. Internal refactors, perf plumbing, and
 * infra never appear. If it's on this page, a user can see it.
 *
 * Everything else derives from this source:
 *   - the page itself (grouped by month, newest first)
 *   - the "Last shipped" stamp (newest entry date)
 *   - (future) monthly ship-notes email = current month rendered into
 *     the existing email infra; homepage "what's new" chip = latest 3.
 */

export type ChangelogKind = "new" | "improved" | "fixed";

export interface ChangelogEntry {
  /** ISO date, e.g. "2026-06-11" */
  date: string;
  kind: ChangelogKind;
  title: string;
  body: string;
}

import { entries as jun2026 } from "./2026-06";
import { entries as may2026 } from "./2026-05";

const ALL: ChangelogEntry[] = [...jun2026, ...may2026].sort((a, b) =>
  b.date.localeCompare(a.date)
);

export interface ChangelogMonth {
  /** e.g. "June 2026" */
  label: string;
  /** e.g. "2026-06" */
  key: string;
  entries: ChangelogEntry[];
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function getChangelogMonths(): ChangelogMonth[] {
  const byMonth = new Map<string, ChangelogEntry[]>();
  for (const e of ALL) {
    const key = e.date.slice(0, 7);
    const list = byMonth.get(key) ?? [];
    list.push(e);
    byMonth.set(key, list);
  }
  return Array.from(byMonth.entries()).map(([key, entries]) => {
    const [y, m] = key.split("-");
    return { key, label: `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`, entries };
  });
}

/** Newest entry date, formatted for the hero stamp. */
export function getLastShipped(): string {
  const d = ALL[0]?.date;
  if (!d) return "";
  const [y, m, day] = d.split("-").map((n) => parseInt(n, 10));
  return `${MONTH_NAMES[m - 1].slice(0, 3)} ${day}, ${y}`;
}
