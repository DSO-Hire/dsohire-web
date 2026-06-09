/**
 * Corporate-function taxonomy + matching for Practice Fit (#110, 2026-06-09).
 *
 * Why this exists
 * ───────────────
 * Every corporate posting is stored with `role_category = "other"` (corporate
 * jobs are categorized by `corporate_function`, the 12-slug taxonomy in
 * `@/lib/corporate/functions`). The pre-#110 scoring engine never read
 * corporate_function, and its role filter had an explicit
 * `if (jobRole === "other") return true` — so corporate postings were gated
 * against NOBODY. A dentist, an office manager and a family-law attorney all
 * scored "Excellent" on a VP-of-Business-Development req (Cam's bug).
 *
 * This module gives corporate roles the same kind of relation the clinical
 * ladder has: a candidate's corporate function vs a job's corporate function is
 * `exact` / `adjacent` / `unrelated`, with unrelated dropping the pair. Within
 * the corporate track an IT candidate won't match a legal req, just as a
 * hygienist doesn't match a dentist req in the clinical track.
 *
 * Candidate signal: candidates have NO structured corporate-function column
 * today, so we derive it from `current_title` (resume-derived) via keyword
 * mapping, plus a generic "dso_corporate" desired-role signal (corporate track,
 * function unknown). Derivation returns an empty set when we can't tell — the
 * function-fit dimension is then excluded rather than guessed, and the
 * coverage damp in compute.ts keeps a thin-data pair out of "Excellent".
 */

import { canonicalizeRoleCategory } from "./role-canonicalize";

/** Canonical corporate-function slugs — mirror @/lib/corporate/functions. */
export type CorporateFunctionSlug =
  | "finance-accounting"
  | "marketing"
  | "operations"
  | "hr-recruiting"
  | "it-engineering"
  | "legal-compliance"
  | "real-estate-facilities"
  | "ma-corporate-development"
  | "training-development"
  | "supply-chain-procurement"
  | "clinical-operations"
  | "business-development";

export const CORPORATE_FUNCTION_LABELS: Record<CorporateFunctionSlug, string> = {
  "finance-accounting": "Finance & Accounting",
  marketing: "Marketing",
  operations: "Operations",
  "hr-recruiting": "HR & Recruiting",
  "it-engineering": "IT & Engineering",
  "legal-compliance": "Legal & Compliance",
  "real-estate-facilities": "Real Estate & Facilities",
  "ma-corporate-development": "M&A and Corporate Development",
  "training-development": "Training & Development",
  "supply-chain-procurement": "Supply Chain & Procurement",
  "clinical-operations": "Clinical Operations",
  "business-development": "Business Development",
};

const VALID_SLUGS = new Set<string>(Object.keys(CORPORATE_FUNCTION_LABELS));

/**
 * Symmetric adjacency between corporate functions — plausible cross-function
 * transfer only. Kept conservative (like the clinical ladder); unrelated
 * functions drop the pair so no candidate sees a req in a field they don't
 * work. There's a unit-style symmetry assertion in the harness.
 *
 * Standalone (no neighbours): it-engineering, legal-compliance,
 * real-estate-facilities — specialized tracks with little lateral transfer.
 */
export const CORPORATE_FUNCTION_ADJACENCY: Record<
  CorporateFunctionSlug,
  CorporateFunctionSlug[]
> = {
  "finance-accounting": ["ma-corporate-development"],
  "ma-corporate-development": ["finance-accounting", "business-development"],
  "business-development": ["ma-corporate-development", "marketing"],
  marketing: ["business-development"],
  operations: ["clinical-operations", "supply-chain-procurement", "training-development"],
  "clinical-operations": ["operations"],
  "supply-chain-procurement": ["operations"],
  "training-development": ["hr-recruiting", "operations"],
  "hr-recruiting": ["training-development"],
  "it-engineering": [],
  "legal-compliance": [],
  "real-estate-facilities": [],
};

export type CorporateRelation = "exact" | "adjacent" | "unrelated";

/**
 * #110/#48 — corporate functions that WELCOME a clinical (DDS/DMD/hygiene)
 * background. A clinically-credentialed candidate isn't gated out of these and
 * gets credit for their clinical experience (the path DDS/DMDs take into the
 * DSO: clinical leadership, doctor recruitment / affiliation, clinical
 * training). The door stays open for chairside-leavers without forcing every
 * dentist onto every corporate req. (Executive tier joins this set with #51.)
 */
export const CLINICAL_WELCOMING_FUNCTIONS = new Set<CorporateFunctionSlug>([
  "clinical-operations",
  "business-development",
  "training-development",
]);

export function isClinicalWelcomingFunction(
  fn: CorporateFunctionSlug | null
): boolean {
  return fn !== null && CLINICAL_WELCOMING_FUNCTIONS.has(fn);
}

/**
 * Map any corporate-function string (a stored slug, a label, or a free-text
 * value) to a canonical slug. Returns null when it can't be resolved.
 */
export function canonicalizeCorporateFunction(
  raw: string | null | undefined
): CorporateFunctionSlug | null {
  if (!raw) return null;
  const k = raw.trim().toLowerCase();
  if (VALID_SLUGS.has(k)) return k as CorporateFunctionSlug;
  // Label / loose forms.
  const compact = k.replace(/[\s&/]+/g, "-").replace(/-+/g, "-");
  if (VALID_SLUGS.has(compact)) return compact as CorporateFunctionSlug;
  // Keyword fallback (handles labels like "M&A and Corporate Development").
  return matchTitleToFunction(k);
}

/**
 * Keyword → function matcher. Ordered most-specific first so e.g. "clinical
 * operations director" lands on clinical-operations, not operations. Used both
 * for loose function strings and for deriving a candidate's function from their
 * resume-derived job title.
 */
function matchTitleToFunction(
  titleLower: string
): CorporateFunctionSlug | null {
  const t = titleLower;
  const has = (...kws: string[]) => kws.some((kw) => t.includes(kw));

  if (has("clinical affairs", "clinical operations", "clinical director", "clinical outcomes", "quality assurance", "clinical quality"))
    return "clinical-operations";
  if (has("m&a", "mergers", "acquisition", "corporate development", "integration", "deal", "diligence", "investor relations"))
    return "ma-corporate-development";
  if (has("business development", "partnership", "affiliation", "doctor recruitment", "practice acquisition", "bizdev", "bd "))
    return "business-development";
  if (has("supply chain", "procurement", "vendor", "logistics", "purchasing"))
    return "supply-chain-procurement";
  if (has("real estate", "facilities", "construction", "lease", "de novo", "property"))
    return "real-estate-facilities";
  if (has("legal", "counsel", "attorney", "compliance", "privacy", "regulatory", "contracts"))
    return "legal-compliance";
  if (has("it ", "information technology", "software", "developer", "engineer", "systems admin", "sysadmin", "data analyst", "data engineer", "security", "cio", "cto", "devops", "infrastructure"))
    return "it-engineering";
  if (has("recruit", "talent acquisition", "talent ", "human resources", "hr ", "hrbp", "people ops", "people operations", "chro", "benefits", "compensation"))
    return "hr-recruiting";
  if (has("training", "learning", "curriculum", "lms", "instructional", "development specialist", "l&d"))
    return "training-development";
  if (has("marketing", "brand", "digital", "seo", "content", "communications", "pr ", "public relations", "patient acquisition", "cmo", "demand gen"))
    return "marketing";
  if (has("finance", "accounting", "accountant", "controller", "fp&a", "revenue cycle", "tax", "treasury", "cfo", "bookkeep", "payable", "receivable"))
    return "finance-accounting";
  if (has("operations", "coo", "area manager", "regional director", "practice operations", "ops "))
    return "operations";
  // generic sales → closest is business development
  if (has("sales", "account executive", "account manager"))
    return "business-development";
  return null;
}

/**
 * Derive a candidate's corporate functions from their resume-derived title.
 * Returns canonical slugs (deduped). Empty when the title maps to nothing
 * corporate (or there's no title) — the caller treats that as "corporate track
 * but function unknown" only when a separate corporate signal exists.
 */
export function deriveCandidateCorporateFunctions(
  currentTitle: string | null | undefined
): CorporateFunctionSlug[] {
  const fn = currentTitle ? matchTitleToFunction(currentTitle.trim().toLowerCase()) : null;
  return fn ? [fn] : [];
}

/**
 * True when the candidate's signals indicate the corporate track at all:
 * either a derivable corporate function from their title, or an explicit
 * `dso_corporate` desired role. (A clinical/admin title that maps to no
 * corporate function returns false.)
 */
export function hasCorporateSignal(
  desiredRoles: string[] | null | undefined,
  currentTitle: string | null | undefined
): boolean {
  const wantsCorporate = (desiredRoles ?? []).some(
    (r) => canonicalizeRoleCategory(r) === "dso_corporate"
  );
  if (wantsCorporate) return true;
  return deriveCandidateCorporateFunctions(currentTitle).length > 0;
}

/**
 * Best relation between a candidate's corporate functions and the job's
 * corporate function. When the candidate's function is unknown (corporate
 * track via dso_corporate but no derivable function) the relation is
 * "unrelated" only if we KNOW a function and it doesn't match — otherwise it's
 * treated as no-signal by the caller (function-fit excluded, not dropped).
 */
export function corporateFunctionRelation(
  candidateFns: CorporateFunctionSlug[],
  jobFn: CorporateFunctionSlug
): CorporateRelation {
  if (candidateFns.includes(jobFn)) return "exact";
  const neighbours = new Set<CorporateFunctionSlug>(
    candidateFns.flatMap((f) => CORPORATE_FUNCTION_ADJACENCY[f] ?? [])
  );
  if (neighbours.has(jobFn)) return "adjacent";
  return "unrelated";
}
