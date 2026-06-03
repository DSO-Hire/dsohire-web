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
  "interviews.workflow": {
    title: "Booking interviews end-to-end",
    tip: "Propose times in the candidate's thread, the candidate picks one, the meeting lands on both calendars with a Meet or Teams link. Rescheduling and cancellation propagate to both sides.",
    format: "drawer",
    lens: "employer",
    videoId: null,
    steps: [
      {
        heading: "1 · Connect your calendar (one-time setup)",
        body: "Settings → Integrations → Connect Google or Microsoft. You'll grant calendar access; we use it to write the event and the video link. You can disconnect anytime.",
      },
      {
        heading: "2 · Propose times",
        body: "From a candidate thread, click Propose interview. Pick three to five time windows; the candidate sees them as a single card and picks one. No back-and-forth email.",
      },
      {
        heading: "3 · The booking",
        body: "When the candidate picks a slot, the event auto-creates on your calendar with a Google Meet or Microsoft Teams link baked in. The candidate gets the same invite at the same time.",
      },
      {
        heading: "4 · Reschedule or cancel",
        body: "Either side can reschedule from the original card or thread. The event updates on both calendars and a fresh card with new times posts in the thread. Cancellation removes the event from both calendars and notes it in the thread.",
      },
      {
        heading: "5 · Reminders",
        body: "We send the candidate an automated email reminder ahead of the interview. Your calendar handles your own reminders the way you've already configured them.",
      },
    ],
  },
  "inbox.offer": {
    title: "Send an offer",
    tip: "Send an offer card in-thread. The candidate accepts or declines on a secure tokenized page, and the pipeline stage flips for you automatically.",
    format: "tip",
    lens: "employer",
  },
  "offers.workflow": {
    title: "Sending and tracking offers",
    tip: "Compose an offer from your library or from scratch, send it in the candidate's thread, and track Accept / Decline in real time. The pipeline stage flips for you when the candidate responds.",
    format: "drawer",
    lens: "employer",
    videoId: null,
    steps: [
      {
        heading: "1 · Compose",
        body: "From a candidate's profile or thread, click Send offer. Pick a template from your offer letter library or start blank. Mergefields like {{candidate.first_name}} and {{job.title}} fill automatically.",
      },
      {
        heading: "2 · Review and send",
        body: "Preview shows the candidate's exact view, including the secure Accept / Decline buttons. Click Send — the candidate gets an email plus a card in their inbox thread.",
      },
      {
        heading: "3 · Candidate responds",
        body: "The candidate opens a secure tokenized page, reads the offer, and accepts or declines with a typed-name soft signature. We capture IP and timestamp for your records.",
      },
      {
        heading: "4 · Auto stage move",
        body: "An accepted offer moves the candidate to Hired automatically. A declined offer moves them to Rejected with the decline reason if the candidate added one. You're notified by email either way.",
      },
      {
        heading: "5 · Revise an offer",
        body: "If you need to send a revised offer, do it from the same thread — the new offer supersedes the old one and the candidate sees both for context.",
      },
    ],
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
  "billing.manage": {
    title: "Upgrade, downgrade, or cancel",
    tip: "Subscription changes go through your secure billing portal — upgrade for proration credit on the unused part of your current plan, downgrade or cancel at any time.",
    format: "drawer",
    lens: "employer",
    videoId: null,
    steps: [
      {
        heading: "Open your billing portal",
        body: "Settings → Billing → Manage subscription. The portal opens in a new window — it's hosted by Stripe so your card details never touch DSO Hire.",
      },
      {
        heading: "Change your plan",
        body: "Pick a new tier and confirm. Upgrades take effect immediately and prorate the difference against the rest of your billing period. Downgrades take effect at the end of the current period so you keep what you paid for.",
      },
      {
        heading: "Switch monthly ↔ annual",
        body: "Same portal. Switching to annual saves roughly 10%; the proration is calculated and shown before you confirm.",
      },
      {
        heading: "Cancel",
        body: "Cancellation takes effect at the end of your current billing period — you keep access until then and aren't charged again. Your data stays put if you come back later.",
      },
      {
        heading: "Update your card or invoice email",
        body: "Same portal. Card and billing email changes apply to the next invoice.",
      },
    ],
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
    tip: "Customize the 3 automatic candidate emails (apply confirmation, message-received, stage-moved) on any paid tier. Growth+ also unlocks unlimited custom templates you can send on demand from a candidate's profile.",
    format: "disclosure",
    lens: "employer",
    bullets: [
      "Predefined templates (3 of them) edit the subject + body of emails the platform sends on candidate events — available on every paid tier including Solo.",
      "Custom templates (Growth+) are reusable templates you author yourself — interview prep, offer follow-ups, no-show outreach — and send on demand from any candidate's profile.",
      "Both surfaces use mergefields like {{candidate.first_name}} and {{job.title}}. Preview pane shows the rendered email before you save or send.",
    ],
  },
  "settings.custom_templates_send": {
    title: "Send a custom email to one candidate",
    tip: "On Growth+, open any candidate's application detail and click 'Send email' next to the Pipeline stage. Pick one of your custom templates, preview the rendered version, and send.",
    format: "tip",
    lens: "employer",
  },
  "settings.mfa": {
    title: "Two-factor authentication (2FA)",
    tip: "Optional security upgrade — adds a 6-digit code from an authenticator app to your sign-in. Trusted devices skip the code prompt for 30 days, so it stays low-friction.",
    format: "drawer",
    lens: "employer",
    videoId: null,
    steps: [
      {
        heading: "Set it up",
        body: "Settings → Account → Two-factor authentication. Scan the QR code with 1Password / Authy / Apple Passwords / Google Authenticator, enter the 6-digit code, and save the 10 recovery codes somewhere safe.",
      },
      {
        heading: "Trust this device",
        body: "On the next sign-in, leave 'Trust this device for 30 days' checked. You won't be prompted for the code again on that browser for 30 days unless you clear cookies, switch networks, or disable + re-enroll MFA.",
      },
      {
        heading: "Require it for your whole team",
        body: "DSO owners can flip 'Require 2FA for the whole DSO' on the same settings page. Every team member is then forced to enroll at their next sign-in. Available on any paid tier.",
      },
      {
        heading: "Lost your device?",
        body: "Use one of the 10 recovery codes from setup — each works once and reveals the option to re-enroll a fresh authenticator. If you've used them all, email support and we'll verify your identity to reset.",
      },
    ],
  },
  "locations.bulk_import": {
    title: "Bulk add locations from a spreadsheet",
    tip: "Upload a CSV or Excel file with one row per practice. We'll validate each row, insert the valid ones, and geocode them in the background. Up to 1000 rows / 5 MB per upload.",
    format: "drawer",
    lens: "employer",
    videoId: null,
    steps: [
      {
        heading: "Download the sample",
        body: "Locations → Bulk Import → Download sample CSV. Three example rows showing exactly the columns we expect — replace them with your own data and save.",
      },
      {
        heading: "Required vs optional columns",
        body: "Required: name, city, state (2-letter code like KS or MO). Optional: address_line1, address_line2, postal_code, website. Header aliases work — 'zip' → postal_code, 'practice name' → name, 'street' → address_line1, etc.",
      },
      {
        heading: "Upload",
        body: "Drag the file onto the dropzone (or click to pick), then click Import. Per-row validation surfaces inline — a deliberately broken row gives you a row number + the specific error so you can fix and re-upload just the failures.",
      },
      {
        heading: "After import",
        body: "Locations show up immediately. Geocoding fans out in the background (concurrency cap of 6 to stay nice to Mapbox); map view updates within a minute. Each location respects the same Public Branding toggle as the single-add path.",
      },
    ],
  },
  "settings.pipeline": {
    title: "Pipeline settings",
    tip: "Rename and reorder your hiring stages here. Changes apply across all your jobs — existing candidates keep their current stage.",
    format: "tip",
    lens: "employer",
  },
  "applications.review": {
    title: "Reviewing applications",
    tip: "Open any application to see the candidate's profile, resume, screening answers, knockout flags, and Practice Fit score side-by-side. Leave structured scorecard feedback and @mention teammates without leaving the page.",
    format: "drawer",
    lens: "employer",
    videoId: null,
    steps: [
      {
        heading: "1 · Find applications",
        body: "Applications tab shows everything across your jobs. The per-job pipeline at /employer/jobs/[id]/applications shows just that role's candidates as a drag-and-drop kanban.",
      },
      {
        heading: "2 · Open the detail page",
        body: "Click any candidate to see profile, resume, screening question answers, knockout flags (with the exact failed question), Practice Fit score breakdown, and your team's notes — all on one page.",
      },
      {
        heading: "3 · Move stages",
        body: "Use the Stage selector at the top of the detail page, drag the card on the kanban, or bulk-select multiple candidates and move them at once. Candidate email notifications follow your per-action settings.",
      },
      {
        heading: "4 · Leave a scorecard",
        body: "Structured interview feedback attached to the candidate — your team sees consistent, comparable input rather than scattered notes. Scorecards roll up on the candidate card so a hiring manager can scan the whole panel at a glance.",
      },
      {
        heading: "5 · Comment and @mention",
        body: "Drop a comment on the candidate card and @mention a teammate. They get an email + an in-app notification with a deep link straight back to the thread.",
      },
      {
        heading: "6 · Send a custom email (Growth+)",
        body: "From any candidate's detail page, click Send email next to the stage selector. Pick one of your custom templates (interview prep, no-show outreach, etc.), preview the rendered version, and send.",
      },
    ],
  },
  "reports.overview": {
    title: "What's in Reports",
    tip: "A DSO-wide view of your hiring funnel, top-performing roles, and time-to-fill metrics. Built from the application data you're already capturing — no extra logging required.",
    format: "drawer",
    lens: "employer",
    videoId: null,
    steps: [
      {
        heading: "Headline tiles",
        body: "Open roles, applications received in the last 30 days, hires this quarter, and your average time-to-fill in days. Quick read at the top of the page.",
      },
      {
        heading: "Pipeline funnel",
        body: "Visual breakdown of where candidates are across all your jobs — how many in New, Reviewed, Interviewed, Offered, Hired, Rejected. Click any stage for the candidate list at that stage.",
      },
      {
        heading: "Top jobs leaderboard",
        body: "Your roles ranked by application volume and conversion rate. Useful for spotting which listings are pulling and which need a refresh.",
      },
      {
        heading: "Cross-location stats",
        body: "Compare hiring activity, fill rate, and time-to-fill across your practice locations. Helpful for multi-location groups to see which markets are running hot and which need attention.",
      },
      {
        heading: "Export to CSV",
        body: "Every applications list — DSO-wide, per-job, per-stage — has a Download CSV link. Bring the data into Excel, your BI tool, or wherever else it needs to go.",
      },
    ],
  },
  "integrations.calendar": {
    title: "Connecting your calendar",
    tip: "Connect Google or Microsoft once and we'll auto-create interview events with Meet or Teams links baked in. Disconnect anytime — no calendar data leaves your control.",
    format: "drawer",
    lens: "employer",
    videoId: null,
    steps: [
      {
        heading: "Where to connect",
        body: "Settings → Integrations → Calendar. One click per provider. You'll be sent through Google or Microsoft's standard OAuth screen to grant calendar access.",
      },
      {
        heading: "What we use it for",
        body: "Writing interview events to your calendar when a candidate books one, generating the Meet or Teams link, and pushing reschedules or cancellations through. We don't read your existing events.",
      },
      {
        heading: "Per-user, not per-DSO",
        body: "Each team member connects their own calendar so events land on the right person's schedule. If a hiring manager hasn't connected theirs, you'll see a one-click prompt the first time they propose an interview.",
      },
      {
        heading: "Disconnect anytime",
        body: "Settings → Integrations → Disconnect. Existing events stay on your calendar — we just stop writing new ones for that user. You can also revoke access from Google or Microsoft's account dashboard.",
      },
    ],
  },
  "locations.public_website": {
    title: "Per-location practice website",
    tip: "Each location gets a public listing page at /location/[slug] showing your branding, address, current open roles, and a careers CTA. Indexed by search engines once your site is out of pre-launch lockdown.",
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

/* ────────────────────────────────────────────────────────────────────
 * EMPLOYER — Automations (rules + drip sequences). These are the most
 * involved tools on the platform, so the copy is deliberately thorough —
 * it powers the on-page "How it works" panels, the /help center, and the
 * AI support assistant (RAG) from one place.
 * ─────────────────────────────────────────────────────────────────── */

const AUTOMATIONS: Record<string, HelpEntry> = {
  "automations.overview": {
    title: "Automations: rules vs. drip sequences",
    tip: "Two different tools live under Automations. Rules react instantly to one thing that happens in your pipeline. Drip sequences send a planned series of emails over days. Use rules for 'when X happens, do Y'; use sequences to gently follow up with a candidate over time.",
    format: "drawer",
    lens: "employer",
    videoId: null,
    steps: [
      {
        heading: "Rules = instant reactions",
        body: "A rule watches for a single event — a candidate applies, or moves to a stage — and immediately runs one or more actions (email the candidate, post an internal note, add a tag, notify or assign a teammate). One event, one set of actions, right now.",
      },
      {
        heading: "Drip sequences = timed follow-ups",
        body: "A sequence is a series of re-engagement emails sent on a schedule (e.g. day 0, day 3, day 7). You enroll a candidate from their application, and the steps go out over time until the sequence finishes or the candidate re-engages.",
      },
      {
        heading: "Which should I use?",
        body: "Use a RULE to automate a one-time response (\"when someone applies, tag it and tell the recruiter\"). Use a SEQUENCE to nurture a quiet candidate over time (\"check in three times over two weeks unless they reply\").",
      },
    ],
    bullets: [
      "Both live under Automations, on the Rules and Drip sequences tabs.",
      "Custom rules and drip sequences are a Scale-plan feature; the built-in default stage-change rule runs on every plan.",
      "Everything candidate-facing always shows your practice name, never the corporate group name, when affiliation masking is on.",
    ],
  },
  "automations.rules": {
    title: "Automation rules",
    tip: "A rule is 'when this happens → optionally only if → do this.' Pick a trigger (a candidate applies, or an application changes stage, or it sits idle), narrow it with conditions, and choose actions. Rules fire once per matching event.",
    format: "drawer",
    lens: "employer",
    videoId: null,
    steps: [
      {
        heading: "1. Pick a trigger",
        body: "The event that starts the rule: an application is received, an application changes stage, or an application sits idle in a stage for N days. The trigger decides which conditions and actions are available.",
      },
      {
        heading: "2. Add conditions (optional)",
        body: "Narrow when the rule runs — e.g. only when it moves to 'Interview', only for a specific job, or only after N days idle. With no conditions, the rule runs on every matching trigger. All conditions must be true (AND).",
      },
      {
        heading: "3. Choose actions",
        body: "What the rule does: email the candidate, send a re-engagement email, post an internal inbox update, add a tag, notify a teammate, or assign the application to a teammate. You can stack several actions on one rule.",
      },
      {
        heading: "Test before you trust it",
        body: "Use 'Test against recent moves' on a stage-change rule to dry-run it over your last 50 stage changes and see exactly which applications it would have matched — no emails sent.",
      },
      {
        heading: "The default rule",
        body: "Every account starts with a built-in 'notify candidate on stage change' rule (posts an inbox update, then emails the candidate). It runs on all plans and can be paused, but not deleted.",
      },
    ],
    bullets: [
      "Rules fire once per matching event, deduped so a candidate isn't emailed twice for the same move.",
      "Auto-advancing or auto-rejecting a candidate (move-stage actions) is intentionally not offered yet — it's the riskiest action and is held until proven.",
      "Custom rules require the Scale plan; the default rule works on every plan.",
      "Owners and admins manage rules; recruiters don't see this tab.",
    ],
  },
  "automations.sequences": {
    title: "Drip sequences",
    tip: "A drip sequence is a series of timed nurture emails to one candidate. Build the steps once, then enroll a candidate from their application. Each step sends after the delay you set, and the whole sequence stops automatically the moment the candidate re-engages.",
    format: "drawer",
    lens: "employer",
    videoId: null,
    steps: [
      {
        heading: "1. Build the sequence",
        body: "On the Drip sequences tab, click New sequence. Name it, then add steps. Each step has a 'wait N days' delay (0 = send right away / on the next hourly run), a subject, and a message. Reorder or remove steps anytime.",
      },
      {
        heading: "2. Personalize without typing code",
        body: "Use the insert chips above each field — First name, Last name, Job title, Practice name — to drop a merge field at your cursor. Hit Preview on any step to see it rendered with sample values before you save.",
      },
      {
        heading: "3. Enroll a candidate",
        body: "Open a candidate's application → Pipeline stage section → pick a sequence under 'Nurture sequence' and click Start sequence. You'll see 'step X of N · next email <date>'. A candidate can be in one sequence at a time.",
      },
      {
        heading: "4. It stops itself",
        body: "A running sequence ends automatically the moment the candidate replies, moves to a different stage, or receives an offer — so you never accidentally keep emailing someone who's already engaged or hired. You can also hit Stop manually.",
      },
      {
        heading: "Send schedule + Run now",
        body: "Steps go out automatically every hour when they're due. To send what's due immediately instead of waiting, use the Run now button on the Drip sequences tab — it reports what sent and why anything stopped.",
      },
    ],
    bullets: [
      "Emails always show your practice name (affiliation-masked), never the corporate group name.",
      "You can't enroll a candidate who already has an offer out or is in a closed stage — they'd just exit immediately.",
      "Pausing a sequence stops its active enrollments on the next run.",
      "Drip sequences require the Scale plan. Owners/admins build them; recruiters can start/stop one from an application.",
    ],
  },
};

/* ────────────────────────────────────────────────────────────────────
 * EMPLOYER — Offer approvals + Analytics (the other involved tools).
 * ─────────────────────────────────────────────────────────────────── */

const OFFER_ANALYTICS: Record<string, HelpEntry> = {
  "offers.approvals": {
    title: "Offer approvals",
    tip: "Offer letters can require a sign-off before they reach the candidate. Owners and admins send directly; recruiters and hiring managers route through approval unless you grant them direct authority. Pay outside your posted range (or above a ceiling you set) can require approval from anyone.",
    format: "drawer",
    lens: "employer",
    videoId: null,
    steps: [
      {
        heading: "Who needs approval",
        body: "By default, owners and admins send offers straight to the candidate. Recruiters and hiring managers have their offers held for an owner/admin to approve. You can grant a specific recruiter or hiring manager direct-send authority in Settings → Offer approvals.",
      },
      {
        heading: "Pay guardrails",
        body: "When composing an offer you enter a structured base amount. If it falls outside the job's posted range — or above an optional dollar ceiling you set — the offer can be routed for approval even for people who normally send directly. The compose screen shows a live banner so the sender knows before submitting.",
      },
      {
        heading: "The approvals queue",
        body: "Held offers land on the Offer approvals page (a count badge shows in the nav). An approver reviews the exact letter and the 'what changed' diff if it's a revision, then Approves — which sends it to the candidate — or Rejects with a note that goes back to the sender.",
      },
      {
        heading: "Everyone stays informed",
        body: "Approvers are emailed when an offer needs sign-off; the original sender is emailed the decision. Nothing reaches the candidate until an approver approves it.",
      },
    ],
    bullets: [
      "Set the policy + per-teammate authority in Settings → Offer approvals.",
      "Approval chains, the $ ceiling, and the version diff are a Scale-plan feature; the guardrail banner shows on every plan.",
      "Owners/admins approve; recruiters see their own pending/rejected offers on the application.",
    ],
  },
  "analytics.overview": {
    title: "Reading your analytics",
    tip: "Analytics turns the application data you're already capturing into hiring metrics — time-to-fill, funnel conversion, source performance, offer acceptance, per-location comparisons, and pay-vs-market benchmarks. No extra logging required.",
    format: "drawer",
    lens: "employer",
    videoId: null,
    steps: [
      {
        heading: "The tabs",
        body: "Overview (headline KPIs + trend), Funnel & velocity (stage-to-stage conversion + time-to-fill), Sources (where applicants come from), Offers (acceptance + decline reasons), Locations (a per-practice comparison table), and Benchmarks (your pay vs. BLS market medians).",
      },
      {
        heading: "Filters",
        body: "Use the date window (30 / 90 / 365 days) to set the period, and the practice filter to scope every tab to a single location or view the whole portfolio.",
      },
      {
        heading: "What changed and why",
        body: "The AI summary reads the current numbers against the prior period and explains the movement in plain English — grounded only in your data, never invented.",
      },
      {
        heading: "Export",
        body: "Pull the per-practice rollup or the raw application data to CSV for your own reporting or a board deck.",
      },
    ],
    bullets: [
      "Metrics that depend on response/start tracking only count from when that capture went live, so brand-new accounts fill in over time.",
      "Benchmarks compare to public BLS OEWS medians by role + state, with a national fallback.",
      "Analytics is read-only and never affects a candidate's experience.",
    ],
  },
};

/* ────────────────────────────────────────────────────────────────────
 * EMPLOYER — Dashboard + Referrals (rounding out help coverage).
 * ─────────────────────────────────────────────────────────────────── */

const MISC: Record<string, HelpEntry> = {
  "dashboard.overview": {
    title: "Your dashboard",
    tip: "A daily snapshot of what needs your attention: applications awaiting review, candidates stuck or stale in the pipeline, recent activity, and how your jobs are performing. The cards link straight to a pre-filtered list so you can act in one click.",
    format: "disclosure",
    lens: "employer",
    bullets: [
      "Awaiting review shows the oldest-waiting application and flags when it's past your SLA.",
      "Stuck = sitting in 'New' too long; Stale = no movement in a mid-pipeline stage. Both deep-link to the matching applications.",
      "Use the location switcher (top left) to scope the whole dashboard to one practice.",
    ],
  },
  "referrals.overview": {
    title: "Referrals",
    tip: "Invite your team (or anyone) to refer candidates with a personal link. When someone applies through that link, the referral is tracked back to the referrer so you can see who's sending you talent.",
    format: "disclosure",
    lens: "employer",
    steps: [
      {
        heading: "Share a referral link",
        body: "Generate a personal referral link and send it to a teammate or contact. Anyone who applies through it is tagged as their referral.",
      },
      {
        heading: "Track who referred whom",
        body: "The Referrals page lists each referral and its status as it moves through your pipeline, so you can credit the people sending you good candidates.",
      },
    ],
    bullets: [
      "There's no bonus/payout engine — this tracks the referral relationship, not payments.",
      "Referred candidates apply and flow through your normal pipeline like any other applicant.",
    ],
  },
};

/* ──────────────────────────────────────────────────────────────────── */

export const HELP_CONTENT: Record<string, HelpEntry> = {
  ...JD,
  ...PIPELINE,
  ...INBOX,
  ...SETTINGS,
  ...AUTOMATIONS,
  ...OFFER_ANALYTICS,
  ...MISC,
  ...CANDIDATE,
};

export type HelpKey = keyof typeof HELP_CONTENT;

/** Lookup by key. Returns undefined for an unknown key (callers no-op). */
export function getHelp(key: string): HelpEntry | undefined {
  return HELP_CONTENT[key];
}
