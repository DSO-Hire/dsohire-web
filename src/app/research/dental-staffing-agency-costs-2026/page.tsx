/**
 * /research/dental-staffing-agency-costs-2026: DSO Hire Research, Nº 1.
 *
 * SOURCE OF TRUTH: docs/research/staffing-agency-costs-2026.md (fact
 * dossier compiled 2026-10-19). Every figure on this page is either quoted
 * in that dossier or is DSO Hire arithmetic on dossier inputs, labeled
 * "DSO Hire calculation" with the formula shown. Do not add a number here
 * that is not in the dossier. Source numbers are re-numbered for this page
 * (SOURCES below), in rough order of first use.
 *
 * Spot-checked against live pages on 2026-10-19: Frontline pricing (20 to
 * 30%, 50 to 85%, 1,825-day pro-rated credit), BLS OOH hygienists
 * ($98,100; 8%), GoTu, Teero (12% + W-2 payroll costs), onDiem/ADA News
 * (25%), TempStars ($38 USD), DentalPost ($259/month, which the live page
 * says covers one active job post at a time), LinkedIn ($10/day example).
 * All matched the dossier.
 *
 * Draft gate: robots come from researchRobots() (src/lib/research/config.ts).
 */

import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/research/callout";
import { Cite } from "@/components/research/cite";
import {
  ChartFigure,
  HBarChart,
  RangeBarChart,
  StackedBarChart,
} from "@/components/research/charts";
import { DataTable } from "@/components/research/data-table";
import { KeyFindings } from "@/components/research/key-findings";
import { PullQuote } from "@/components/research/pull-quote";
import {
  Accent,
  Prose,
  ReportFaq,
  ReportSection,
  ReportShell,
} from "@/components/research/report-shell";
import { researchRobots } from "@/lib/research/config";
import {
  researchPath,
  STAFFING_COSTS_2026 as REPORT,
  type ResearchSource,
} from "@/lib/research/reports";
import { PRICING_TIERS } from "@/lib/stripe/prices";

const PATH = researchPath(REPORT.slug);

export const metadata: Metadata = {
  title: { absolute: `${REPORT.title} | DSO Hire Research` },
  description: REPORT.description,
  alternates: { canonical: PATH },
  robots: researchRobots(),
  authors: [{ name: REPORT.author.name }],
  openGraph: {
    title: REPORT.title,
    description: REPORT.description,
    url: `https://dsohire.com${PATH}`,
    type: "article",
    publishedTime: REPORT.datePublished,
    modifiedTime: REPORT.dateModified,
    authors: [REPORT.author.name],
  },
};

/* ── Sources (re-numbered from the dossier) ─────────────────────── */

const VENDOR = "Vendor, describing its own prices";
const COMPETITOR = "Vendor marketing, describing competitors";

const SOURCES: ResearchSource[] = [
  /* 1 */ { label: "Frontline Source Group, Pricing", url: "https://www.frontlinesourcegroup.com/pricing.html", kind: VENDOR, date: "last updated September 28, 2026" },
  /* 2 */ { label: "Frontline Source Group, Dental Staffing Agency", url: "https://www.frontlinesourcegroup.com/dental-staffing-agency.html", kind: VENDOR },
  /* 3 */ { label: "Frontline Source Group, \"Why do so many dental hygienist positions stay open, and what actually fills them?\"", url: "https://www.frontlinesourcegroup.com/blog-dental-hygienist-vacancies-why-so-many-roles-stay-open.html", kind: VENDOR, date: "published March 11, 2026, updated October 16, 2026" },
  /* 4 */ { label: "Frontline Dental Jobs, FAQ", url: "https://www.frontlinedentaljobs.com/faq/", kind: VENDOR },
  /* 5 */ { label: "DentalBase.ai, \"Dental Staffing Agency Guide: Costs, Pros, and Cons\"", url: "https://www.dentalbase.ai/blogs/practice-management/dental-staffing-agency-guide", kind: "Vendor marketing; no source given for its fee figures", date: "September 28, 2026" },
  /* 6 */ { label: "Caris Partners, Dentist Recruitment and Placement", url: "https://carispartners.com/dentist-recruitment/", kind: VENDOR, date: "post dated August 19, 2024" },
  /* 7 */ { label: "Henry Schein Dental Recruitment Services, Dental Questions (FAQ)", url: "https://dentalrecruitmentservices.henryschein.com/dental-resources/dental-questions/", kind: VENDOR },
  /* 8 */ { label: "The Doc Hunters, home page", url: "https://www.thedochunters.com/", kind: VENDOR },
  /* 9 */ { label: "Raybrex Dental Recruiting, home page", url: "https://raybrexdentalrecruiting.com/", kind: VENDOR },
  /* 10 */ { label: "Hygiene Staffing, FAQ", url: "https://hygienestaffing.com/faq/", kind: VENDOR },
  /* 11 */ { label: "U.S. Bureau of Labor Statistics, Occupational Employment and Wage Statistics, May 2025 national estimates (BLS Public Data API)", url: "https://api.bls.gov/publicAPI/v1/timeseries/data/", kind: "Government" },
  /* 12 */ { label: "U.S. Bureau of Labor Statistics, Occupational Outlook Handbook, Dental Hygienists", url: "https://www.bls.gov/ooh/healthcare/dental-hygienists.htm", kind: "Government" },
  /* 13 */ { label: "U.S. Bureau of Labor Statistics, Occupational Outlook Handbook, Dental Assistants", url: "https://www.bls.gov/ooh/healthcare/dental-assistants.htm", kind: "Government" },
  /* 14 */ { label: "U.S. Bureau of Labor Statistics, Occupational Outlook Handbook, Dentists", url: "https://www.bls.gov/ooh/healthcare/dentists.htm", kind: "Government" },
  /* 15 */ { label: "ADA Health Policy Institute, Dental Practice Research (FAQ)", url: "https://www.ada.org/resources/research/health-policy-institute/dental-practice-research", kind: "Association" },
  /* 16 */ { label: "GoTu, Pricing", url: "https://gotu.com/pricing/", kind: VENDOR, date: "page dated June 4, 2026" },
  /* 17 */ { label: "Teero, Dental Staffing: Hire W-2 Dental Hygienists", url: "https://www.teero.com/dental-office/staffing", kind: `${VENDOR}; its claims about rivals are competitor marketing` },
  /* 18 */ { label: "ADA News, \"ADA members receive exclusive discounts, rebates with onDiem\"", url: "https://adanews.ada.org/ada-news/2025/june/ada-members-receive-exclusive-discounts-rebates-with-ondiem/", kind: "Association press, describing vendor terms", date: "June 20, 2025" },
  /* 19 */ { label: "onDiem, partner landing page", url: "https://ondiem.com/ondiem-darby", kind: VENDOR },
  /* 20 */ { label: "TempStars, Frequently Asked Questions", url: "https://www.tempstars.com/frequently-asked-questions/", kind: VENDOR },
  /* 21 */ { label: "TempStars, Pricing", url: "https://www.tempstars.com/pricing/", kind: VENDOR },
  /* 22 */ { label: "TempStars, \"How to Find Dental Temps to Fill Shifts (2026 Guide)\"", url: "https://www.tempstars.com/find-dental-temps-fill-shifts/", kind: COMPETITOR, date: "April 30, 2026" },
  /* 23 */ { label: "Cloud Dentistry, Value Calculators", url: "https://go.clouddentistry.com/offices/value-calculators/", kind: `${VENDOR}; competitor figures are marketing estimates`, date: "pricing as of April 30, 2026" },
  /* 24 */ { label: "Cloud Dentistry FAQ, \"Does Cloud Dentistry charge placement fees if I hire someone full or part time?\"", url: "https://faq.clouddentistry.com/en/articles/9806109-does-cloud-dentistry-charge-placement-fees-if-i-hire-someone-full-or-part-time", kind: VENDOR },
  /* 25 */ { label: "DirectDental, Pricing and Plans", url: "https://directdental.com/pricing", kind: VENDOR },
  /* 26 */ { label: "DirectDental, home page", url: "https://directdental.com/", kind: VENDOR },
  /* 27 */ { label: "Princess Dental Staffing, Pricing", url: "https://www.princessdentalstaffing.com/pricing", kind: VENDOR },
  /* 28 */ { label: "Kwikly, Temporary Staffing Solution for DSOs", url: "https://www.joinkwikly.com/dental-offices/dental-support-organizations", kind: VENDOR },
  /* 29 */ { label: "Teero, \"Best Dental Staffing Agencies (2026): Fees Compared\"", url: "https://www.teero.com/dental-office/staffing/compare", kind: COMPETITOR, date: "published October 16, 2026; competitor prices checked September 18, 2026" },
  /* 30 */ { label: "Totally Temps (Madison, WI), Find Dental Hygienist and Assistant Temp Jobs", url: "https://totallytemps.com/dental-professionals/", kind: `${VENDOR} (single market)` },
  /* 31 */ { label: "DentalPost, Dental Hiring Products", url: "https://dentalpost.net/dental-hiring-products", kind: VENDOR },
  /* 32 */ { label: "LinkedIn, Hiring Pro pricing overview", url: "https://business.linkedin.com/hire/hiring-pro/pricing", kind: VENDOR },
  /* 33 */ { label: "Indeed, Hire: Pricing", url: "https://www.indeed.com/hire/pricing", kind: VENDOR },
  /* 34 */ { label: "Indeed Help Center, Pay Per Started Application (PPSA) overview", url: "https://www.indeed.com/help/employers/articles/pay-per-started-application-ppsa-overview", kind: VENDOR },
  /* 35 */ { label: "ADA Health Policy Institute, The State of the U.S. Dental Economy, 3rd Quarter 2026 Update", url: "https://www.ada.org/-/media/project/ada-organization/ada/ada-org/files/resources/research/hpi/state_us_dental_economy_q32026.pdf", kind: "Association", date: "Q3 2026" },
  /* 36 */ { label: "DANB, \"New research demonstrates dental assistants' impact on bottom line\"", url: "https://www.danb.org/news-blog/detail/news/new-research-demonstrates-dental-assistants-impact-on-bottom-line", kind: "Association (certification body; research with the DALE Foundation)", date: "May 7, 2024" },
  /* 37 */ { label: "DANB, \"The cost of dental assistant turnover\"", url: "https://www.danb.org/news-blog/detail/blog/the-cost-of-dental-assistant-turnover", kind: "Association", date: "May 14, 2024" },
  /* 38 */ { label: "Gallup, \"This Fixable Problem Costs U.S. Businesses $1 Trillion\"", url: "https://www.gallup.com/workplace/247391/fixable-problem-costs-businesses-trillion.aspx", kind: "Research firm (methodology not detailed on the page)", date: "March 13, 2019" },
  /* 39 */ { label: "SHRM, \"The Real Costs of Recruitment\" (Katie Navarra)", url: "https://www.shrm.org/topics-tools/news/talent-acquisition/real-costs-recruitment", kind: "Association", date: "April 11, 2022" },
];

/* ── Figures (all from the dossier; see file header) ────────────── */

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const kTick = (n: number) => (n === 0 ? "$0" : `$${n / 1000}K`);

/** BLS OEWS May 2025 national medians [11] and the dossier's fee table (DSO Hire calculation). */
const ROLE_FEES = [
  { role: "General dentist", soc: "29-1021", median: 170_950, lo15: 25_643, hi25: 42_738, lo20: 34_190, hi30: 51_285 },
  { role: "Dental hygienist", soc: "29-1292", median: 98_100, lo15: 14_715, hi25: 24_525, lo20: 19_620, hi30: 29_430 },
  { role: "Office manager (proxy)", soc: "43-1011, offices of dentists", median: 63_910, lo15: 9_587, hi25: 15_978, lo20: 12_782, hi30: 19_173 },
  { role: "Dental assistant", soc: "31-9091", median: 48_070, lo15: 7_211, hi25: 12_018, lo20: 9_614, hi30: 14_421 },
  { role: "Receptionist", soc: "43-4171, offices of dentists", median: 46_500, lo15: 6_975, hi25: 11_625, lo20: 9_300, hi30: 13_950 },
] as const;

/** 8-hour hygienist shift at the BLS median hourly wage ($47.16) [11]. DSO Hire calculation. */
const SHIFT_PAY = 377.28;
const SHIFTS = [
  { label: "TempStars, US flat fee", fee: 38.0, total: "$415.28", sub: "$38 per completed shift" },
  { label: "Teero, 12%", fee: 45.27, total: "$422.55 plus W-2 payroll costs", sub: "fee $45.27" },
  { label: "GoTu, 22.5%", fee: 84.89, total: "$462.17", sub: "fee $84.89; more where shifts run as W-2" },
  { label: "onDiem, ADA member 25%", fee: 94.32, total: "$471.60", sub: "fee $94.32" },
] as const;
const AGENCY_SHIFT = { feeLo: 188.64, feeHi: 320.69, totalLo: 565.92, totalHi: 697.97 };

const solo = PRICING_TIERS.solo;
const enterprise = PRICING_TIERS.enterprise;

/* ── FAQ: plain strings, each restating facts cited in the body ──── */

const FAQ = [
  {
    q: "How much do dental staffing agencies charge for a permanent hire?",
    a: "Most dental recruiters do not publish their fees. The one firm with a dental division that publishes a rate card (Frontline Source Group) lists direct hire at 20 to 30 percent of first-year base salary. A vendor guide that cites no source puts the range at 15 to 25 percent. Some dentist-only recruiters charge flat fees instead: Caris Partners publishes $5,000 to $15,000 per dentist or specialist hire.",
  },
  {
    q: "What would an agency fee be for a dental hygienist?",
    a: "At 20 to 30 percent of the BLS May 2025 median hygienist wage of $98,100, the fee works out to about $19,620 to $29,430 per hire. That is a DSO Hire calculation on published inputs, not a quote from any agency.",
  },
  {
    q: "How long do dental recruiter guarantees last?",
    a: "Ninety days is the only guarantee length published by more than one dental recruiter (Henry Schein Dental Recruitment Services and The Doc Hunters). Frontline Source Group sells a five-year warranty, which its pricing page describes as a pro-rated credit rather than a cash refund. What you get back, a replacement, a refund, or a credit, is set by contract.",
  },
  {
    q: "What do temp dental staffing apps charge?",
    a: "Published fees include GoTu at 22.5 percent of a hygienist's shift rate (flat $60 to $300 per shift for other roles), Teero at 12 percent plus W-2 payroll costs, onDiem at a flat 25 percent for ADA members, and TempStars at $38 per completed shift in the US. The one traditional agency rate card we found lists a 50 to 85 percent markup on contract and temporary staff.",
  },
  {
    q: "How much does it cost to post a dental job online?",
    a: "DentalPost's job posting subscription is $259 per month for one active job post at a time. LinkedIn's own example is a $10 daily budget for 30 days, which costs $300 or less. Indeed lets many jobs post free and prices sponsored jobs by auction, billed per started application by default, with the minimum shown at checkout.",
  },
  {
    q: "What does an open dental assistant role cost a practice?",
    a: "Research by DANB and the DALE Foundation estimates more than $21,000 in revenue at risk on average for a vacant dental assistant position, and nearly $110,000 if it stays open a full year. DANB puts the average cost of dental assistant turnover at $10,000.",
  },
] as const;

export default function StaffingAgencyCostsReport() {
  return (
    <ReportShell
      report={REPORT}
      kicker="DSO Hire Research · Nº 1 · October 2026"
      title={
        <>
          What dental staffing agencies <Accent>actually charge.</Accent>
        </>
      }
      dek="Placement fees, guarantee terms, temp platform fees, and job board prices for 2026, built from published rate cards and government wage data. Few agencies publish a price, so we show exactly what is public, what is our arithmetic, and what we could not verify."
      sources={SOURCES}
      accessed="October 19, 2026"
      cta={{
        title: (
          <>
            Price your next hire <span className="text-heritage-bright">before</span> you sign.
          </>
        ),
        sub: "See how a flat monthly subscription with no placement fees compares on your own roles. Live demo, no sign-up.",
      }}
      methodology={
        <>
          <p>
            Every figure in this report was read on the source&rsquo;s own page or pulled
            from the official BLS Public Data API on October 19, 2026, unless a different
            publication date is shown in the source list. Figures that surfaced only in
            search snippets, third-party aggregators, or pages that refused the request
            were left out. We re-checked the most important numbers (Frontline&rsquo;s rate
            card, the BLS hygienist median, GoTu, Teero, onDiem, TempStars, DentalPost and
            LinkedIn) against the live pages the same day; all matched. Two details come from that check rather than our original notes: DentalPost&rsquo;s page says its subscription covers one active job post at a time, and Teero&rsquo;s says payroll costs are shown before you confirm a shift.
          </p>
          <p>
            Wage baselines are BLS Occupational Employment and Wage Statistics, May 2025
            national estimates, the latest release at the time of writing.<Cite n={11} /> We
            use BLS wages, which measure employed dentists, rather than ADA Health Policy
            Institute owner net income ($215,320 for general dentists in 2025), which
            measures mostly practice owners.<Cite n={15} /> The office manager row uses
            BLS first-line supervisors of office and administrative support in offices of
            dentists as a proxy, because BLS has no office manager category.
          </p>
          <p>
            Any line labeled <strong>DSO Hire calculation</strong> is our arithmetic on cited
            inputs, with the formula shown. No agency quoted those dollar amounts. Source
            types are listed with every source so you can weigh a vendor&rsquo;s description
            of its own prices differently from a vendor&rsquo;s description of its
            competitors.
          </p>
          <p>
            What we left out: ZipRecruiter (its pricing page refused automated access and
            third-party figures conflict); locum tenens dentist bill rates (no source
            publishes what a practice pays); and several widely repeated statistics we could
            not trace to a primary source, including the claim that a bad hire costs 30
            percent of first-year earnings, often attributed to the U.S. Department of Labor.
            We sell hiring software to dental groups, so treat our framing with the same
            care as anyone else&rsquo;s.
          </p>
        </>
      }
    >
      <Prose>
        <p>
          Ask a dental group what an agency hire cost them and you will usually get a
          number. Ask what agencies charge in general and you will get a shrug, because
          very few dental staffing agencies publish a price. Most hard numbers in this report
          come from three places: one general staffing firm with a dental division that
          publishes a rate card, app-based temp marketplaces that publish their own fees,
          and government wage data.
        </p>
        <p>
          That makes industry &ldquo;typical&rdquo; ranges directional at best, and we say
          so wherever it matters. Where a number comes from a firm with something to sell,
          including us, we say so.
        </p>
      </Prose>

      <div className="mt-12">
        <KeyFindings
          findings={[
            <>
              <strong>Permanent placement is priced as a share of first-year salary.</strong>{" "}
              The one agency with a dental division that publishes a rate card charges 20 to
              30 percent of first-year base salary.<Cite n={1} /> An uncited vendor guide puts
              it at 15 to 25 percent.<Cite n={5} />
            </>,
            <>
              <strong>On BLS medians, that is about $19,600 to $29,400 per hygienist</strong>{" "}
              and $9,600 to $14,400 per dental assistant (DSO Hire calculation).
              <Cite n={[1, 11]} />
            </>,
            <>
              <strong>Dentist-only recruiters sometimes charge flat fees.</strong> Caris
              Partners publishes $5,000 to $15,000 per dentist or specialist hire.
              <Cite n={6} /> Others advertise flat or below-average pricing without a number.
              <Cite n={[7, 8]} />
            </>,
            <>
              <strong>The standard guarantee is 90 days.</strong> Two dental recruiters publish
              it.<Cite n={[7, 8]} /> One firm sells five years, as a pro-rated credit.
              <Cite n={1} />
            </>,
            <>
              <strong>Temp marketplaces publish fees of 12 to 25 percent of pay</strong>, or a
              flat fee per shift.<Cite n={[16, 17, 18, 20]} /> The one traditional agency rate
              card shows a 50 to 85 percent markup.<Cite n={1} />
            </>,
            <>
              <strong>&ldquo;Free&rdquo; permanent hires are common on temp platforms.</strong>{" "}
              Six state $0 placement or buyout fees on their own pages, and most charge a
              subscription or per-shift fee instead.<Cite n={[17, 19, 20, 24, 26, 27]} />
            </>,
            <>
              <strong>Job boards cost hundreds, not thousands, per month.</strong> DentalPost
              is $259 a month<Cite n={31} />; LinkedIn&rsquo;s own example is $300 or less
              for 30 days<Cite n={32} />; Indeed prices sponsored jobs by auction.
              <Cite n={[33, 34]} />
            </>,
            <>
              <strong>Vacancies are long and costly.</strong> One in five practices report
              hygienist positions open more than six months.<Cite n={35} /> An open assistant
              role puts more than $21,000 of revenue at risk on average.<Cite n={36} />
            </>,
          ]}
        />
      </div>

      {/* ── 1. Permanent placement ─────────────────────────────── */}
      <ReportSection
        id="placement-fees"
        kicker="01 · Permanent placement"
        title="Few agencies publish a fee. The ones that do say 20 to 30 percent."
      >
        <Prose>
          <p>
            Permanent placement is usually contingent: you pay only when someone you hire
            starts. Raybrex puts it plainly: &ldquo;There is never a fee unless we find you a
            quality dentist that you want to hire.&rdquo;<Cite n={9} /> What you pay when
            that happens is much harder to find.
          </p>
          <p>
            The clearest public number comes from Frontline Source Group, a general staffing
            firm with a dental division. Its rate card lists direct hire at 20 to 30 percent
            of annual salary, with final pricing set by contract at kickoff.<Cite n={1} /> Its
            dental pages describe the same model, &ldquo;a contingent fee of 20 to 30 percent
            of the placed hygienist&rsquo;s first-year base salary.&rdquo;<Cite n={[2, 3]} />
          </p>
          <p>
            Other published figures are weaker. A 2026 vendor guide gives 15 to 25 percent of
            first-year salary but cites no source for it.<Cite n={5} /> Henry Schein Dental
            Recruitment Services says only that its fees are &ldquo;less than the industry
            average.&rdquo;<Cite n={7} /> The Doc Hunters advertise a flat rate &ldquo;among
            the lowest in the nation&rdquo; without naming it.<Cite n={8} /> Hygiene Staffing
            bills permanent and temporary placements separately and does not publish either.
            <Cite n={10} />
          </p>
          <p>
            Dentist searches are where the two pricing models split. Caris Partners publishes
            a flat $5,000 to $15,000 &ldquo;once the dentist or specialist is hired.&rdquo;
            <Cite n={6} /> A percentage model on the same hire costs far more, as the next
            section shows.
          </p>
        </Prose>

        <Callout tone="caveat" label="Reading the range">
          <p>
            The honest summary is roughly 15 to 30 percent of first-year salary, with the only
            published dental rate card at 20 to 30 percent. We use 20 to 30 percent for the
            math below because it is the only range a firm publishes for its own services.
          </p>
        </Callout>
      </ReportSection>

      {/* ── 2. Per role ─────────────────────────────────────────── */}
      <ReportSection
        id="fee-by-role"
        kicker="02 · What that means per role"
        title="A percentage fee scales with the salary, so dentist hires cost the most."
      >
        <Prose>
          <p>
            A percentage is abstract until you apply it to a real salary. Using BLS May 2025
            national medians, a 20 to 30 percent fee comes to about $34,000 to $51,000 for a
            general dentist and about $19,600 to $29,400 for a hygienist.<Cite n={[1, 11]} />{" "}
            Compare the flat-fee model for dentists, $5,000 to $15,000.<Cite n={6} />
          </p>
        </Prose>

        <Callout tone="calc">
          <p>
            <strong>Fee = BLS May 2025 national median annual wage × published fee percentage.</strong>
          </p>
          <p>
            Example, dental hygienist: $98,100 × 20% = $19,620; $98,100 × 30% = $29,430. Wages
            from BLS OEWS<Cite n={11} />, confirmed by the BLS Occupational Outlook Handbook
            for hygienists, assistants and dentists<Cite n={[12, 13, 14]} />; fee range from
            Frontline&rsquo;s rate card<Cite n={1} /> and an uncited vendor guide.
            <Cite n={5} /> Your salaries, and the fee you negotiate, will differ.
          </p>
        </Callout>

        <ChartFigure
          kicker="Chart 1 · DSO Hire calculation"
          title="Placement fee per hire at 20 to 30 percent of the BLS median wage"
          legend={[
            { label: "Percentage fee, 20 to 30% of median wage", tone: "ink" },
            { label: "Published flat fee (dentist recruiter)", tone: "bronze" },
          ]}
          note={
            <>
              Wages: BLS OEWS May 2025 national medians.<Cite n={11} /> Fee range: Frontline
              Source Group rate card.<Cite n={1} /> Flat fee: Caris Partners.<Cite n={6} />{" "}
              Office manager uses first-line office supervisors in offices of dentists as a
              proxy. Specialist dentists are omitted: BLS counts are small and specialist
              searches are often flat-fee or retained.
            </>
          }
          table={{
            caption: "Placement fee per hire by role",
            columns: [
              { header: "Role" },
              { header: "BLS median wage", numeric: true },
              { header: "Fee at 20–30%", numeric: true },
            ],
            rows: [
              ...ROLE_FEES.map((r) => [r.role, usd(r.median), `${usd(r.lo20)} – ${usd(r.hi30)}`]),
              ["Dentist, flat-fee recruiter", "n/a", "$5,000 – $15,000"],
            ],
          }}
        >
          <RangeBarChart
            max={55_000}
            ticks={[0, 10_000, 20_000, 30_000, 40_000, 50_000]}
            formatTick={kTick}
            ariaLabel={`Placement fee per hire at 20 to 30 percent of the BLS May 2025 median wage: ${ROLE_FEES.map((r) => `${r.role} ${usd(r.lo20)} to ${usd(r.hi30)}`).join("; ")}. For comparison, one dentist recruiter publishes a flat fee of $5,000 to $15,000.`}
            rows={[
              ...ROLE_FEES.map((r) => ({
                label: r.role,
                low: r.lo20,
                high: r.hi30,
                display: `${usd(r.lo20)} to ${usd(r.hi30)}`,
                sub: `median ${usd(r.median)}`,
                tone: "ink" as const,
              })),
              {
                label: "Dentist, flat-fee recruiter",
                low: 5_000,
                high: 15_000,
                display: "$5,000 to $15,000",
                sub: "published flat fee",
                tone: "bronze" as const,
              },
            ]}
          />
        </ChartFigure>

        <DataTable
          caption="Fee per hire at both published ranges (DSO Hire calculation)"
          columns={[
            { header: "Role (BLS SOC)" },
            { header: "Median wage, May 2025", numeric: true },
            { header: "At 15–25%", numeric: true },
            { header: "At 20–30%", numeric: true },
          ]}
          rows={ROLE_FEES.map((r) => [
            <>
              {r.role}
              <span className="block text-xs font-normal text-slate-meta">{r.soc}</span>
            </>,
            usd(r.median),
            `${usd(r.lo15)} – ${usd(r.hi25)}`,
            `${usd(r.lo20)} – ${usd(r.hi30)}`,
          ])}
          footnote={
            <>
              Wages: BLS OEWS May 2025.<Cite n={11} /> 15–25%: uncited vendor guide.
              <Cite n={5} /> 20–30%: Frontline Source Group rate card.<Cite n={1} /> Receptionist
              and office manager rows use offices of dentists (NAICS 621200) wages.
            </>
          }
        />
      </ReportSection>

      {/* ── 3. Guarantees ───────────────────────────────────────── */}
      <ReportSection
        id="guarantees"
        kicker="03 · Guarantee periods"
        title="Ninety days is the norm. What you get back varies."
      >
        <Prose>
          <p>
            A guarantee is what protects the fee if the hire leaves early. Ninety days is the
            only length published by more than one dental recruiter. Henry Schein offers
            &ldquo;a free replacement if you are not satisfied within the first ninety
            days,&rdquo;<Cite n={7} /> and The Doc Hunters say every dentist they place
            &ldquo;comes with a 90 day guarantee.&rdquo;<Cite n={8} /> A 2026 vendor guide,
            again without a source, says most reputable agencies offer a partial refund or
            free replacement.<Cite n={5} />
          </p>
          <p>
            Frontline sells something much longer: a five-year warranty, which it frames
            against the industry&rsquo;s 90 days. Its FAQ says failed placements are replaced
            &ldquo;at no additional search fee,&rdquo;<Cite n={4} /> while its pricing page
            describes the remedy as a pro-rated credit over 1,825 days, based on how long
            the hire stayed and governed by the client agreement.<Cite n={1} />
          </p>
        </Prose>

        <PullQuote
          attribution={
            <>
              Frontline Source Group, describing its own five-year warranty
              <Cite n={3} />
            </>
          }
        >
          &ldquo;20 times longer than the 90-day guarantee that is standard across the
          staffing industry&rdquo;
        </PullQuote>

        <DataTable
          caption="Published guarantee terms"
          columns={[{ header: "Recruiter" }, { header: "Length" }, { header: "Remedy" }]}
          minWidth="32rem"
          rows={[
            [<>Henry Schein Dental Recruitment Services<Cite n={7} /></>, "90 days", "Free replacement"],
            [<>The Doc Hunters<Cite n={8} /></>, "90 days (dentists)", "Not specified on the page"],
            [
              <>Frontline Source Group<Cite n={[1, 4]} /></>,
              "5 years (1,825 days)",
              "Pricing page: pro-rated credit by days worked. FAQ: replacement at no additional search fee.",
            ],
          ]}
          footnote="Remedies are set by contract. Ask whether you get a replacement search, a refund, or a credit, and how it is pro-rated."
        />
      </ReportSection>

      {/* ── 4. Temp and per diem ────────────────────────────────── */}
      <ReportSection
        id="temp-fees"
        kicker="04 · Temp and per-diem coverage"
        title="Temp apps publish their fees. Traditional agencies bundle theirs into the bill rate."
      >
        <Prose>
          <p>
            Temp coverage is priced differently from permanent placement. App-based
            marketplaces publish a fee on top of what the clinician earns, either a
            percentage of pay or a flat amount per shift. Traditional agencies quote an
            hourly bill rate that includes the worker&rsquo;s pay plus their service fee
            <Cite n={2} />, so the markup is harder to see. Frontline&rsquo;s rate card puts
            that markup at 50 to 85 percent, depending on skill and assignment length.
            <Cite n={1} />
          </p>
          <p>
            Competitors&rsquo; descriptions of each other run in the same direction but are
            marketing, not price lists. Teero says published service fees among its rivals
            run &ldquo;15% to 25% among the companies that publish a rate.&rdquo;
            <Cite n={17} /> TempStars says traditional agencies add an $80 to $150 or more
            placement fee per shift, plus a $15 to $60 hourly markup.<Cite n={22} /> The
            uncited vendor guide gives 30 to 60 percent.<Cite n={5} />
          </p>
        </Prose>

        <DataTable
          caption="Published temp platform pricing (vendors describing their own prices)"
          minWidth="44rem"
          columns={[
            { header: "Platform" },
            { header: "Fee model" },
            { header: "Published fee" },
            { header: "Permanent hire fee" },
          ]}
          rows={[
            [
              <>GoTu<Cite n={16} /></>,
              "Percent (hygienists); flat per shift (others)",
              "Hygienist 22.5% of shift rate. Assistant $60, front desk $70, associate dentist $300 per completed shift. Extra 20% of pay where shifts run as W-2.",
              "Not covered in our review",
            ],
            [
              <>Teero<Cite n={17} /></>,
              "Percent of pay",
              "12% of hygienist pay rate, plus W-2 employer payroll costs (shown before you confirm)",
              "None",
            ],
            [
              <>onDiem<Cite n={[18, 19]} /></>,
              "Percent of pay (W-2)",
              "Flat 25% for ADA members, with a $25 rebate per shift on the first 20 shifts each calendar year",
              "None for temp-to-perm",
            ],
            [
              <>TempStars<Cite n={[20, 21]} /></>,
              "Flat per shift",
              "$38 USD per completed shift in the US; $18 to unlock a candidate on its job board",
              "$0",
            ],
            [
              <>Cloud Dentistry<Cite n={[23, 24]} /></>,
              "Subscription",
              "$97/month on a 12-month plan in “popular markets”; $20 completion fee per booking in some areas",
              "None through self-service",
            ],
            [
              <>DirectDental<Cite n={[25, 26]} /></>,
              "Subscription",
              "Clinical $399/month (+$199 per added location); Non-Clinical $199/month; optional one-time $499 or $999 services (fall promotion)",
              "None",
            ],
            [
              <>Princess Dental Staffing<Cite n={27} /></>,
              "Subscription",
              "Temps Only $139/month; All Access $259/month",
              "No additional hiring fee",
            ],
            [
              <>Kwikly<Cite n={[28, 29]} /></>,
              "Not published on its pages",
              "15% per shift plus W-2 costs, according to a competitor’s comparison (Teero), not Kwikly. Kwikly does publish that shifts cut or cancelled within 24 hours are billed at the original hours.",
              "Not published",
            ],
          ]}
          footnote={
            <>
              TempStars&rsquo; pricing page shows &ldquo;$73&rdquo; without a currency; its FAQ
              clarifies that is $73 CAD in Canada and $38 USD in the US.<Cite n={[20, 21]} />{" "}
              Platform percentages exclude employer payroll taxes on W-2 models unless noted.
            </>
          }
        />

        <Prose>
          <p>
            To compare these on equal terms, we priced one 8-hour hygienist shift at the BLS
            median hourly wage of $47.16.<Cite n={11} /> Real temp pay is often higher: one
            Madison, Wisconsin agency advertises hygienist temp pay starting at $62 an hour
            and assistant pay from $31.<Cite n={30} />
          </p>
        </Prose>

        <ChartFigure
          kicker="Chart 2 · DSO Hire calculation"
          title="What one 8-hour hygienist shift costs the office, by pricing model"
          legend={[
            { label: "Clinician pay (8 × $47.16 = $377.28)", tone: "muted" },
            { label: "Platform or agency fee", tone: "brick" },
            { label: "Agency fee, upper end of range", tone: "brick", hatched: true },
          ]}
          note={
            <>
              Pay: BLS May 2025 median hourly wage for hygienists.<Cite n={11} /> Fees: TempStars
              <Cite n={20} />, Teero<Cite n={17} />, GoTu<Cite n={16} />, onDiem for ADA
              members<Cite n={18} />, Frontline rate card markup<Cite n={1} />. Totals exclude
              employer payroll taxes where the platform adds them (Teero; GoTu W-2 regions,
              +20% of pay).
            </>
          }
          table={{
            caption: "Cost of one 8-hour hygienist shift",
            columns: [
              { header: "Model" },
              { header: "Fee", numeric: true },
              { header: "Total to office", numeric: true },
            ],
            rows: [
              ...SHIFTS.map((s) => [s.label, usd2(s.fee), s.total]),
              [
                "Traditional agency, 50–85% markup",
                `${usd2(AGENCY_SHIFT.feeLo)} – ${usd2(AGENCY_SHIFT.feeHi)}`,
                `${usd2(AGENCY_SHIFT.totalLo)} – ${usd2(AGENCY_SHIFT.totalHi)}`,
              ],
            ],
          }}
        >
          <StackedBarChart
            max={750}
            ticks={[0, 250, 500, 750]}
            formatTick={(n) => `$${n}`}
            ariaLabel={`Cost of one 8-hour hygienist shift at $377.28 of pay: ${SHIFTS.map((s) => `${s.label}, ${s.total}`).join("; ")}; traditional agency at a 50 to 85 percent markup, ${usd2(AGENCY_SHIFT.totalLo)} to ${usd2(AGENCY_SHIFT.totalHi)}.`}
            rows={[
              ...SHIFTS.map((s) => ({
                label: s.label,
                display: s.total,
                sub: s.sub,
                segments: [
                  { value: SHIFT_PAY, tone: "muted" as const },
                  { value: s.fee, tone: "brick" as const },
                ],
              })),
              {
                label: "Traditional agency, 50–85% markup",
                display: `${usd2(AGENCY_SHIFT.totalLo)} to ${usd2(AGENCY_SHIFT.totalHi)}`,
                sub: `fee ${usd2(AGENCY_SHIFT.feeLo)} to ${usd2(AGENCY_SHIFT.feeHi)}`,
                segments: [
                  { value: SHIFT_PAY, tone: "muted" as const },
                  { value: AGENCY_SHIFT.feeLo, tone: "brick" as const },
                  { value: AGENCY_SHIFT.feeHi - AGENCY_SHIFT.feeLo, tone: "brick" as const, hatched: true },
                ],
              },
            ]}
          />
        </ChartFigure>

        <Callout tone="calc">
          <p>
            <strong>Shift cost = 8 hours × $47.16 + the platform&rsquo;s fee</strong> (its
            percentage of pay, or its flat per-shift fee).
          </p>
          <p>
            Flat fees weigh more on lower-paid roles. For a dental assistant at the BLS median
            ($23.11 an hour, so $184.88 for 8 hours), GoTu&rsquo;s $60 flat fee is an
            effective 32 percent and TempStars&rsquo; $38 is 21 percent.
            <Cite n={[11, 16, 20]} />
          </p>
        </Callout>
      </ReportSection>

      {/* ── 5. Job boards ───────────────────────────────────────── */}
      <ReportSection
        id="job-boards"
        kicker="05 · Job boards, for contrast"
        title="Posting a job costs hundreds a month. The work of screening is yours."
      >
        <Prose>
          <p>
            Job boards sit at the other end of the scale. You pay to reach candidates, not for
            a hire, and your team does the sourcing and screening.
          </p>
          <ul>
            <li>
              <strong>DentalPost:</strong> the Job Posting Subscription is $259 a month, which
              its page says covers one active job post at a time. Resume search is a $149 a
              month add-on.<Cite n={31} />
            </li>
            <li>
              <strong>LinkedIn:</strong> you set a daily budget and pay for views. Its own
              example: &ldquo;If you set a $10 daily budget and run a job post for 30 days,
              your total cost will be $300 or less.&rdquo; One free job post can be open at a
              time.<Cite n={32} />
            </li>
            <li>
              <strong>Indeed:</strong> many jobs post free. Sponsored jobs are priced by
              auction, and the minimum &ldquo;will depend on several factors&rdquo; and
              appears at checkout.<Cite n={33} /> Qualifying jobs are automatically billed per
              started application (PPSA) and cannot switch back to pay per click.
              <Cite n={34} />
            </li>
          </ul>
          <p>
            We left ZipRecruiter out: its pricing page refused our request, and the
            third-party figures in circulation conflict with each other.
          </p>
        </Prose>

        <ChartFigure
          kicker="Chart 3 · DSO Hire calculation"
          title="Agency fee for one hygienist hire vs. one month of job board spend"
          note={
            <>
              Agency fee: 20% and 30% of the BLS May 2025 hygienist median, $98,100.
              <Cite n={[1, 11]} /> DentalPost: one month, one active post.<Cite n={31} />{" "}
              LinkedIn: its own $10 a day for 30 days example, &ldquo;$300 or less.&rdquo;
              <Cite n={32} /> Indeed is auction priced with no fixed public figure, so it is not
              charted.<Cite n={[33, 34]} /> A board does not guarantee a hire; an agency fee
              buys one.
            </>
          }
          table={{
            caption: "Agency fee vs. job board spend for one hygienist hire",
            columns: [{ header: "Option" }, { header: "Cost", numeric: true }],
            rows: [
              ["Agency fee at 30%", "$29,430"],
              ["Agency fee at 20%", "$19,620"],
              ["LinkedIn, $10/day for 30 days", "$300 or less"],
              ["DentalPost, one month", "$259"],
            ],
          }}
        >
          <HBarChart
            max={30_000}
            ticks={[0, 10_000, 20_000, 30_000]}
            formatTick={kTick}
            ariaLabel="One hygienist hire: agency fee at 30 percent, $29,430; agency fee at 20 percent, $19,620; LinkedIn at $10 a day for 30 days, $300 or less; DentalPost for one month, $259."
            rows={[
              { label: "Agency fee at 30%", value: 29_430, display: "$29,430", tone: "ink" },
              { label: "Agency fee at 20%", value: 19_620, display: "$19,620", tone: "ink" },
              { label: "LinkedIn, 30 days", value: 300, display: "$300 or less", sub: "$10/day example", tone: "heritage" },
              { label: "DentalPost, one month", value: 259, display: "$259", sub: "one active post", tone: "heritage" },
            ]}
          />
        </ChartFigure>
      </ReportSection>

      {/* ── 6. Turnover and vacancy ────────────────────────────── */}
      <ReportSection
        id="vacancy-cost"
        kicker="06 · The cost of an empty chair"
        title="Fees are only half the math. Open roles cost money too."
      >
        <Prose>
          <p>
            The fee is the visible cost. The vacancy is the other one. In the ADA Health
            Policy Institute&rsquo;s Q3 2026 update, the vast majority of dentists recruiting
            hygienists called it &ldquo;very&rdquo; or &ldquo;extremely challenging,&rdquo; a
            pattern that has held for more than two years. Only two in five recruiting
            dentists filled the hygiene position, compared with around two-thirds of those
            recruiting dental assistants.<Cite n={35} /> BLS projects hygienist employment to
            grow 8 percent from 2025 to 2035.<Cite n={12} />
          </p>
        </Prose>

        <PullQuote
          attribution={
            <>
              ADA Health Policy Institute, State of the U.S. Dental Economy, Q3 2026
              <Cite n={35} />
            </>
          }
        >
          &ldquo;One out of five dental practices report hygienist positions being open for
          more than six months&rdquo;
        </PullQuote>

        <Prose>
          <p>
            The best dental-specific cost estimate we found comes from DANB, the DALE
            Foundation and Global Skills X-Change, based on a December 2023 survey with more
            than 560 responses. It puts the average revenue at risk from a vacant dental
            assistant position at more than $21,000, nearly $110,000 if the role stays open a
            full year, and $30,000 to almost $60,000 in extra labor cost.<Cite n={36} /> A
            separate DANB post puts the average cost of dental assistant turnover at $10,000,
            about $1,000 of it on hiring expenses.<Cite n={37} />
          </p>
        </Prose>

        <ChartFigure
          kicker="Chart 4 · Association research"
          title="What an open or lost dental assistant costs a practice"
          note={
            <>
              DANB and DALE Foundation research, survey of December 2023, more than 560
              responses.<Cite n={[36, 37]} /> DANB is a certification body for dental
              assistants. Figures are averages, not quotes for your practice.
            </>
          }
          table={{
            caption: "Cost of dental assistant turnover and vacancy (DANB)",
            columns: [{ header: "Measure" }, { header: "Amount", numeric: true }],
            rows: [
              ["Average cost of assistant turnover", "$10,000"],
              ["Average revenue at risk, vacant position", "More than $21,000"],
              ["Revenue at risk if open a full year", "Nearly $110,000"],
            ],
          }}
        >
          <HBarChart
            max={120_000}
            ticks={[0, 40_000, 80_000, 120_000]}
            formatTick={kTick}
            ariaLabel="Dental assistant costs per DANB: average turnover cost $10,000; average revenue at risk from a vacant position more than $21,000; revenue at risk if the role stays open a full year nearly $110,000."
            rows={[
              { label: "Turnover cost, average", value: 10_000, display: "$10,000", tone: "ink" },
              { label: "Revenue at risk, vacant role", value: 21_000, display: "More than $21,000", sub: "average", tone: "ink" },
              { label: "Revenue at risk, open 12 months", value: 110_000, display: "Nearly $110,000", tone: "brick" },
            ]}
          />
        </ChartFigure>

        <Prose>
          <p>
            General workforce figures are wider and older. Gallup estimated in 2019 that
            replacing an employee costs one-half to two times their annual salary, without
            detailing its method on the page.<Cite n={38} /> SHRM reported in 2022 that the
            average cost per hire was nearly $4,700.<Cite n={39} /> You will also see
            &ldquo;a bad hire costs 30 percent of first-year earnings,&rdquo; credited to the
            U.S. Department of Labor. We could not trace it to any Labor Department source,
            so we do not use it.
          </p>
        </Prose>
      </ReportSection>

      {/* ── 7. Multi-location ──────────────────────────────────── */}
      <ReportSection
        id="multi-location"
        kicker="07 · For multi-location groups"
        title="What this means if you hire across many practices"
      >
        <Prose>
          <ul>
            <li>
              <strong>Price fees by role, not by headline percentage.</strong> At 20 to 30
              percent, an assistant hire runs about $9,600 to $14,400 and a general dentist
              about $34,000 to $51,000 (DSO Hire calculation).<Cite n={[1, 11]} /> Ten hires
              a year at different roles can produce very different invoices.
            </li>
            <li>
              <strong>Get the rate card and the guarantee in writing.</strong> Frontline sets
              final pricing by contract, and its own pages describe the warranty remedy two
              ways.<Cite n={[1, 4]} /> Ask for the length, the remedy, and how it is
              pro-rated.
            </li>
            <li>
              <strong>Check temp-to-perm terms before you book shifts.</strong> Several
              platforms publish $0 conversion fees<Cite n={[17, 19, 20]} />; others do not
              publish them at all.<Cite n={28} />
            </li>
            <li>
              <strong>Count payroll costs on W-2 shifts.</strong> Teero adds W-2 payroll
              costs to its 12 percent, and GoTu adds 20 percent of pay where shifts run as
              W-2.<Cite n={[16, 17]} />
            </li>
            <li>
              <strong>Use agencies where they earn the fee.</strong> A hard dentist or
              specialist search, a market you do not know, or a shift you need filled
              tomorrow. For routine roles your team can source, board and platform costs are
              a fraction of a placement fee, but the screening work moves to you.
            </li>
            <li>
              <strong>Weigh the vacancy, not just the fee.</strong> With one in five practices
              reporting hygienist roles open more than six months<Cite n={35} />, a slow cheap
              search can cost more than a fast expensive one.<Cite n={36} />
            </li>
          </ul>
          <p>
            One more option, and it is ours: DSO Hire is a hiring platform for dental groups
            priced as a flat monthly subscription with no placement fees, from{" "}
            {usd(solo.monthlyPrice)} a month ({solo.name}) to {usd(enterprise.monthlyPrice)} a
            month ({enterprise.name}). It replaces job board spend and recruiter fees for the
            roles your team can fill directly; it does not replace an agency for the searches
            above. <Link href="/pricing">See plan details</Link>.
          </p>
        </Prose>
      </ReportSection>

      <ReportFaq items={FAQ} />
    </ReportShell>
  );
}
