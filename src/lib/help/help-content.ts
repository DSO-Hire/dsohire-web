/**
 * Contextual help registry — the single source of truth for every in-app
 * help string on DSO Hire (Dave call Note 5; design doc
 * Business Plan & Strategy/Contextual_Help_System_Design_2026-05-22.md).
 *
 * Authors edit copy HERE, in one file. Components (HelpTip / HelpDisclosure /
 * HelpDrawer) and the standalone /employer/help + /candidate/help pages all
 * read from this registry by key, so inline tips and the FAQ never drift.
 *
 * Locked decisions (Cam 2026-05-22):
 *   - Help is ALWAYS FREE at every tier. Never gate a help entry.
 *   - One registry, three affordances chosen by content weight:
 *       tip        → HelpTip (ⓘ popover) for 1–2 sentences
 *       disclosure → HelpDisclosure (inline expand) for a paragraph / short list
 *       drawer     → HelpDrawer (right slide-out) for walkthroughs + video
 *   - Drawers ship with WRITTEN steps now; `videoId` is a slot for a future
 *     clip from the GTM walkthrough recording (embed-by-id so swapping the
 *     video host later is a registry change, not a code change).
 *
 * Keys are dot-namespaced by surface ("jd.requirements", "pipeline.stages").
 * Keep them stable — they're referenced from component call sites.
 */

export type HelpLens = "employer" | "candidate" | "both";

/** Default affordance for a given entry. Call sites may override. */
export type HelpFormat = "tip" | "disclosure" | "drawer";

export interface HelpStep {
  /** Optional short heading for the step / section. */
  heading?: string;
  /** One short paragraph of body copy. */
  body: string;
}

export interface HelpEntry {
  /** Short heading shown on disclosure + drawer surfaces. */
  title: string;
  /**
   * The one-liner. Shown verbatim in the HelpTip popover, and used as the
   * intro line on disclosure / drawer surfaces. Keep ≤ ~240 chars.
   */
  tip: string;
  /** The affordance this entry is authored for (call sites may override). */
  format: HelpFormat;
  /** Audience-appropriate phrasing scope. */
  lens: HelpLens;
  /** Richer body for disclosure / drawer surfaces. */
  steps?: HelpStep[];
  /** Optional flat bullet list (disclosure / drawer). */
  bullets?: string[];
  /**
   * Future walkthrough clip id. Null = "written steps only for now"; the
   * drawer renders a quiet "video coming soon" affordance rather than a
   * broken player. Set the id once the GTM clips are recorded.
   */
  videoId?: string | null;
}

/* ────────────────────────────────────────────────────────────────────
 * EMPLOYER — Job posting wizard (clinical + corporate, new + edit)
 * ─────────────────────────────────────────────────────────────────── */

const JD: Record<string, HelpEntry> = {
  "jd.overview": {
    title: "How posting a job works",
    tip: "Five quick steps — Basics, Description, Compensation, Screening, and Status. You can save a draft and finish anytime; nothing goes live until you set the status to Active.",
    format: "drawer",
    lens: "employer",
    videoId: null,
    steps: [
      {
        heading: "1 · Basics",
        body: "Title, role, employment type, and which of your locations the role is at. This is the only step with required fields.",
      },
      {
        heading: "2 · Description",
        body: "Write it yourself, or on Growth+ let the AI generator draft it from the basics — it fills the field automatically and you edit freely after.",
      },
      {
        heading: "3 · Compensation",
        body: "Set a range and how it's paid. Showing a range gets you materially more applicants; you can also keep it hidden while still powering internal matching.",
      },
      {
        heading: "4 · Screening questions",
        body: "Optional knockout and free-response questions. Knockouts are soft — a wrong answer flags the applicant for you, it never auto-rejects them.",
      },
      {
        heading: "5 · Status",
        body: "Save as Draft to finish later, or set Active to publish. You can unpublish anytime.",
      },
    ],
  },
  "jd.ai_generator": {
    title: "AI job-description generator",
    tip: "Writes a first draft from your Basics and applies it straight into the description field. Edit it freely after — it's a starting point, not a lock-in.",
    format: "disclosure",
    lens: "employer",
    bullets: [
      "Drafts from the title, role, and details you've already entered.",
      "Applies directly into the editor — no separate “apply” step.",
      "Fully editable after; rewrite or trim anything.",
      "There's a daily usage cap to keep costs sane — you'll see a note if you hit it.",
    ],
  },
  "jd.comp_visible": {
    title: "Show compensation",
    tip: "Listings that show a pay range get noticeably more applicants. If you hide it, the range still powers matching behind the scenes — candidates just won't see the number.",
    format: "tip",
    lens: "employer",
  },
  "jd.comp_components": {
    title: "Composable compensation",
    tip: "Layer base, variable/bonus, and equity. Each piece can show on the public listing or stay internal — useful when the package is more than a flat salary.",
    format: "disclosure",
    lens: "employer",
    bullets: [
      "Base range is the headline number candidates see.",
      "Variable / bonus and equity can be shown or kept internal per role.",
      "What you mark internal never renders on the public listing.",
    ],
  },
  "jd.skills": {
    title: "Preferred skills",
    tip: "Not a hard filter. Practice Fit rewards candidates who match a few of these; missing a skill never disqualifies anyone.",
    format: "tip",
    lens: "employer",
  },
  "jd.requirements": {
    title: "Requirements",
    tip: "The must-haves shown on the listing — license, education, experience. Pick from the role-specific suggestions or type your own; each one becomes its own line.",
    format: "tip",
    lens: "employer",
  },
  "jd.screening": {
    title: "Screening questions",
    tip: "Ask knockout or free-response questions on the application. Knockouts are soft — a missed answer flags the applicant for your review, it doesn't auto-reject.",
    format: "disclosure",
    lens: "employer",
    bullets: [
      "Knockout questions flag, they don't reject — you stay in control.",
      "Free-response questions collect context without gating.",
      "Avoid questions that touch protected characteristics; the builder nudges you off these.",
    ],
  },
  "jd.knockout": {
    title: "Soft knockout",
    tip: "“Soft” means a wrong answer flags the applicant for you to review — it never auto-rejects them. You decide.",
    format: "tip",
    lens: "employer",
  },
  "jd.verification": {
    title: "Verification requirements",
    tip: "Mark which credentials this role needs verified. DSO Hire is the conduit — you or a sanctioned third party do the verifying; we never assert a credential is verified ourselves.",
    format: "disclosure",
    lens: "employer",
    bullets: [
      "Tells candidates what they'll be asked to furnish.",
      "DSO Hire passes credentials through — it is not the verifier.",
      "Verification is set by your own diligence or a sanctioned third-party service.",
    ],
  },
  "jd.visibility": {
    title: "Candidate visibility",
    tip: "By default candidates see exactly where they sit in your pipeline. Turn this on only for a sensitive or executive search to show an abstracted “In review” instead.",
    format: "tip",
    lens: "employer",
  },
  "jd.internal_only": {
    title: "Internal-only job",
    tip: "Hidden from public search and the job feed. Share the direct link with the people you want to apply — useful for confidential or internal-mobility roles.",
    format: "tip",
    lens: "employer",
  },
};

/* ────────────────────────────────────────────────────────────────────
 * EMPLOYER — Pipeline / kanban
 * ─────────────────────────────────────────────────────────────────── */

const PIPELINE: Record<string, HelpEntry> = {
  "pipeline.overview": {
    title: "How the pipeline works",
    tip: "Applicants flow through stages you can drag them between. Bulk-select to move several at once. Candidates see their stage unless you've hidden it on the job.",
    format: "drawer",
    lens: "employer",
    videoId: null,
    steps: [
      {
        heading: "Stages",
        body: "New, Reviewed, Interviewed, Offered, Hired, Rejected by default — rename or reorder them in Settings → Pipeline.",
      },
      {
        heading: "Move candidates",
        body: "Drag a card between columns, or use the Stage selector on the card. Bulk-select to move many at once.",
      },
      {
        heading: "What the candidate sees",
        body: "By default candidates see their current stage. If you turned on hidden stages for this job, they see an abstracted “In review” until Offer or Hired.",
      },
      {
        heading: "Scorecards & comments",
        body: "Leave structured interview feedback and @mention teammates right on a candidate card.",
      },
    ],
  },
  "pipeline.stages": {
    title: "Pipeline stages",
    tip: "Each column is a stage in your hiring flow. Rename or reorder them in Settings → Pipeline — changes apply across your jobs.",
    format: "tip",
    lens: "employer",
  },
  "pipeline.practice_fit": {
    title: "Practice Fit score",
    tip: "A guidance score, not a gate. It blends role, skills, schedule, and preferences — and drops any dimension the candidate left blank so sparse profiles aren't penalized.",
    format: "disclosure",
    lens: "employer",
    bullets: [
      "Blends role match, skills, schedule overlap, and stated preferences.",
      "Missing data drops from the denominator — a thin profile isn't punished.",
      "Buckets: Strong / Good / Fair / Low. It's a sort aid, never an auto-decision.",
    ],
  },
  "pipeline.scorecards": {
    title: "Scorecards",
    tip: "Structured interview feedback attached to a candidate. Keeps interviewer notes consistent and comparable across your team.",
    format: "tip",
    lens: "employer",
  },
  "pipeline.bulk": {
    title: "Bulk actions",
    tip: "Select multiple candidates to move, reject, or archive them in one go. Candidate notifications still follow your per-action settings.",
    format: "tip",
    lens: "employer",
  },
};

/* ────────────────────────────────────────────────────────────────────
 * EMPLOYER — Inbox, candidates, talent pool
 * ─────────────────────────────────────────────────────────────────── */

const INBOX: Record<string, HelpEntry> = {
  "inbox.overview": {
    title: "Messaging candidates",
    tip: "Threaded messaging with inline cards for interviews and offers, plus attachments. Replies notify the candidate by email.",
    format: "disclosure",
    lens: "employer",
    bullets: [
      "One thread per candidate; rich cards embed interviews and offers inline.",
      "Attach files directly in the thread.",
      "The candidate gets an email when you message; they can reply in-thread.",
    ],
  },
  "inbox.interview": {
    title: "Propose an interview",
    tip: "Offer times right in the thread. The candidate books one, and it lands on your connected calendar automatically.",
    format: "tip",
    lens: "employer",
  },
  "inbox.offer": {
    title: "Send an offer",
    tip: "Send an offer card in-thread. The candidate accepts or declines on a secure tokenized page, and the pipeline stage flips for you automatically.",
    format: "tip",
    lens: "employer",
  },
  "talent.overview": {
    title: "Talent Pool",
    tip: "Search candidates who've opted into discovery. Browsing isn't contacting — you reach out deliberately, and candidate privacy settings are always respected.",
    format: "disclosure",
    lens: "employer",
    bullets: [
      "Only candidates who opted into discovery appear here.",
      "Filter by role, skills, location, and more.",
      "Browsing a profile doesn't notify or contact anyone.",
    ],
  },
  "candidate.profile_view": {
    title: "Verified vs. self-reported",
    tip: "Items marked verified were confirmed by your own diligence or a sanctioned third party. Everything else is self-reported by the candidate — DSO Hire never asserts verification itself.",
    format: "tip",
    lens: "employer",
  },
};

/* ────────────────────────────────────────────────────────────────────
 * EMPLOYER — Billing, team, locations, settings
 * ─────────────────────────────────────────────────────────────────── */

const SETTINGS: Record<string, HelpEntry> = {
  "billing.tiers": {
    title: "Plans & tiers",
    tip: "Four plans — Solo, Growth, Scale, Enterprise. Every paying tier gets every feature in its tier; there's no feature gating beyond the plan you're on.",
    format: "disclosure",
    lens: "employer",
    bullets: [
      "Solo — smaller groups getting started.",
      "Growth — midsize, multi-location.",
      "Scale — larger, multi-region operations.",
      "Enterprise — the largest, most complex groups.",
    ],
  },
  "billing.annual": {
    title: "Annual billing",
    tip: "Pay annually for roughly 10% off versus monthly. Same features either way.",
    format: "tip",
    lens: "employer",
  },
  "locations.overview": {
    title: "Practice locations",
    tip: "Locations power job placement, per-location analytics, and let you scope Hiring Managers to just the practices they run.",
    format: "tip",
    lens: "employer",
  },
  "settings.affiliation": {
    title: "DSO affiliation",
    tip: "Controls whether a location publicly shows it's part of your group. Set a location private and its jobs won't link back to your corporate brand.",
    format: "tip",
    lens: "employer",
  },
  "settings.templates": {
    title: "Email templates",
    tip: "On Growth+, customize the subject and body of candidate emails with mergefields like {{candidate.first_name}} and {{job.title}}.",
    format: "tip",
    lens: "employer",
  },
  "settings.pipeline": {
    title: "Pipeline settings",
    tip: "Rename and reorder your hiring stages here. Changes apply across all your jobs — existing candidates keep their current stage.",
    format: "tip",
    lens: "employer",
  },
};

/* ────────────────────────────────────────────────────────────────────
 * CANDIDATE
 * ─────────────────────────────────────────────────────────────────── */

const CANDIDATE: Record<string, HelpEntry> = {
  "cand.onboarding": {
    title: "Getting started",
    tip: "A fuller profile means better matches and more relevant roles. Import your resume to fill most of it in seconds, then review before anything saves.",
    format: "drawer",
    lens: "candidate",
    videoId: null,
    steps: [
      {
        heading: "Build your profile",
        body: "Roles you want, skills, schedule, and preferences. The more you add, the better your matches — and you choose what's visible.",
      },
      {
        heading: "Import your resume",
        body: "Upload a resume and we parse it into your profile. You review every field before it saves — nothing is applied on your behalf.",
      },
      {
        heading: "Understand Practice Fit",
        body: "On each job you'll see a fit score. It's guidance to help you prioritize, never a barrier to applying.",
      },
      {
        heading: "Apply with control",
        body: "You see exactly where you stand in each employer's pipeline, and you decide who can discover your profile.",
      },
    ],
  },
  "cand.practice_fit": {
    title: "Your Practice Fit score",
    tip: "How well a role lines up with your profile — roles, skills, schedule, preferences. It's guidance to help you prioritize, not a gate. You can apply to anything.",
    format: "disclosure",
    lens: "candidate",
    bullets: [
      "Higher means a closer match to what you've told us you want.",
      "Some jobs show no score when there isn't enough overlap data — that's not a no.",
      "It never blocks you from applying.",
    ],
  },
  "cand.import": {
    title: "Resume import",
    tip: "Upload a resume and we pull out your experience, skills, and education. You review everything before it saves — nothing applies on your behalf.",
    format: "tip",
    lens: "candidate",
  },
  "cand.privacy": {
    title: "Profile visibility & data",
    tip: "You control who can see your profile and can hide it from employer discovery anytime. You can also export or delete your data from settings.",
    format: "disclosure",
    lens: "candidate",
    bullets: [
      "Toggle whether employers can discover you in the Talent Pool.",
      "Hidden profiles still let you apply directly to jobs.",
      "Export or delete your data anytime from Settings → Data.",
    ],
  },
  "cand.applications": {
    title: "Your applications",
    tip: "Track every role you've applied to and where it stands. The stage you see reflects what the employer has shared for that job.",
    format: "tip",
    lens: "candidate",
  },
  "cand.credentials": {
    title: "Credentials",
    tip: "Adding licenses and certifications strengthens your matches. Items show as self-reported until an employer or third party verifies them — we don't assert verification for you.",
    format: "tip",
    lens: "candidate",
  },
};

/* ──────────────────────────────────────────────────────────────────── */

export const HELP_CONTENT: Record<string, HelpEntry> = {
  ...JD,
  ...PIPELINE,
  ...INBOX,
  ...SETTINGS,
  ...CANDIDATE,
};

export type HelpKey = keyof typeof HELP_CONTENT;

/** Lookup by key. Returns undefined for an unknown key (callers no-op). */
export function getHelp(key: string): HelpEntry | undefined {
  return HELP_CONTENT[key];
}
