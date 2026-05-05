/**
 * Role config for the dynamic /for-[role] landing pages.
 *
 * One config object per role becomes one rendered page. The page template
 * lives in `./page.tsx`. Adding a new role is a copy-paste of an existing
 * entry — no new file required.
 *
 * Cross-links between roles surface in the "different role?" section on
 * each page. The relatedRoles array references slugs from this same map.
 *
 * Compensation ranges are directional. They reflect what we've seen across
 * the industry as of 2026; not legal guidance, not a guarantee, not pulled
 * from any single source. Update as we get real data from the platform's
 * own listings.
 */

import {
  Stethoscope,
  Sparkles,
  Heart,
  GraduationCap,
  Users,
  TrendingUp,
} from "lucide-react";

export interface RoleAdvantage {
  title: string;
  body: string;
}

export interface RelatedRole {
  slug: string;
  label: string;
}

export interface RoleConfig {
  /** URL segment — matches the [role] dynamic param. */
  slug: string;
  /** Plural display label, used in breadcrumb + heading + jobs CTA. */
  label: string;
  /** Short eyebrow caption shown above the headline. */
  eyebrow: string;
  /** Lucide icon component for the role badge. */
  Icon: React.ComponentType<{ className?: string }>;
  /** Hero copy. */
  hero: {
    headline: string;
    /** Highlighted phrase inside the headline (heritage-tinted underline). */
    headlineAccent: string;
    sub: string;
  };
  /** "Why a DSO" reasons. 4–5 entries. */
  advantages: RoleAdvantage[];
  /** Career-path narrative — 1–3 paragraphs. */
  careerPath: {
    title: string;
    paragraphs: string[];
  };
  /** Compensation context. */
  compensation: {
    title: string;
    range: string;
    notes: string;
  };
  /** Filtered jobs CTA URL. */
  jobsFilterHref: string;
  /** Other roles to link to in the "different role?" section. */
  relatedRoles: RelatedRole[];
  /** SEO meta description. */
  metaDescription: string;
}

export const ROLE_CONFIGS: RoleConfig[] = [
  {
    slug: "dentists",
    label: "Dentists",
    eyebrow: "DDS / DMD · Associate Dentist Roles",
    Icon: Stethoscope,
    hero: {
      headline: "Practice dentistry without owning the building.",
      headlineAccent: "without owning the building",
      sub: "Multi-location DSOs offer the clinical autonomy you trained for, the benefits package solo practice can't match, and a career path that doesn't end at 'become an owner.' Find a role that fits how you actually want to practice.",
    },
    advantages: [
      {
        title: "A real benefits package",
        body: "401(k) match, group health insurance, malpractice coverage, paid CE allowance, paid time off — things solo practices struggle to offer at any scale. Most DSOs also include disability and life insurance.",
      },
      {
        title: "Mentorship and peer learning",
        body: "Multi-doc practices mean someone to consult on tricky cases. Solo practice can be lonely. DSOs also typically run internal CE programs and case-review meetings — the kind of structured learning you don't get when you're the only DDS in the building.",
      },
      {
        title: "Modern equipment at scale",
        body: "DSOs buy CBCT, digital scanners (iTero / Trios / Primescan), CAD/CAM mills, and laser equipment at scale. Solo practices often wait years to upgrade. You'll practice with current technology, not 2014's.",
      },
      {
        title: "Predictable schedules",
        body: "No 7am-7pm weeks because the owner needs to cover production. DSOs staff their schedules around defined hours, which means you can actually plan your life outside the operatory.",
      },
      {
        title: "Career path that doesn't dead-end",
        body: "Associate → senior associate → partner track at some DSOs. Some emerging DSOs offer equity grants. Lead-clinician roles, education-track exits, regional director paths. Much more variety than 'buy a practice or stay an associate forever.'",
      },
    ],
    careerPath: {
      title: "What growth looks like",
      paragraphs: [
        "Most DSO dentists start as associate dentists at one location. From there, the path forks. Some lean into clinical mastery — taking on complex cases, mentoring associates, becoming the practice's senior clinician. Others move into hybrid roles — clinical lead at a single practice, regional clinical director across 5-10 practices, or director of clinical operations at the DSO HQ level.",
        "The big difference from private practice: progression doesn't require buying out a partner. DSOs build career paths because they need them to retain talent — solo practices retain by offering equity, which is one path. DSOs retain by offering ladders. If equity is non-negotiable for you, some DSOs offer it (especially newer ones); ask in interviews.",
      ],
    },
    compensation: {
      title: "What you can expect to earn",
      range: "$150K – $300K+ for general dentists; specialists higher",
      notes: "DSOs typically structure as a guaranteed base plus production percentage (often 25-30% of collections above the base). Geographic variance is significant — coastal urban metros pay more, midwest and rural pay less. Newer DSOs often pay more aggressively to attract talent. We surface comp ranges on every job listing where the DSO shares them.",
    },
    jobsFilterHref: "/jobs?category=dentist",
    relatedRoles: [
      { slug: "specialists", label: "Specialists" },
      { slug: "office-managers", label: "Office Managers" },
      { slug: "hygienists", label: "Hygienists" },
    ],
    metaDescription:
      "Dentist jobs at multi-location DSOs. Real benefits, modern equipment, mentorship from peer doctors, and career paths that don't end at 'become an owner.' Browse open dentist roles and learn what working at a DSO actually looks like.",
  },
  {
    slug: "specialists",
    label: "Specialists",
    eyebrow: "Endo · Perio · Pedo · OS · Ortho",
    Icon: Sparkles,
    hero: {
      headline: "Specialty practice with built-in referrals.",
      headlineAccent: "built-in referrals",
      sub: "Get the case volume your specialty needs without building the referral network from scratch. Multi-location DSOs feed referrals from sister GP practices, so your day looks like patient care — not lunch-and-learns and golf with referring offices.",
    },
    advantages: [
      {
        title: "Referral pipeline from sister GPs",
        body: "Your case volume isn't dependent on networking. Specialty referrals from the DSO's general dentists flow to you by default. Some DSOs route 80%+ of their internal endo / perio / pedo cases to specialists at sister practices.",
      },
      {
        title: "Specialty equipment without the capital",
        body: "Surgical microscopes, CBCT, sedation suites, ortho 3D imaging, hard-tissue lasers — the kind of equipment that's a $200K+ decision in private practice. DSOs amortize the investment across multiple practices and you get to use it from day one.",
      },
      {
        title: "Travel-between-locations roles",
        body: "Many DSOs hire specialists who rotate between 3-5 practices weekly, especially in less-dense markets. You see the variety; the DSO solves the geographic spread. Useful if you don't want to commit to one office or one city.",
      },
      {
        title: "Production-based compensation",
        body: "Most DSO specialist comp is structured as a percentage of collections, sometimes with a base guarantee. Your specialty premium gets recognized — high-production specialists routinely clear $400K+ at DSOs that take their model seriously.",
      },
      {
        title: "Peer specialist learning",
        body: "Larger DSOs employ multiple specialists in your discipline. Peer review, case discussions, internal CE — the kind of community you'd otherwise build through specialty associations and conferences alone.",
      },
    ],
    careerPath: {
      title: "What growth looks like",
      paragraphs: [
        "Most DSO specialists start as associate specialists at one or two practices. From there, paths typically include: lead specialist (case review, training of associates, equipment decisions), regional specialty director (oversight across 10-20 practices), and education roles (running internal CE and mentoring program for the DSO's GPs on referral indications). Some DSOs also offer ownership / partner-track paths to specialists, similar to GPs.",
        "What's harder at a DSO: building your own personal referral brand. If your career goal is to be the area's recognized expert with patients knocking down your door at your own clinic, private practice still wins. DSOs are better when you want the case volume without the marketing work.",
      ],
    },
    compensation: {
      title: "What you can expect to earn",
      range: "$250K – $500K+; varies significantly by specialty",
      notes: "Oral surgery and orthodontics top the range. Pediatric dentistry tends lower than general specialty averages but with better lifestyle. Endo and Perio sit in the middle. Production-based comp means high-volume specialists at busy DSOs can substantially exceed the top of typical ranges. Geographic variance is significant — comp scales with metro population density.",
    },
    jobsFilterHref: "/jobs?category=specialist",
    relatedRoles: [
      { slug: "dentists", label: "Dentists (general)" },
      { slug: "office-managers", label: "Office Managers" },
    ],
    metaDescription:
      "Specialist jobs at multi-location DSOs — Endo, Perio, Pedo, Oral Surgery, Ortho. Built-in referral pipeline from sister GP practices. Production-based comp, modern specialty equipment, no marketing-the-practice burden. Browse open specialist roles.",
  },
  {
    slug: "hygienists",
    label: "Hygienists",
    eyebrow: "RDH · Registered Dental Hygienist",
    Icon: Heart,
    hero: {
      headline: "Hygiene work that respects your time.",
      headlineAccent: "respects your time",
      sub: "Defined PTO, real CE allowance, predictable schedules, and no 'double up' expectations on slow days. The DSO model treats hygiene as critical care, not as flex labor when the schedule lightens.",
    },
    advantages: [
      {
        title: "Defined PTO and CE allowance",
        body: "Most DSOs offer 2-4 weeks of paid time off and a $500-$1,500 annual CE allowance. Solo practices often promise 'flexible time off' that turns into unpaid days. The DSO version is on the offer letter.",
      },
      {
        title: "Predictable schedules",
        body: "DSO operations teams build hygiene schedules around defined production goals, not around the owner's calendar. You know your hours. No '7am-3pm becomes 9am-7pm because the doctor's running late' chaos.",
      },
      {
        title: "Certifications often DSO-paid",
        body: "Local anesthesia certification, laser certification, expanded-functions certifications — the things that move you from $35/hr to $50/hr — are routinely DSO-funded as part of CE allowance. Solo practices typically expect you to pay your own way.",
      },
      {
        title: "No 'double up' expectations",
        body: "When a solo practice has a slow morning, the hygienist often gets pulled into front-desk work, sterilization, or the doctor's column. DSO operations have specific hygiene production targets and staff for them — you're not the variable cost when the schedule lightens.",
      },
      {
        title: "Career path beyond hygiene chair",
        body: "Lead hygienist, hygiene coordinator (across multiple practices), DSO clinical operations roles — the kinds of paths that solo practices structurally don't have because there's only one hygienist position to advance into.",
      },
    ],
    careerPath: {
      title: "What growth looks like",
      paragraphs: [
        "Most RDHs at DSOs start as a chair-side hygienist at one location. From there, paths include: senior RDH (mentor newer hires, anchor the schedule, take on complex cases), lead hygienist (run hygiene operations at one large practice or 2-3 small ones), hygiene coordinator (DSO-wide standards, training, equipment decisions). Some larger DSOs have regional hygiene director roles that combine clinical work with operational responsibility for 10+ practices.",
        "If clinical chair work is what you want for the next decade, that's also genuinely supported — DSOs typically have stable hygiene roles you can stay in for years. The difference vs. solo practice is that the option to grow is there if you want it; you're not stuck.",
      ],
    },
    compensation: {
      title: "What you can expect to earn",
      range: "$35 – $55/hr typical; lead/coordinator roles higher",
      notes: "Hourly rate varies by region (West Coast and Northeast top the range, Midwest and South lower) and certification (LA-certified hygienists earn $5-10/hr more on average). Many DSOs add production bonuses tied to hygiene-driven service mix (perio, sealants, fluoride). Lead and coordinator roles are often salaried at $75K-$110K depending on scope.",
    },
    jobsFilterHref: "/jobs?category=dental_hygienist",
    relatedRoles: [
      { slug: "dental-assistants", label: "Dental Assistants" },
      { slug: "office-managers", label: "Office Managers" },
    ],
    metaDescription:
      "Hygienist jobs at multi-location DSOs. Defined PTO, real CE allowance, predictable schedules, no double-up expectations. Local anesthesia and laser certifications often DSO-paid. Browse open RDH roles and learn what working at a DSO is actually like.",
  },
  {
    slug: "dental-assistants",
    label: "Dental Assistants",
    eyebrow: "DA · EFDA · Expanded Functions",
    Icon: GraduationCap,
    hero: {
      headline: "Dental assisting with a career ladder.",
      headlineAccent: "with a career ladder",
      sub: "Structured EFDA training, certification reimbursement, multi-doctor variety, and a real path from chair-side to operations. The DSO model treats DAs as long-term team members, not entry-level placeholders.",
    },
    advantages: [
      {
        title: "Structured EFDA training",
        body: "Most DSOs run formal EFDA training programs with defined timelines, mentorship, and reimbursement for state certification fees. Solo practices typically offer 'we'll show you on the job' — the DSO version is more like an apprenticeship.",
      },
      {
        title: "Multi-doctor variety",
        body: "Assist alongside specialists (endo, perio, pedo) plus general dentists. You see the full range of dental work, which speeds your skill development and clarifies which path you actually want — clinical, EFDA, or operations.",
      },
      {
        title: "Career ladder you can climb",
        body: "DA → EFDA → expanded functions → office manager → ops. Each step has a defined scope and pay bump. Solo practices structurally can't offer this because they have one DA slot and one OM slot. DSOs have many of each.",
      },
      {
        title: "Real benefits at most DSOs",
        body: "Health insurance, paid time off, dental coverage for you and your family, 401(k) — the things solo practices often can't offer DAs at all because the math doesn't work for a single small business. DSOs at scale can.",
      },
      {
        title: "Sponsored certifications",
        body: "EFDA, radiology certification, CPR/BLS, OSHA training — DSOs typically cover these as part of CE allowance or as direct reimbursement. The cost of becoming more credentialed isn't on you.",
      },
    ],
    careerPath: {
      title: "What growth looks like",
      paragraphs: [
        "DAs at DSOs typically start as chairside assistants at one practice. The first big move is EFDA certification (in states that allow it) — gets you to expanded functions and a meaningful pay bump. From there, paths include: lead DA (run sterilization, mentor newer hires, manage clinical supplies), treatment coordinator (move into patient-facing roles with a clinical background), and office manager (the natural promotion track from clinical operations to running a practice).",
        "DAs who want to stay clinical can — and DSOs value experienced career DAs significantly. The difference is the option exists to move upward without leaving the company. Many regional managers, OMs, and clinical operations leaders at DSOs started as DAs and worked their way up.",
      ],
    },
    compensation: {
      title: "What you can expect to earn",
      range: "$18 – $28/hr; EFDA and lead roles higher",
      notes: "Standard DA rates land at $18-$22/hr in most US markets. EFDA certification typically adds $4-$6/hr. Lead DAs and surgical assistants earn the top of the range or move to salaried positions. Production bonuses tied to practice-level KPIs are common at larger DSOs (typically $100-$500/month based on practice performance).",
    },
    jobsFilterHref: "/jobs?category=dental_assistant",
    relatedRoles: [
      { slug: "front-desk", label: "Front Desk + Treatment Coordinators" },
      { slug: "hygienists", label: "Hygienists" },
      { slug: "office-managers", label: "Office Managers" },
    ],
    metaDescription:
      "Dental assistant jobs at multi-location DSOs. Structured EFDA training with reimbursement, multi-doctor variety, real benefits, and a career ladder from chair-side to operations. Browse open DA and EFDA roles at verified DSOs.",
  },
  {
    slug: "front-desk",
    label: "Front Desk + Treatment Coordinators",
    eyebrow: "Patient-facing operations",
    Icon: Users,
    hero: {
      headline: "Front desk that's a real career, not a stop-gap.",
      headlineAccent: "a real career",
      sub: "Real systems training (PMS, insurance verification, financing tools), defined career paths to office manager and beyond, and the kind of operational stability a single-practice front desk rarely gets.",
    },
    advantages: [
      {
        title: "Real systems training",
        body: "Practice management software (Dentrix, Eaglesoft, Open Dental, Curve), insurance verification platforms, treatment-plan presentation tools, financing partner systems — DSOs train you on enterprise versions of these. Solo practices often have one team member who 'just figured it out' and never wrote it down.",
      },
      {
        title: "Defined career path to OM",
        body: "Front desk → senior front desk → treatment coordinator → office manager is a well-traveled track at most DSOs. The path is documented, the timeline is roughly known, and the pay bumps are real. Solo practices have one OM slot — when it's filled, you wait or leave.",
      },
      {
        title: "Backup coverage",
        body: "When you take vacation at a DSO, someone covers your role from a sister practice or a regional float pool. Solo-practice vacations often turn into 'we'll just close the front desk' chaos — or you don't take them.",
      },
      {
        title: "Performance-based bonuses",
        body: "Production bonuses tied to collections, treatment plan acceptance rate, or overall practice KPIs are common at DSOs. The metrics are clear; the math is documented; the bonus actually shows up. Solo-practice 'maybe we'll do bonuses this quarter' is structurally different.",
      },
      {
        title: "Predictable hours",
        body: "DSOs schedule front-desk shifts around defined practice hours. Solo practices often run on 'whoever's open helps the doctor catch up' models that turn 8-hour shifts into 10. The DSO version has more discipline because the operations team lives separate from the chair.",
      },
    ],
    careerPath: {
      title: "What growth looks like",
      paragraphs: [
        "Most front-desk hires start at one practice handling check-in, scheduling, insurance verification, and patient communications. The first big step is treatment coordinator — owning treatment plan presentation, financing setup, and case acceptance. From there, the office manager track opens: assistant OM, OM at one practice, multi-practice OM, and eventually regional manager or DSO ops roles.",
        "The path is real because DSOs need it. Multi-location operations need a steady supply of operators who understand patient-facing work from the desk side and can grow into running a practice. If you're someone who likes patients and loves systems, this is one of the highest-leverage starting points in dental ops.",
      ],
    },
    compensation: {
      title: "What you can expect to earn",
      range: "$17 – $25/hr base; treatment coordinators + bonuses higher",
      notes: "Front-desk base rates vary by region but typically sit at $17-$22/hr. Treatment coordinators (more senior, more case-acceptance responsibility) earn $22-$28/hr or move to salary. Production bonuses tied to practice KPIs add $200-$1,000/month for senior front-desk roles. Office manager is salaried, typically $50K-$80K depending on practice size.",
    },
    jobsFilterHref: "/jobs?category=front_office",
    relatedRoles: [
      { slug: "office-managers", label: "Office Managers" },
      { slug: "dental-assistants", label: "Dental Assistants" },
    ],
    metaDescription:
      "Front desk and treatment coordinator jobs at multi-location DSOs. Real systems training, defined career path to office manager, performance-based bonuses, and predictable hours. Browse open front-desk and TC roles at verified DSOs.",
  },
  {
    slug: "office-managers",
    label: "Office + Regional Managers",
    eyebrow: "OM · RM · Operations Leadership",
    Icon: TrendingUp,
    hero: {
      headline: "Operations leadership with a playbook.",
      headlineAccent: "with a playbook",
      sub: "Real P&L responsibility, KPI scorecards, peer OM networks across the DSO, and operating playbooks instead of solo-practice trial-and-error. If you want to run dental practices at scale, this is where the work actually lives.",
    },
    advantages: [
      {
        title: "Real P&L responsibility",
        body: "OMs at DSOs typically own a P&L for their practice — production, collections, supply costs, labor cost percentage, EBITDA. The DSO finance team gives you the numbers, the playbook tells you how to move them, and your bonus structure rewards you when you do.",
      },
      {
        title: "Operating playbooks",
        body: "DSOs run on documented operating models — patient flow standards, hire/onboard SOPs, monthly close procedures, supply ordering cadences, KPI dashboards. Solo practices figure this out by trial and error every time. At a DSO, you inherit ten years of operational learning.",
      },
      {
        title: "Peer OM network",
        body: "Other OMs at sister practices to compare notes, troubleshoot, share tactics. Most DSOs run monthly or quarterly OM meetings where peer learning happens. Solo-practice OM is the loneliest role in dentistry; multi-practice OM has actual community.",
      },
      {
        title: "Standardized compensation",
        body: "Base + production bonus + EBITDA bonus structures are common across DSOs. The math is on the offer letter. Solo practices often run on 'we'll figure out a bonus' models that don't pay out the way they're described in the interview.",
      },
      {
        title: "Career mobility upward",
        body: "OM → multi-practice OM → regional manager → director of operations → VP-level. The path is real and DSOs need to fill it. Solo practices structurally can't offer this — you can't promote out of an OM role at a single practice except by leaving.",
      },
    ],
    careerPath: {
      title: "What growth looks like",
      paragraphs: [
        "Office managers typically start running one practice's daily operations — staffing, scheduling, inventory, KPIs, patient experience, and the team. From there, paths include: multi-practice OM (oversee 2-3 sister practices), area manager (4-8 practices), regional manager (8-25 practices), director of operations or VP-level corporate roles. Some DSOs split clinical and non-clinical career tracks at this level; others integrate them.",
        "Regional managers are typically responsible for the financial performance of their practice cluster, the hiring and development of their OMs, and the implementation of DSO-wide initiatives at the local level. The work shifts from running one practice to coaching the people who run multiple practices. Most senior DSO operators came up through this path — it's the canonical operations career in multi-practice dentistry.",
      ],
    },
    compensation: {
      title: "What you can expect to earn",
      range: "OM $50K – $95K base; RM $80K – $150K+ with bonus",
      notes: "Office manager base salary varies by practice size and region — single-practice OM at a smaller DSO might be $50-$65K; multi-practice OM at a larger DSO can be $80-$100K. Bonus structures based on practice KPIs typically add 10-25% to base. Regional managers earn $80-$150K base with similar or larger bonus components, often including DSO-level performance metrics.",
    },
    jobsFilterHref: "/jobs?category=office_manager",
    relatedRoles: [
      { slug: "front-desk", label: "Front Desk + Treatment Coordinators" },
      { slug: "dentists", label: "Dentists" },
    ],
    metaDescription:
      "Office manager and regional manager jobs at multi-location DSOs. Real P&L responsibility, operating playbooks, peer OM networks, standardized comp with KPI bonuses, and a clear path to regional and VP-level operations roles. Browse open OM and RM roles.",
  },
];

/** Quick-lookup map for the dynamic route. */
export const ROLE_BY_SLUG: Record<string, RoleConfig> = Object.fromEntries(
  ROLE_CONFIGS.map((r) => [r.slug, r])
);

/** All slugs — used by generateStaticParams. */
export const ROLE_SLUGS: string[] = ROLE_CONFIGS.map((r) => r.slug);
