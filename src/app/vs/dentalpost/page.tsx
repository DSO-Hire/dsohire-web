/**
 * /vs/dentalpost: DSO Hire vs DentalPost (named, sourced comparison).
 *
 * Every DentalPost fact is from DentalPost's own pages as fetched on
 * 2026-10-19 (docs/research/dso-hiring-software-landscape-2026.md §2.2,
 * §3.1). DSO Hire prices come from prices.ts (monthly list).
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
  DSOHIRE_OPENINGS_LADDER,
  DSOHIRE_PRICE_RANGE,
  DSOHIRE_SOLO_NAME,
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

const PATH = "/vs/dentalpost";

export const metadata: Metadata = {
  alternates: { canonical: PATH },
  robots: researchRobots(),
  title: "DSO Hire vs DentalPost: Dental Hiring Compared (2026)",
  description: `A sourced, side-by-side look at DSO Hire and DentalPost: pricing, multi-location posting, candidate scoring, temp roles, and contracts, as each company publishes them (checked ${VS_ACCESSED}).`,
};

/* Numbered to match <Cite n /> below. */
const SOURCES: ResearchSource[] = [
  /* 1 */ DSOHIRE_SOURCES.pricing,
  /* 2 */ DSOHIRE_SOURCES.forGroups,
  /* 3 */ DSOHIRE_SOURCES.llms,
  /* 4 */ DSOHIRE_SOURCES.jobBoards,
  /* 5 */ { label: "DentalPost, Dental Hiring (pricing and FAQ)", url: "https://www.dentalpost.net/dental-hiring/", kind: KIND_VENDOR },
  /* 6 */ { label: "DentalPost, Corporate Recruiting", url: "https://info.dentalpost.net/corporate-recruiting/", kind: KIND_VENDOR },
  /* 7 */ { label: "DentalPost, About Us", url: "https://www.dentalpost.net/about-us/", kind: KIND_VENDOR },
];

const ROWS: React.ReactNode[][] = [
  [
    "Model",
    <>Dental-only hiring platform with built-in applicant tracking<Cite n={3} /></>,
    <>Dental job board; describes itself as the industry&rsquo;s &ldquo;largest online and mobile job board&rdquo;<Cite n={5} /></>,
  ],
  [
    "Pricing",
    <>{DSOHIRE_PRICE_RANGE} per group, published, with {DSOHIRE_OPENINGS_LADDER} active openings by tier<Cite n={1} /></>,
    <>$259/mo Job Posting Subscription with &ldquo;one active job post at a time&rdquo;; Resume Search add-on $149/mo; DSO volume packages on request<Cite n={[5, 6]} /></>,
  ],
  [
    "Multi-location",
    <>Post one role to many practices in a single flow, on every tier<Cite n={[1, 2]} /></>,
    <>Corporate offering to &ldquo;post and manage openings across all your locations in one place,&rdquo; priced on request<Cite n={6} /></>,
  ],
  [
    "Permanent hiring",
    <>Yes<Cite n={3} /></>,
    <>Yes: full-time and part-time listings<Cite n={5} /></>,
  ],
  [
    "Temp coverage",
    <>No. DSO Hire does not book temp shifts<Cite n={3} /></>,
    <>Temp roles can be posted as job listings<Cite n={5} />; we found no shift-booking product on its pages</>,
  ],
  [
    "Fit scoring",
    <>PracticeFit, a two-sided fit model built for dentistry, on every tier; never rejects anyone automatically<Cite n={[1, 2, 3]} /></>,
    <>&ldquo;Candidate match scores&rdquo; using assessment data (DISC, Emotional Intelligence, Core Values, Skills, and more)<Cite n={5} /></>,
  ],
  [
    "Candidate cost",
    <>Free for candidates<Cite n={3} /></>,
    <>No candidate fee stated on the pages we read; &ldquo;Assessments are always FREE for job seekers&rdquo;<Cite n={7} /></>,
  ],
  [
    "Contract",
    <>Monthly or annual; cancel or change tiers anytime<Cite n={1} /></>,
    <>Auto-renews monthly; cancel anytime<Cite n={5} /></>,
  ],
];

const FAQ_ITEMS: FaqItem[] = [
  {
    q: "How much does DentalPost cost?",
    a: `As of ${VS_ACCESSED}, DentalPost's site lists a $259/month Job Posting Subscription with one active job post at a time, plus an optional $149/month Resume Search add-on. Packages for multi-location groups are quoted on request.`,
  },
  {
    q: "Can I post for several locations on DentalPost?",
    a: `Yes. Its corporate recruiting page offers multi-location posting for DSOs and multi-location groups, with pricing through volume packages on request. DSO Hire includes multi-location posting on every tier, starting at ${DSOHIRE_FROM} (${DSOHIRE_SOLO_NAME}, monthly billing).`,
  },
  {
    q: "Do both score candidates?",
    a: "Yes. DentalPost lists candidate match scores based on assessment data. DSO Hire's PracticeFit scores two-sided fit between how each practice operates and the candidate's working preferences, and it never rejects anyone automatically.",
  },
  {
    q: "Are there long-term contracts?",
    a: "Neither requires one. DentalPost says its subscription auto-renews monthly and can be canceled anytime. DSO Hire plans are monthly or annual, and you can cancel or change tiers anytime.",
  },
  {
    q: "Do candidates pay?",
    a: "DSO Hire is free for candidates. DentalPost says its assessments are always free for job seekers, and we found no candidate fee on its pages.",
  },
];

export default function VsDentalPostPage() {
  return (
    <SiteShell ctaIntent="dso">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "DSO Hire vs DentalPost", path: PATH },
        ])}
      />
      <VsHero
        eyebrow="Compared · DentalPost"
        title={
          <>
            DSO Hire vs DentalPost.{" "}
            <em className="not-italic text-heritage-light">
              Two dental-only tools, priced differently.
            </em>
          </>
        }
        intro="DentalPost is a dental job board that sells a monthly subscription per active post, with match scores and optional resume search. DSO Hire is a dental-only hiring platform for multi-location groups: one flat monthly subscription per group, built-in applicant tracking, and a fit score on every application. Here is how they compare, using only what each company publishes."
      />

      <VsBlock>
        <DataTable
          caption={`DSO Hire and DentalPost compared, as published on ${VS_ACCESSED}`}
          columns={[{ header: "" }, { header: "DSO Hire" }, { header: "DentalPost" }]}
          rows={ROWS}
          minWidth="44rem"
          footnote={`DSO Hire prices are monthly list prices from its pricing page (annual billing is about 10% less). Competitor details are quoted from the competitor's own pages, checked ${VS_ACCESSED}.`}
        />
      </VsBlock>

      <VsSection id="when-dentalpost" eyebrow="Honest take" title="When DentalPost is the better choice">
        <ul>
          <li>
            <strong>You run one practice or hire one role at a time.</strong>{" "}$259/mo for a
            single active post costs less than our cheapest plan ({DSOHIRE_FROM}).
            <Cite n={[5, 1]} />{" "}Our own job-boards page says it plainly: &ldquo;a one-off
            listing is cheaper than any subscription, ours included.&rdquo;
            <Cite n={4} />
          </li>
          <li>
            <strong>You want to search resumes proactively today.</strong>{" "}DentalPost&rsquo;s
            Resume Search add-on ($149/mo) lets you search its database of public resumes,
            which it puts at 200K+.<Cite n={5} />
          </li>
          <li>
            <strong>You already have an ATS and mainly need dental reach.</strong>{" "}DentalPost
            advertises ATS integration with &ldquo;220+ systems.&rdquo;<Cite n={6} />
          </li>
          <li>
            <strong>You use personality and culture assessments in screening.</strong>{" "}
            DentalPost builds its match scores from DISC, Emotional Intelligence, Core Values,
            Skills, and Workplace Culture assessments.<Cite n={5} />
          </li>
        </ul>
      </VsSection>

      <VsSection id="where-differs" eyebrow="Where DSO Hire differs" title="What DSO Hire does differently">
        <ul>
          <li>
            <strong>One published flat fee for the whole group.</strong>{" "}DSO Hire publishes
            every tier: {DSOHIRE_PRICE_RANGE}, capped by active openings and admin seats, not
            by location, with no per-listing or placement fees.<Cite n={1} />{" "}DentalPost
            publishes its single-post price; its packages for DSOs and multi-location groups
            are quoted on request.<Cite n={[5, 6]} />
          </li>
          <li>
            <strong>A two-sided fit model built only for dentistry.</strong>{" "}Each practice
            profiles how it actually operates, candidates profile their working preferences,
            and every application arrives with a fit score that a person uses to prioritize.
            It never rejects anyone automatically.<Cite n={[2, 3]} />
          </li>
        </ul>
        <p>
          To be candid: DentalPost also scores candidates (&ldquo;candidate match
          scores&rdquo;), and it also includes tools to evaluate, message, and schedule
          interviews.<Cite n={5} />{" "}The difference is in how the score is built and how
          pricing scales across locations, not in whether a score exists.
        </p>
      </VsSection>

      <VsFaq items={FAQ_ITEMS} />
      <VsSources sources={SOURCES} />
      <VsCta
        headline="Hiring across several locations?"
        sub="See DSO Hire's published prices, or move your current postings over for free."
      />
    </SiteShell>
  );
}
