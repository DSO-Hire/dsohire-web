/**
 * Corporate role taxonomy (5G.c, 2026-05-13).
 *
 * 12 top-level functions × seed sub-roles per the locked Corporate
 * Roles Build Spec (2026-05-08). Powers:
 *   • The "Corporate function" selector on /employer/jobs/new when
 *     scope=corporate (5G.c wizard surface)
 *   • The /corporate-roles/[function] SEO landing pages
 *   • The Corporate tab filter chips on /jobs?surface=corporate
 *   • The candidate profile "Corporate functions" multi-select
 *
 * Functions are the primary filter unit. Sub-roles are seed-only —
 * recruiters can post any title under any function.
 *
 * Function slugs follow the URL-friendly lowercase-hyphen pattern so
 * /corporate-roles/finance-accounting works as a public route.
 */

export interface CorporateFunction {
  /** Stable identifier — used in DB writes + URLs. Don't rename casually. */
  slug: string;
  /** Display name for tabs/chips/headings. */
  label: string;
  /** SEO-leaning one-liner for landing page hero + meta description. */
  blurb: string;
  /** Seed sub-roles — recruiter chip suggestions, not enforced. */
  subRoles: string[];
}

export const CORPORATE_FUNCTIONS: CorporateFunction[] = [
  {
    slug: "finance-accounting",
    label: "Finance & Accounting",
    blurb:
      "Lead the financial health of a multi-practice DSO — controllership, FP&A, revenue cycle, and tax strategy roles.",
    subRoles: [
      "CFO",
      "VP Finance",
      "Controller",
      "FP&A",
      "Accounts Payable",
      "Revenue Cycle",
      "Tax",
    ],
  },
  {
    slug: "marketing",
    label: "Marketing",
    blurb:
      "Drive patient acquisition + brand strategy across a multi-practice DSO — digital, content, brand, and PR roles.",
    subRoles: [
      "CMO",
      "VP Marketing",
      "Brand",
      "Digital",
      "Patient Acquisition",
      "Content",
      "PR",
    ],
  },
  {
    slug: "operations",
    label: "Operations",
    blurb:
      "Run the day-to-day of a multi-practice DSO — regional ops, area management, and practice excellence.",
    subRoles: [
      "COO",
      "VP Operations",
      "Regional Director",
      "Area Manager",
      "Practice Operations",
    ],
  },
  {
    slug: "hr-recruiting",
    label: "HR & Recruiting",
    blurb:
      "Build the people function at a multi-practice DSO — talent, HRBPs, comp/benefits, and learning + development.",
    subRoles: [
      "CHRO",
      "VP People",
      "Talent Acquisition",
      "HRBP",
      "Compensation & Benefits",
      "Learning & Development",
    ],
  },
  {
    slug: "it-engineering",
    label: "IT & Engineering",
    blurb:
      "Run the tech stack of a multi-practice DSO — PMS, infrastructure, software, data, and security roles.",
    subRoles: [
      "CIO",
      "CTO",
      "IT Manager",
      "Systems Administrator",
      "Software Engineer",
      "Data Analyst",
      "Security",
    ],
  },
  {
    slug: "legal-compliance",
    label: "Legal & Compliance",
    blurb:
      "Steward regulatory + contractual posture at a multi-practice DSO — general counsel, compliance, privacy.",
    subRoles: [
      "General Counsel",
      "Compliance Officer",
      "Privacy Officer",
      "Contracts Manager",
      "Regulatory Affairs",
    ],
  },
  {
    slug: "real-estate-facilities",
    label: "Real Estate & Facilities",
    blurb:
      "Build + maintain the physical footprint of a multi-practice DSO — leases, de novo, construction, facilities.",
    subRoles: [
      "VP Real Estate",
      "Facilities Manager",
      "Construction Manager",
      "Lease Administrator",
      "De Novo Lead",
    ],
  },
  {
    slug: "ma-corporate-development",
    label: "M&A and Corporate Development",
    blurb:
      "Drive growth via acquisition + integration at a multi-practice DSO — diligence, deal execution, strategy, IR.",
    subRoles: [
      "VP M&A",
      "Integration Lead",
      "Deal Diligence",
      "Strategy",
      "Investor Relations",
    ],
  },
  {
    slug: "training-development",
    label: "Training & Development",
    blurb:
      "Stand up clinical + non-clinical training programs at a multi-practice DSO — curriculum, LMS, clinical trainers.",
    subRoles: [
      "Director of Training",
      "Clinical Trainer",
      "Curriculum Designer",
      "LMS Administrator",
    ],
  },
  {
    slug: "supply-chain-procurement",
    label: "Supply Chain & Procurement",
    blurb:
      "Run the supply + vendor side of a multi-practice DSO — procurement, vendor management, logistics.",
    subRoles: [
      "Supply Chain Director",
      "Procurement Manager",
      "Vendor Management",
      "Logistics",
    ],
  },
  {
    slug: "clinical-operations",
    label: "Clinical Operations",
    blurb:
      "Lead clinical quality + outcomes at a multi-practice DSO — VP Clinical Affairs, regional clinical directors, QA.",
    subRoles: [
      "VP Clinical Affairs",
      "Regional Clinical Director",
      "Quality Assurance",
      "Clinical Outcomes",
    ],
  },
  {
    slug: "business-development",
    label: "Business Development",
    blurb:
      "Source affiliations + doctor partnerships for a multi-practice DSO — partnerships, doctor recruitment, growth.",
    subRoles: [
      "VP Business Development",
      "Partnerships Lead",
      "DSO Affiliation Lead",
      "Practice Acquisition",
      "Doctor Recruitment",
    ],
  },
];

/** Lookup helper used by landing pages + filter components. */
export function getCorporateFunction(
  slug: string
): CorporateFunction | undefined {
  return CORPORATE_FUNCTIONS.find((f) => f.slug === slug);
}

/** Slugs only, for static path generation. */
export const CORPORATE_FUNCTION_SLUGS: ReadonlyArray<string> =
  CORPORATE_FUNCTIONS.map((f) => f.slug);
