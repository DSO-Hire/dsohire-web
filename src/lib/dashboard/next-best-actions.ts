/**
 * Next Best Actions — BOH Remodel Lane 2a (Day 32, Model 01).
 *
 * Pure ranking function that unifies the dashboard's scattered attention
 * signals (stuck SLA breaches, stale mid-pipeline candidates, today's top
 * fits, inbound mutual interest) into ONE ordered queue of actionable
 * cards. The dashboard stops reporting and starts directing.
 *
 * Deliberately consumes data the page ALREADY loads — zero new queries
 * (foundation-protection: this lane is UI-layer only). Pure module, no
 * server imports, trivially unit-testable.
 *
 * Ranking philosophy (impact × urgency, then variety):
 *   1. SLA-breached new applications (max 2) — speed-to-review is the
 *      single highest-leverage hiring behavior; these are already late.
 *   2. The strongest unactioned fit (1) — high-fit candidates go cold
 *      fastest; mutual interest upgrades the copy.
 *   3. Stale mid-pipeline cluster (1 summary) — bulk-decision nudge.
 *   4. Inbound interest (1 summary) — warm leads worth a personal note.
 * Capped at MAX_ITEMS so the queue is a queue, not another list.
 */

export type NbaTone = "hot" | "fit" | "std";

export interface NbaAction {
  label: string;
  href: string;
}

export interface NbaItem {
  id: string;
  tone: NbaTone;
  title: string;
  why: string;
  primary: NbaAction;
  secondary?: NbaAction;
}

export interface NbaInput {
  stuck: Array<{
    applicationId: string;
    candidateName: string;
    jobTitle: string;
    daysWaiting: number;
  }>;
  stuckTotal: number;
  slaDays: number;
  stale: Array<{
    applicationId: string;
    candidateName: string;
    jobTitle: string;
    daysWaiting: number;
    stageLabel: string;
  }>;
  staleTotal: number;
  staleDays: number;
  /** Anonymity-safe display fields — mask BEFORE passing in. */
  topFit: {
    name: string;
    jobTitle: string;
    score: number;
    interested: boolean;
    /** Deep-link target — the candidate's fit detail, mirroring Today's Top Fits. */
    candidateId: string;
  } | null;
  interestedCount: number;
}

const MAX_ITEMS = 5;

export function buildNextBestActions(input: NbaInput): NbaItem[] {
  const items: NbaItem[] = [];

  // 1 — SLA breaches (the existing StuckAlert's data, re-voiced per card).
  for (const s of input.stuck.slice(0, 2)) {
    items.push({
      id: `stuck-${s.applicationId}`,
      tone: "hot",
      title: `${s.candidateName} has waited ${s.daysWaiting} days unreviewed`,
      why: `${s.jobTitle} — waiting past your ${input.slaDays}-day response goal. Same-day responders advance candidates at the highest rate.`,
      primary: {
        label: "Review now",
        href: `/employer/applications/${s.applicationId}`,
      },
      secondary: {
        label: `All overdue (${input.stuckTotal})`,
        href: "/employer/applications?stuck=1",
      },
    });
  }

  // 2 — strongest fit on the board today.
  if (input.topFit) {
    const f = input.topFit;
    items.push({
      id: "topfit",
      tone: "fit",
      title: f.interested
        ? `${f.name} (fit ${f.score}) saved your job — mutual interest`
        : `${f.name} is a ${f.score}-fit for ${f.jobTitle}`,
      why: f.interested
        ? `${f.jobTitle} — they raised a hand AND they score. Your warmest lead today.`
        : "Your strongest match on the board right now — high-fit candidates go cold the fastest.",
      primary: {
        label: "See the fit",
        href: `/employer/candidates/${f.candidateId}`,
      },
    });
  }

  // 3 — stale mid-pipeline cluster (one summary card, not N nags).
  if (input.staleTotal > 0) {
    const oldest = input.stale[0];
    items.push({
      id: "stale",
      tone: "std",
      title: `${input.staleTotal} candidate${input.staleTotal === 1 ? "" : "s"} stalled mid-pipeline (${input.staleDays}+ days)`,
      why: oldest
        ? `Oldest: ${oldest.candidateName} — ${oldest.daysWaiting} days in ${oldest.stageLabel} on ${oldest.jobTitle}. Likely needs a bulk decision pass.`
        : "Likely needs a bulk decision pass.",
      primary: {
        label: "Open stale list",
        href: "/employer/applications?stale=1",
      },
    });
  }

  // 4 — inbound interest (warm leads).
  if (input.interestedCount > 0) {
    items.push({
      id: "interested",
      tone: "fit",
      title: `${input.interestedCount} candidate${input.interestedCount === 1 ? "" : "s"} saved your jobs recently`,
      why: "Mutual-interest signals — a short personal note converts these at the highest rate of any outreach.",
      primary: { label: "See who", href: "#interested-in-you" },
    });
  }

  return items.slice(0, MAX_ITEMS);
}
