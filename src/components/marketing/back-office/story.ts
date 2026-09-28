/**
 * Back-office showcase v2 — "One hire, start to finish" (2026-09-28).
 *
 * Replaces the five disconnected feature slides (v1, 2026-07-08) with ONE
 * continuous story: a single candidate, Dr. Sarah Chen, followed through
 * the real employer app from an empty job post to a signed hire. Every
 * scene lives inside the same app shell, so the visitor watches one
 * product, not five screenshots.
 *
 * Truthfulness rule (unchanged house standard): the footnote says "the
 * live product," so every depicted capability maps to something shipped,
 * and product labels are IMPORTED from their source-of-truth modules
 * rather than retyped:
 *   • Post      comp model (lib/comp/model) + Draft with AI (jd-generator)
 *               + multi-location posting
 *   • Source    anonymous-discoverable talent pool, double-blind outreach,
 *               real prospect-stage labels (lib/sourcing/pipeline)
 *   • Match     PracticeFit: one engine, two sides of declared data, real
 *               v8 dimension weights (lib/practice-fit/compute.ts)
 *   • Interview kanban stage move → the LIVE stage_changed → email_candidate
 *               automation (lib/automations/types.ts Phase 1)
 *   • Hire      offer comp guardrail + approval routing (lib/offers,
 *               Scale/Enterprise) → Hired stage
 * All people, practices, and numbers are sample data, and the section
 * footnote says so.
 */

import { KIND_DEFAULT_LABELS } from "@/lib/applications/stages";
import {
  COMP_MODEL_OPTIONS,
  DURATION_LABELS,
  LAB_FEE_LABELS,
  PERCENT_BASIS_LABELS,
} from "@/lib/comp/model";
import { PROSPECT_STAGE_LABELS } from "@/lib/sourcing/pipeline";

export const HERO = {
  name: "Dr. Sarah Chen",
  initials: "SC",
  masked: "Candidate DDS-2291",
  role: "Associate Dentist",
  city: "Boise",
  years: 7,
  fit: 94,
};

/* ── Scene 1 · Post ── */

const GUARANTEE_PLUS_PERCENT_LABEL =
  COMP_MODEL_OPTIONS.find((o) => o.value === "guarantee_plus_percent")?.label ??
  "Daily guarantee + %";

export const COMP_ROWS: ReadonlyArray<{ label: string; value: string }> = [
  { label: "Model", value: GUARANTEE_PLUS_PERCENT_LABEL },
  { label: "Guarantee", value: `$750/day · ${DURATION_LABELS.intro_90d}` },
  { label: "Production", value: `32% of ${PERCENT_BASIS_LABELS.adjusted_production}` },
  { label: "Lab fees", value: LAB_FEE_LABELS.split_50 },
];

/** Estimated annual range the comp engine derives ($k). */
export const COMP_ESTIMATE = { min: 185, max: 232 };

export const POST_LOCATIONS = ["Boise", "Meridian", "Eagle"];

/** Button label matches jd-generator-panel.tsx exactly. */
export const DRAFT_BUTTON_LABEL = "Draft with AI";

/** JD as word-streamable segments; `b` marks the comp facts the model
 *  pulled from the package above (they get the grounded highlight). */
export type Seg = { t: string; b?: boolean };
export const JD_PARAGRAPHS: ReadonlyArray<ReadonlyArray<Seg>> = [
  [
    { t: "Join a growing, clinician-led practice as an Associate Dentist. We offer a " },
    { t: "$750/day guarantee for your first 90 days", b: true },
    { t: ", then " },
    { t: "32% of adjusted production", b: true },
    { t: ", with " },
    { t: "lab fees split 50/50", b: true },
    { t: "." },
  ],
  [
    {
      t: "Expect a full schedule of general and restorative cases, modern equipment, and a hygiene team that runs on time.",
    },
  ],
  [
    { t: "What we're looking for: " },
    { t: "DDS/DMD, active Idaho license, 2+ years chairside.", b: false },
  ],
];

/* ── Scene 2 · Source ── */

export interface PoolTile {
  id: string;
  masked: string;
  role: string;
  meta: string;
  fit: number;
}

export const POOL: ReadonlyArray<PoolTile> = [
  { id: "hero", masked: HERO.masked, role: "Associate Dentist", meta: "Boise · 7 yrs", fit: 94 },
  { id: "p2", masked: "Candidate DDS-1180", role: "Associate Dentist", meta: "Nampa · 4 yrs", fit: 89 },
  { id: "p3", masked: "Candidate DDS-3307", role: "Associate Dentist", meta: "Eagle · 11 yrs", fit: 86 },
  { id: "p4", masked: "Candidate DMD-0452", role: "Associate Dentist", meta: "Meridian · 2 yrs", fit: 81 },
  { id: "p5", masked: "Candidate DDS-2716", role: "Associate Dentist", meta: "Caldwell · 6 yrs", fit: 78 },
  { id: "p6", masked: "Candidate DMD-1893", role: "Associate Dentist", meta: "Boise · 3 yrs", fit: 74 },
];

export const POOL_FILTERS = ["Associate Dentist", "Within 30 mi of Boise", "Open to opportunities"];

export const OUTREACH_MESSAGE =
  "A growing Boise practice is hiring an associate that matches your PracticeFit. Interested in an intro? Your name stays hidden until you say yes.";

/** Real prospect-stage labels, in order. */
export const SOURCING_STEPS: ReadonlyArray<string> = [
  PROSPECT_STAGE_LABELS.sourced,
  PROSPECT_STAGE_LABELS.contacted,
  PROSPECT_STAGE_LABELS.responded,
  PROSPECT_STAGE_LABELS.converted,
];

export const CONSENT_BADGE = "Contact shared by candidate";

/* ── Scene 3 · Match ── */

export const FIT_PAIRS: ReadonlyArray<{ dim: string; candidate: string; practice: string }> = [
  { dim: "Work pace", candidate: "Steady & thorough", practice: "Steady" },
  { dim: "Mentorship", candidate: "Wants a mentor", practice: "On-site mentor" },
  { dim: "PMS fluency", candidate: "Dentrix · Eaglesoft", practice: "Dentrix" },
  { dim: "Matters most", candidate: "Compensation", practice: "$750/day + 32%" },
];

/** Real v8 dimension weights (compute.ts WEIGHTS, restated). */
export const FIT_DIMS: ReadonlyArray<{ label: string; weight: number }> = [
  { label: "Location", weight: 14 },
  { label: "Role fit", weight: 12 },
  { label: "Compensation", weight: 10 },
  { label: "PMS fluency", weight: 9 },
];
export const FIT_DIMS_MORE = "+ 16 more";

export const FIT_WHY =
  "Strong on pace, mentorship, and PMS. Her top priority is comp, and the guarantee answers it.";

export const FIT_HONESTY = "A dimension only counts when both sides answered. Nothing is guessed.";

/* ── Scene 4 · Interview ── */

export interface KbCard {
  id: string;
  name: string;
  role: string;
  fit: number;
  masked?: boolean;
  days: number;
}

export const KANBAN: ReadonlyArray<{
  key: "open" | "screen" | "interview" | "offer";
  label: string;
  count: number;
  cards: KbCard[];
}> = [
  {
    key: "open",
    label: KIND_DEFAULT_LABELS.open,
    count: 14,
    cards: [
      { id: "k1", name: "Maria G.", role: "RDA · Meridian", fit: 88, days: 1 },
      { id: "k2", name: "Candidate RDH-4821", role: "Hygienist · Boise", fit: 91, masked: true, days: 2 },
      { id: "k3", name: "Tom W.", role: "Front desk · Eagle", fit: 72, days: 3 },
    ],
  },
  {
    key: "screen",
    label: KIND_DEFAULT_LABELS.screen,
    count: 6,
    cards: [
      { id: "hero", name: HERO.name, role: "Associate · Boise", fit: HERO.fit, days: 1 },
      { id: "k4", name: "Devon P.", role: "Office manager · Nampa", fit: 83, days: 4 },
    ],
  },
  {
    key: "interview",
    label: KIND_DEFAULT_LABELS.interview,
    count: 3,
    cards: [
      { id: "k5", name: "Aisha R.", role: "Hygienist · Meridian", fit: 87, days: 5 },
      { id: "k6", name: "Luis M.", role: "EFDA · Boise", fit: 80, days: 8 },
    ],
  },
  {
    key: "offer",
    label: KIND_DEFAULT_LABELS.offer,
    count: 1,
    cards: [{ id: "k7", name: "James R.", role: "Associate · Eagle", fit: 90, days: 2 }],
  },
];

/** Maps to the LIVE stage_changed → email_candidate automation. */
export const AUTOMATION = {
  kicker: "Automation fired",
  title: `Stage → ${KIND_DEFAULT_LABELS.interview}: interview-prep email and booking link sent`,
  sub: "To Dr. Chen · from the practice · logged to her timeline",
};

export const BOOKED = "Booked · Thu, Oct 9 · 10:00 AM";

/* ── Scene 5 · Hire ── */

export const OFFER_ROWS: ReadonlyArray<{ label: string; value: string }> = [
  { label: "Position", value: "Associate Dentist · Boise" },
  { label: "Compensation", value: "$750/day for 90 days, then 32%" },
  { label: "Estimated annual", value: "$185k – $232k" },
  { label: "Start date", value: "Mon, Nov 3" },
];

export const OFFER_GUARDRAIL =
  "32% is above your Associate · Boise band (28–30%), so this offer routes for approval.";

export const APPROVERS = [
  { role: "Hiring manager", who: "You", initials: "YO" },
  { role: "Regional director", who: "M. Alvarez", initials: "MA" },
];

export const HIRE_STATS = [
  { k: "Posted to hired", v: "23 days" },
  { k: "Placement fee", v: "$0" },
  // 20% of the $185k low end of her estimated annual (agency norm 15–25%).
  { k: "Typical agency fee", v: "$37,000" },
];

export const HIRED_LABEL = KIND_DEFAULT_LABELS.hired;
export const OFFER_LABEL = KIND_DEFAULT_LABELS.offer;

/* ── Scene metadata (order = the journey) ── */

export type NavId =
  | "dashboard"
  | "jobs"
  | "pipeline"
  | "applications"
  | "talent"
  | "inbox"
  | "analytics"
  | "approvals"
  | "automations";

export interface SceneMeta {
  /** Journey rail label (one word). */
  step: string;
  /** Caption headline. */
  title: string;
  /** Caption body. */
  caption: string;
  /** Faux URL in the chrome. */
  url: string;
  /** Breadcrumb trail in the app header. */
  crumbs: string[];
  /** Sidebar item this scene lives under. */
  nav: NavId;
  durationMs: number;
}

export const SCENES: ReadonlyArray<SceneMeta> = [
  {
    step: "Post",
    title: "Post once, grounded in real comp",
    caption:
      "Build the package dentists actually get paid on, let AI draft the listing from it, and publish to every location at once.",
    url: "app.dsohire.com/employer/jobs/new",
    crumbs: ["Jobs", "New job", "Associate Dentist"],
    nav: "jobs",
    durationMs: 9800,
  },
  {
    step: "Source",
    title: "Find people who want to be found",
    caption:
      "Search candidates who opted in. Outreach is double-blind: she stays anonymous until she says yes.",
    url: "app.dsohire.com/employer/talent-pool",
    crumbs: ["Talent Pool", "Associate Dentist · Boise"],
    nav: "talent",
    durationMs: 9400,
  },
  {
    step: "Match",
    title: "One score, two sides of data",
    caption:
      "Her assessment meets your practice profile. PracticeFit only counts what both sides answered.",
    url: "app.dsohire.com/employer/applications/chen",
    crumbs: ["Applications", HERO.name],
    nav: "applications",
    durationMs: 8200,
  },
  {
    step: "Interview",
    title: "Move her forward. The busywork follows.",
    caption:
      "Drag to Interview and the automation sends prep and a booking link. She picks a time; your team sees it live.",
    url: "app.dsohire.com/employer/pipeline",
    crumbs: ["Pipeline HQ", "All locations"],
    nav: "pipeline",
    durationMs: 9000,
  },
  {
    step: "Hire",
    title: "Offer, approved, hired. No placement fee.",
    caption:
      "Comp guardrails route an above-band offer to the right approver. She signs, and the hire costs you nothing extra.",
    url: "app.dsohire.com/employer/offer-approvals",
    crumbs: ["Offer approvals", HERO.name],
    nav: "approvals",
    durationMs: 10200,
  },
];
