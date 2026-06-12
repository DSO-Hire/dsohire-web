/**
 * June 2026 ship notes. Append-only within the month; one entry per
 * user-visible change, written in customer language. See ./index.ts
 * for the maintenance rule.
 */
import type { ChangelogEntry } from "./index";

export const entries: ChangelogEntry[] = [
  {
    date: "2026-06-12",
    kind: "improved",
    title: "Your dashboard greets you with what matters",
    body: "The dashboard headline now reacts to your real hiring state — a hire this week, offers awaiting answers, candidates past your response goal, a surge of applications, or a clean slate. Always true, never canned: it reads the same numbers the tiles show.",
  },
  {
    date: "2026-06-11",
    kind: "improved",
    title: "A sharper sidebar — and it collapses",
    body: "The navigation rail got a redesign: the DSO Hire mark draws itself in on load, sections are named (Hire, Insight, Operate), the active page gets a settling green edge, and the footer tightened to one line. Best part: the tab on the rail's edge collapses it to a slim icon bar — tooltips on hover, more room for your pipeline — and it remembers your choice.",
  },
  {
    date: "2026-06-11",
    kind: "new",
    title: "Review candidates without leaving the keyboard",
    body: "On any application, j and k now step you through every candidate in that job's pipeline — with a position marker so you always know where you are. Open the pipeline, hit j, and review the whole stack in one sitting.",
  },
  {
    date: "2026-06-11",
    kind: "improved",
    title: "The candidate workspace, rebuilt",
    body: "Application detail is now a true workspace: evidence organized into tabs (Profile, Screening, Messages, Offer, Internal, Timeline) beside an always-visible pipeline rail with stage, assignee, interviews, and tags. No more thirteen-section scroll — and your internal notes stay clearly walled off from anything candidate-facing.",
  },
  {
    date: "2026-06-11",
    kind: "improved",
    title: "Job health, per opening",
    body: "Every active job on the dashboard now shows its pipeline funnel, days open, weekly application velocity, and a health dot that flags stalled candidates or overdue reviews — replacing the plain job leaderboard. The dashboard also loads with a true-to-layout skeleton, so nothing jumps when your numbers arrive.",
  },
  {
    date: "2026-06-11",
    kind: "new",
    title: "Your dashboard is now live",
    body: "A realtime activity rail streams new applications, candidate replies, and teammate scorecards onto your dashboard the moment they happen — no refresh, across every practice you can see.",
  },
  {
    date: "2026-06-11",
    kind: "improved",
    title: "A leaner, faster dashboard",
    body: "The dashboard tightened up: a compact header, four at-a-glance hiring numbers with trend sparklines (awaiting review, apps this week, offers out, time-to-fill), and your action queue right below. Less scrolling, same depth.",
  },
  {
    date: "2026-06-11",
    kind: "improved",
    title: "Time-to-fill, front and center",
    body: "The dashboard now shows your median posting-to-hire time over the trailing 90 days — the number multi-location groups actually manage to — plus a hires sparkline. Location switcher applies, like everything else.",
  },
  {
    date: "2026-06-11",
    kind: "new",
    title: "Your dashboard now leads with Next Best Actions",
    body: "Overdue reviews, your strongest fit, stalled candidates, and inbound interest — unified into one ranked queue at the top of the dashboard. Keyboard users: j/k to move, Enter to open.",
  },
  {
    date: "2026-06-11",
    kind: "improved",
    title: "Help center caught up with everything new",
    body: "Seven new help articles — per-teammate permissions, confidential searches, Pipeline HQ, seat packs, the résumé builder, DSOFit, and the new apply flow — plus refreshed plan and team guides. The in-app AI assistant learned all of it too.",
  },
  {
    date: "2026-06-11",
    kind: "improved",
    title: "The ROI calculator now counts job-board fees too",
    body: "Hiring spend is two channels, not one — agency placement fees AND per-listing job-board costs. A side-by-side spend picture shows your stack against our one flat line, and the math finally works for groups that never touch agencies.",
  },
  {
    date: "2026-06-11",
    kind: "fixed",
    title: "Pricing page polish",
    body: "The comparison header now sticks cleanly while you scroll, and the ROI calculator models large-group volumes — up to 300 locations and 600 hires a year, counted across all locations.",
  },
  {
    date: "2026-06-11",
    kind: "improved",
    title: "A pricing comparison you can actually scan",
    body: "The tier matrix is now collapsible categories with at-a-glance coverage chips — open what you care about instead of scrolling sixty rows. Roadmap items stay honestly separated from what's live.",
  },
  {
    date: "2026-06-11",
    kind: "new",
    title: "Walk the back office from the homepage",
    body: "A film strip of the platform's machinery — pipeline, automations, offer approvals, permissions, analytics — so you can see what's behind a posting before you sign up.",
  },
  {
    date: "2026-06-11",
    kind: "new",
    title: "The founder story, signed",
    body: "A real letter on /about — who built this, why, and the six things we will never do. Several of them are enforced in the database, not just promised.",
  },
  {
    date: "2026-06-11",
    kind: "new",
    title: "The homepage shows the live marketplace",
    body: "Real open roles, real counts, straight from the database — with honesty floors so we never inflate. What you see is what's actually hiring.",
  },
  {
    date: "2026-06-11",
    kind: "new",
    title: "Try PracticeFit before signing up",
    body: "A three-tap sample on the candidates page shows how fit scoring works — clearly labeled as a sample. Your real score comes from your real answers.",
  },
  {
    date: "2026-06-11",
    kind: "new",
    title: "ROI calculator on pricing",
    body: "Drag your locations, hires, and agency spend — see what switching saves and which tier fits. It recommends down when your footprint is small.",
  },
  {
    date: "2026-06-11",
    kind: "new",
    title: "Security, switching, and comparison pages",
    body: "An honest security posture page (including what's still on the roadmap), a white-glove switching offer, and straight category comparisons against job boards and staffing agencies.",
  },
  {
    date: "2026-06-10",
    kind: "new",
    title: "Confidential searches",
    body: "Run a sensitive replacement search only specific teammates can see. Enforced at the database layer — not just hidden in the interface.",
  },
  {
    date: "2026-06-10",
    kind: "new",
    title: "Per-teammate permissions",
    body: "30+ actions individually grantable per person on Growth and up — who can send offers, edit postings, message candidates, see billing.",
  },
  {
    date: "2026-06-10",
    kind: "new",
    title: "Seat packs",
    body: "Need a few more seats without a tier jump? +3 seats for $99/mo on Growth and Scale, prorated automatically.",
  },
  {
    date: "2026-06-10",
    kind: "new",
    title: "Free résumé builder for candidates",
    body: "Six ATS-safe templates, built from your profile in minutes, exported as clean PDF. Free forever — no watermark games.",
  },
  {
    date: "2026-06-09",
    kind: "improved",
    title: "Smarter fit scoring for corporate roles",
    body: "DSOFit now scores corporate functions on their own dimensions instead of borrowing clinical ones — scores you can take at face value.",
  },
  {
    date: "2026-06-08",
    kind: "improved",
    title: "Faster everywhere",
    body: "Dashboard loads parallelized and 49 database indexes added. The app feels noticeably snappier on big pipelines.",
  },
  {
    date: "2026-06-05",
    kind: "improved",
    title: "Rebuilt application wizard",
    body: "Applying is now one clear question at a time — with résumé autofill so candidates never type what we can read.",
  },
  {
    date: "2026-06-04",
    kind: "new",
    title: "Weekly fit digest for candidates",
    body: "A Monday email with your top new high-fit roles — only when there's something genuinely worth seeing. No matches, no email.",
  },
  {
    date: "2026-06-04",
    kind: "new",
    title: "PracticeFit assessment — ranked priorities",
    body: "Rank what matters most to you and the matching tilts accordingly. About five minutes, role-aware, and your matches explain themselves.",
  },
  {
    date: "2026-06-03",
    kind: "new",
    title: "Offer approval chains",
    body: "Offers can require owner or admin approval before anything sends — with comp guardrails and a full audit trail.",
  },
];
