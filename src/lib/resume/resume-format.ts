/**
 * #87 — pure résumé types + formatting helpers.
 *
 * Extracted from resume-data.ts so it carries NO server-only imports
 * (no createSupabaseServerClient / next/headers). That lets the résumé
 * template render on the client too — which is what powers the builder's
 * live preview (resume-builder.tsx) as well as the server render.
 *
 * resume-data.ts re-exports everything here for back-compat.
 */

import {
  ROLE_CATEGORIES,
  SPECIALTIES,
  LICENSE_TYPES,
  CERTIFICATION_KINDS,
} from "@/lib/candidate/canonical-lists";

type CanonOpt = { value: string; label: string };

function prettify(v: string): string {
  return v.replace(/[_-]+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function makeLookup(
  list: ReadonlyArray<CanonOpt>
): (v: string | null | undefined) => string {
  const m = new Map(list.map((o) => [o.value, o.label]));
  return (v) => (v ? m.get(v) ?? prettify(v) : "");
}

export const roleLabel = makeLookup(ROLE_CATEGORIES);
export const specialtyLabel = makeLookup(SPECIALTIES);
export const licenseTypeLabel = makeLookup(LICENSE_TYPES);
export const certKindLabel = makeLookup(CERTIFICATION_KINDS);

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2021-03-01" → "Mar 2021"; null → "". */
export function monthYear(d: string | null): string {
  if (!d) return "";
  const [y, m] = d.split("-");
  const mi = Number(m) - 1;
  if (!y || mi < 0 || mi > 11) return y ?? "";
  return `${MONTHS[mi]} ${y}`;
}

export function dateRange(
  start: string | null,
  end: string | null,
  isCurrent: boolean
): string {
  const s = monthYear(start);
  const e = isCurrent ? "Present" : monthYear(end);
  if (s && e) return `${s} – ${e}`;
  return s || e || "";
}

export type ResumeWork = {
  id: string;
  title: string;
  company: string;
  isDso: boolean;
  start: string | null;
  end: string | null;
  isCurrent: boolean;
  description: string | null;
};

export type ResumeEducation = {
  id: string;
  school: string;
  degree: string | null;
  field: string | null;
  startYear: number | null;
  endYear: number | null;
  description: string | null;
};

export type ResumeLicense = {
  id: string;
  type: string;
  state: string | null;
  number: string | null;
  displayNumber: boolean;
  expires: string | null;
};

export type ResumeCert = {
  id: string;
  kind: string;
  level: string | null;
  expires: string | null;
};

export type ResumeData = {
  name: string;
  headline: string | null;
  summary: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  linkedinUrl: string | null;
  yearsExperience: number | null;
  desiredRoles: string[];
  specialties: string[];
  skills: string[];
  languages: string[];
  pmsSystems: string[];
  work: ResumeWork[];
  education: ResumeEducation[];
  licenses: ResumeLicense[];
  certifications: ResumeCert[];
};

/** Does this résumé have any real body content beyond the header? */
export function resumeHasContent(d: ResumeData): boolean {
  return (
    d.work.length > 0 ||
    d.education.length > 0 ||
    d.licenses.length > 0 ||
    d.certifications.length > 0 ||
    d.skills.length > 0 ||
    Boolean(d.summary && d.summary.trim())
  );
}
