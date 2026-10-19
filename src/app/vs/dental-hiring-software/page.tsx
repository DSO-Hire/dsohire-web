/**
 * /vs/dental-hiring-software: "Hiring software for dental groups: the 2026
 * landscape". A roundup by published business model, fair to everyone.
 *
 * Every vendor fact is from that vendor's own pages as fetched on
 * 2026-10-19 (docs/research/dso-hiring-software-landscape-2026.md §2, §3.4).
 * The "which ATS do large DSOs use" section is DSO Hire's own observation
 * of careers-site HTML, labeled as such. Facts the dossier rejected
 * (ZipRecruiter, UKG, Paylocity, any "where DSOs advertise" statistic,
 * ownership claims) are deliberately absent. DSO Hire prices come from
 * prices.ts (monthly list).
 *
 * Draft gate: robots come from researchRobots() (src/lib/research/config.ts),
 * so this page is noindex,nofollow until RESEARCH_PUBLISHED flips. Not in
 * sitemap.ts, llms.txt, nav, or cross-linked from existing pages yet.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/marketing/site-shell";
import { VsCta, VsFaq, VsHero } from "@/components/marketing/vs-layout";
import {
  DSOHIRE_OPENINGS_LADDER,
  DSOHIRE_PRICE_RANGE,
  DSOHIRE_SOURCES,
  KIND_OBSERVED,
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

const PATH = "/vs/dental-hiring-software";

export const metadata: Metadata = {
  alternates: { canonical: PATH },
  robots: researchRobots(),
  title: "Hiring Software for Dental Groups (DSOs): The 2026 Landscape",
  description: `Dental job boards, temp staffing marketplaces, general job boards, and applicant tracking systems, grouped by how each one charges. Every price and feature is quoted from the vendor's own page (checked ${VS_ACCESSED}).`,
};

/* Numbered to match <Cite n /> below. */
const SOURCES: ResearchSource[] = [
  /* 1 */ DSOHIRE_SOURCES.pricing,
  /* 2 */ DSOHIRE_SOURCES.forGroups,
  /* 3 */ DSOHIRE_SOURCES.llms,
  /* 4 */ { label: "DentalPost, Dental Hiring (pricing and FAQ)", url: "https://www.dentalpost.net/dental-hiring/", kind: KIND_VENDOR },
  /* 5 */ { label: "DentalPost, Corporate Recruiting", url: "https://info.dentalpost.net/corporate-recruiting/", kind: KIND_VENDOR },
  /* 6 */ { label: "Cloud Dentistry, home page", url: "https://go.clouddentistry.com/", kind: KIND_VENDOR },
  /* 7 */ { label: "Cloud Dentistry, DSO Solutions", url: "https://go.clouddentistry.com/dso/", kind: KIND_VENDOR },
  /* 8 */ {
    label: "Cloud Dentistry FAQ, \"Does Cloud Dentistry charge placement fees if I hire someone full or part-time?\"",
    url: "https://faq.clouddentistry.com/en/articles/9806109-does-cloud-dentistry-charge-placement-fees-if-i-hire-someone-full-or-part-time",
    kind: KIND_VENDOR,
    date: "published April 2, 2026",
  },
  /* 9 */ {
    label: "Cloud Dentistry FAQ, \"What are the benefits of a Cloud Dentistry subscription?\"",
    url: "https://faq.clouddentistry.com/en/articles/9797412-what-are-the-benefits-of-a-cloud-dentistry-subscription",
    kind: KIND_VENDOR,
  },
  /* 10 */ { label: "Cloud Dentistry, Value Calculators", url: "https://go.clouddentistry.com/offices/value-calculators/", kind: KIND_VENDOR },
  /* 11 */ { label: "Teero, Staffing for DSOs", url: "https://www.teero.com/dso/staffing", kind: KIND_VENDOR },
  /* 12 */ { label: "Teero, FAQ", url: "https://www.teero.com/faq", kind: KIND_VENDOR },
  /* 13 */ { label: "Indeed, Sponsored Job pricing", url: "https://www.indeed.com/hire/pricing", kind: KIND_VENDOR },
  /* 14 */ { label: "LinkedIn Help, Post a job on LinkedIn", url: "https://www.linkedin.com/help/linkedin/answer/a517545", kind: KIND_VENDOR },
  /* 15 */ { label: "LinkedIn Help, Pay-per-click promoted job posts", url: "https://www.linkedin.com/help/linkedin/answer/a520820", kind: KIND_VENDOR },
  /* 16 */ { label: "LinkedIn Help, Job posting credits", url: "https://www.linkedin.com/help/linkedin/answer/a519623", kind: KIND_VENDOR },
  /* 17 */ { label: "Breezy HR, Pricing", url: "https://breezy.hr/pricing", kind: KIND_VENDOR },
  /* 18 */ { label: "Workable, Pricing", url: "https://www.workable.com/pricing", kind: KIND_VENDOR },
  /* 19 */ { label: "JazzHR, Pricing", url: "https://www.jazzhr.com/pricing/", kind: KIND_VENDOR },
  /* 20 */ { label: "iCIMS, home page (its /pricing/ page returned not found)", url: "https://www.icims.com/", kind: KIND_VENDOR },
  /* 21 */ { label: "Paycor, Plans and Pricing", url: "https://www.paycor.com/plans-pricing/", kind: KIND_VENDOR },
  /* 22 */ { label: "MB2 Dental, Careers (redirects to careers-mb2dental.icims.com)", url: "https://www.mb2dental.com/careers/", kind: KIND_OBSERVED },
  /* 23 */ { label: "Smile Brands, Careers", url: "https://www.smilebrands.com/careers/", kind: KIND_OBSERVED },
  /* 24 */ { label: "Pacific Dental Services, Careers (jobs.pdshealth.com)", url: "https://www.pacificdentalservices.com/careers/", kind: KIND_OBSERVED },
  /* 25 */ { label: "Gentle Dental, Careers", url: "https://www.gentledental.com/careers", kind: KIND_OBSERVED },
  /* 26 */ { label: "Aspen Dental, Careers", url: "https://careers.aspendental.com/", kind: KIND_OBSERVED },
  /* 27 */ { label: "Heartland Dental, Careers (jobs.heartland.com)", url: "https://heartland.com/careers", kind: KIND_OBSERVED },
  /* 28 */ DSOHIRE_SOURCES.jobBoards,
];

const CATEGORY_ROWS: React.ReactNode[][] = [
  [
    "Dental hiring platform (flat fee, built-in applicant tracking)",
    "DSO Hire",
    <>{DSOHIRE_PRICE_RANGE} flat, per group<Cite n={1} /></>,
    "Yes",
    "No",
    "Yes",
  ],
  [
    "Dental job board",
    "DentalPost",
    <>$259/mo per active post; DSO packages on request<Cite n={[4, 5]} /></>,
    "Yes",
    "Temp job listings only",
    "Yes",
  ],
  [
    "Dental staffing marketplace (subscription)",
    "Cloud Dentistry",
    <>Subscription priced by location and term, $97/mo price point, booking fees in some areas<Cite n={[9, 10]} /></>,
    "Yes",
    "Yes",
    <>Yes, no permanent placement fee<Cite n={8} /></>,
  ],
  [
    "Dental staffing marketplace (W-2, percentage fee)",
    "Teero",
    <>12% service fee on shifts, hygienists only<Cite n={12} /></>,
    "Yes",
    "Yes",
    <>Yes, free<Cite n={12} /></>,
  ],
  [
    "General job boards",
    "Indeed, LinkedIn",
    <>Free posting with limits, plus pay-per-click sponsorship<Cite n={[13, 14, 15]} /></>,
    "No",
    "Job postings only",
    "Yes",
  ],
  [
    "Applicant tracking, published prices",
    "Breezy HR, Workable, JazzHR",
    <>From a free plan (Breezy HR) to $719/mo (Workable&rsquo;s top displayed tier)<Cite n={[17, 18, 19]} /></>,
    "No",
    "No",
    "Yes",
  ],
  [
    "Applicant tracking or HR suite, quote only",
    "iCIMS, Paycor",
    <>Contact sales<Cite n={[20, 21]} /></>,
    "No",
    "No",
    "Yes",
  ],
];

const FAQ_ITEMS: FaqItem[] = [
  {
    q: "What do large DSOs use for applicant tracking?",
    a: `On ${VS_ACCESSED}, the careers sites we checked for MB2 Dental, Smile Brands, Pacific Dental Services, and Gentle Dental pointed to iCIMS, and Aspen Dental's careers site loads Phenom. This is our own observation of a small number of public careers pages, not a survey.`,
  },
  {
    q: "Which dental platforms cover temp shifts?",
    a: "Cloud Dentistry (temp, part-time, and permanent) and Teero (W-2 temp hygienists). DentalPost and DSO Hire are not shift-booking products, though DentalPost accepts temp job listings.",
  },
  {
    q: "Do dental marketplaces charge to hire permanently?",
    a: "Cloud Dentistry and Teero both state that they do not charge for permanent hires made through their platforms.",
  },
  {
    q: "Which applicant tracking systems publish prices?",
    a: "Breezy HR, Workable, and JazzHR publish prices on their sites. iCIMS and Paycor are quote-based.",
  },
  {
    q: "Is there a free option?",
    a: "Yes, with limits. Indeed lets many jobs post free (some are sponsored only), LinkedIn allows one free job at a time, and Breezy HR's Bootstrap plan is free with one active position. DSO Hire does not have a free tier.",
  },
];

export default function DentalHiringSoftwarePage() {
  return (
    <SiteShell ctaIntent="dso">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Hiring software for dental groups", path: PATH },
        ])}
      />
      <VsHero
        eyebrow={`Landscape · Checked ${VS_ACCESSED}`}
        title={
          <>
            Hiring software for dental groups:{" "}
            <em className="not-italic text-heritage-light">the 2026 landscape.</em>
          </>
        }
        intro="Dental groups hire through job boards, temp staffing marketplaces, general job sites, applicant tracking systems, and agencies. Each model charges differently and solves a different problem. This page groups the options by how they work and what they publish, quoting each company's own pages. We make DSO Hire, so we say where it fits and where it does not."
      />

      <VsBlock>
        <DataTable
          caption={`Hiring options for dental groups by business model, as published on ${VS_ACCESSED}`}
          columns={[
            { header: "Model" },
            { header: "Examples" },
            { header: "Published pricing" },
            { header: "Dental only" },
            { header: "Temp shifts" },
            { header: "Permanent hires" },
          ]}
          rows={CATEGORY_ROWS}
          minWidth="56rem"
          footnote="Examples are the vendors we could verify from their own pages; each category has others. DSO Hire prices are monthly list prices."
        />
      </VsBlock>

      <VsSection id="dental-platforms" eyebrow="Model 1" title="Dental hiring platform with applicant tracking">
        <p>
          <strong>DSO Hire</strong>{" "}is a dental-only hiring platform for multi-location dental
          groups.<Cite n={3} />{" "}It charges one flat monthly subscription per group,{" "}
          {DSOHIRE_PRICE_RANGE} billed monthly (about 10% less billed annually), capped by
          active openings ({DSOHIRE_OPENINGS_LADDER} by tier) and admin seats, with no
          per-listing or placement fees.<Cite n={1} />{" "}Candidates use it free. Every
          application gets a two-sided fit score that a person uses to prioritize; it never
          rejects anyone automatically.<Cite n={[2, 3]} />{" "}It is for permanent hiring only and
          does not book temp shifts.<Cite n={3} />{" "}It has no free trial or free tier.
          <Cite n={1} />
        </p>
      </VsSection>

      <VsSection id="dental-job-boards" eyebrow="Model 2" title="Dental job boards">
        <p>
          <strong>DentalPost</strong>{" "}describes itself as the dental industry&rsquo;s
          &ldquo;largest online and mobile job board.&rdquo;<Cite n={4} />{" "}Its Job Posting
          Subscription is $259/month for one active job post at a time, auto-renews monthly,
          and can be canceled anytime. It includes candidate match scores built from
          assessments, and adds Resume Search for $149/month.<Cite n={4} />{" "}For DSOs and
          multi-location groups it offers posting across locations, ATS integration with
          &ldquo;220+ systems,&rdquo; and volume packages on request.<Cite n={5} />{" "}For a
          closer look, see{" "}
          <Link href="/vs/dentalpost">DSO Hire vs DentalPost</Link>.
        </p>
      </VsSection>

      <VsSection id="staffing-marketplaces" eyebrow="Model 3" title="Dental staffing marketplaces">
        <p>
          These platforms book temporary shifts and, increasingly, support permanent hires too.
        </p>
        <ul>
          <li>
            <strong>Cloud Dentistry</strong>{" "}connects offices with dental professionals for
            permanent, part-time, or temporary work.<Cite n={6} />{" "}Its subscription is priced
            by office location and term (1, 6, or 12 months), with a $97/month price point for
            a 12-month plan in popular markets and a $20 completion fee per booking in certain
            areas.<Cite n={[9, 10]} />{" "}It says it does not charge permanent placement fees
            through its self-service platform.<Cite n={8} />{" "}For DSOs it lists dashboards,
            billing across offices, a free internal float pool, and dedicated account managers,
            with pricing on request.<Cite n={7} />{" "}See{" "}
            <Link href="/vs/cloud-dentistry">DSO Hire vs Cloud Dentistry</Link>.
          </li>
          <li>
            <strong>Teero</strong>{" "}staffs temp dental hygienists who are W-2 employees of
            Teero; right now offices can only request hygienists. It charges a 12% service fee
            plus W-2 payroll taxes, with no contracts or minimums, and says offices can hire a
            hygienist permanently through Teero for free.<Cite n={12} />{" "}It supports multiple
            locations within one login.<Cite n={[11, 12]} />
          </li>
        </ul>
      </VsSection>

      <VsSection id="general-job-boards" eyebrow="Model 4" title="General job boards">
        <ul>
          <li>
            <strong>Indeed</strong>{" "}offers Free, Standard, Premium, and Premium Plus (Beta)
            plans. Many jobs post free, though some are &ldquo;sponsored only.&rdquo; Sponsored
            Jobs are billed on job seeker interactions like clicks or started applications;
            the minimum price appears in the product rather than on the pricing page. It
            advertises no long-term contracts, and Premium Plus (Beta) shows a &ldquo;Smart Fit
            Score (0-100).&rdquo;<Cite n={13} />
          </li>
          <li>
            <strong>LinkedIn</strong>{" "}allows one free job post at a time.<Cite n={14} />{" "}
            Promoted jobs are pay-per-click against a daily or total budget you set.
            <Cite n={15} />{" "}It has discontinued discounted prepaid job credits.
            <Cite n={16} />
          </li>
        </ul>
        <p>
          Neither describes a dental-specific or multi-location-specific feature on the pages
          we read.<Cite n={[13, 15]} />
        </p>
      </VsSection>

      <VsSection id="ats" eyebrow="Model 5" title="General applicant tracking systems">
        <p>
          General-purpose applicant tracking systems (ATSs) manage the pipeline for any
          industry. None described a dental-specific product on the pages we read, so a dental
          group configures roles, stages, and screening itself.
        </p>
        <ul>
          <li>
            <strong>Breezy HR</strong>{" "}has a free Bootstrap plan with one active position or
            candidate pool at a time. Paid plans are $157, $273, and $439 a month billed
            annually, or $189, $329, and $529 billed monthly.<Cite n={17} />
          </li>
          <li>
            <strong>Workable</strong>{" "}prices by company size. For 1 to 20 employees its default
            view showed $299, $599, and $719 a month, with unlimited active jobs subject to fair
            use, and a 15-day free trial. Those prices appeared under a recruiting and HR bundle
            banner, so the recruiting-only price may differ.<Cite n={18} />
          </li>
          <li>
            <strong>JazzHR</strong>{" "}publishes annual prices: $1,000, $3,480 (up to 200 active
            jobs), and $5,508 a year. Its Plus plan lists &ldquo;AI-Powered Candidate
            Matching.&rdquo;<Cite n={19} />
          </li>
          <li>
            <strong>iCIMS</strong>{" "}describes itself as an enterprise-grade applicant tracking
            system and offers demos and sales conversations rather than published prices.
            <Cite n={20} />{" "}<strong>Paycor</strong>{" "}provides custom quotes.<Cite n={21} />{" "}We
            could not load readable pricing pages for Paylocity or UKG, so they are not
            covered here.
          </li>
        </ul>
      </VsSection>

      <VsSection id="agencies" eyebrow="Model 6" title="Recruiting and staffing agencies">
        <p>
          Agencies run the search for you. Their terms vary by firm and we did not verify them
          for this page, so we do not quote fees here. For how a flat
          subscription compares with a per-placement model, see{" "}
          <Link href="/vs/staffing-agencies">DSO Hire vs staffing agencies</Link>.
        </p>
      </VsSection>

      <VsSection id="large-dsos" eyebrow="Our observation" title="What large DSOs use for applicant tracking">
        <p>
          On {VS_ACCESSED} we opened the public careers pages of several large DSOs and looked
          at which hiring system each page loads. MB2 Dental, Smile Brands, Pacific Dental
          Services, and Gentle Dental pointed to iCIMS-hosted job pages.
          <Cite n={[22, 23, 24, 25]} />{" "}Aspen Dental&rsquo;s careers site loads Phenom.
          <Cite n={26} />{" "}Heartland Dental&rsquo;s jobs site did not reveal a vendor.
          <Cite n={27} />
        </p>
        <p>
          This is our own reading of page code, not a statement from these companies, and we
          checked about a dozen sites. Not seeing a vendor is not evidence that a group does not
          use it. We found no credible published data on which channels DSOs use to advertise
          roles, so this page makes no claim about that.
        </p>
      </VsSection>

      <VsSection id="where-dsohire-fits" eyebrow="Where DSO Hire fits" title="Choosing by the problem you have">
        <ul>
          <li>
            <strong>Call-offs and short-term gaps:</strong>{" "}a temp staffing marketplace. DSO
            Hire does not book temps.
          </li>
          <li>
            <strong>One practice, one opening at a time:</strong>{" "}a single job board listing
            is usually the cheapest route. Our own job-boards comparison says a one-off listing
            is cheaper than any subscription, ours included.<Cite n={28} />
          </li>
          <li>
            <strong>Hiring at enterprise scale on an existing HR suite:</strong>{" "}an enterprise
            ATS like those large DSOs run. DSO Hire is not built to replace an enterprise HR
            system.
          </li>
          <li>
            <strong>Permanent hiring across several locations:</strong>{" "}this is what DSO Hire
            is built for. One published flat fee covers the group, one role posts to many
            practices in a single flow, and every applicant arrives with a dental-specific,
            two-sided fit score that never rejects anyone automatically.
            <Cite n={[1, 2, 3]} />
          </li>
        </ul>
        <p>
          To be fair to the rest of the field: several competitors also say they charge no
          placement fees for permanent hires, and match or fit scores are offered by DentalPost,
          Indeed (in beta), and JazzHR.<Cite n={[4, 8, 12, 13, 19]} />
        </p>
      </VsSection>

      <VsFaq items={FAQ_ITEMS} />
      <VsSources sources={SOURCES} />
      <VsCta
        headline="Hiring permanently across locations?"
        sub="See DSO Hire's published prices, or move your current postings over for free."
      />
    </SiteShell>
  );
}
