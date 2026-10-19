/**
 * /vs/cloud-dentistry: DSO Hire vs Cloud Dentistry (named, sourced
 * comparison).
 *
 * Every Cloud Dentistry fact is from Cloud Dentistry's own pages as fetched
 * on 2026-10-19 (docs/research/dso-hiring-software-landscape-2026.md §2.3,
 * §3.2). DSO Hire prices come from prices.ts (monthly list).
 *
 * Draft gate: robots come from researchRobots() (src/lib/research/config.ts),
 * so this page is noindex,nofollow until RESEARCH_PUBLISHED flips. Not in
 * sitemap.ts, llms.txt, nav, or cross-linked from existing pages yet.
 */

import type { Metadata } from "next";
import { SiteShell } from "@/components/marketing/site-shell";
import { VsCta, VsFaq, VsHero } from "@/components/marketing/vs-layout";
import {
  DSOHIRE_FROM,
  DSOHIRE_PRICE_RANGE,
  DSOHIRE_SOURCES,
  KIND_VENDOR,
  VS_ACCESSED,
  VsBlock,
  VsSection,
  VsSources,
} from "@/components/marketing/vs-sourced";
import { Cite } from "@/components/research/cite";
import { DataTable } from "@/components/research/data-table";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd } from "@/components/seo/schema";
import type { FaqItem } from "@/components/marketing/faq-accordion";
import { researchRobots } from "@/lib/research/config";
import type { ResearchSource } from "@/lib/research/reports";

const PATH = "/vs/cloud-dentistry";

export const metadata: Metadata = {
  alternates: { canonical: PATH },
  robots: researchRobots(),
  title: "DSO Hire vs Cloud Dentistry: Permanent Hiring and Temp Staffing Compared (2026)",
  description: `A sourced, side-by-side look at DSO Hire and Cloud Dentistry: pricing, temp coverage, permanent hiring, multi-location tools, and contract terms, as each company publishes them (checked ${VS_ACCESSED}).`,
};

/* Numbered to match <Cite n /> below. */
const SOURCES: ResearchSource[] = [
  /* 1 */ DSOHIRE_SOURCES.pricing,
  /* 2 */ DSOHIRE_SOURCES.forGroups,
  /* 3 */ DSOHIRE_SOURCES.llms,
  /* 4 */ { label: "Cloud Dentistry, home page", url: "https://go.clouddentistry.com/", kind: KIND_VENDOR },
  /* 5 */ { label: "Cloud Dentistry, DSO Solutions", url: "https://go.clouddentistry.com/dso/", kind: KIND_VENDOR },
  /* 6 */ {
    label: "Cloud Dentistry FAQ, \"Does Cloud Dentistry charge placement fees if I hire someone full or part-time?\"",
    url: "https://faq.clouddentistry.com/en/articles/9806109-does-cloud-dentistry-charge-placement-fees-if-i-hire-someone-full-or-part-time",
    kind: KIND_VENDOR,
    date: "published April 2, 2026",
  },
  /* 7 */ {
    label: "Cloud Dentistry FAQ, \"What are the benefits of a Cloud Dentistry subscription?\"",
    url: "https://faq.clouddentistry.com/en/articles/9797412-what-are-the-benefits-of-a-cloud-dentistry-subscription",
    kind: KIND_VENDOR,
  },
  /* 8 */ {
    label: "Cloud Dentistry blog, \"Dental Staffing Agency Costs Explained\"",
    url: "https://go.clouddentistry.com/2026/08/03/dental-staffing-agency-costs-explained-subscription-vs-markup-pricing/",
    kind: KIND_VENDOR,
    date: "published August 3, 2026",
  },
  /* 9 */ { label: "Cloud Dentistry, Value Calculators", url: "https://go.clouddentistry.com/offices/value-calculators/", kind: KIND_VENDOR },
  /* 10 */ {
    label: "Cloud Dentistry FAQ, \"How does pricing work for Cloud Direct Pay (CDP)?\"",
    url: "https://faq.clouddentistry.com/en/articles/9800568-how-does-pricing-work-for-cloud-direct-pay-cdp",
    kind: KIND_VENDOR,
  },
];

const ROWS: React.ReactNode[][] = [
  [
    "Model",
    <>Permanent-hire platform with built-in applicant tracking, dental only<Cite n={3} /></>,
    <>Dental staffing marketplace to &ldquo;hire verified and background checked dental talent for permanent, part-time, or temporary work&rdquo;<Cite n={4} /></>,
  ],
  [
    "Pricing",
    <>{DSOHIRE_PRICE_RANGE} per group, published, with no per-listing or placement fees<Cite n={1} /></>,
    <>Subscription priced by office location and term; &ldquo;$97/monthly&rdquo; for a 12-month plan in popular markets, plus a $20 completion fee per booking in certain areas<Cite n={[7, 8, 9]} />. Optional Cloud Direct Pay: $20 to $40 per booking<Cite n={10} />. DSO pricing on request<Cite n={5} /></>,
  ],
  [
    "Multi-location",
    <>Post one role to many practices in a single flow, on every tier; per-location dashboards from the Scale tier<Cite n={1} /></>,
    <>DSO dashboards, a &ldquo;billing summary for all offices,&rdquo; and dedicated DSO account managers<Cite n={5} /></>,
  ],
  [
    "Permanent hiring",
    <>Yes<Cite n={3} /></>,
    <>Yes; no permanent placement fees through its self-service platform<Cite n={6} /></>,
  ],
  [
    "Temp coverage",
    <>No. DSO Hire does not book temp shifts<Cite n={3} /></>,
    <>Yes: on-demand temp booking, plus an internal float pool it says is free for DSOs<Cite n={[5, 7]} /></>,
  ],
  [
    "Fit scoring",
    <>PracticeFit, a two-sided fit model built for dentistry, on every tier; never rejects anyone automatically<Cite n={[1, 2, 3]} /></>,
    <>Professional ratings (&ldquo;95% of our professionals are rated 4+ stars&rdquo;)<Cite n={5} />; we found no fit score described on its pages</>,
  ],
  [
    "Candidate cost",
    <>Free for candidates<Cite n={3} /></>,
    <>&ldquo;Free to sign up and explore for both dental professionals and offices&rdquo;<Cite n={4} /></>,
  ],
  [
    "Contract",
    <>Monthly or annual; cancel or change tiers anytime<Cite n={1} /></>,
    <>Subscription terms of 1, 6, or 12 months<Cite n={7} /></>,
  ],
];

const FAQ_ITEMS: FaqItem[] = [
  {
    q: "Is Cloud Dentistry a staffing agency?",
    a: "It describes itself as a marketplace for dental professionals. It says it does not charge permanent placement fees through its self-service platform, and its DSO page lists temp-to-full-time hires with no markups or buy-outs.",
  },
  {
    q: "What does Cloud Dentistry cost?",
    a: `Subscription pricing depends on office location and term (1, 6, or 12 months). As of ${VS_ACCESSED}, its calculator cites $97/month for a 12-month plan in popular markets, not including a $20 completion fee per booking in certain areas. Pricing for DSOs is by conversation with its DSO team.`,
  },
  {
    q: "Can I use both?",
    a: "Yes. The models are complementary: Cloud Dentistry for temp coverage and float pools, DSO Hire for structured permanent hiring across locations.",
  },
  {
    q: "Which handles multi-location better?",
    a: "Both offer multi-location tools. Cloud Dentistry focuses on staffing dashboards, billing across offices, and float pools. DSO Hire focuses on posting one role to many practices and tracking each applicant through a pipeline.",
  },
  {
    q: "Do dental professionals pay?",
    a: "Neither charges dental professionals to sign up, according to each company's site.",
  },
];

export default function VsCloudDentistryPage() {
  return (
    <SiteShell ctaIntent="dso">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "DSO Hire vs Cloud Dentistry", path: PATH },
        ])}
      />
      <VsHero
        eyebrow="Compared · Cloud Dentistry"
        title={
          <>
            DSO Hire vs Cloud Dentistry.{" "}
            <em className="not-italic text-heritage-light">
              Temp coverage and permanent hiring are different jobs.
            </em>
          </>
        }
        intro="Cloud Dentistry is a dental staffing marketplace, operating since 2014, where offices book temp shifts and can also hire part-time and permanent staff. DSO Hire is a dental-only platform for permanent hiring across multi-location groups, with one flat monthly subscription and built-in applicant tracking. It does not book temps. Here is how they compare, using only what each company publishes."
      />

      <VsBlock>
        <DataTable
          caption={`DSO Hire and Cloud Dentistry compared, as published on ${VS_ACCESSED}`}
          columns={[{ header: "" }, { header: "DSO Hire" }, { header: "Cloud Dentistry" }]}
          rows={ROWS}
          minWidth="44rem"
          footnote={`DSO Hire prices are monthly list prices from its pricing page (annual billing is about 10% less). Competitor details are quoted from the competitor's own pages, checked ${VS_ACCESSED}. Volume and rating figures are the vendor's own and unaudited.`}
        />
      </VsBlock>

      <VsSection id="when-cloud-dentistry" eyebrow="Honest take" title="When Cloud Dentistry is the better choice">
        <ul>
          <li>
            <strong>You need same-week or same-day temp coverage for call-offs.</strong>{" "}DSO
            Hire does not book temps.<Cite n={3} />{" "}Cloud Dentistry reports &ldquo;&lt;10
            minutes for booking confirmation.&rdquo;<Cite n={5} />
          </li>
          <li>
            <strong>You want a float pool to share your own staff across offices.</strong>{" "}
            Cloud Dentistry says its internal float pool is free for DSOs.<Cite n={5} />
          </li>
          <li>
            <strong>You prefer to try before you hire.</strong>{" "}Cloud Dentistry reports that
            6 out of 10 offices made a permanent hire after a temp booking.<Cite n={4} />
          </li>
          <li>
            <strong>Budget is the deciding factor for a single office.</strong>{" "}Its published
            price point ($97/mo on a 12-month plan in popular markets) is below our cheapest
            plan ({DSOHIRE_FROM}).<Cite n={[9, 1]} />
          </li>
        </ul>
      </VsSection>

      <VsSection id="where-differs" eyebrow="Where DSO Hire differs" title="What DSO Hire does differently">
        <ul>
          <li>
            <strong>One published flat fee for the whole group.</strong>{" "}DSO Hire publishes
            every tier: {DSOHIRE_PRICE_RANGE}, capped by active openings and admin seats, not
            by location, with no per-booking fees.<Cite n={1} />{" "}Cloud Dentistry&rsquo;s
            subscription price varies by office location and term, with per-booking fees in
            some areas, and its DSO pricing is by conversation.<Cite n={[5, 7, 9]} />
          </li>
          <li>
            <strong>A two-sided fit model built only for dentistry.</strong>{" "}Each practice
            profiles how it actually operates, candidates profile their working preferences,
            and every application arrives with a fit score that a person uses to prioritize.
            It never rejects anyone automatically.<Cite n={[2, 3]} />
          </li>
        </ul>
        <p>
          To be candid: no placement fees is not a difference here. Cloud Dentistry also says
          it does not charge permanent placement fees through its self-service platform.
          <Cite n={6} />{" "}And if temp coverage is the need, Cloud Dentistry offers it and DSO
          Hire does not.
        </p>
      </VsSection>

      <VsFaq items={FAQ_ITEMS} />
      <VsSources sources={SOURCES} />
      <VsCta
        headline="Filling permanent roles across locations?"
        sub="See DSO Hire's published prices, or move your current postings over for free."
      />
    </SiteShell>
  );
}
