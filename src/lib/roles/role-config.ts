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
  Smile,
  Sparkles,
  Heart,
  GraduationCap,
  Users,
  TrendingUp,
  Briefcase,
  Activity,
  ClipboardList,
  FlaskConical,
  ShieldCheck,
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
  /** Compensation context — describes the STRUCTURE, not specific dollar
   * amounts. We're a job board, not a salary survey. Specific comp shows
   * up on individual job listings where the DSO chooses to share it. */
  compensation: {
    title: string;
    /** One-line summary of how comp is typically structured for this role. */
    structure: string;
    /** Longer explanation of the comp model (base, bonus, geographic
     * variance, etc.) — still no specific dollar ranges. */
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
    Icon: Smile,
    hero: {
      headline: "Practice dentistry without owning the building.",
      headlineAccent: "without owning the building.",
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
      {
        title: "No business overhead distraction",
        body: "You practice dentistry; the DSO handles HR, billing, insurance contracting, supplier relationships, IT, and compliance. Solo-practice owners are running a small business in addition to seeing patients. At a DSO, you get to focus on clinical work without the administrative tax.",
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
      title: "How comp works at DSOs",
      structure: "Guaranteed base + production percentage",
      notes: "Most DSO dentist comp is structured as a monthly base salary plus a percentage of production or collections above that base. The percentage varies by DSO and metro — coastal urban markets typically pay more aggressively than rural / Midwest. Some DSOs add quarterly or annual bonuses tied to practice-level KPIs (patient retention, case acceptance, hygiene-driven revenue). A handful of newer DSOs also offer equity grants or partner-track ownership programs — worth asking about during interviews if that path matters to you. Specific comp shows up on each job listing when the DSO chooses to share it.",
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
      headlineAccent: "built-in referrals.",
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
        body: "Most DSO specialist comp is structured as a percentage of collections, sometimes with a base guarantee. Your specialty premium gets recognized — comp scales with your case volume, and DSOs with strong referral pipelines from sister GP practices give specialty production a meaningful platform.",
      },
      {
        title: "Peer specialist learning",
        body: "Larger DSOs employ multiple specialists in your discipline. Peer review, case discussions, internal CE — the kind of community you'd otherwise build through specialty associations and conferences alone.",
      },
      {
        title: "Room to sub-specialize",
        body: "At a DSO with the case volume to support it, you can focus your practice on a sub-niche — implant-heavy oral surgery, full-arch restorative, clear-aligner ortho, sleep dentistry. Solo practices typically can't generate the volume to specialize that narrowly. Multi-location DSOs can.",
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
      title: "How comp works at DSOs",
      structure: "Production-based, often with a base guarantee",
      notes: "Most DSO specialist comp is structured as a percentage of collections or adjusted production, often without a meaningful base — your earnings reflect your case volume directly. Some DSOs offer a guaranteed monthly draw against future production, especially during your first 90 days while the referral pipeline ramps. Travel-between-locations roles sometimes include per-diem or mileage on top. Equity / partner-track is available at a handful of DSOs for high-producing specialists. The economics of specialty comp at a DSO depend heavily on the referral pipeline from sister GP practices — worth asking about the DSO's GP-to-specialist referral conversion rate during interviews.",
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
      headlineAccent: "respects your time.",
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
      {
        title: "Modern instruments + ergonomic equipment",
        body: "DSOs invest in current-generation cavitrons, ergonomic operatory chairs, magnification loupes, and laser equipment at scale. Solo practices often run hygienists on whatever was bought 10 years ago. Better tools mean less wear on your hands, neck, and back over a career.",
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
      title: "How comp works at DSOs",
      structure: "Hourly base, often with production bonuses",
      notes: "Most DSO hygiene roles are paid hourly. The hourly rate scales with metro market (coastal urban higher, Midwest and South lower) and with certification — local-anesthesia and laser certifications typically command a higher rate. Some DSOs layer in production bonuses tied to hygiene-driven service mix (perio probing, sealants, fluoride applications, oral cancer screenings). Lead hygienist and hygiene coordinator roles transition to salary. The benefits package — PTO, CE allowance, paid certifications — often adds substantially to total comp beyond what shows on the hourly rate.",
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
    eyebrow: "DA · EFDA",
    Icon: GraduationCap,
    hero: {
      headline: "Dental assisting with a career ladder.",
      headlineAccent: "with a career ladder.",
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
      {
        title: "Cross-training across specialties",
        body: "When the DSO has specialists at sister practices, you can rotate to assist on oral surgery, ortho, or pediatric procedures alongside your GP work. That breadth is hard to build at a solo practice that only sees one type of case all day.",
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
      title: "How comp works at DSOs",
      structure: "Hourly base, with EFDA premium + production bonuses where offered",
      notes: "Standard DA roles are paid hourly. EFDA certification (in states that allow it) typically commands a meaningful per-hour bump. Surgical assistants and lead DAs often earn at the top of their market range or move to salaried positions. Production bonuses tied to practice-level KPIs are common at larger DSOs — typically a fixed monthly amount when the practice hits its targets. CE allowances, certification reimbursement, and benefits add to total comp beyond the hourly rate. Geographic variance is significant — coastal urban markets pay more than rural / Midwest / South.",
    },
    jobsFilterHref: "/jobs?category=dental_assistant",
    relatedRoles: [
      { slug: "front-desk", label: "Front Desk + Treatment Coordinators" },
      { slug: "hygienists", label: "Hygienists" },
      { slug: "office-managers", label: "Office Managers" },
    ],
    metaDescription:
      "Dental assistant jobs at multi-location DSOs. Structured EFDA training with reimbursement, multi-doctor variety, real benefits, and a career ladder from chair-side to operations. Browse open DA and EFDA roles on DSO Hire.",
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
      {
        title: "Insurance verification support",
        body: "Many DSOs run a centralized insurance verification team that handles benefit checks, eligibility, and pre-auths in advance — instead of you spending 45 minutes on hold with Aetna during a busy morning. You handle the patient-facing work; the back office handles the carrier-facing work.",
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
      title: "How comp works at DSOs",
      structure: "Hourly base + treatment-acceptance and collection bonuses",
      notes: "Front-desk roles are typically hourly. Treatment coordinator positions, with more senior responsibility for case acceptance and financing setup, often move to salary. Performance bonuses tied to practice KPIs (collection rate, treatment-plan acceptance, daily production targets) are common at larger DSOs — typically a fixed amount when the practice hits a metric. Office manager promotion track transitions fully to salary. The structured-bonus model is one of the things DSOs typically do meaningfully better than solo practices for this role: you can see the math on the offer letter.",
    },
    jobsFilterHref: "/jobs?category=front_office",
    relatedRoles: [
      { slug: "office-managers", label: "Office Managers" },
      { slug: "dental-assistants", label: "Dental Assistants" },
    ],
    metaDescription:
      "Front desk and treatment coordinator jobs at multi-location DSOs. Real systems training, defined career path to office manager, performance-based bonuses, and predictable hours. Browse open front-desk and TC roles on DSO Hire.",
  },
  {
    slug: "office-managers",
    label: "Office Managers",
    eyebrow: "OM · Operations Leadership",
    Icon: TrendingUp,
    hero: {
      headline: "Operations leadership with a playbook.",
      headlineAccent: "with a playbook.",
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
      {
        title: "DSO HQ resources at your back",
        body: "HR escalation paths, finance and accounting support, legal and compliance team, marketing and recruiting infrastructure — DSO operations roles get backed by a corporate function. Solo-practice OMs handle all of those personally, often without specialized training. At a DSO, you escalate; at a solo practice, you absorb.",
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
      title: "How comp works at DSOs",
      structure: "Salary + KPI bonus structure (often with EBITDA component)",
      notes: "OM and RM comp is salaried, with bonus structures tied to specific practice or region KPIs — production, collections, labor-cost percentage, patient retention, EBITDA. Bonus components typically add a meaningful percentage on top of base for OMs, and a larger percentage for RMs at larger DSOs. Multi-practice OM and Regional Manager roles often include quarterly bonuses based on DSO-wide initiatives. The standardized math (vs. solo-practice 'we'll figure out a bonus') is a major appeal of DSO operations roles — the formula's on the offer letter and the bonus actually shows up.",
    },
    jobsFilterHref: "/jobs?category=office_manager",
    relatedRoles: [
      { slug: "front-desk", label: "Front Desk + Treatment Coordinators" },
      { slug: "dentists", label: "Dentists" },
    ],
    metaDescription:
      "Office manager and regional manager jobs at multi-location DSOs. Real P&L responsibility, operating playbooks, peer OM networks, standardized comp with KPI bonuses, and a clear path to regional and VP-level operations roles. Browse open OM and RM roles.",
  },
  {
    slug: "corporate",
    label: "Corporate & Administrative Roles",
    eyebrow: "Non-clinical · Support-Center Careers",
    Icon: Briefcase,
    hero: {
      headline: "Build a career in dental. Without the clinical license.",
      headlineAccent: "Without the clinical license.",
      sub: "Dental groups and DSOs run like real companies: finance, marketing, operations, people, IT, revenue cycle, and business development all live at the support-center level. If you want mission-driven work with healthcare-company scale, the corporate side of dental is hiring.",
    },
    advantages: [
      {
        title: "A real corporate function",
        body: "Multi-location dental groups centralize finance & accounting, FP&A, marketing & growth, HR / people, recruiting, IT & data, compliance, revenue cycle, and business development at a support center. The roles look like any growth-stage healthcare company — not 'help out at the front desk.'",
      },
      {
        title: "Healthcare scale without hospital bureaucracy",
        body: "Mid-market groups are big enough to have specialized roles and a real budget, but small enough that you can see your impact and move fast. You're not employee #40,000 in a hospital system — your work visibly moves the business.",
      },
      {
        title: "Business development is a growth engine",
        body: "Dental is consolidating from a fragmented market, so corporate development / M&A teams that source, evaluate, and integrate practice acquisitions are some of the highest-leverage roles in the industry. If you like deals and integration work, dental is one of the most active spaces in healthcare right now.",
      },
      {
        title: "Recession-resilient industry",
        body: "Dental demand is durable across economic cycles, and groups keep growing support-function headcount as they add practices. Corporate dental roles offer stability that a lot of higher-flying sectors can't promise.",
      },
      {
        title: "Cross-functional visibility",
        body: "At a multi-practice operator you sit close to operations, finance, clinical leadership, and the field. Analysts and managers get exposure that would take years to earn at a larger, more siloed company — and that breadth accelerates the path to director and VP roles.",
      },
      {
        title: "Hybrid and remote are common",
        body: "Because these are headquarters functions rather than chairside roles, many corporate dental positions are hybrid or fully remote — especially in finance, marketing, RCM, data, and recruiting. You get the mission of healthcare without being tied to one operatory.",
      },
    ],
    careerPath: {
      title: "What growth looks like",
      paragraphs: [
        "Corporate roles span the functions you'd find at any growth-stage company — finance & accounting, FP&A, revenue cycle management, marketing & growth, people / HR, recruiting, IT & data, compliance, and business development. Most people enter at the coordinator / analyst / manager level inside one function and grow within it: analyst → senior analyst → manager → director → VP.",
        "The distinctive dental path is business / corporate development — sourcing, underwriting, and integrating practice acquisitions as groups consolidate the market. Operations leadership (regional and above) and revenue cycle leadership are the other two areas where dental-specific experience compounds quickly into senior roles. Many of the people running large groups today came up through ops, finance, or BD on the corporate side.",
      ],
    },
    compensation: {
      title: "How comp works for corporate roles",
      structure: "Salary + performance bonus (function-dependent)",
      notes: "Corporate dental comp mirrors the broader market for each function — finance, marketing, operations, people, IT — with a base salary plus a performance or company-target bonus. Business development / corporate development roles often layer in deal- or pipeline-linked incentives. Senior operations and finance roles may include an EBITDA-linked bonus, and a handful of groups offer equity or carry at the leadership level. Geographic and seniority variance is significant; specific comp shows up on each listing when the employer chooses to share it.",
    },
    jobsFilterHref: "/jobs?surface=corporate",
    relatedRoles: [
      { slug: "office-managers", label: "Office Managers" },
      { slug: "dentists", label: "Dentists" },
    ],
    metaDescription:
      "Corporate and administrative jobs at dental groups and DSOs — finance, marketing, operations, people/HR, IT, revenue cycle, and business development. Build a career in dental without a clinical license. Browse open corporate roles on DSO Hire.",
  },
  {
    slug: "dental-therapists",
    label: "Dental Therapists",
    eyebrow: "Dental Therapist · Expanded-Scope Clinical",
    Icon: Activity,
    hero: {
      headline: "A new role, with room to grow into.",
      headlineAccent: "room to grow into.",
      sub: "Dental therapy is one of the newest expanded-scope clinical roles in the US — and multi-location DSOs are among the first to build real structure around it: supervision that's actually available, a defined scope, and a path that isn't improvised alone.",
    },
    advantages: [
      {
        title: "Supervision that's actually present",
        body: "Therapists practice under dentist supervision. At a multi-doc DSO there's a supervising dentist on site or a sister practice a call away — not one solo owner booked solid with no bandwidth to back you up.",
      },
      {
        title: "A defined, respected scope",
        body: "DSOs that hire therapists write clear protocols for what you do — restorations, extractions, preventive care within your state's scope — so you practice at the top of your license instead of bouncing between assisting and therapy.",
      },
      {
        title: "Access-driven, mission work",
        body: "Therapists exist to widen care access. DSOs deploy them across practices and community programs where the need is highest — mission-driven work with a real employer and benefits behind it.",
      },
      {
        title: "Benefits + paid licensure pathway",
        body: "401(k), health, PTO, CE allowance, and reimbursement toward the certification/licensure path — the kind of support a single practice rarely offers for a brand-new role.",
      },
      {
        title: "First-mover career path",
        body: "Lead therapist, therapy-program coordinator across practices, clinical-education roles. Because the role is new, the people who join now help define the ladder rather than inherit it.",
      },
    ],
    careerPath: {
      title: "What growth looks like",
      paragraphs: [
        "Most dental therapists start chairside in their state's defined scope under a supervising dentist. From there the path is still being written — which is the opportunity. Early therapists move into lead-therapist roles (anchoring protocols, mentoring new hires), therapy-program coordination across a DSO's practices, and clinical-education roles helping the group's dentists work effectively alongside therapists.",
        "Scope of practice varies a lot by state — what you can do in Minnesota differs from Arizona or Colorado. DSOs operating in therapy-friendly states are the ones building the operational playbooks, so you join with structure instead of inventing it on your own.",
      ],
    },
    compensation: {
      title: "How comp works at DSOs",
      structure: "Salary or hourly base, scaling with scope + market",
      notes:
        "Dental therapist comp is still maturing as the role spreads state by state. Most DSO roles are salaried or hourly, with the rate reflecting your state's permitted scope (broader scope, higher value), metro market, and experience. Because the role expands access, some positions tie into community-health or grant-funded programs. Licensure support and the standard DSO benefits package add to total comp beyond the rate. Specific pay shows on each listing when the employer chooses to share it.",
    },
    jobsFilterHref: "/jobs?category=dental_therapist",
    relatedRoles: [
      { slug: "hygienists", label: "Hygienists" },
      { slug: "dental-assistants", label: "Dental Assistants" },
      { slug: "dentists", label: "Dentists" },
    ],
    metaDescription:
      "Dental therapist jobs at multi-location DSOs. Real dentist supervision, a defined expanded-scope role, paid licensure support, and a first-mover career path in one of dentistry's newest clinical roles. Browse open dental therapy roles on DSO Hire.",
  },
  {
    slug: "practice-administrators",
    label: "Practice Administrators",
    eyebrow: "Practice Administrator · Non-Clinical Leadership",
    Icon: ClipboardList,
    hero: {
      headline: "Run the practice. Skip the chair.",
      headlineAccent: "Skip the chair.",
      sub: "Practice administrators keep multi-provider offices running — people, scheduling, compliance, vendors, patient experience. At a DSO you get documented systems, a support center behind you, and a path that scales past one building.",
    },
    advantages: [
      {
        title: "Systems instead of sticky notes",
        body: "DSOs run on documented operating models — onboarding SOPs, compliance calendars, vendor management, KPI dashboards. You inherit years of operational learning instead of reinventing it for one office.",
      },
      {
        title: "A support center at your back",
        body: "HR escalation, finance, legal and compliance, IT, and recruiting are backed by a corporate function. A single-practice administrator absorbs all of that personally; at a DSO you escalate.",
      },
      {
        title: "Clear KPIs + bonus math",
        body: "Practice-level scorecards — production, collections, labor-cost percentage, patient retention — with bonus structures written on the offer letter, not a vague 'we'll figure out a bonus.'",
      },
      {
        title: "A peer network",
        body: "Administrators at sister practices to compare notes, troubleshoot, and share tactics. Running a single practice's admin is isolating; a multi-practice group gives you actual community.",
      },
      {
        title: "A path past one practice",
        body: "Administrator → multi-practice administrator → area / regional operations. The ladder exists because multi-location groups need it — you can grow without leaving.",
      },
    ],
    careerPath: {
      title: "What growth looks like",
      paragraphs: [
        "Practice administrators typically start running one office's non-clinical operations — staffing, scheduling, compliance, vendors, patient experience, and the team. From there, paths include multi-practice administrator (2–3 offices), area manager, and regional operations roles, plus support-center positions in people, RCM, or compliance for administrators who want to specialize.",
        "The work shifts from running one practice well to building the systems and people that run several. Many regional operators and support-center leaders at DSOs came up through the administrator track — it's a non-clinical path into the heart of how multi-practice dentistry actually runs.",
      ],
    },
    compensation: {
      title: "How comp works at DSOs",
      structure: "Salary + KPI bonus structure",
      notes:
        "Practice administrator comp is salaried, with bonus components tied to practice KPIs — collections, labor-cost percentage, patient retention, sometimes EBITDA. The standardized math is a real appeal versus single-practice administration: the formula is on the offer letter and the bonus actually shows up. Multi-practice and regional roles step up base and bonus and may add quarterly incentives tied to group-wide initiatives. Geographic and seniority variance is significant; specifics show on each listing when shared.",
    },
    jobsFilterHref: "/jobs?category=practice_administrator",
    relatedRoles: [
      { slug: "office-managers", label: "Office Managers" },
      { slug: "front-desk", label: "Front Desk + Treatment Coordinators" },
      { slug: "corporate", label: "Corporate & Administrative" },
    ],
    metaDescription:
      "Practice administrator jobs at multi-location DSOs. Documented operating systems, a corporate support center behind you, clear KPI bonuses, and a path past one practice into regional operations. Browse open practice administrator roles on DSO Hire.",
  },
  {
    slug: "dental-lab-technicians",
    label: "Dental Lab Technicians",
    eyebrow: "Dental Lab Technician · CDT",
    Icon: FlaskConical,
    hero: {
      headline: "Lab work with modern tools and steady volume.",
      headlineAccent: "modern tools and steady volume.",
      sub: "Multi-location groups generate consistent case volume and invest in digital lab workflows — milling, 3D printing, design software — so you work with current technology instead of waiting years for an upgrade.",
    },
    advantages: [
      {
        title: "A digital lab at scale",
        body: "CAD/CAM mills, 3D printers, and intraoral-scan workflows (exocad, 3Shape, Medit) bought at group scale. You work with current technology from day one instead of whatever was affordable a decade ago.",
      },
      {
        title: "Steady, varied case volume",
        body: "Multiple practices feeding one lab means consistent work across crowns, bridges, aligners, night guards, and surgical guides — not the feast-or-famine swings a small outsourced lab rides.",
      },
      {
        title: "Benefits + CDT support",
        body: "Health, PTO, and 401(k), plus reimbursement toward CDT certification and continuing education — support a small independent lab rarely offers a technician.",
      },
      {
        title: "Direct line to the clinicians",
        body: "An in-house lab sits close to the dentists you fabricate for — faster feedback, fewer remakes, and better outcomes than an arms-length lab you only reach by shipping label.",
      },
      {
        title: "A path to lead + digital roles",
        body: "Lead technician, digital-workflow specialist, and lab manager across the group's practices — real progression a one-bench operation can't structurally offer.",
      },
    ],
    careerPath: {
      title: "What growth looks like",
      paragraphs: [
        "Most lab technicians at a group start at the bench in their specialty — fixed, removable, or digital design. The biggest lever now is digital: technicians who own the scan-to-design-to-mill workflow become hard to replace. From there, paths include lead technician, digital-workflow specialist (running the group's CAD/CAM and printing pipeline), and lab manager overseeing fabrication for multiple practices.",
        "As more of the lab goes digital, the role increasingly blends craft with software. Groups investing in in-house digital labs need technicians who can bridge both — which is exactly where the comp and the seniority are heading.",
      ],
    },
    compensation: {
      title: "How comp works at DSOs",
      structure: "Hourly or salary, scaling with digital skills + CDT",
      notes:
        "Lab technician comp is typically hourly, moving to salary for lead and manager roles. Digital-workflow skills (CAD design, mill/printer operation, scan processing) and CDT certification command the higher end of the range. Production-linked incentives exist at some larger in-house labs. Benefits, CE, and certification support add to total comp beyond the hourly rate. Market variance is significant — specifics show on each listing when the employer shares them.",
    },
    jobsFilterHref: "/jobs?category=lab_tech",
    relatedRoles: [
      { slug: "dental-assistants", label: "Dental Assistants" },
      { slug: "specialists", label: "Specialists" },
      { slug: "dentists", label: "Dentists" },
    ],
    metaDescription:
      "Dental lab technician jobs at multi-location DSOs. Digital lab workflows (CAD/CAM, 3D printing) at scale, steady case volume, CDT certification support, and a path to lead and digital-specialist roles. Browse open dental lab tech roles on DSO Hire.",
  },
  {
    slug: "sterilization-technicians",
    label: "Sterilization Technicians",
    eyebrow: "Sterilization Technician · Instrument Processing",
    Icon: ShieldCheck,
    hero: {
      headline: "The role that keeps the practice safe — and your foot in the door.",
      headlineAccent: "your foot in the door.",
      sub: "Sterilization is critical infection-control work, and at a DSO it comes with real training, OSHA/HIPAA certification support, and a documented path into assisting and clinical operations.",
    },
    advantages: [
      {
        title: "Real infection-control training",
        body: "DSOs run formal protocols — instrument processing, autoclave validation, OSHA and HIPAA standards — so you learn the standard properly instead of 'watch once and copy.'",
      },
      {
        title: "Certifications covered",
        body: "OSHA, HIPAA, CPR/BLS, and infection-control credentials are typically DSO-funded. Becoming more credentialed isn't on your dime.",
      },
      {
        title: "A genuine foot in the door",
        body: "Many dental assistants, lead DAs, and clinical-ops leaders started in sterilization. A DSO has the role count to promote into; a single practice has one of everything and nowhere to move.",
      },
      {
        title: "Benefits from day one",
        body: "Health, PTO, and 401(k) — often unavailable to an entry-level role at a single small practice where the math doesn't work, but standard at a group with scale.",
      },
      {
        title: "A defined role, not the catch-all",
        body: "At a DSO sterilization is staffed as its own function with clear standards and accountability, not the thing whoever happens to be free does between patients.",
      },
    ],
    careerPath: {
      title: "What growth looks like",
      paragraphs: [
        "Sterilization technicians start owning instrument processing, autoclave operation, and infection-control compliance for a practice. It's one of the clearest on-ramps in dentistry: the common next step is dental assistant (often with the DSO funding the training), then EFDA in states that allow it, and on into lead clinical and operations roles.",
        "If you want to stay in instrument processing, larger groups value experienced sterilization leads who set standards across practices. The difference from a single office is that the option to move up exists — you're not stuck because there's only one of each role.",
      ],
    },
    compensation: {
      title: "How comp works at DSOs",
      structure: "Hourly base + certification-driven raises",
      notes:
        "Sterilization roles are paid hourly, with raises tied to certifications (OSHA, HIPAA, infection control) and to stepping up into lead or dental-assistant work. The benefits package — health, PTO, paid certifications — often adds meaningfully on top of the hourly rate, and the assisting path opens a clear route to higher pay. Geographic variance is significant; specifics show on each listing when shared.",
    },
    jobsFilterHref: "/jobs?category=sterilization_tech",
    relatedRoles: [
      { slug: "dental-assistants", label: "Dental Assistants" },
      { slug: "hygienists", label: "Hygienists" },
      { slug: "front-desk", label: "Front Desk + Treatment Coordinators" },
    ],
    metaDescription:
      "Sterilization technician jobs at multi-location DSOs. Real infection-control training, paid OSHA/HIPAA certifications, benefits from day one, and a documented path into dental assisting and clinical operations. Browse open sterilization tech roles on DSO Hire.",
  },
];

/** Quick-lookup map for the dynamic route. */
export const ROLE_BY_SLUG: Record<string, RoleConfig> = Object.fromEntries(
  ROLE_CONFIGS.map((r) => [r.slug, r])
);

/** All slugs — used by generateStaticParams. */
export const ROLE_SLUGS: string[] = ROLE_CONFIGS.map((r) => r.slug);
