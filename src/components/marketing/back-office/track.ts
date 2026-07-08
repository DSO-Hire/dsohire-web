/**
 * Back-office showcase — the scripted demo track (Fable spec 2026-07-08).
 *
 * ALL canned data for the five chapters lives here, in one place, so the
 * truthfulness audit has a single file to proof. Labels that exist in the
 * product are IMPORTED from their source-of-truth modules (stages, comp,
 * sourcing) — never retyped — so marketing can't drift from the app.
 *
 * Truthfulness rule (house standard): the footnote says "live product," so
 * every depicted capability maps to something shipped:
 *   • CH1 automation = the LIVE application.stage_changed → email_candidate
 *     path (lib/automations/types.ts Phase 1). No reserved actions shown.
 *   • CH5 uses the real prospect-stage labels; the "reveal" is depicted as
 *     the double-blind card flip + consent badge, not a fabricated stage.
 */

import { KIND_DEFAULT_LABELS } from "@/lib/applications/stages";
import {
  COMP_MODEL_OPTIONS,
  DURATION_LABELS,
  LAB_FEE_LABELS,
  PERCENT_BASIS_LABELS,
} from "@/lib/comp/model";
import { PROSPECT_STAGE_LABELS } from "@/lib/sourcing/pipeline";

/* ── CH1 · Pipeline → automation ── */

export interface DemoCard {
  id: string;
  name: string;
  role: string;
  fit: number;
  masked?: boolean;
}

export const KANBAN_COLUMNS: ReadonlyArray<{
  key: "open" | "screen" | "interview" | "offer";
  label: string;
  count: number;
  cards: DemoCard[];
}> = [
  {
    key: "open",
    label: KIND_DEFAULT_LABELS.open,
    count: 14,
    cards: [{ id: "maria", name: "Maria G.", role: "RDA · Chandler", fit: 88 }],
  },
  {
    key: "screen",
    label: KIND_DEFAULT_LABELS.screen,
    count: 6,
    cards: [
      { id: "sarah", name: "Dr. Sarah Chen", role: "Associate · Boise", fit: 94 },
      {
        id: "rdh4821",
        name: "Candidate RDH-4821",
        role: "Hygienist · Mesa",
        fit: 91,
        masked: true,
      },
    ],
  },
  {
    key: "interview",
    label: KIND_DEFAULT_LABELS.interview,
    count: 3,
    cards: [{ id: "devon", name: "Devon P.", role: "Front Office · Tempe", fit: 79 }],
  },
  {
    key: "offer",
    label: KIND_DEFAULT_LABELS.offer,
    count: 1,
    cards: [{ id: "james", name: "James R.", role: "Ops Manager · Corp", fit: 86 }],
  },
];

/** Maps to the LIVE stage_changed → email_candidate automation. */
export const AUTOMATION_TOAST = {
  kicker: "Automation fired",
  title: `When stage → ${KIND_DEFAULT_LABELS.interview}: interview-prep email + calendar link sent`,
  sub: "To Dr. Chen · practice-masked sender · logged",
};

/* ── CH2 · Comp model ── */

const GUARANTEE_PLUS_PERCENT_LABEL =
  COMP_MODEL_OPTIONS.find((o) => o.value === "guarantee_plus_percent")?.label ??
  "Daily guarantee + %";

export const COMP_FIELDS: ReadonlyArray<{ label: string; value: string }> = [
  { label: "Model", value: GUARANTEE_PLUS_PERCENT_LABEL },
  { label: "Guarantee", value: `$750 / day · ${DURATION_LABELS.intro_90d}` },
  { label: "Production", value: `32% of ${PERCENT_BASIS_LABELS.adjusted_production}` },
  { label: "Lab fees", value: LAB_FEE_LABELS.split_50 },
];

export const COMP_GUARDRAIL =
  "32% is above your Associate · Boise band (28–30%) — flagged for owner sign-off.";

export const COMP_ESTIMATE = { min: 185, max: 232 }; // $k

/* ── CH3 · PracticeFit — one score, two sides of data ──
 *
 * The honest model (lib/practice-fit/compute.ts + track.ts): ONE engine
 * scores a candidate↔job pair from BOTH sides' declared data — the
 * candidate's PracticeFit assessment × the job + practice profile. A
 * dimension only scores when both sides answered (unscored dims drop out
 * of the denominator — nothing is guessed). PracticeFit covers practice-
 * level roles (clinical/admin tracks); DSOFit is the corporate track —
 * same engine, per-function weight profiles (seniority, org scale,
 * leadership scope). A pair is never scored across tracks. */

/** Paired inputs — candidate assessment answer × practice profile answer.
 *  Vocabulary mirrors the real assessment + practice-profile fields
 *  (work_pace/practice_pace, mentorship, comp_priority tilt, PMS). */
export const FIT_PAIRS: ReadonlyArray<{
  dim: string;
  candidate: string;
  practice: string;
}> = [
  { dim: "Work pace", candidate: "Steady & thorough", practice: "Steady" },
  { dim: "Mentorship", candidate: "Wants a mentor", practice: "Offered — clinical director" },
  { dim: "PMS fluency", candidate: "Dentrix · Eaglesoft", practice: "Dentrix" },
  { dim: "Matters most", candidate: "Compensation", practice: "$750/day + 32%" },
];

export const FIT_SCORE = 94;

/** Real v8 dimension weights (lib/practice-fit/compute.ts WEIGHTS — module-
 *  private, restated; 20 practice-track dims, normalized over scored only). */
export const FIT_DIM_CHIPS: ReadonlyArray<{ label: string; weight: number }> = [
  { label: "Location", weight: 14 },
  { label: "Role fit", weight: 12 },
  { label: "Compensation", weight: 10 },
  { label: "PMS fluency", weight: 9 },
];
export const FIT_DIM_MORE = "+ 16 more";

export const FIT_HONESTY_NOTE =
  "A dimension only counts when both sides answered — nothing is guessed.";

export const DSOFIT_NOTE =
  "Corporate & multi-practice leadership roles run the same engine — weighted per function: seniority, org scale, leadership scope.";

/* ── CH4 · Draft with AI ── */

/** Button label matches jd-generator-panel.tsx exactly. */
export const DRAFT_BUTTON_LABEL = "Draft with AI";

export const JD_LINES: ReadonlyArray<{ html: string }> = [
  { html: "<h4>Associate Dentist — Boise, ID</h4>" },
  {
    html: "Join a growing, clinician-led practice as an Associate Dentist. We offer a <b>$750/day guarantee for your first 90 days</b>, then <b>32% of adjusted production</b> — with lab fees split 50/50.",
  },
  {
    html: "You'll see a full schedule of general and restorative cases with modern equipment and a supportive hygiene team.",
  },
  {
    html: "<b>What we're looking for:</b> DDS/DMD, active ID license, 2+ years chairside, comfort with crown &amp; bridge.",
  },
  { html: "<b>Why here:</b> mentorship, CE support, and a real path toward partnership." },
];

export const JD_FOOT =
  "Grounded in the role + your comp model · uses “the company” when the practice is masked.";

/* ── CH5 · Sourcing / consent ── */

/** Real prospect-stage labels; the double-blind reveal is the card flip +
 *  consent badge (an event, not a stage). */
export const SOURCING_STEPS: ReadonlyArray<string> = [
  PROSPECT_STAGE_LABELS.sourced,
  PROSPECT_STAGE_LABELS.contacted,
  PROSPECT_STAGE_LABELS.responded,
  PROSPECT_STAGE_LABELS.converted,
];

export const SOURCING = {
  maskedName: "Candidate RDH-4821",
  revealedName: "Priya N., RDH",
  revealedInitials: "PN",
  role: "Hygienist · Mesa · 6 yrs",
  fit: 91,
  message:
    "“A growing Mesa practice is hiring a hygienist that matches your PracticeFit. Interested in an intro? Your name stays hidden until you say yes.”",
  consentBadge: "✓ Contact shared by candidate",
};

/* ── Chapters (order + player metadata) ── */

export interface ChapterMeta {
  /** Chip kicker, e.g. "01 · Pipeline". */
  kicker: string;
  /** Chip + caption title. */
  title: string;
  /** Faux URL in the device chrome. */
  url: string;
  /** Caption below the controls. */
  caption: string;
  /** Autoplay dwell. */
  durationMs: number;
}

export const CHAPTERS: ReadonlyArray<ChapterMeta> = [
  {
    kicker: "01 · Pipeline",
    title: "Pipeline → automation",
    url: "app.dsohire.com/employer/pipeline",
    caption:
      "Drag Dr. Chen to Interview — masking holds, counts tick, the automation fires.",
    durationMs: 8200,
  },
  {
    kicker: "02 · Comp",
    title: "A comp model that speaks dental",
    url: "app.dsohire.com/employer/jobs/new · comp",
    caption:
      "Build a real dental package — guarantee, production %, lab fees — into a live annual range.",
    durationMs: 6800,
  },
  {
    kicker: "03 · PracticeFit",
    title: "One score, two sides of data",
    url: "app.dsohire.com/employer/candidates/chen",
    caption:
      "Dr. Chen's assessment meets the practice's profile — dimensions only count when both sides answered. DSOFit runs corporate roles the same way.",
    durationMs: 7400,
  },
  {
    kicker: "04 · AI JD",
    title: "Draft with AI",
    url: "app.dsohire.com/employer/jobs/new · description",
    caption:
      "A dental-accurate job post, drafted from the role and the comp you built.",
    durationMs: 7200,
  },
  {
    kicker: "05 · Sourcing",
    title: "Candidates who want to be found",
    url: "app.dsohire.com/employer/sourcing",
    caption:
      "Double-blind outreach — the candidate stays anonymous until they choose to reveal.",
    durationMs: 7200,
  },
];
