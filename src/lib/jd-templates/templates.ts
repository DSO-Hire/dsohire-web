/**
 * JD template library (E1.3, 2026-05-13).
 *
 * Static catalog of role-shaped templates that pre-fill the AI JD
 * generator. Each template carries:
 *   • role_category — keyed to the wizard's ROLE_OPTIONS so we can
 *     filter templates by the active role choice
 *   • label — short title shown on the card ("Associate · GP")
 *   • title_seed — suggested job title; the AI may refine
 *   • brief — drops verbatim into the AI generator's brief textarea
 *
 * NOTE: This doesn't replace the AI generator — it gives operators a
 * faster on-ramp than typing a brief from scratch. They still hit
 * "Generate" to run Haiku, which then drafts the full description.
 *
 * Adding a new template: append a row to TEMPLATES. The role_category
 * must match a value from ROLE_OPTIONS in job-wizard.tsx.
 *
 * ─────────────────────────────────────────────────────────────────────
 * 2026-05-26 brief rewrite — Cam direction after wizard step re-sequence.
 * The brief field no longer carries hardcoded comp ($180K–$240K), hourly
 * rates ($42–$55/hr), employment-type ("Full-time"), specific day counts
 * ("4–5 days/week"), or specific experience-year requirements
 * ("2+ years"). Reason: those facts now flow into the AI prompt via the
 * Details-step structured context block, which is authoritative. Having
 * them ALSO in the brief was creating two problems:
 *   1. Recruiters saw a comp range in the brief textarea that contradicted
 *      what they'd entered in Details on the previous step, before the AI
 *      reconciled them on Generate — confusing UX.
 *   2. The AI sometimes deferred to the brief's stale number over the
 *      Details ground truth on the edges.
 * Briefs now focus on what the Details step does NOT carry: clinical
 * scope, technology stack, culture/staffing notes, and role personality.
 * The AI generator combines this with the recruiter's Details inputs to
 * produce a draft that's grounded in their actual choices.
 * ─────────────────────────────────────────────────────────────────────
 */

export interface JdTemplate {
  id: string;
  role_category: string;
  label: string;
  title_seed: string;
  brief: string;
}

export const JD_TEMPLATES: JdTemplate[] = [
  // Dentist (associate) — 2 variants
  {
    id: "dentist_gp_full_time",
    role_category: "dentist",
    label: "Associate · GP, full-time",
    title_seed: "Associate Dentist",
    brief:
      "General dentistry — restorative, prophy, simple extractions. Mentor on staff for complex cases. Newer grads welcome with a structured ramp.",
  },
  {
    id: "dentist_gp_part_time",
    role_category: "dentist",
    label: "Associate · GP, part-time",
    title_seed: "Associate Dentist (Part-Time)",
    brief:
      "General dentistry. Newer grads welcome with mentor support. Mix of restorative and hygiene check-outs.",
  },

  // Specialist (pedo, ortho, endo, perio, OMS, prostho, public health,
  // anesthesia) — covers every specialty in src/lib/candidate/canonical-lists
  // SPECIALTIES list. Each template seeds a specialty-specific brief that
  // the AI generator will refine into a full description.
  {
    id: "specialist_pediatric",
    role_category: "specialist",
    label: "Pediatric specialist",
    title_seed: "Pediatric Dentist",
    brief:
      "Board-eligible or board-certified pediatric dentist. Mix of primary care and sedation cases. High pediatric volume — 25–35 patients/day.",
  },
  {
    id: "specialist_endo",
    role_category: "specialist",
    label: "Endodontist",
    title_seed: "Endodontist",
    brief:
      "Endodontist handling referrals from sister GP practices. Operating microscope and CBCT in-office.",
  },
  {
    id: "specialist_orthodontist",
    role_category: "specialist",
    label: "Orthodontist",
    title_seed: "Orthodontist",
    brief:
      "Board-eligible or board-certified orthodontist. Mix of clear aligner therapy (Invisalign / SureSmile) and traditional brackets; in-house Phase I program for pediatric patients. CBCT and Dolphin Imaging on site.",
  },
  {
    id: "specialist_periodontist",
    role_category: "specialist",
    label: "Periodontist",
    title_seed: "Periodontist",
    brief:
      "Periodontist handling referrals from sister GP practices — implants, soft tissue grafts, regenerative therapy, and complex perio cases. In-house CBCT and surgical suite.",
  },
  {
    id: "specialist_oms",
    role_category: "specialist",
    label: "Oral & Maxillofacial Surgeon",
    title_seed: "Oral Surgeon",
    brief:
      "Oral and maxillofacial surgeon for full-arch implant placement, third molars, and surgical extractions. Active state DDA / sedation permit required. IV sedation suite and CBCT in-office.",
  },
  {
    id: "specialist_prosthodontist",
    role_category: "specialist",
    label: "Prosthodontist",
    title_seed: "Prosthodontist",
    brief:
      "Prosthodontist focused on full-arch restorative cases, complex crown & bridge, and removable prosthodontics. Partners with our in-house OMS / periodontist team on the surgical side. Full digital workflow — intraoral scanners and chairside milling.",
  },
  {
    id: "specialist_public_health",
    role_category: "specialist",
    label: "Public Health Dentist",
    title_seed: "Public Health Dentist",
    brief:
      "Public health dentist for our community-access program — sliding-scale clinics and outreach partnerships with local schools and health centers. Strong preventive and restorative skills, comfortable with diverse patient populations. Some travel between sites.",
  },
  {
    id: "specialist_anesthesiology",
    role_category: "specialist",
    label: "Dental Anesthesiologist",
    title_seed: "Dental Anesthesiologist",
    brief:
      "Dental anesthesiologist providing in-office IV sedation and general anesthesia for special-needs and high-anxiety patients. Travels between our practices for scheduled sedation days.",
  },

  // Hygienist — 2 variants
  {
    id: "hygienist_full_time",
    role_category: "dental_hygienist",
    label: "Hygienist · full-time",
    title_seed: "Dental Hygienist",
    brief:
      "Dental hygienist. Active state license required. Mix of perio and prophy patients on a digital-imaging-equipped operatory.",
  },
  {
    id: "hygienist_temp",
    role_category: "dental_hygienist",
    label: "Hygienist · temp/PRN",
    title_seed: "Dental Hygienist (PRN)",
    brief:
      "Per-diem hygienist for coverage shifts. Flexible scheduling — pick up shifts as they fit your calendar.",
  },

  // Dental Assistant — 2 variants
  {
    id: "da_chairside",
    role_category: "dental_assistant",
    label: "Chairside assistant",
    title_seed: "Dental Assistant",
    brief:
      "Chairside dental assistant. State radiology certification required. Experience with 4-handed dentistry and basic restorative assist.",
  },
  {
    id: "da_expanded_function",
    role_category: "dental_assistant",
    label: "Expanded function (EFDA)",
    title_seed: "Expanded Function Dental Assistant",
    brief:
      "EFDA with active state certification. Placing restorations under doctor supervision in addition to full chairside duties.",
  },

  // Front Office — 2 variants
  {
    id: "front_desk_receptionist",
    role_category: "front_office",
    label: "Receptionist",
    title_seed: "Front Desk Receptionist",
    brief:
      "Front desk receptionist for a busy multi-doctor practice. Scheduling, patient check-in/out, insurance verification. Practice-management software experience required (Dentrix / Eaglesoft / Open Dental).",
  },
  {
    id: "front_desk_insurance_coordinator",
    role_category: "front_office",
    label: "Insurance coordinator",
    title_seed: "Insurance Coordinator",
    brief:
      "Insurance coordinator handling claim submission, follow-up on aging A/R, pre-authorizations, and patient billing questions. Dental insurance experience preferred.",
  },

  // Office Manager — 2 variants (single + multi-location)
  {
    id: "office_manager_single_practice",
    role_category: "office_manager",
    label: "Office Manager · Single practice",
    title_seed: "Office Manager",
    brief:
      "Office manager for a single-location practice. Overseeing front office staff, scheduling, and KPIs (production, collections, no-show rate). Dental management experience required.",
  },
  {
    id: "office_manager_multi_location",
    role_category: "office_manager",
    label: "Office Manager · 2–3 practices",
    title_seed: "Multi-Location Office Manager",
    brief:
      "Office manager overseeing 2–3 practices in close geographic proximity. Travels between sites weekly; partners with the regional manager on staffing, scheduling, and KPI rollups. Multi-location dental ops experience preferred.",
  },

  // Regional Manager — 2 variants (smaller + larger scope)
  {
    id: "regional_manager_4_to_8_practices",
    role_category: "regional_manager",
    label: "Regional Manager · 4–8 practices",
    title_seed: "Regional Manager",
    brief:
      "Regional manager covering 4–8 practices. Operational support to office managers, KPI tracking, staff development, and P&L responsibility. Dental ops experience required.",
  },
  {
    id: "regional_manager_8_to_15_practices",
    role_category: "regional_manager",
    label: "Regional Manager · 8–15 practices",
    title_seed: "Senior Regional Manager",
    brief:
      "Senior regional manager with full P&L responsibility for 8–15 practices across a multi-state region. Coaches office managers, owns integration of newly acquired practices, and partners with HQ ops on the operating model. Multi-site dental ops leadership required.",
  },

  // Treatment Coordinator (front-office adjacent, but worth its own row)
  {
    id: "treatment_coordinator",
    role_category: "front_office",
    label: "Treatment Coordinator",
    title_seed: "Treatment Coordinator",
    brief:
      "Treatment coordinator owning case presentation, treatment plan financing conversations, and patient follow-through from consult to scheduled. Strong communication and comfort with insurance terminology and OrthoBanc / CareCredit / in-house financing programs.",
  },
];

/** Get templates filtered to a specific role_category. */
export function templatesForRole(roleCategory: string): JdTemplate[] {
  return JD_TEMPLATES.filter((t) => t.role_category === roleCategory);
}
