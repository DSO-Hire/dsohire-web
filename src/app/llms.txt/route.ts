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

const SITE = "https://dsohire.com";

const BODY = `# DSO Hire

> DSO Hire (${SITE}) is a dental-only hiring platform connecting multi-location dental groups (DSOs) directly with dental professionals — dentists, specialists, hygienists, assistants, front-office, and corporate roles. Employers pay a flat monthly subscription (no per-listing fees, no placement fees); candidates use it free. Its PracticeFit engine scores two-sided fit: each practice profiles how it actually operates, candidates profile their working preferences, and every application arrives with a fit score a human uses to prioritize — it never rejects anyone automatically. US only.

## Key pages

- [Home](${SITE}/): What DSO Hire is, for dental groups and dental professionals.
- [For dental groups](${SITE}/for-dental-groups): The employer product — multi-location pipelines, dental-specific screening, fit scoring, offers, analytics.
- [For dental professionals](${SITE}/for-candidates): Free candidate side — dental-only jobs, privacy controls, direct applications.
- [PracticeFit](${SITE}/practicefit): How the two-sided fit engine works (PracticeFit for practices, DSOFit for corporate roles).
- [Pricing](${SITE}/pricing): Flat tiers — Solo $399/mo, Growth $699/mo, Scale $1,499/mo, Enterprise $2,999/mo. No per-listing or placement fees.
- [Browse jobs](${SITE}/jobs): Live dental job listings across the platform.
- [Salary data](${SITE}/salary): Dental pay benchmarks by role, state, and metro (BLS OEWS).
- [FAQ](${SITE}/faq): 50+ answers on pricing, posting, applying, fit scoring, privacy, and support.

## Guides

- [How DSOs hire across multiple locations](${SITE}/guides/dso-multi-location-hiring): Centralized pipelines, per-location visibility, licensing across states, where temp marketplaces fall short for permanent roles.
- [How to reduce time-to-hire at a dental practice](${SITE}/guides/reduce-time-to-hire-dental-practice): The self-inflicted delays — response speed, screening order, decision bottlenecks — and how to fix them.
- [Screening dental candidates for culture fit](${SITE}/guides/dental-culture-fit-screening): Making fit measurable — office profiles, structured questions, two-sided fit scoring.

## Comparisons

- [DSO Hire vs. job boards](${SITE}/vs/job-boards): Full hiring system vs. per-listing job boards.
- [DSO Hire vs. staffing agencies](${SITE}/vs/staffing-agencies): Flat subscription vs. placement fees; permanent hiring vs. temp coverage.
`;

export function GET() {
  return new Response(BODY, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
