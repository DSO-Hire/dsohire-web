/**
 * /vs/staffing-agencies — #115 FOH-6: category comparison (generic, per
 * the locked de-naming rule). Deliberately honest about where agencies
 * genuinely win — that's the credibility that converts.
 */

import { SiteShell } from "@/components/marketing/site-shell";
import {
  VsCta,
  VsHero,
  VsHonestNote,
  VsTable,
  type VsRow,
} from "@/components/marketing/vs-layout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DSO Hire vs Staffing Agencies — Dental Recruiting Costs Compared",
  description:
    "Dental staffing agencies charge 15–25% of first-year salary per placement — $30,000–$50,000 for an associate dentist. DSO Hire is a flat-fee hiring platform with unlimited hires. An honest comparison, including when an agency is still the right call.",
};

const ROWS: VsRow[] = [
  {
    dimension: "Cost per hire",
    them: "15–25% of first-year salary, per placement. A $200K associate dentist costs $30,000–$50,000 in fees. Ten hires a year can clear $200K in fees alone.",
    us: "Flat monthly subscription, unlimited hires. The platform costs the same whether you hire two people this year or forty.",
  },
  {
    dimension: "Who owns the pipeline",
    them: "The agency. The candidate relationships, the pipeline, the market knowledge — it lives in their CRM, and you re-rent it for the next search.",
    us: "You. Every applicant, every scorecard, every silver-medalist lands in YOUR talent pool and compounds with every search you run.",
  },
  {
    dimension: "Visibility",
    them: "You see the three to five candidates the recruiter chooses to share, on their schedule.",
    us: "You see every applicant, scored by PracticeFit, the moment they apply — and your whole team works the same live pipeline.",
  },
  {
    dimension: "Routine roles",
    them: "Hygienists, assistants, and front-desk roles move slowly through agency pipelines — the economics push recruiters toward the big-fee searches.",
    us: "Routine roles are the platform's bread and butter: post across locations, screen with knockout questions, message and book interviews same-day.",
  },
  {
    dimension: "Volume economics",
    them: "Hiring more means paying more — there's no version of agency pricing where ten hires don't cost roughly ten fees.",
    us: "Hiring more means each hire costs less. The subscription is the whole bill.",
  },
];

export default function VsStaffingAgenciesPage() {
  return (
    <SiteShell ctaIntent="dso">
      <VsHero
        eyebrow="Compared · Staffing Agencies"
        title={
          <>
            Stop paying placement fees{" "}
            <em className="not-italic text-heritage-light">
              for your own hires.
            </em>
          </>
        }
        intro="Dental staffing agencies are effective — and priced like executive search, even for routine roles. If a meaningful share of your hires are hygienists, assistants, and office staff your team could source directly, the math stops working fast. Here's the honest comparison."
      />
      <VsTable themLabel="Staffing agencies" rows={ROWS} />
      <VsHonestNote
        title="Where an agency is still the right call"
        body="A genuinely hard executive search with a tight deadline, a market you don't know, or temp coverage for tomorrow morning — agencies and shift marketplaces earn their fees there, and we'd tell you to use one. DSO Hire exists so those are the ONLY hires you pay a premium for, instead of all of them. (Run your own numbers with the calculator on our pricing page.)"
      />
      <VsCta
        headline="Keep agencies for the searches that need them."
        sub="Move the other 90% of your hiring to a flat fee — applicants ranked by fit, your pipeline, your candidate relationships, compounding."
      />
    </SiteShell>
  );
}
