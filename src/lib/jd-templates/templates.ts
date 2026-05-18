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
      "Full-time associate. General dentistry — restorative, prophy, simple extractions. 2+ years experience preferred. Comp range $180K–$240K plus production bonus. Mentor on staff for complex cases.",
  },
  {
    id: "dentist_gp_part_time",
    role_category: "dentist",
    label: "Associate · GP, part-time",
    title_seed: "Associate Dentist (Part-Time)",
    brief:
      "Part-time associate, 2–3 days/week. General dentistry. Newer grads welcome with mentor support. Daily guarantee $750 or 30% of collections, whichever higher.",
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
      "Board-eligible or board-certified pediatric dentist. Mix of primary care + sedation cases. Full-time preferred but 3-day schedule negotiable. High pediatric volume — 25–35 patients/day.",
  },
  {
    id: "specialist_endo",
    role_category: "specialist",
    label: "Endodontist",
    title_seed: "Endodontist",
    brief:
      "Endodontist for 1–2 days/week of referrals. Operating microscope + CBCT in-office. Per-diem or per-procedure comp model — open to negotiation.",
  },
  {
    id: "specialist_orthodontist",
    role_category: "specialist",
    label: "Orthodontist",
    title_seed: "Orthodontist",
    brief:
      "Board-eligible or board-certified orthodontist. Mix of clear aligner therapy (Invisalign / SureSmile) and traditional brackets; in-house Phase I program for pediatric patients. CBCT + Dolphin Imaging on site. Full-time or 3–4 day rotating-practices schedule both open. Production-based comp with monthly guarantee.",
  },
  {
    id: "specialist_periodontist",
    role_category: "specialist",
    label: "Periodontist",
    title_seed: "Periodontist",
    brief:
      "Periodontist for 1–2 days/week of referrals from sister GP practices — implants, soft tissue grafts, regenerative therapy, and complex perio cases. In-house CBCT + surgical suite. Per-diem or percentage-of-collections comp model.",
  },
  {
    id: "specialist_oms",
    role_category: "specialist",
    label: "Oral & Maxillofacial Surgeon",
    title_seed: "Oral Surgeon",
    brief:
      "Oral & maxillofacial surgeon for full-arch implant placement, third molars, and surgical extractions. Active state DDA / sedation permit required. IV sedation suite and CBCT in-office. Per-diem comp at 35–40% of collections, sometimes with a base guarantee.",
  },
  {
    id: "specialist_prosthodontist",
    role_category: "specialist",
    label: "Prosthodontist",
    title_seed: "Prosthodontist",
    brief:
      "Prosthodontist focused on full-arch restorative cases, complex crown & bridge, and removable prosthodontics. Partners with our in-house OMS / periodontist team on the surgical side. Full digital workflow — intraoral scanners + chairside milling. Comp open to discussion.",
  },
  {
    id: "specialist_public_health",
    role_category: "specialist",
    label: "Public Health Dentist",
    title_seed: "Public Health Dentist",
    brief:
      "Public health dentist for our community-access program — sliding-scale clinics and outreach partnerships with local schools and health centers. Strong preventive + restorative skills, comfortable with diverse patient populations. Some travel between sites. Salaried with benefits + CE allowance.",
  },
  {
    id: "specialist_anesthesiology",
    role_category: "specialist",
    label: "Dental Anesthesiologist",
    title_seed: "Dental Anesthesiologist",
    brief:
      "Dental anesthesiologist providing in-office IV sedation and general anesthesia for special-needs and high-anxiety patients. Travel between our practices for scheduled sedation days. Per-diem comp model with travel reimbursement.",
  },

  // Hygienist — 2 variants
  {
    id: "hygienist_full_time",
    role_category: "dental_hygienist",
    label: "Hygienist · full-time",
    title_seed: "Dental Hygienist",
    brief:
      "Full-time dental hygienist, 4–5 days/week. Active state license required. Mix of perio and prophy. $42–$55/hr DOE plus benefits + CE allowance.",
  },
  {
    id: "hygienist_temp",
    role_category: "dental_hygienist",
    label: "Hygienist · temp/PRN",
    title_seed: "Dental Hygienist (PRN)",
    brief:
      "Per-diem hygienist for coverage 1–2 days/week. Flexible scheduling — pick up shifts as they fit your calendar. $55–$70/hr DOE.",
  },

  // Dental Assistant — 2 variants
  {
    id: "da_chairside",
    role_category: "dental_assistant",
    label: "Chairside assistant",
    title_seed: "Dental Assistant",
    brief:
      "Chairside dental assistant. State radiology certification required. Experience with 4-handed dentistry and basic restorative assist. $22–$30/hr DOE.",
  },
  {
    id: "da_expanded_function",
    role_category: "dental_assistant",
    label: "Expanded function (EFDA)",
    title_seed: "Expanded Function Dental Assistant",
    brief:
      "EFDA with active state certification. Will be placing restorations under doctor supervision plus full chairside duties. $28–$38/hr DOE.",
  },

  // Front Office — 2 variants
  {
    id: "front_desk_receptionist",
    role_category: "front_office",
    label: "Receptionist",
    title_seed: "Front Desk Receptionist",
    brief:
      "Front desk receptionist for a busy multi-doctor practice. Scheduling, patient check-in/out, insurance verification. Practice-management software experience required (Dentrix / Eaglesoft / Open Dental). $18–$24/hr.",
  },
  {
    id: "front_desk_insurance_coordinator",
    role_category: "front_office",
    label: "Insurance coordinator",
    title_seed: "Insurance Coordinator",
    brief:
      "Insurance coordinator handling claim submission, follow-up on aging A/R, pre-authorizations, and patient billing questions. 1+ year dental insurance experience preferred. $22–$28/hr.",
  },

  // Office Manager — 2 variants (single + multi-location)
  {
    id: "office_manager_single_practice",
    role_category: "office_manager",
    label: "Office Manager · Single practice",
    title_seed: "Office Manager",
    brief:
      "Office manager for a single-location practice. Overseeing front office staff, scheduling, KPIs (production, collections, no-show rate). 3+ years dental management experience required. $65K–$85K plus performance bonus.",
  },
  {
    id: "office_manager_multi_location",
    role_category: "office_manager",
    label: "Office Manager · 2–3 practices",
    title_seed: "Multi-Location Office Manager",
    brief:
      "Office manager overseeing 2–3 practices in close geographic proximity. Travels between sites weekly; partners with the regional manager on staffing, scheduling, and KPI rollups. 4+ years dental ops experience, ideally multi-location. $75K–$95K plus performance bonus + mileage reimbursement.",
  },

  // Regional Manager — 2 variants (smaller + larger scope)
  {
    id: "regional_manager_4_to_8_practices",
    role_category: "regional_manager",
    label: "Regional Manager · 4–8 practices",
    title_seed: "Regional Manager",
    brief:
      "Regional manager covering 4–8 practices. Operational support to office managers, KPI tracking, staff development, P&L responsibility. 5+ years dental ops experience required. $95K–$130K plus regional performance bonus + travel reimbursement.",
  },
  {
    id: "regional_manager_8_to_15_practices",
    role_category: "regional_manager",
    label: "Regional Manager · 8–15 practices",
    title_seed: "Senior Regional Manager",
    brief:
      "Senior regional manager with full P&L responsibility for 8–15 practices across a multi-state region. Coaches office managers, owns integration of newly acquired practices, and partners with HQ ops on the operating model. 7+ years multi-site dental ops leadership required. $130K–$170K plus regional performance bonus + travel.",
  },

  // Treatment Coordinator (front-office adjacent, but worth its own row)
  {
    id: "treatment_coordinator",
    role_category: "front_office",
    label: "Treatment Coordinator",
    title_seed: "Treatment Coordinator",
    brief:
      "Treatment coordinator owning case presentation, treatment plan financing conversations, and patient follow-through from consult to scheduled. Strong communication + comfort with insurance terminology and OrthoBanc / CareCredit / in-house financing programs. $24–$32/hr DOE.",
  },
];

/** Get templates filtered to a specific role_category. */
export function templatesForRole(roleCategory: string): JdTemplate[] {
  return JD_TEMPLATES.filter((t) => t.role_category === roleCategory);
}
