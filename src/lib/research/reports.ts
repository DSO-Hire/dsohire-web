/**
 * Registry of DSO Hire Research reports. The /research index, each report's
 * metadata, and (once published) the sitemap all read from this list, so a
 * report's title, dates and slug live in exactly one place.
 */

export interface ResearchSource {
  /** Human-readable citation: publisher, title. */
  label: string;
  url: string;
  /** Source type, shown so readers can weigh it (e.g. "Government"). */
  kind: string;
  /** Publication or "last updated" date when the source states one. */
  date?: string;
}

export interface ResearchReportMeta {
  slug: string;
  /** Full headline, used for <title>, OG and JSON-LD. */
  title: string;
  /** Short card title for the index. */
  shortTitle: string;
  description: string;
  /** ISO dates. */
  datePublished: string;
  dateModified: string;
  /** Display date, e.g. "October 2026". */
  dateLabel: string;
  readMinutes: number;
  author: { name: string; role: string };
  topic: string;
}

export const AUTHOR_CAM = { name: "Cam Eslinger", role: "Founder, DSO Hire" } as const;

export const STAFFING_COSTS_2026: ResearchReportMeta = {
  slug: "dental-staffing-agency-costs-2026",
  title: "What dental staffing agencies actually charge (2026)",
  shortTitle: "What dental staffing agencies actually charge",
  description:
    "Published placement fees, guarantee terms, temp platform fees, and job board prices for dental hiring in 2026, with every number cited and every DSO Hire calculation labeled.",
  datePublished: "2026-10-19",
  dateModified: "2026-10-19",
  dateLabel: "October 2026",
  readMinutes: 12,
  author: AUTHOR_CAM,
  topic: "Hiring costs",
};

export const RESEARCH_REPORTS: readonly ResearchReportMeta[] = [STAFFING_COSTS_2026];

export function researchPath(slug: string): string {
  return `/research/${slug}`;
}
