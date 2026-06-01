/**
 * Pay-transparency compliance engine — the single source of truth for which
 * US jurisdictions require a pay range (and/or a benefits description) IN a
 * job posting, and a pure evaluator that decides what a given posting must
 * disclose.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NOT LEGAL ADVICE. DSO Hire is a compliance *assist*, not your lawyer. This
 * map is maintained in good faith from public guidance (state DOL / .gov +
 * reputable employment-law trackers) but laws change frequently and edge
 * cases turn on facts. See PAY_TRANSPARENCY_DISCLAIMER below; surface it
 * anywhere this engine drives UI.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Design notes
 *  • ONE flat, dated, cited table (`PAY_TRANSPARENCY_JURISDICTIONS`). Adding
 *    or amending a law is a one-row edit with a citation + source URL. Keep
 *    it that way — do not scatter jurisdiction logic into call sites.
 *  • Each row carries an `effectiveDate`; the engine only enforces a row on
 *    or after that date, so pending laws (VA 2026-07-01, ME 2026-07-29,
 *    CT posting mandate 2026-10-01) auto-activate without a code change.
 *  • "Strictest wins" across a multi-location / multi-state posting: if ANY
 *    covered jurisdiction requires a range, the posting requires a range; if
 *    ANY requires a benefits description, the posting requires one.
 *  • Employer-size thresholds are recorded but the product enforces by
 *    default and lets the employer self-certify an exemption (we never
 *    assert coverage — conduit, not verifier).
 *
 * Researched + verified June 2026 (Day 24). Re-verify before relying on the
 * pending-date rows; confirm any new state enactments quarterly.
 */

export const PAY_TRANSPARENCY_DISCLAIMER =
  "DSO Hire surfaces pay-transparency requirements to help you post compliantly. " +
  "This is general information, not legal advice — requirements change and edge " +
  "cases vary. Confirm your obligations with your own counsel.";

/* ───────────────────────── Types ───────────────────────── */

export type PostingRule =
  | "range_in_posting" // the pay range must appear in the public posting
  | "on_request" // disclose on request / post-offer — no posting mandate
  | "none";

export type RemoteReach =
  /** Covers any remote role performable in-state; disregards "no X applicants". CO, WA. */
  | "broad"
  /** Covers remote only if it reports to / is tied to an in-state office. NY, IL, MA, VT, NJ. */
  | "reports_to"
  /** Tied to in-state work; little/no published remote guidance. HI, MN, MD, DC, ME. */
  | "in_state";

export type JurisdictionLevel = "state" | "city" | "county";

export interface PayTransparencyJurisdiction {
  /** Stable id: USPS state code, or "ST:City Name" for a local ordinance. */
  id: string;
  level: JurisdictionLevel;
  /** USPS state code the jurisdiction sits in. */
  state: string;
  /** Display name. */
  name: string;
  rule: PostingRule;
  /** True when a pay range must be in the posting itself. */
  requiresRange: boolean;
  /**
   * True when the posting must ALSO carry a general description of benefits /
   * other compensation (CO, WA, IL, MN, MD, NJ, VT, + CT from 2026-10-01).
   */
  requiresBenefits: boolean;
  /** Minimum employees for coverage; null = no floor (any size covered). */
  sizeThreshold: number | null;
  sizeThresholdNote?: string;
  /** ISO date; the rule is only enforced on or after this date. */
  effectiveDate: string;
  remoteReach: RemoteReach;
  citation: string;
  sourceUrl: string;
  /** Short penalty summary for tooltips / audit context. */
  penalty?: string;
  /** Anything a recruiter or auditor should know. */
  notes?: string;
  /**
   * City-name matchers for local ordinances (case-insensitive). Counties are
   * generally subsumed by their state's law for the *range* requirement, so we
   * only carry locals that are NOT subsumed (lower threshold or no state law).
   */
  matchCities?: string[];
}

/* ─────────────── The jurisdiction table (single source of truth) ─────────────── */

export const PAY_TRANSPARENCY_JURISDICTIONS: PayTransparencyJurisdiction[] = [
  /* ===== Range-in-posting STATES ===== */
  {
    id: "CA",
    level: "state",
    state: "CA",
    name: "California",
    rule: "range_in_posting",
    requiresRange: true,
    requiresBenefits: false,
    sizeThreshold: 15,
    sizeThresholdNote: "15+ employees (total; ≥1 may be in CA).",
    effectiveDate: "2023-01-01",
    remoteReach: "broad",
    citation: "Cal. Labor Code § 432.3 (am. SB 642, eff. 2026-01-01)",
    sourceUrl: "https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202520260SB642",
    penalty: "$100–$10,000 per violation; first-violation cure if all listings fixed.",
    notes:
      "Range must be in the posting — a link or QR code does NOT satisfy CA. Covers remote roles fillable from CA. Benefits description not required in the posting.",
  },
  {
    id: "CO",
    level: "state",
    state: "CO",
    name: "Colorado",
    rule: "range_in_posting",
    requiresRange: true,
    requiresBenefits: true,
    sizeThreshold: null,
    sizeThresholdNote: "Any employer with ≥1 Colorado employee.",
    effectiveDate: "2021-01-01",
    remoteReach: "broad",
    citation: "C.R.S. § 8-5-201 (Equal Pay for Equal Work Act); 7 CCR 1103-13",
    sourceUrl: "https://cdle.colorado.gov/dlss/labor-laws-by-topic/equal-pay-for-equal-work-act",
    penalty: "$500–$10,000 per posting; CDLE may waive first violation if cured.",
    notes:
      "Broadest in the country. Requires range + a general description of bonuses/commissions/other comp AND benefits + how to apply. Covers remote roles performable from CO even if the posting says it won't hire Coloradans.",
  },
  {
    id: "WA",
    level: "state",
    state: "WA",
    name: "Washington",
    rule: "range_in_posting",
    requiresRange: true,
    requiresBenefits: true,
    sizeThreshold: 15,
    sizeThresholdNote: "15+ employees (total; includes out-of-state employers recruiting WA).",
    effectiveDate: "2023-01-01",
    remoteReach: "broad",
    citation: "RCW 49.58.110 (Equal Pay and Opportunities Act)",
    sourceUrl: "https://www.lni.wa.gov/workers-rights/wages/equal-pay-opportunities-act/",
    penalty: "L&I penalty + statutory damages $100–$5,000 per violation; 5-day cure window through 2027.",
    notes:
      "Requires wage scale/range + a general description of benefits and other compensation. Covers any role fillable by a WA-based employee, including remote; disregards 'no WA applicants' language.",
  },
  {
    id: "NY",
    level: "state",
    state: "NY",
    name: "New York",
    rule: "range_in_posting",
    requiresRange: true,
    requiresBenefits: false,
    sizeThreshold: 4,
    sizeThresholdNote: "4+ employees.",
    effectiveDate: "2023-09-17",
    remoteReach: "reports_to",
    citation: "N.Y. Labor Law § 194-b",
    sourceUrl: "https://dol.ny.gov/pay-transparency",
    penalty: "Up to $1,000 / $2,000 / $3,000 per violation (1st/2nd/3rd). No private right of action.",
    notes:
      "Range + job description. Covers roles performed at least partly in NY, plus remote roles reporting to a NY office/supervisor. Subsumes the NYC, Albany Co., Westchester Co. and Ithaca local ordinances for the range requirement.",
  },
  {
    id: "NJ",
    level: "state",
    state: "NJ",
    name: "New Jersey",
    rule: "range_in_posting",
    requiresRange: true,
    requiresBenefits: true,
    sizeThreshold: 10,
    sizeThresholdNote: "10+ employees over 20 calendar weeks.",
    effectiveDate: "2025-06-01",
    remoteReach: "reports_to",
    citation: "N.J.S.A. 34:6B-23 (P.L. 2024, c.91)",
    sourceUrl: "https://www.nj.gov/labor/myworkrights/wages/pay-transparency/",
    penalty: "$300 first violation, $600 each subsequent.",
    notes:
      "Range (defined min/max, no open-ended) + a general description of benefits and other compensation programs available in the first 12 months. Covers employers doing business / taking applications in NJ.",
  },
  {
    id: "HI",
    level: "state",
    state: "HI",
    name: "Hawaii",
    rule: "range_in_posting",
    requiresRange: true,
    requiresBenefits: false,
    sizeThreshold: 50,
    sizeThresholdNote: "50+ employees (statute silent on in-state vs total — treat as total).",
    effectiveDate: "2024-01-01",
    remoteReach: "in_state",
    citation: "Haw. Rev. Stat. § 378-2.4 (Act 203, 2023)",
    sourceUrl: "https://labor.hawaii.gov/hcrc/3767-2/",
    penalty: "Enforced as an unlawful discriminatory practice (HRS ch. 378).",
    notes:
      "Hourly rate or salary range only. Exempts internal transfers/promotions and public-sector collectively-bargained roles. The 50-employee floor exempts most small practices.",
  },
  {
    id: "VT",
    level: "state",
    state: "VT",
    name: "Vermont",
    rule: "range_in_posting",
    requiresRange: true,
    requiresBenefits: true,
    sizeThreshold: 5,
    sizeThresholdNote: "5+ employees (≥1 in VT).",
    effectiveDate: "2025-07-01",
    remoteReach: "reports_to",
    citation: "21 V.S.A. § 495m (Act 155, 2024)",
    sourceUrl:
      "https://ago.vermont.gov/sites/ago/files/2024-12/Final%20Version%20of%20H%20704%20Guidance%20(12-31-24).pdf",
    penalty: "AG Civil Rights Unit enforcement (no fixed fine schedule).",
    notes:
      "Range + general overview of benefits/other comp. Commission-only roles state that fact (no range); tipped roles disclose tipped status + base wage range. Covers VT roles or remote roles predominantly for a VT office.",
  },
  {
    id: "IL",
    level: "state",
    state: "IL",
    name: "Illinois",
    rule: "range_in_posting",
    requiresRange: true,
    requiresBenefits: true,
    sizeThreshold: 15,
    sizeThresholdNote: "15+ employees.",
    effectiveDate: "2025-01-01",
    remoteReach: "reports_to",
    citation: "820 ILCS 112/10 (Equal Pay Act, am. HB 3129)",
    sourceUrl: "https://labor.illinois.gov/laws-rules/conmed/equal-pay-act-salary-transparency.html",
    penalty: "$500 / $2,500 / $10,000 (1st/2nd/3rd+); cure window for 1st & 2nd.",
    notes:
      "Pay scale/range + a general description of benefits and other compensation (bonuses, stock, incentives). Covers roles partly in IL or reporting to an IL office. Must furnish range + benefits to third-party posters.",
  },
  {
    id: "MN",
    level: "state",
    state: "MN",
    name: "Minnesota",
    rule: "range_in_posting",
    requiresRange: true,
    requiresBenefits: true,
    sizeThreshold: 30,
    sizeThresholdNote: "30+ employees at one or more MN sites.",
    effectiveDate: "2025-01-01",
    remoteReach: "in_state",
    citation: "Minn. Stat. § 181.173",
    sourceUrl: "https://www.revisor.mn.gov/statutes/cite/181.173",
    penalty: "Private claim to MN DLI or AG enforcement under ch. 181 (no fixed schedule).",
    notes:
      "Good-faith salary range (min/max, no open-ended; fixed rate if no range) + a general description of all benefits and other compensation, including health/retirement.",
  },
  {
    id: "MD",
    level: "state",
    state: "MD",
    name: "Maryland",
    rule: "range_in_posting",
    requiresRange: true,
    requiresBenefits: true,
    sizeThreshold: null,
    sizeThresholdNote: "No size floor — all employers doing business in MD.",
    effectiveDate: "2024-10-01",
    remoteReach: "in_state",
    citation: "Md. Code, Lab. & Empl. § 3-304.2 (Wage Range Transparency Act)",
    sourceUrl:
      "https://www.jacksonlewis.com/insights/your-guide-maryland-wage-transparency-and-paystub-notice-laws-effective-oct-1-2024",
    penalty: "Order to comply (1st), escalating civil penalties up to $300/employee for repeats.",
    notes:
      "Full wage range (min/max) + a general description of benefits + any other compensation. Covers work performed at least partly in MD. No size floor — even a single-location office is covered.",
  },
  {
    id: "MA",
    level: "state",
    state: "MA",
    name: "Massachusetts",
    rule: "range_in_posting",
    requiresRange: true,
    requiresBenefits: false,
    sizeThreshold: 25,
    sizeThresholdNote: "26+ employees whose primary workplace is in MA (prior year average).",
    effectiveDate: "2025-10-29",
    remoteReach: "reports_to",
    citation: "M.G.L. c. 149, § 105F (Frances Perkins Workplace Equity Act)",
    sourceUrl: "https://www.mass.gov/info-details/pay-transparency-in-massachusetts",
    penalty: "Warning (1st), then up to $500 / $1,000 / $25,000; 2-day cure through 2027.",
    notes:
      "Pay range (annual salary or hourly) only — benefits not required in the posting. Covers roles whose primary place of work is MA or remote workers tied to a MA worksite.",
  },
  {
    id: "VA",
    level: "state",
    state: "VA",
    name: "Virginia",
    rule: "range_in_posting",
    requiresRange: true,
    requiresBenefits: false,
    sizeThreshold: null,
    sizeThresholdNote: "No size floor — any employer with ≥1 employee.",
    effectiveDate: "2026-07-01",
    remoteReach: "in_state",
    citation: "Va. Code (SB 215 / HB 636, 2026 session)",
    sourceUrl:
      "https://ogletree.com/insights-resources/blog-posts/virginia-and-maine-enact-pay-transparency-laws-to-take-effect-in-july-2026/",
    penalty: "AG civil action up to $1,000 (1st) / $5,000 (subsequent); 15-day cure. Private right of action.",
    notes:
      "NEW (signed spring 2026; effective 2026-07-01, ~a month after our launch target). Good-faith wage/range in every public and internal posting. No size floor. Final regs may follow.",
  },
  {
    id: "ME",
    level: "state",
    state: "ME",
    name: "Maine",
    rule: "range_in_posting",
    requiresRange: true,
    requiresBenefits: false,
    sizeThreshold: 10,
    sizeThresholdNote: "10+ employees (statute silent on in-state vs total).",
    effectiveDate: "2026-07-29",
    remoteReach: "in_state",
    citation: "Me. Rev. Stat. tit. 26 (LD 54 / wage transparency act, 2026)",
    sourceUrl: "https://www.littler.com/news-analysis/asap/maine-enacts-wage-transparency-law",
    penalty: "$100–$500 per violation; 3-year recordkeeping.",
    notes:
      "NEW (effective 2026-07-29). Range of pay in any posting; commission-only roles must say so. Remote applicability not yet clarified by guidance.",
  },
  {
    id: "DC",
    level: "state", // treated as a state-level jurisdiction for matching
    state: "DC",
    name: "Washington, D.C.",
    rule: "range_in_posting",
    requiresRange: true,
    requiresBenefits: false,
    sizeThreshold: null,
    sizeThresholdNote: "No size floor — employers with ≥1 D.C. employee.",
    effectiveDate: "2024-06-30",
    remoteReach: "in_state",
    citation: "D.C. Code § 32-1451 et seq. (Wage Transparency Omnibus Amendment Act of 2024)",
    sourceUrl: "https://code.dccouncil.gov/us/dc/council/code/titles/32/chapters/14A",
    penalty: "$1,000 / $5,000 / $20,000 (1st/2nd/subsequent).",
    notes:
      "Good-faith min/max in the posting. Benefits/health-care existence must be disclosed BEFORE the first interview (not in the posting itself), so we don't force a benefits field for DC.",
  },
  {
    id: "CT",
    level: "state",
    state: "CT",
    name: "Connecticut",
    rule: "range_in_posting",
    requiresRange: true,
    requiresBenefits: true,
    sizeThreshold: null,
    sizeThresholdNote: "1+ CT employee (no size floor).",
    effectiveDate: "2026-10-01",
    remoteReach: "reports_to",
    citation: "Conn. Gen. Stat. § 31-40z (am. Public Act 26-12, H.B. 5003)",
    sourceUrl:
      "https://portal.ct.gov/dol/divisions/wage-and-workplace-standards/salary-range-disclosure-law-faqs",
    penalty: "Private right of action; compensatory damages + fees.",
    notes:
      "Through 2026-09-30 CT is on-request only (no posting mandate). On 2026-10-01 it flips to requiring wage/range + a general description of benefits IN the posting — that is what this dated row enforces.",
  },

  /* ===== City ordinances NOT subsumed by their state ===== */
  {
    id: "OH:Cleveland",
    level: "city",
    state: "OH",
    name: "Cleveland, OH",
    rule: "range_in_posting",
    requiresRange: true,
    requiresBenefits: false,
    sizeThreshold: 15,
    sizeThresholdNote: "15+ employees within Cleveland city limits.",
    effectiveDate: "2025-10-27",
    remoteReach: "in_state",
    citation: "Cleveland Ordinance No. 104-2025",
    sourceUrl:
      "https://www.jacksonlewis.com/insights/clevelands-pay-transparency-and-compensation-history-law-breaking-down-new-employer-requirements",
    penalty: "Up to $1,000 (1st) / $5,000 (repeat in 5 yrs); 90-day cure window.",
    notes:
      "CRITICAL: Ohio has NO statewide posting law, so a state-only rule would miss this. Salary range/scale must be in the ad. Also bans salary-history screening. Matches jobs located in Cleveland.",
    matchCities: ["cleveland"],
  },
  {
    id: "NJ:Jersey City",
    level: "city",
    state: "NJ",
    name: "Jersey City, NJ",
    rule: "range_in_posting",
    requiresRange: true,
    requiresBenefits: true,
    sizeThreshold: 5,
    sizeThresholdNote: "5+ workers (employees AND independent contractors).",
    effectiveDate: "2022-04-01",
    remoteReach: "in_state",
    citation: "Jersey City Municipal Code (pay-range posting ordinance, 2022)",
    sourceUrl: "https://www.jerseycitynj.gov/residentresources/inclusion/paytransparency",
    penalty: "Up to $2,000 per violation.",
    notes:
      "Stricter than NJ statewide: lower threshold (5, counting contractors) and requires salary range + benefits. Applies to employers headquartered in Jersey City. Matches jobs located in Jersey City.",
    matchCities: ["jersey city"],
  },
];

/* ───────────────────── State name → USPS code ───────────────────── */

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY", "district of columbia": "DC", "washington dc": "DC",
  "washington d.c.": "DC",
};

/** Normalize a free-text state ("CA", "California", " calif. ") to a USPS code, or null. */
export function normalizeStateCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  if (t.length === 2) return t.toUpperCase();
  const code = STATE_NAME_TO_CODE[t.toLowerCase()];
  return code ?? null;
}

/* ───────────────────────── Engine ───────────────────────── */

export interface PostingLocation {
  state: string | null;
  city?: string | null;
}

export interface PayTransparencyInput {
  /** Physical locations attached to the job (from job_locations → dso_locations). */
  locations: PostingLocation[];
  /** jobs.work_mode — onsite | remote | hybrid | blended | null. */
  workMode?: string | null;
  /**
   * jobs.remote_state_restrictions — the states a remote role is open to. Empty
   * for a remote role = open to all US (assume strictest).
   */
  remoteStates?: string[];
  /** jobs.compensation_type — range | starting_at | up_to | exact | doe. */
  compType: string;
  compMin: number | null;
  compMax: number | null;
  compVisible: boolean;
  /** Whether a benefits / other-comp description is present (jobs.benefits non-empty). */
  hasBenefits: boolean;
}

export type ViolationCode =
  | "pay_hidden" // compensation_visible is false in a covered jurisdiction
  | "no_range" // DOE / no numbers where a range is required
  | "benefits_missing"; // covered jurisdiction requires a benefits description

export interface PayTransparencyAssessment {
  /** Active, applicable jurisdictions (dated + location/remote matched). */
  covered: PayTransparencyJurisdiction[];
  requiresRange: boolean;
  requiresBenefits: boolean;
  /** Jurisdiction ids driving the range requirement (for messaging). */
  rangeDrivers: string[];
  benefitsDrivers: string[];
  /** Problems with the current posting given the requirements. Empty = compliant. */
  violations: ViolationCode[];
  /**
   * True when this is a remote/open posting that broad-reach states (CO/WA)
   * could capture even though no covered physical location is attached.
   */
  remoteRisk: boolean;
  remoteRiskStates: string[];
}

/** Is a comp configuration a concrete range/number (vs DOE / blank)? */
function hasConcretePay(input: PayTransparencyInput): boolean {
  if (input.compType === "doe") return false;
  // A floor or a ceiling counts as "pay shown"; range needs at least one bound.
  return input.compMin != null || input.compMax != null;
}

/** All jurisdictions whose effectiveDate has arrived as of `asOf`. */
export function activeJurisdictions(asOf: Date = new Date()): PayTransparencyJurisdiction[] {
  const t = asOf.getTime();
  return PAY_TRANSPARENCY_JURISDICTIONS.filter(
    (j) => new Date(j.effectiveDate).getTime() <= t
  );
}

/** Active jurisdictions that apply to a single physical location. */
export function jurisdictionsForLocation(
  loc: PostingLocation,
  asOf: Date = new Date()
): PayTransparencyJurisdiction[] {
  const code = normalizeStateCode(loc.state);
  if (!code) return [];
  const city = (loc.city ?? "").trim().toLowerCase();
  return activeJurisdictions(asOf).filter((j) => {
    if (j.state !== code) return false;
    if (j.level === "state") return true;
    // Local ordinance: match by city name.
    if (j.matchCities && city) return j.matchCities.includes(city);
    return false;
  });
}

/**
 * The core evaluator. Strictest-wins across all attached locations + (for
 * remote/open postings) broad-reach states. Returns what the posting must
 * disclose and any current violations.
 */
export function evaluateJobPosting(
  input: PayTransparencyInput,
  asOf: Date = new Date()
): PayTransparencyAssessment {
  const matched = new Map<string, PayTransparencyJurisdiction>();

  // 1) Physical locations.
  for (const loc of input.locations) {
    for (const j of jurisdictionsForLocation(loc, asOf)) matched.set(j.id, j);
  }

  // 2) Remote handling. A remote role open to a covered state is covered; a
  //    remote role open to ALL states is treated as covered by the strictest
  //    broad-reach states (CO, WA) — they disregard applicant-exclusion text.
  const isRemote = input.workMode === "remote";
  const remoteStates = (input.remoteStates ?? [])
    .map((s) => normalizeStateCode(s))
    .filter((s): s is string => !!s);
  let remoteRisk = false;
  const remoteRiskStates: string[] = [];

  if (isRemote) {
    const active = activeJurisdictions(asOf);
    if (remoteStates.length > 0) {
      // Open only to a known set of states — match those.
      for (const code of remoteStates) {
        for (const j of active) {
          if (j.level === "state" && j.state === code) matched.set(j.id, j);
        }
      }
    } else {
      // Open to all US: the broad-reach states reach it. Flag as risk and
      // fold them into the requirement so we nudge toward showing pay.
      for (const j of active) {
        if (j.remoteReach === "broad") {
          matched.set(j.id, j);
          remoteRisk = true;
          remoteRiskStates.push(j.state);
        }
      }
    }
  }

  const covered = [...matched.values()];
  const rangeDrivers = covered.filter((j) => j.requiresRange).map((j) => j.id);
  const benefitsDrivers = covered.filter((j) => j.requiresBenefits).map((j) => j.id);
  const requiresRange = rangeDrivers.length > 0;
  const requiresBenefits = benefitsDrivers.length > 0;

  const violations: ViolationCode[] = [];
  if (requiresRange) {
    if (!hasConcretePay(input)) violations.push("no_range");
    if (!input.compVisible) violations.push("pay_hidden");
  }
  if (requiresBenefits && !input.hasBenefits) violations.push("benefits_missing");

  return {
    covered,
    requiresRange,
    requiresBenefits,
    rangeDrivers,
    benefitsDrivers,
    violations,
    remoteRisk,
    remoteRiskStates: [...new Set(remoteRiskStates)],
  };
}

/** Convenience: is the posting compliant (no violations)? */
export function isPostingCompliant(
  input: PayTransparencyInput,
  asOf: Date = new Date()
): boolean {
  return evaluateJobPosting(input, asOf).violations.length === 0;
}

/* ───────────────────── Human-readable messaging ───────────────────── */

/** "California, Colorado, and Washington" from a list of jurisdiction ids. */
export function describeJurisdictions(ids: string[]): string {
  const names = ids
    .map((id) => PAY_TRANSPARENCY_JURISDICTIONS.find((j) => j.id === id)?.name)
    .filter((n): n is string => !!n);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/** Short plain-English summary of what a covered posting must disclose. */
export function describeRequirement(a: PayTransparencyAssessment): string | null {
  if (!a.requiresRange && !a.requiresBenefits) return null;
  const where = describeJurisdictions(a.rangeDrivers.length ? a.rangeDrivers : a.benefitsDrivers);
  const parts: string[] = [];
  if (a.requiresRange) parts.push("a visible pay range");
  if (a.requiresBenefits) parts.push("a description of benefits and other compensation");
  const what = parts.length === 2 ? `${parts[0]} and ${parts[1]}` : parts[0];
  const n = new Set([...a.rangeDrivers, ...a.benefitsDrivers]).size;
  return `${where} require${n === 1 ? "s" : ""} ${what} in this posting.`;
}

/**
 * Server-side error string when a covered posting is non-compliant. Returns
 * null when there's nothing to block on. Drives the publish guard.
 */
export function describeBlockingError(a: PayTransparencyAssessment): string | null {
  if (a.violations.length === 0) return null;
  const where = describeJurisdictions(a.rangeDrivers.length ? a.rangeDrivers : a.benefitsDrivers);
  const fixes: string[] = [];
  if (a.violations.includes("no_range"))
    fixes.push("add a pay range (a single 'DOE' or blank amount isn't enough)");
  if (a.violations.includes("pay_hidden")) fixes.push("turn on “Show pay publicly”");
  if (a.violations.includes("benefits_missing"))
    fixes.push("add a general description of benefits and other compensation");
  const fixText =
    fixes.length === 1
      ? fixes[0]
      : `${fixes.slice(0, -1).join(", ")} and ${fixes[fixes.length - 1]}`;
  return (
    `Pay-transparency law in ${where} applies to this posting. To publish, ${fixText}. ` +
    `(If your organization is below the size threshold and exempt, you can mark it exempt instead.)`
  );
}
