/**
 * /llms.txt — plain-text site map for AI crawlers and answer engines
 * (launch SEO spec, Phase 4). llms.txt convention: a short markdown-flavored
 * description of what the site is, then the key URLs with one-line
 * descriptions, so LLM-based engines can cite the right pages.
 *
 * Every claim here must stay code-true (house rule #1) and pricing must match
 * src/lib/stripe/prices.ts (house rule #2). Fit scoring is described
 * human-in-the-loop — never automatic rejection (house rule #3).
 */

import {
  PRICING_TIERS,
  PRICING_TIER_ORDER,
} from "@/lib/stripe/prices";
import { DEMO_URL } from "@/lib/marketing/demo";

const SITE = "https://dsohire.com";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** One line per tier, generated from prices.ts so it can never drift. */
const PRICE_LINES = PRICING_TIER_ORDER.map((id) => {
  const t = PRICING_TIERS[id];
  const openings =
    t.maxActiveJobs === null ? "unlimited active openings" : `up to ${t.maxActiveJobs} active openings`;
  const seats = t.maxSeats === null ? "unlimited admin seats" : `${t.maxSeats} admin seats`;
  return `- ${t.name}: ${usd(t.monthlyPrice)}/mo billed monthly, or ${usd(t.annualMonthlyEquivalent)}/mo billed annually (${usd(t.annualPrice)}/yr). ${openings[0].toUpperCase()}${openings.slice(1)}, ${seats}.`;
}).join("\n");

const BODY = `# DSO Hire

> DSO Hire (${SITE}) is a dental-only hiring platform connecting multi-location dental groups (DSOs) directly with dental professionals: dentists, specialists, hygienists, assistants, front-office, and corporate roles. Employers pay a flat monthly subscription (no per-listing fees, no placement fees); candidates use it free. Its PracticeFit engine scores two-sided fit: each practice profiles how it actually operates, candidates profile their working preferences, and every application arrives with a fit score a human uses to prioritize. It never rejects anyone automatically. US only.

Status: Live since July 2026.

## Pricing (USD, flat monthly subscription per dental group)

${PRICE_LINES}
- No per-listing fees, no placement fees, unlimited hires on every plan. Candidates always use DSO Hire free.

## Key pages

- [Home](${SITE}/): What DSO Hire is, for dental groups and dental professionals.
- [For dental groups](${SITE}/for-dental-groups): The employer product. Multi-location pipelines, dental-specific screening, fit scoring, offers, analytics.
- [For dental professionals](${SITE}/for-candidates): Free candidate side. Dental-only jobs, privacy controls, direct applications.
- [PracticeFit](${SITE}/practicefit): How the two-sided fit engine works (PracticeFit for practices, DSOFit for corporate roles).
- [Pricing](${SITE}/pricing): Plan details and comparison. No per-listing or placement fees.
- [Live product demo, no sign-up](${DEMO_URL}): A working dental group account with sample data, read-only.
- [Hiring cost calculator](${SITE}/calculator): Compare your current agency or job-board spend with a flat subscription.
- [Browse jobs](${SITE}/jobs): Live dental job listings across the platform.
- [Salary data](${SITE}/salary): Dental pay benchmarks by role, state, and metro (BLS OEWS).
- [FAQ](${SITE}/faq): 50+ answers on pricing, posting, applying, fit scoring, privacy, and support.
- [Dental hiring report](${SITE}/dental-hiring-report): Anonymized compensation bands, role mix, and hiring velocity from the DSO Hire platform.
- [Security](${SITE}/security): How candidate and practice data is protected: row-level security, encryption in transit and at rest, audit logging, and the compliance roadmap.
- [Changelog](${SITE}/changelog): Every user-visible improvement, as it ships.

## Guides

- [How DSOs hire across multiple locations](${SITE}/guides/dso-multi-location-hiring): Centralized pipelines, per-location visibility, licensing across states, where temp marketplaces fall short for permanent roles.
- [How to reduce time-to-hire at a dental practice](${SITE}/guides/reduce-time-to-hire-dental-practice): The self-inflicted delays (response speed, screening order, decision bottlenecks) and how to fix them.
- [Screening dental candidates for culture fit](${SITE}/guides/dental-culture-fit-screening): Making fit measurable with office profiles, structured questions, and two-sided fit scoring.

## Research

- [What dental staffing agencies actually charge (2026)](${SITE}/research/dental-staffing-agency-costs-2026): Placement fees (published dental rate card: 20 to 30 percent of first-year salary), fee per role at BLS median wages, guarantee periods, temp app fees, job board costs. 39 cited sources.
- [The dental hiring shortage, by the numbers (2026)](${SITE}/research/dental-hiring-shortage-2026): ADA HPI recruiting difficulty and fill rates, BLS 2025 to 2035 projections, HRSA shortage data, DSO affiliation trends, wages vs inflation. 24 cited sources.

## Comparisons

- [DSO Hire vs. job boards](${SITE}/vs/job-boards): Full hiring system vs. per-listing job boards.
- [DSO Hire vs. staffing agencies](${SITE}/vs/staffing-agencies): Flat subscription vs. placement fees; permanent hiring vs. temp coverage.
- [DSO Hire vs. DentalPost](${SITE}/vs/dentalpost): Published pricing, multi-location model, and fit scoring compared, sourced from each company's pages.
- [DSO Hire vs. Cloud Dentistry](${SITE}/vs/cloud-dentistry): Permanent hiring platform vs. temp and permanent staffing marketplace, sourced.
- [Hiring software for dental groups: the 2026 landscape](${SITE}/vs/dental-hiring-software): Dental job boards, staffing marketplaces, general job boards, ATSs and agencies by business model.
`;

export function GET() {
  return new Response(BODY, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
