/**
 * /vs/staffing-agencies — #115 FOH-6: category comparison (generic, per
 * the locked de-naming rule). Deliberately honest about where agencies
 * genuinely win — that's the credibility that converts.
 */

import { SiteShell } from "@/components/marketing/site-shell";
import {
  VsCta,
  VsFaq,
  VsHero,
  VsHonestNote,
  VsTable,
  type VsRow,
} from "@/components/marketing/vs-layout";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd } from "@/components/seo/schema";
import Link from "next/link";
import { PRICING_TIERS } from "@/lib/stripe/prices";
import { researchPath, STAFFING_COSTS_2026 } from "@/lib/research/reports";
import type { FaqItem } from "@/components/marketing/faq-accordion";
import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/vs/staffing-agencies" },
  title: "DSO Hire vs Staffing Agencies: Dental Recruiting Costs Compared",
  description:
    "The one published dental agency rate card lists 20–30% of first-year salary per placement (about $34,000–$51,000 for a general dentist at the BLS median wage). DSO Hire is a flat-fee hiring platform with unlimited hires. An honest comparison, including when an agency is still the right call.",
};

const ROWS: VsRow[] = [
  {
    dimension: "Cost per hire",
    them: "Typically 20–30% of first-year salary, per placement. At the BLS median general-dentist wage ($170,950), that is about $34,000–$51,000 for one associate. Ten hygienist hires at that rate run about $196,000–$294,000 in fees.",
    us: "Flat monthly subscription, unlimited hires. The platform costs the same whether you hire two people this year or forty.",
  },
  {
    dimension: "Who owns the pipeline",
    them: "The agency. The candidate relationships, the pipeline, the market knowledge: it all lives in their CRM, and you re-rent it for the next search.",
    us: "You. Every applicant, every scorecard, every silver-medalist lands in YOUR talent pool and compounds with every search you run.",
  },
  {
    dimension: "Visibility",
    them: "You see the three to five candidates the recruiter chooses to share, on their schedule.",
    us: "You see every applicant, scored by PracticeFit, the moment they apply, and your whole team works the same live pipeline.",
  },
  {
    dimension: "Routine roles",
    them: "Hygienists, assistants, and front-desk roles move slowly through agency pipelines; the economics push recruiters toward the big-fee searches.",
    us: "Routine roles are the platform's bread and butter: post across locations, screen with knockout questions, message and book interviews same-day.",
  },
  {
    dimension: "Volume economics",
    them: "Hiring more means paying more. There's no version of agency pricing where ten hires don't cost roughly ten fees.",
    us: "Hiring more means each hire costs less. The subscription is the whole bill.",
  },
];

const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;

// Every answer restates a fact already on this page (table rows, honest
// note) or in prices.ts. Rendered visibly AND as FAQPage JSON-LD.
const FAQ_ITEMS: FaqItem[] = [
  {
    q: "How much do dental staffing agencies charge?",
    a: "Few agencies publish their fees. The one published dental rate card we found lists 20 to 30 percent of first-year base salary, per placement. At the BLS median general-dentist wage of $170,950 (May 2025), that is about $34,000 to $51,000 for a single associate hire.",
  },
  {
    q: "How is DSO Hire priced instead?",
    a: `A flat monthly subscription with unlimited hires and no placement fees. Plans run from ${fmt(PRICING_TIERS.solo.monthlyPrice)}/mo (${PRICING_TIERS.solo.name}) to ${fmt(PRICING_TIERS.enterprise.monthlyPrice)}/mo (${PRICING_TIERS.enterprise.name}), and the platform costs the same whether you hire two people this year or forty.`,
  },
  {
    q: "Who owns the candidate pipeline?",
    a: "You do. Every applicant, every scorecard, and every runner-up lands in your own talent pool, instead of living in an agency's CRM that you re-rent for the next search.",
  },
  {
    q: "Does DSO Hire work for routine roles like hygienists and assistants?",
    a: "Yes, that is the platform's bread and butter. Post across locations, screen with knockout questions, and message candidates and book interviews the same day.",
  },
  {
    q: "When is a staffing agency still the right call?",
    a: "A genuinely hard executive search with a tight deadline, a market you don't know, or temp coverage for tomorrow morning. Agencies and shift marketplaces earn their fees there.",
  },
];

export default function VsStaffingAgenciesPage() {
  return (
    <SiteShell ctaIntent="dso">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "DSO Hire vs. staffing agencies", path: "/vs/staffing-agencies" },
        ])}
      />
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
        intro="Dental staffing agencies are effective. They're also priced like executive search, even for routine roles. If a meaningful share of your hires are hygienists, assistants, and office staff your team could source directly, the math stops working fast. Here's the honest comparison."
      />
      <VsTable themLabel="Staffing agencies" rows={ROWS} />
      <VsHonestNote
        title="Where an agency is still the right call"
        body="A genuinely hard executive search with a tight deadline, a market you don't know, or temp coverage for tomorrow morning: agencies and shift marketplaces earn their fees there, and we'd tell you to use one. DSO Hire exists so those are the ONLY hires you pay a premium for, instead of all of them. (Run your own numbers with the calculator on our pricing page.)"
      />
      <VsFaq items={FAQ_ITEMS} />
      <section className="px-6 sm:px-14 pb-20 max-w-[1240px] mx-auto">
        <p className="max-w-[860px] text-xs text-slate-meta leading-[1.65]">
          <span className="font-bold text-slate-body">Sources:</span> fee range from
          Frontline Source Group&rsquo;s published rate card (direct hire, 20 to 30 percent of
          first-year base salary); wages from BLS Occupational Employment and Wage Statistics,
          May 2025 national medians (general dentist $170,950; dental hygienist $98,100). Dollar
          amounts are our arithmetic on those inputs. Full sourcing in{" "}
          <Link
            href={researchPath(STAFFING_COSTS_2026.slug)}
            className="font-semibold text-heritage-deep underline underline-offset-2 hover:text-ink"
          >
            {STAFFING_COSTS_2026.shortTitle}
          </Link>
          .
        </p>
      </section>
      <VsCta
        headline="Keep agencies for the searches that need them."
        sub="Move the other 90% of your hiring to a flat fee: applicants ranked by fit, your pipeline, your candidate relationships, compounding."
      />
    </SiteShell>
  );
}
