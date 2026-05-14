/**
 * Corporate JD template library (5G.d, 2026-05-14).
 *
 * Parallel to src/lib/jd-templates/templates.ts, but keyed by
 * `corporate_function` slug (see src/lib/corporate/functions.ts) instead
 * of role_category. These pre-fill the corporate AI JD generator on the
 * /employer/jobs/new/corporate wizard's Description step.
 *
 * Each template carries:
 *   • corporate_function — must match a slug from CORPORATE_FUNCTIONS so
 *     we can filter templates by the active function choice
 *   • label — short title shown on the card ("CFO · Acquisition-focused")
 *   • title_seed — suggested job title; the AI may refine
 *   • brief — drops verbatim into the AI generator's brief textarea
 *
 * These are corporate-shaped: strategic scope, business outcomes,
 * cross-practice reach. No chairside / clinical framing — that's the
 * whole point of the 5G.d parallel surface.
 *
 * Adding a new template: append a row to CORPORATE_JD_TEMPLATES. The
 * corporate_function must match a slug from CORPORATE_FUNCTIONS.
 */

export interface JdTemplate {
  id: string;
  corporate_function: string;
  label: string;
  title_seed: string;
  brief: string;
}

export const CORPORATE_JD_TEMPLATES: JdTemplate[] = [
  // Finance & Accounting — 2 variants
  {
    id: "finance_cfo_acquisition",
    corporate_function: "finance-accounting",
    label: "CFO · Acquisition-focused",
    title_seed: "Chief Financial Officer",
    brief:
      "CFO for a growth-stage DSO scaling through acquisition. Owns FP&A, capital structure, debt covenants, and deal modeling alongside the M&A team. Partners with the PE sponsor on board reporting. 10+ years finance leadership, prior DSO or multi-site healthcare experience strongly preferred. Comp includes equity.",
  },
  {
    id: "finance_controller",
    corporate_function: "finance-accounting",
    label: "Controller · Multi-entity",
    title_seed: "Corporate Controller",
    brief:
      "Corporate Controller overseeing the close, consolidations across 20+ practice entities, and audit readiness. Builds and manages the accounting team. CPA required, multi-entity consolidation experience essential. Reports to the CFO.",
  },

  // Marketing — 2 variants
  {
    id: "marketing_vp_patient_acquisition",
    corporate_function: "marketing",
    label: "VP Marketing · Patient Acquisition",
    title_seed: "VP of Marketing",
    brief:
      "VP Marketing owning patient acquisition strategy across the full practice portfolio. Leads digital, paid, local SEO, and brand. Accountable for cost-per-new-patient and chair utilization targets. 8+ years marketing leadership, multi-location or franchise healthcare background preferred.",
  },
  {
    id: "marketing_digital_director",
    corporate_function: "marketing",
    label: "Digital Director · Growth",
    title_seed: "Director of Digital Marketing",
    brief:
      "Director of Digital Marketing running paid search, social, and website conversion across all practice sites. Manages agency relationships and the in-house digital team. Strong analytics orientation — owns the new-patient funnel dashboard.",
  },

  // Operations — 2 variants
  {
    id: "operations_regional_director",
    corporate_function: "operations",
    label: "Regional Director · 8–15 practices",
    title_seed: "Regional Director of Operations",
    brief:
      "Regional Director of Operations with full P&L responsibility for 8–15 practices. Coaches office managers, drives production and collections targets, and standardizes operational playbooks. 5+ years multi-site healthcare operations leadership required. Significant in-region travel.",
  },
  {
    id: "operations_vp",
    corporate_function: "operations",
    label: "VP Operations · Portfolio-wide",
    title_seed: "Vice President of Operations",
    brief:
      "VP Operations leading the regional director team across the entire practice portfolio. Owns operational KPIs, integration of newly acquired practices, and the operating model. 10+ years scaling multi-site operations, prior DSO experience required.",
  },

  // HR & Recruiting — 2 variants
  {
    id: "hr_vp_people",
    corporate_function: "hr-recruiting",
    label: "VP People · Scaling org",
    title_seed: "VP of People",
    brief:
      "VP of People building the HR function for a fast-scaling DSO. Owns talent strategy, total rewards, HRBP coverage, and culture through integration. 8+ years HR leadership in a multi-site or high-growth environment. Reports to the CEO.",
  },
  {
    id: "hr_talent_acquisition_director",
    corporate_function: "hr-recruiting",
    label: "Director · Doctor & Staff Recruiting",
    title_seed: "Director of Talent Acquisition",
    brief:
      "Director of Talent Acquisition leading clinical and non-clinical recruiting across all practices. Builds the recruiting team, owns time-to-fill and offer-acceptance metrics, and partners with operations on staffing plans. Healthcare or dental recruiting background preferred.",
  },

  // IT & Engineering — 2 variants
  {
    id: "it_director_infrastructure",
    corporate_function: "it-engineering",
    label: "IT Director · PMS & Infrastructure",
    title_seed: "Director of IT",
    brief:
      "Director of IT owning the practice-management system, network infrastructure, and help desk across all locations. Leads PMS migrations during practice integrations and manages the IT team and vendor stack. 7+ years IT leadership, multi-site experience required.",
  },
  {
    id: "it_data_analyst",
    corporate_function: "it-engineering",
    label: "Data Analyst · Practice Performance",
    title_seed: "Senior Data Analyst",
    brief:
      "Senior Data Analyst building reporting and dashboards on practice performance — production, collections, scheduling, and patient flow. Works across PMS data sources to give operations and finance a single source of truth. SQL and BI tooling required.",
  },

  // Legal & Compliance
  {
    id: "legal_compliance_officer",
    corporate_function: "legal-compliance",
    label: "Compliance Officer · Multi-state",
    title_seed: "Director of Compliance",
    brief:
      "Director of Compliance owning the regulatory program across a multi-state practice footprint — HIPAA, OSHA, state dental board requirements, and corporate practice of dentistry structures. Builds policy, training, and audit cadence. Healthcare compliance background required.",
  },

  // Real Estate & Facilities
  {
    id: "real_estate_de_novo_lead",
    corporate_function: "real-estate-facilities",
    label: "De Novo Lead · New practice buildout",
    title_seed: "Director of De Novo Development",
    brief:
      "Director of De Novo Development leading new practice site selection, lease negotiation, and buildout from greenfield to open. Manages construction partners and timelines across multiple concurrent projects. Multi-unit retail or healthcare development experience preferred.",
  },

  // M&A and Corporate Development
  {
    id: "ma_integration_lead",
    corporate_function: "ma-corporate-development",
    label: "Integration Lead · Post-close",
    title_seed: "Director of Integration",
    brief:
      "Director of Integration owning the post-close playbook — systems, staff, branding, and operations onboarding for newly acquired practices. Partners with the deal team and operations to hit integration timelines and synergy targets. Prior DSO or healthcare M&A integration experience required.",
  },

  // Training & Development
  {
    id: "training_director",
    corporate_function: "training-development",
    label: "Director of Training · Clinical & Ops",
    title_seed: "Director of Training & Development",
    brief:
      "Director of Training & Development standing up onboarding and continuing education programs for clinical and front-office staff across the portfolio. Owns the LMS, curriculum, and a team of trainers. Instructional design background plus dental or healthcare experience preferred.",
  },

  // Supply Chain & Procurement
  {
    id: "supply_chain_procurement_manager",
    corporate_function: "supply-chain-procurement",
    label: "Procurement Manager · Vendor consolidation",
    title_seed: "Procurement Manager",
    brief:
      "Procurement Manager consolidating supply spend across all practices — negotiates GPO and vendor contracts, standardizes the formulary, and owns cost-per-chair supply targets. Healthcare or dental supply chain experience preferred.",
  },

  // Clinical Operations
  {
    id: "clinical_ops_regional_director",
    corporate_function: "clinical-operations",
    label: "Regional Clinical Director",
    title_seed: "Regional Clinical Director",
    brief:
      "Regional Clinical Director leading clinical quality, outcomes, and standards across a region of practices. Mentors doctors, drives clinical KPIs, and partners with operations — a leadership role, not a chairside role. DDS/DMD with multi-practice clinical leadership experience.",
  },

  // Business Development — 2 variants
  {
    id: "bd_vp_affiliations",
    corporate_function: "business-development",
    label: "VP BD · DSO Affiliations",
    title_seed: "VP of Business Development",
    brief:
      "VP of Business Development sourcing and closing practice affiliations and doctor partnerships. Owns the deal pipeline from outreach through LOI, partnering with M&A on diligence. 7+ years dealmaking, prior DSO affiliation or healthcare M&A experience strongly preferred. Comp includes deal-based incentives.",
  },
  {
    id: "bd_doctor_recruitment_lead",
    corporate_function: "business-development",
    label: "Doctor Recruitment Lead",
    title_seed: "Director of Doctor Recruitment",
    brief:
      "Director of Doctor Recruitment building the associate and partner-doctor pipeline across the portfolio. Owns sourcing strategy, the doctor candidate experience, and placement targets. Partners with operations on staffing needs. Dental industry network strongly preferred.",
  },
];

/** Get templates filtered to a specific corporate_function slug. */
export function corporateTemplatesForFunction(slug: string): JdTemplate[] {
  return CORPORATE_JD_TEMPLATES.filter((t) => t.corporate_function === slug);
}
