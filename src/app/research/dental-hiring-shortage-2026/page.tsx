/**
 * /research/dental-hiring-shortage-2026: DSO Hire Research, Nº 2.
 *
 * SOURCE OF TRUTH: docs/research/dental-hiring-shortage-2026.md (fact
 * dossier compiled 2026-10-19). Every figure on this page is quoted in that
 * dossier or is DSO Hire arithmetic on official BLS series, labeled "DSO
 * Hire calculation". Do not add a number here that is not in the dossier.
 * Sources are re-numbered for this page in order of first use (SRC below);
 * cite them by key, e.g. <Cite n={N.hpiQ3} />.
 *
 * Spot-checked against live pages on 2026-10-19:
 *   - ADA HPI Q3 2026 PDF: hygienist/assistant difficulty series, fill rates
 *     (42.1 / 66.8, 42.8 / 62.3), time-to-fill buckets, 21% wages: all match.
 *   - BLS OOH hygienists ($98,100; 225,300 jobs; 8%; 15,000 openings) and
 *     assistants ($48,070; 388,600; 7%; 53,000): match.
 *   - HRSA HPSA quarterly report (8,027; 78,301,897; 32.94%; 13,145; rural
 *     5,142 / 64.06%): match.
 *   - HPI Perspectives (60% adequate, 91%, 16% enrollment): match.
 *   - HPI dentist workforce page now says 205,088 professionally active
 *     dentists as of 2025; the dossier's 202,485 is the 2024 count from the
 *     PDF. We use the live figure (source "hpiWorkforcePage").
 *   - HRSA projections page refused automated access (403); its figures are
 *     used as recorded in the dossier.
 *
 * Draft gate: robots come from researchRobots() (src/lib/research/config.ts).
 */

import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/research/callout";
import { Cite } from "@/components/research/cite";
import {
  ChartFigure,
  ColumnChart,
  HBarChart,
  StackedBarChart,
  type ChartTone,
} from "@/components/research/charts";
import { DataTable } from "@/components/research/data-table";
import { KeyFindings } from "@/components/research/key-findings";
import { PullQuote } from "@/components/research/pull-quote";
import { RelatedReports } from "@/components/research/related-reports";
import {
  Accent,
  Prose,
  ReportFaq,
  ReportSection,
  ReportShell,
} from "@/components/research/report-shell";
import { researchRobots } from "@/lib/research/config";
import {
  HIRING_SHORTAGE_2026 as REPORT,
  researchPath,
  STAFFING_COSTS_2026,
  type ResearchSource,
} from "@/lib/research/reports";

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

/* ── Sources (re-numbered from the dossier, in order of first use) ── */

const HPI = "Association (ADA Health Policy Institute)";
const HPI_PDF = "https://www.ada.org/-/media/project/ada-organization/ada/ada-org/files/resources/research/hpi";

const SRC = {
  hpiQ3: { label: "ADA Health Policy Institute, The State of the U.S. Dental Economy: 3rd Quarter 2026 Update (plus insights on dental staff recruitment)", url: `${HPI_PDF}/state_us_dental_economy_q32026.pdf`, kind: `${HPI}; panel survey, n=704 private-practice dentists`, date: "Q3 2026 (fielded September 14, 2026)" },
  hpiQ1: { label: "ADA Health Policy Institute, The State of the U.S. Dental Economy: 1st Quarter 2026 Update (plus a closer look into staffing challenges)", url: `${HPI_PDF}/state_us_dental_economy_q12026.pdf`, kind: `${HPI}; panel survey, n=796`, date: "Q1 2026" },
  hpiQ4: { label: "ADA Health Policy Institute, The State of the U.S. Dental Economy: 4th Quarter 2025 Update (plus a look ahead into 2026)", url: `${HPI_PDF}/state_us_dental_economy_q42025.pdf`, kind: HPI, date: "revised February 3, 2026" },
  bls: { label: "U.S. Bureau of Labor Statistics, Occupational Outlook Handbook, Dental Hygienists", url: "https://www.bls.gov/ooh/healthcare/dental-hygienists.htm", kind: "Government", date: "last modified August 27, 2026" },
  blsDa: { label: "U.S. Bureau of Labor Statistics, Occupational Outlook Handbook, Dental Assistants", url: "https://www.bls.gov/ooh/healthcare/dental-assistants.htm", kind: "Government", date: "last modified August 27, 2026" },
  hrsaProj: { label: "HRSA National Center for Health Workforce Analysis, Health Workforce Projections (2023 to 2038)", url: "https://bhw.hrsa.gov/data-research/projecting-health-workforce-supply-demand", kind: "Government", date: "released December 2025; page last reviewed September 2026" },
  hpiWorkforce: { label: "ADA Health Policy Institute, The U.S. Dentist Workforce (2025 update)", url: `${HPI_PDF}/us_dentist_workforce_2025.pdf`, kind: HPI, date: "data as of August 2025" },
  adea2025: { label: "ADEA, Dentists of Tomorrow 2025: An Analysis of the Results of the ADEA 2025 Survey of U.S. Dental School Seniors (Istrate, Samanta, Booker, West)", url: "https://www.adea.org/docs/default-source/adea-main/research-publications/dental-school-seniors/adea_dentists_of_tomorrow_2025.pdf", kind: "Academic association; survey of 3,325 seniors, 48% response", date: "January 2026" },
  blsCes: { label: "U.S. Bureau of Labor Statistics, Current Employment Statistics, Offices of Dentists (CES6562120001, CES6562120003, CES6562120008) and CPI-U all items (CUSR0000SA0), seasonally adjusted", url: "https://data.bls.gov/timeseries/CES6562120001", kind: "Government; latest months preliminary; DSO Hire analysis" },
  adaNews2025: { label: "ADA News, \"Five years later: Staffing shortages, infection control since the COVID-19 pandemic\" (M.B. Versaci)", url: "https://adanews.ada.org/ada-news/2025/february/five-years-later-staffing-shortages-infection-control-since-the-covid-19-pandemic/", kind: "Association news", date: "February 27, 2025" },
  hpiPerspectives: { label: "ADA Health Policy Institute, \"We Have a Major Dental Hygienist Shortage. It's Unlikely to Go Away Soon.\" (HPI Perspectives)", url: "https://www.ada.org/resources/research/health-policy-institute/dentist-workforce/dental-hygienist-shortage", kind: HPI, date: "April 2026" },
  blsDds: { label: "U.S. Bureau of Labor Statistics, Occupational Outlook Handbook, Dentists", url: "https://www.bls.gov/ooh/healthcare/dentists.htm", kind: "Government", date: "last modified August 27, 2026" },
  hpsa: { label: "HRSA Bureau of Health Workforce, Designated Health Professional Shortage Areas Statistics, Fourth Quarter of Fiscal Year 2026", url: "https://data.hrsa.gov/default/generatehpsaquarterlyreport", kind: "Government", date: "as of September 30, 2026" },
  adaCovid: { label: "American Dental Association, \"Research reveals impact of COVID-19 on dental hygienists\" (press release)", url: "https://www.ada.org/about/press-releases/research-reveals-impact-of-covid-19-on-dental-hygienists", kind: "Association; ADA and ADHA panel, September 2020 to August 2021", date: "February 22, 2022" },
  hpi2022: { label: "ADA Health Policy Institute with ADAA, ADHA, DANB and IgniteDA, Dental Workforce Shortages: Data to Navigate Today's Labor Market", url: `${HPI_PDF}/dental_workforce_shortages_labor_market.pdf`, kind: "Association; surveys of June 2022 (assistants n=4,255, hygienists n=5,122)", date: "October 2022" },
  danb2026: { label: "DANB, \"Certification offers a solution to dental assistant workforce challenges, new data shows\" (2026 Salary and Satisfaction Survey)", url: "https://www.danb.org/news-blog/detail/news/certification-offers-a-solution-to-dental-assistant-workforce-challenges-new-data-shows", kind: "Association (certification board); 3% response rate", date: "September 8, 2026" },
  danb2025: { label: "DANB, \"What dentists should know about retaining dental assistants\"", url: "https://www.danb.org/news-blog/detail/blog/what-dentists-should-know-about-retaining-dental-assistants", kind: "Association (certification board)", date: "January 15, 2025" },
  danb2022: { label: "DANB, \"New data reveal dental assistant workforce trends\"", url: "https://www.danb.org/news-blog/detail/news/new-data-reveal-dental-assistant-workforce-trends", kind: "Association (certification board); 7% response rate", date: "November 7, 2022" },
  gotu: { label: "GoTu, \"2026 State of Work\" report announcement", url: "https://gotu.com/news-trends/state-of-work-2026/", kind: "Vendor (temp staffing platform); convenience sample, fielding dates not stated", date: "April 28, 2026" },
  hpiWorkforcePage: { label: "ADA Health Policy Institute, Dentist Workforce (web page)", url: "https://www.ada.org/resources/research/health-policy-institute/dentist-workforce", kind: HPI, date: "figure as of 2025; read October 19, 2026" },
  adaNews2025b: { label: "ADA News, \"HPI: More new dentists affiliated with DSOs\" (M.B. Versaci)", url: "https://adanews.ada.org/new-dentist/2025/november/hpi-more-new-dentists-affiliated-with-dsos/", kind: "Association news", date: "November 17, 2025" },
  adea2024: { label: "ADEA, Dentists of Tomorrow 2024 (Education Research Series, Issue 7)", url: "https://www.adea.org/home/publications/research-and-data/graduating-oral-health-students/dentists-of-tomorrow-2024", kind: "Academic association", date: "December 2024" },
  hpiQ2: { label: "ADA Health Policy Institute, The State of the U.S. Dental Economy: 2nd Quarter 2026 Update", url: `${HPI_PDF}/state_us_dental_economy_q22026.pdf`, kind: `${HPI}; panel survey, n=552`, date: "Q2 2026" },
  danbNumbers: { label: "DANB, \"Dental assisting by the numbers\"", url: "https://www.danb.org/news-blog/detail/blog/dental-assisting-by-the-numbers", kind: "Association; model inputs not published on the page, use with caution", date: "April 9, 2025" },
} satisfies Record<string, ResearchSource>;

type SrcKey = keyof typeof SRC;
const SRC_KEYS = Object.keys(SRC) as SrcKey[];
const SOURCES: ResearchSource[] = SRC_KEYS.map((k) => SRC[k]);
/** Source number by key, 1-based, in SOURCES order. */
const N = Object.fromEntries(SRC_KEYS.map((k, i) => [k, i + 1])) as Record<SrcKey, number>;

/* ── Figures (all from the dossier; see file header) ────────────── */

const pctTick = (n: number) => `${n}%`;
const fmt1 = (n: number) => n.toFixed(1);

/** HPI quarterly panel, Q1 2024 to Q3 2026, values as printed on the Q3 2026 charts [hpiQ3]. */
const QUARTERS = [
  "Q1 2024", "Q2 2024", "Q3 2024", "Q4 2024",
  "Q1 2025", "Q2 2025", "Q3 2025", "Q4 2025",
  "Q1 2026", "Q2 2026", "Q3 2026",
] as const;
const QUARTER_TICKS = QUARTERS.map((q) => q.replace(" 20", " ’"));
const HYG_HARD = [88.8, 88.7, 91.7, 90.1, 87.9, 91.7, 90.8, 88.3, 90.5, 87.7, 88.3] as const;
const DA_HARD = [77.2, 75.6, 75.6, 70.4, 72.0, 70.9, 69.2, 70.4, 69.8, 68.2, 76.8] as const;
const HYG_RECRUITING = [35.5, 34.2, 33.9, 31.7, 33.1, 37.1, 32.5, 31.4, 37.6, 36.8, 35.1] as const;
const DA_RECRUITING = [37.5, 37.6, 40.0, 36.6, 39.0, 39.7, 37.5, 34.9, 36.7, 38.2, 34.2] as const;

/** Fill rates among dentists who recruited in the prior three months [hpiQ3]. */
const FILL = [
  { label: "Hygienists, Q3 2025", value: 42.8, tone: "muted" as const },
  { label: "Hygienists, Q3 2026", value: 42.1, tone: "brick" as const },
  { label: "Assistants, Q3 2025", value: 62.3, tone: "muted" as const },
  { label: "Assistants, Q3 2026", value: 66.8, tone: "ink" as const },
];

/** Time to fill, among filled roles [hpiQ3]. Order: <2 wk, 2 wk to 1 mo, 1 to 3 mo, 3 to 6 mo, >6 mo. */
const TTF_BUCKETS: readonly { label: string; tone: ChartTone }[] = [
  { label: "Under 2 weeks", tone: "muted" },
  { label: "2 weeks to 1 month", tone: "heritage" },
  { label: "1 to 3 months", tone: "ink" },
  { label: "3 to 6 months", tone: "bronze" },
  { label: "More than 6 months", tone: "brick" },
];
const TTF = [
  { label: "Hygienists, Q3 2025", values: [12.1, 15.0, 35.5, 15.9, 21.5] },
  { label: "Hygienists, Q3 2026", values: [9.6, 19.2, 30.8, 19.2, 21.2] },
  { label: "Assistants, Q3 2025", values: [16.7, 36.1, 34.4, 8.3, 4.5] },
  { label: "Assistants, Q3 2026", values: [11.2, 31.1, 37.9, 12.4, 7.5] },
] as const;

/** Share saying staffing is adequate, Q1 2026 [hpiQ1]. */
const ADEQUATE = [
  { label: "Dental hygienists", value: 60.3, tone: "brick" as const },
  { label: "Dental assistants", value: 73.5, tone: "ink" as const },
  { label: "Administrative staff", value: 79.3, tone: "ink" as const },
];

/** Share of U.S. dentists affiliated with a DSO [hpiWorkforce]. No 2018 value published. */
const DSO_YEARS = ["2015", "2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024"] as const;
const DSO_SHARE = [7.2, 8.1, 8.5, null, 10.0, 10.7, 11.1, 12.7, 13.8, 16.1] as const;

/* ── FAQ: plain strings, each restating facts cited in the body ──── */

const FAQ = [
  {
    q: "Is there a dental hygienist shortage in 2026?",
    a: "Every available measure points that way. In the ADA Health Policy Institute's Q3 2026 survey, 88.3 percent of dentists who had recruited a hygienist in the prior three months called it very or extremely challenging, and that share has stayed between 87.7 and 91.7 percent every quarter since early 2024. In Q1 2026 only 60.3 percent of dentists said they had an adequate number of hygienists. HRSA projects a shortage of 33,220 full-time-equivalent hygienists in 2038.",
  },
  {
    q: "How long does it take to fill a dental hygienist position?",
    a: "Among dentists who filled a hygienist role in Q3 2026, 30.8 percent said it was open 1 to 3 months, 19.2 percent said 3 to 6 months, and 21.2 percent said more than six months. Only 42.1 percent of dentists who recruited a hygienist filled the role at all, compared with 66.8 percent for dental assistants. These figures come from the ADA Health Policy Institute's quarterly panel of private-practice dentists.",
  },
  {
    q: "How many dental hygienist and assistant jobs will open each year?",
    a: "The Bureau of Labor Statistics projects about 15,000 openings for dental hygienists and about 53,000 for dental assistants each year, on average, from 2025 to 2035. It projects hygienist employment to grow 8 percent and assistant employment 7 percent over that decade.",
  },
  {
    q: "Are more dentists working for DSOs?",
    a: "Yes. The ADA Health Policy Institute reports that 16.1 percent of U.S. dentists were affiliated with a DSO in 2024, up from 7.2 percent in 2015, and 26.5 percent of dentists up to 10 years out of dental school were affiliated. In ADEA's 2025 survey of dental school seniors, 32 percent of those entering private practice intended to join a DSO.",
  },
  {
    q: "Have dental office wages kept up with inflation?",
    a: "No. The ADA Health Policy Institute reports that hourly earnings of dental office staff rose 21 percent from January 2021 while inflation was 27 percent. Our own calculation on current BLS series finds production and nonsupervisory pay in offices of dentists up 24.6 percent from January 2021 to August 2026, against 27.2 percent for consumer prices. The two differ, but both show wages trailing inflation.",
  },
] as const;

export default function HiringShortageReport() {
  return (
    <ReportShell
      report={REPORT}
      kicker="DSO Hire Research · Nº 2 · October 2026"
      title={
        <>
          The dental hiring shortage, <Accent>by the numbers.</Accent>
        </>
      }
      dek="How hard hygienists and assistants are to hire in 2026, how long the chair sits empty, and what federal projections say about the next decade. Built from ADA, BLS and HRSA data, with every caveat left in."
      sources={SOURCES}
      accessed="October 19, 2026"
      cta={{
        title: (
          <>
            Fill the hygiene chair <span className="text-heritage-bright">faster.</span>
          </>
        ),
        sub: "See how dental groups run hiring across every location from one pipeline. Live demo, no sign-up.",
      }}
      methodology={
        <>
          <p>
            Every figure in this report was read on the source&rsquo;s own page or PDF, or
            pulled from official BLS data series, on October 19, 2026, unless the source list
            shows a different date. We re-checked the most important numbers against the live
            sources the same day: the ADA Health Policy Institute&rsquo;s Q3 2026 staffing
            charts, the BLS Occupational Outlook Handbook pages for hygienists and assistants,
            HRSA&rsquo;s quarterly shortage area report, and HPI&rsquo;s April 2026 hygienist
            article. All matched. One figure changed: HPI&rsquo;s dentist workforce page now
            reports 205,088 professionally active dentists as of 2025, so we use that rather
            than the 2024 count in its earlier PDF. HRSA&rsquo;s projections page refused our
            automated request that day, so its figures are as we recorded them from the
            December 2025 release.
          </p>
          <p>
            <strong>About the HPI survey.</strong>{" "}The quarterly figures come from HPI&rsquo;s
            Economic Outlook and Emerging Issues in Dentistry panel. Samples: 704
            private-practice respondents in Q3 2026 (31.2 percent adjusted response rate), 552 in
            Q2 2026, and 796 responses in Q1 2026.<Cite n={[N.hpiQ3, N.hpiQ2, N.hpiQ1]} />{" "}HPI
            notes the panel skews toward ADA members, general dentists, practice owners, solo or
            small-group dentists, mid-to-late career, white, and urban dentists. Recruiting
            questions are asked only of dentists who recruited in the prior three months, so the
            base for those percentages is roughly a third of respondents. Quarterly values were
            read from HPI&rsquo;s chart labels.
          </p>
          <p>
            Lines labeled <strong>DSO Hire calculation</strong>{" "}are our arithmetic on official
            BLS series, with the series named. Where two credible sources disagree, we show both
            and say why they might differ.
          </p>
          <p>
            <strong>Numbers we did not use, and why.</strong>{" "}These circulate widely in dental
            hiring content. We could not verify them, or the primary source says something
            different.
          </p>
          <ul>
            <li>
              <strong>&ldquo;1 in 4 hygienist positions are unfilled.&rdquo;</strong>{" "}Attributed
              only to unnamed industry recruiting data. We found no primary U.S. vacancy-rate
              source; a 23 percent hygienist vacancy figure from England&rsquo;s NHS may be the
              origin.
            </li>
            <li>
              <strong>&ldquo;8 percent of hygienists left the workforce.&rdquo;</strong>{" "}The
              primary source says 7.9 percent of survey respondents were not working in
              September 2020, falling to 4.9 percent by August 2021, with permanent exits
              estimated at 1.6 percent.<Cite n={N.adaCovid} />
            </li>
            <li>
              <strong>&ldquo;31 percent of hygienists and 34 percent of assistants will retire
              within five years.&rdquo;</strong>{" "}Real numbers, but they are respondents&rsquo;
              expectations in a June 2022 survey that included former workers, not a forecast.
              <Cite n={N.hpi2022} />{" "}We use them only with that framing.
            </li>
            <li>
              <strong>Front desk turnover of 25 to 35 percent a year, and $10,000 to $20,000 a
              month lost to a front desk vacancy.</strong>{" "}No primary source cited anywhere we
              looked.
            </li>
            <li>
              <strong>&ldquo;20.5 percent of hygienists changed jobs in 2024&rdquo; and
              &ldquo;23 percent of assistants switched practices in 2024.&rdquo;</strong>{" "}We could
              not trace either to a primary page. The closest verified figure is DANB&rsquo;s
              &ldquo;about one-quarter&rdquo; of assistants leaving a job in the prior year.
              <Cite n={N.danb2025} />
            </li>
            <li>
              <strong>A 6 percent revenue loss for each day an assistant role is vacant.</strong>{" "}
              It does appear on DANB&rsquo;s page, but the model behind it is not published there
              and the figure cannot be interpreted without it.<Cite n={N.danbNumbers} />
            </li>
            <li>
              <strong>Hygienist time to fill of &ldquo;6 to 12 weeks.&rdquo;</strong>{" "}No primary
              data behind it. We use HPI&rsquo;s time-to-fill survey instead.
            </li>
            <li>
              <strong>Older vintages.</strong>{" "}HRSA&rsquo;s 2037 projections, the 7,980 dental
              shortage area count, and BLS&rsquo;s 2023 to 2033 projections with May 2024 wages
              have all been superseded by the newer releases used here. We do not mix vintages.
            </li>
          </ul>
          <p>
            We sell hiring software to dental groups, so treat our framing with the same care as
            anyone else&rsquo;s.
          </p>
        </>
      }
    >
      <Prose>
        <p>
          Anyone who has tried to hire a dental hygienist in the last few years already knows
          it is hard. This report puts numbers on how hard, using the best public data we could
          find: the ADA Health Policy Institute&rsquo;s quarterly survey of dentists, federal
          labor and workforce projections, and dental school survey data.
        </p>
        <p>
          The short version: hygienists are the bottleneck, it has not eased, and the
          federal outlook does not expect it to. The data also has limits, and we flag them where
          they matter. Where a number comes from a firm with something to sell, including us, we
          say so.
        </p>
      </Prose>

      <div className="mt-12">
        <KeyFindings
          findings={[
            <>
              <strong>About 9 in 10 dentists who recruit a hygienist call it very or extremely
              challenging.</strong>{" "}88.3 percent in Q3 2026, and between 87.7 and 91.7 percent
              every quarter since Q1 2024.<Cite n={N.hpiQ3} />
            </>,
            <>
              <strong>Only about 2 in 5 filled the hygienist role.</strong>{" "}42.1 percent in Q3
              2026 (42.8 percent a year earlier), against 66.8 percent for dental assistants.
              <Cite n={N.hpiQ3} />
            </>,
            <>
              <strong>One in five filled hygienist roles had been open more than six
              months</strong>{" "}(21.2 percent). For assistants it was 7.5 percent, up from 4.5.
              <Cite n={N.hpiQ3} />
            </>,
            <>
              <strong>4 in 10 dentists do not have enough hygienists.</strong>{" "}Only 60.3 percent
              said their hygienist staffing was adequate, against 73.5 percent for assistants and
              79.3 percent for administrative staff.<Cite n={N.hpiQ1} />
            </>,
            <>
              <strong>Staffing is a top challenge for 2026, and the top one for DSO
              dentists.</strong>{" "}54.2 percent of dentists named it in their top three; among DSO
              dentists it ranked first, at 59.3 percent.<Cite n={N.hpiQ4} />
            </>,
            <>
              <strong>The federal outlook does not ease it.</strong>{" "}BLS projects about 15,000
              hygienist and 53,000 assistant openings a year through 2035.
              <Cite n={[N.bls, N.blsDa]} />{" "}HRSA projects a 33,220 full-time-equivalent
              hygienist shortage in 2038.<Cite n={N.hrsaProj} />
            </>,
            <>
              <strong>New dentists are moving to DSOs.</strong>{" "}16.1 percent of U.S. dentists
              were DSO-affiliated in 2024, up from 7.2 percent in 2015, and 26.5 percent of those
              up to 10 years out of school.<Cite n={N.hpiWorkforce} />{" "}32 percent of 2025 seniors
              heading into private practice intend to join one.<Cite n={N.adea2025} />
            </>,
            <>
              <strong>Dental office wages have trailed inflation since 2021.</strong>{" "}Pay rose
              24.6 percent from January 2021 to August 2026 while prices rose 27.2 percent (BLS
              series, DSO Hire calculation).<Cite n={N.blsCes} />{" "}HPI&rsquo;s own reading is 21
              percent against 27.<Cite n={N.hpiQ3} />
            </>,
          ]}
        />
      </div>

      {/* ── 1. Hygienists ──────────────────────────────────────── */}
      <ReportSection
        id="hygienists"
        kicker="01 · The hardest hire"
        title="Nine in ten, every quarter: hygienists are the hardest role to recruit."
      >
        <Prose>
          <p>
            Each quarter the ADA Health Policy Institute asks a panel of private-practice
            dentists whether they recruited for a role in the past three months, and if so, how
            hard it was. In Q3 2026, 35.1 percent had recruited a hygienist, and 88.3 percent of
            them called it &ldquo;very&rdquo; or &ldquo;extremely challenging.&rdquo;
            <Cite n={N.hpiQ3} />{" "}That share has not dropped below 87.7 percent in any quarter
            since the start of 2024. HPI&rsquo;s own summary: &ldquo;This trend has been
            consistent for more than two years.&rdquo;<Cite n={N.hpiQ3} />
          </p>
          <p>
            It was worse before. About 95 percent of dentists called hygienist recruiting very
            or extremely challenging at the end of 2022,<Cite n={N.adaNews2025} />{" "}and 94.9
            percent did in Q4 2023.<Cite n={N.hpiQ4} />{" "}So the reading has eased a few points
            from its peak, then held.
          </p>
          <p>
            Dental assistants are easier, but not easy. In Q3 2026, 34.2 percent of dentists
            recruited an assistant and 76.8 percent of them found it very or extremely
            challenging, up from 68.2 percent the quarter before and close to the early-2024
            high.<Cite n={N.hpiQ3} />{" "}Administrative staff are easier still: in Q1 2026, 58.0
            percent of dentists recruiting for those roles said it was very or extremely
            challenging, in a range of 55.3 to 66.6 percent since early 2024.
            <Cite n={N.hpiQ1} />
          </p>
        </Prose>

        <ChartFigure
          kicker="Chart 1 · ADA Health Policy Institute"
          title="Share of recruiting dentists who call it very or extremely challenging, by quarter"
          legend={[
            { label: "Dental hygienists", tone: "brick" },
            { label: "Dental assistants", tone: "ink" },
          ]}
          note={
            <>
              Among dentists who recruited for the role in the prior three months, roughly a
              third of each quarter&rsquo;s respondents. Q3 2026 n=704 private-practice dentists.
              Values as labeled on HPI&rsquo;s Q3 2026 charts.<Cite n={N.hpiQ3} />{" "}Zero-based
              axis: the flat line is the finding.
            </>
          }
          table={{
            caption: "Recruiting difficulty and share recruiting, by quarter",
            columns: [
              { header: "Quarter" },
              { header: "Hygienists: very or extremely challenging", numeric: true },
              { header: "Assistants: very or extremely challenging", numeric: true },
              { header: "Share recruiting hygienists", numeric: true },
              { header: "Share recruiting assistants", numeric: true },
            ],
            rows: QUARTERS.map((q, i) => [
              q,
              `${fmt1(HYG_HARD[i])}%`,
              `${fmt1(DA_HARD[i])}%`,
              `${fmt1(HYG_RECRUITING[i])}%`,
              `${fmt1(DA_RECRUITING[i])}%`,
            ]),
          }}
        >
          <ColumnChart
            categories={QUARTER_TICKS}
            series={[
              { label: "Dental hygienists", tone: "brick", values: HYG_HARD },
              { label: "Dental assistants", tone: "ink", values: DA_HARD },
            ]}
            max={100}
            ticks={[0, 25, 50, 75, 100]}
            formatTick={pctTick}
            formatValue={fmt1}
            minWidth="42rem"
            ariaLabel={`Share of recruiting dentists calling it very or extremely challenging, Q1 2024 to Q3 2026. Hygienists: ${QUARTERS.map((q, i) => `${q} ${HYG_HARD[i]}%`).join(", ")}. Assistants: ${QUARTERS.map((q, i) => `${q} ${DA_HARD[i]}%`).join(", ")}.`}
          />
        </ChartFigure>

        <Prose>
          <p>
            Why is it so hard? In Q1 2026, HPI asked dentists in their own words. For
            hygienists, 66.5 percent cited not enough applicants, 36.8 percent cited demands for
            high wages or benefits, and 7.9 percent said candidates would not work the advertised
            hours. For assistants, the top reasons were not enough applicants (57.5 percent),
            unqualified or poor-quality applicants (40.9 percent), and high wage demands (17.1
            percent).<Cite n={N.hpiQ1} />
          </p>
        </Prose>

        <Callout tone="caveat" label="Who is answering">
          <p>
            These percentages are among dentists who recruited for the role in the prior three
            months, not all dentists. The HPI panel leans toward ADA members, practice owners,
            and solo or small-group practices, so multi-location groups are underrepresented.
            <Cite n={N.hpiQ3} />
          </p>
        </Callout>
      </ReportSection>

      {/* ── 2. Time to fill ────────────────────────────────────── */}
      <ReportSection
        id="time-to-fill"
        kicker="02 · Time to fill"
        title="Fewer than half fill the hygiene role. One in five waited more than six months."
      >
        <Prose>
          <p>
            HPI&rsquo;s Q3 2026 update added a question most surveys skip: did you actually fill
            the role? Among dentists recruiting a hygienist, 42.1 percent did, almost the same as
            a year earlier (42.8 percent). Among those recruiting an assistant, 66.8 percent
            filled it, up from 62.3 percent.<Cite n={N.hpiQ3} />{" "}As far as we found, this is the
            only dentistry-specific, nationally sampled time-to-fill data available.
          </p>
        </Prose>

        <ChartFigure
          kicker="Chart 2 · ADA Health Policy Institute"
          title="Share of recruiting dentists who filled the role"
          note={
            <>
              Among dentists who recruited for the role in the prior three months. Q3 2025
              n=770; Q3 2026 n=704.<Cite n={N.hpiQ3} />
            </>
          }
          table={{
            caption: "Fill rate by role, Q3 2025 and Q3 2026",
            columns: [{ header: "Role and quarter" }, { header: "Filled the role", numeric: true }],
            rows: FILL.map((f) => [f.label, `${fmt1(f.value)}%`]),
          }}
        >
          <HBarChart
            max={100}
            ticks={[0, 25, 50, 75, 100]}
            formatTick={pctTick}
            ariaLabel={`Share of recruiting dentists who filled the role: ${FILL.map((f) => `${f.label}, ${f.value}%`).join("; ")}.`}
            rows={FILL.map((f) => ({ label: f.label, value: f.value, display: `${fmt1(f.value)}%`, tone: f.tone }))}
          />
        </ChartFigure>

        <Prose>
          <p>
            For roles that were filled, HPI also asked how long the position had been open.
            Hygienist roles skew long: half took one to six months, and 21.2 percent had been
            open more than six months, roughly the same as a year earlier (21.5 percent).
            Assistant roles fill faster, but took slightly longer than a year ago: 7.5 percent
            were open more than six months, up from 4.5 percent.<Cite n={N.hpiQ3} />
          </p>
        </Prose>

        <ChartFigure
          kicker="Chart 3 · ADA Health Policy Institute"
          title="How long the position was open before it was filled"
          legend={TTF_BUCKETS}
          note={
            <>
              Among dentists who filled the role. Shares may not sum to exactly 100 because of
              rounding in the source.<Cite n={N.hpiQ3} />
            </>
          }
          table={{
            caption: "Time to fill by role, Q3 2025 and Q3 2026",
            columns: [
              { header: "Role and quarter" },
              ...TTF_BUCKETS.map((b) => ({ header: b.label, numeric: true })),
            ],
            rows: TTF.map((r) => [r.label, ...r.values.map((v) => `${fmt1(v)}%`)]),
          }}
        >
          <StackedBarChart
            max={100}
            ticks={[0, 25, 50, 75, 100]}
            formatTick={pctTick}
            ariaLabel={`How long the position was open before being filled. ${TTF.map((r) => `${r.label}: ${TTF_BUCKETS.map((b, i) => `${b.label.toLowerCase()} ${r.values[i]}%`).join(", ")}`).join(". ")}.`}
            rows={TTF.map((r) => ({
              label: r.label,
              display: `${fmt1(r.values[4])}% over 6 months`,
              segments: r.values.map((v, i) => ({ value: v, tone: TTF_BUCKETS[i].tone })),
            }))}
          />
        </ChartFigure>

        <PullQuote
          attribution={
            <>
              ADA Health Policy Institute, State of the U.S. Dental Economy, Q3 2026
              <Cite n={N.hpiQ3} />
            </>
          }
        >
          &ldquo;Staffing shortages have not eased much within the past year.&rdquo;
        </PullQuote>

        <Prose>
          <p>
            Practices are trying. In Q4 2025, 42.3 percent of dentists said they planned to add
            staff in 2026; by Q3 2026, 40.7 percent said they had.<Cite n={N.hpiQ3} />
          </p>
        </Prose>
      </ReportSection>

      {/* ── 3. Adequacy ────────────────────────────────────────── */}
      <ReportSection
        id="adequacy"
        kicker="03 · Not enough staff"
        title="Four in ten dentists say they do not have enough hygienists."
      >
        <Prose>
          <p>
            Recruiting difficulty measures the search. Adequacy measures the result. In Q1 2026,
            HPI asked all 796 respondents whether they had enough staff in each role. Only 60.3
            percent said yes for hygienists, against 73.5 percent for assistants and 79.3 percent
            for administrative staff.<Cite n={N.hpiQ1} />{" "}As HPI put it in April, &ldquo;only
            60% of dentists have an adequate number of dental hygienists on staff.&rdquo;
            <Cite n={N.hpiPerspectives} />
          </p>
        </Prose>

        <ChartFigure
          kicker="Chart 4 · ADA Health Policy Institute"
          title="Share of dentists who say they have an adequate number of staff, by role"
          note={
            <>
              Q1 2026, n=796. Share answering &ldquo;yes, adequate.&rdquo;
              <Cite n={N.hpiQ1} />
            </>
          }
          table={{
            caption: "Staff adequacy by role, Q1 2026",
            columns: [{ header: "Role" }, { header: "Adequate staffing", numeric: true }],
            rows: ADEQUATE.map((a) => [a.label, `${fmt1(a.value)}%`]),
          }}
        >
          <HBarChart
            max={100}
            ticks={[0, 25, 50, 75, 100]}
            formatTick={pctTick}
            ariaLabel={`Share of dentists reporting adequate staffing, Q1 2026: ${ADEQUATE.map((a) => `${a.label} ${a.value}%`).join("; ")}.`}
            rows={ADEQUATE.map((a) => ({ label: a.label, value: a.value, display: `${fmt1(a.value)}%`, tone: a.tone }))}
          />
        </ChartFigure>

        <Prose>
          <p>
            Benefits are part of the picture. Fewer than half of dentists (42.6 percent) said
            they offer health insurance, and HPI found that practices with adequate staffing
            offer benefits more often.<Cite n={N.hpiQ1} />{" "}One dentist&rsquo;s comment in the
            same survey shows where some practices end up: &ldquo;We now have to use a recruiter
            and pay 17% of first year&rsquo;s wage.&rdquo; That is one respondent&rsquo;s
            experience, not a statistic.<Cite n={N.hpiQ1} />
          </p>
        </Prose>
      </ReportSection>

      {/* ── 4. DSO dentists ────────────────────────────────────── */}
      <ReportSection
        id="dso-dentists"
        kicker="04 · What DSO dentists say"
        title="For dentists in DSOs, staffing is the number one challenge."
      >
        <Prose>
          <p>
            Asked in late 2025 to name their top three challenges for 2026, 55.3 percent of
            dentists picked insurance issues, 54.2 percent staffing shortages, and 41.5 percent
            overhead costs.<Cite n={N.hpiQ4} />{" "}A year earlier, about 62 percent had named
            staffing shortages as the biggest challenge for 2025.<Cite n={N.adaNews2025} />
          </p>
          <p>
            Split by affiliation, staffing ranked first for DSO-affiliated dentists, at 59.3
            percent, against 53.8 percent for dentists outside DSOs.<Cite n={N.hpiQ4} />{" "}DSO
            dentists were also more likely to plan to add staff in 2026: 54.8 percent, against
            41.7 percent.<Cite n={N.hpiQ4} />
          </p>
        </Prose>

        <DataTable
          caption="Top challenges and plans for 2026, DSO vs. non-DSO dentists (asked Q4 2025)"
          minWidth="30rem"
          columns={[
            { header: "Measure" },
            { header: "DSO-affiliated", numeric: true },
            { header: "Not DSO-affiliated", numeric: true },
          ]}
          rows={[
            ["Staffing named as a top-3 challenge", "59.3%", "53.8%"],
            ["Plan to add staff in 2026", "54.8%", "41.7%"],
          ]}
          footnote={
            <>
              ADA Health Policy Institute, Q4 2025 update.<Cite n={N.hpiQ4} />{" "}For all dentists,
              staffing was named by 54.2 percent.
            </>
          }
        />

        <Callout tone="caveat" label="Small subgroup">
          <p>
            HPI does not publish the number of DSO-affiliated respondents. On the plans question,
            the percentages reported for owner-dentists in DSOs are consistent with roughly 31
            people. Read the DSO splits as directional, not precise.
          </p>
        </Callout>
      </ReportSection>

      {/* ── 5. Federal outlook ─────────────────────────────────── */}
      <ReportSection
        id="federal-outlook"
        kicker="05 · The federal outlook"
        title="Federal projections expect demand to keep growing, and hygienists to stay short."
      >
        <Prose>
          <p>
            The Bureau of Labor Statistics updated its projections to the 2025 to 2035 decade in
            August 2026. It expects hygienist jobs to grow 8 percent, which it classes as much
            faster than average, with about 15,000 openings a year, and assistant jobs to grow 7
            percent, with about 53,000 openings a year.<Cite n={[N.bls, N.blsDa]} />{" "}Openings
            include replacing workers who retire or change careers, not just new jobs. BLS
            points to the aging population as one driver: &ldquo;Demand for dental services is
            expected to increase as the older adult population grows.&rdquo;<Cite n={N.bls} />
          </p>
        </Prose>

        <DataTable
          caption="BLS employment projections, 2025 to 2035, and May 2025 pay"
          minWidth="40rem"
          columns={[
            { header: "Occupation" },
            { header: "Jobs, 2025", numeric: true },
            { header: "Change by 2035", numeric: true },
            { header: "Growth", numeric: true },
            { header: "Openings per year", numeric: true },
            { header: "Median pay", numeric: true },
          ]}
          rows={[
            [<>Dental hygienists<Cite n={N.bls} /></>, "225,300", "+17,900", "+8%", "About 15,000", "$98,100"],
            [<>Dental assistants<Cite n={N.blsDa} /></>, "388,600", "+28,800", "+7%", "About 53,000", "$48,070"],
            [<>Dentists<Cite n={N.blsDds} /></>, "161,400", "About +9,000", "+6%", "About 4,800", "$176,110"],
          ]}
          footnote="Projected 2035 jobs: hygienists 243,200; assistants 417,400. Median annual pay, May 2025. Hygienists $47.16 an hour; assistants $23.11 an hour. Hygienists in offices of dentists earned a median $98,280."
        />

        <Prose>
          <p>
            HRSA, the federal health workforce agency, goes further. Its December 2025
            projections show a shortage of 33,220 full-time-equivalent dental hygienists in 2038,
            larger than its projected shortage of 19,860 general dentists. For dentists outside
            metro areas, it projects a 46 percent shortage.<Cite n={N.hrsaProj} />
          </p>
        </Prose>

        <ChartFigure
          kicker="Chart 5 · HRSA"
          title="Projected shortage in 2038, full-time equivalents"
          note={
            <>
              HRSA National Center for Health Workforce Analysis, 2023 to 2038 projections,
              released December 2025.<Cite n={N.hrsaProj} />{" "}Supersedes the earlier 2037
              projections that still circulate online.
            </>
          }
          table={{
            caption: "HRSA projected FTE shortage, 2038",
            columns: [{ header: "Occupation" }, { header: "Projected shortage (FTE)", numeric: true }],
            rows: [
              ["Dental hygienists", "33,220"],
              ["General dentists", "19,860"],
            ],
          }}
        >
          <HBarChart
            max={40_000}
            ticks={[0, 10_000, 20_000, 30_000, 40_000]}
            formatTick={(n) => (n === 0 ? "0" : `${n / 1000}K`)}
            ariaLabel="HRSA projected shortage in 2038: dental hygienists 33,220 full-time equivalents; general dentists 19,860."
            rows={[
              { label: "Dental hygienists", value: 33_220, display: "33,220 FTE", tone: "brick" },
              { label: "General dentists", value: 19_860, display: "19,860 FTE", tone: "ink" },
            ]}
          />
        </ChartFigure>

        <Callout tone="caveat" label="The models disagree on dentists">
          <p>
            The ADA Health Policy Institute projects the number of dentists per capita rising
            through 2040, while HRSA projects a general-dentist shortage in 2038.
            <Cite n={[N.hpiWorkforce, N.hrsaProj]} />{" "}They use different models. Both point the
            same way on the question that matters most for dental groups: hygienists are the
            tighter constraint.
          </p>
        </Callout>

        <Prose>
          <p>
            Federal shortage area designations tell a related story, with an important limit.
            As of September 30, 2026, there were 8,027 dental Health Professional Shortage Areas
            covering 78,301,897 people, with 32.94 percent of need met and 13,145 more dentists
            needed to remove the designations. 5,142 of them (64.06 percent) are rural.
            <Cite n={N.hpsa} />
          </p>
        </Prose>

        <DataTable
          caption="Dental shortage areas: states needing the most dentists, and states with the least need met"
          minWidth="34rem"
          columns={[
            { header: "Most dentists needed" },
            { header: "Dentists needed", numeric: true },
            { header: "Least need met" },
            { header: "Need met", numeric: true },
          ]}
          rows={[
            ["Florida", "1,344", "District of Columbia", "2.90%"],
            ["Texas", "1,331", "Delaware", "4.37%"],
            ["North Carolina", "680", "Kentucky", "9.30%"],
            ["California", "625", "New York", "15.99%"],
            ["New York", "598", "New Mexico", "16.10%"],
            ["Arizona", "556", "Georgia", "17.42%"],
          ]}
          footnote={
            <>
              HRSA, dental HPSA statistics as of September 30, 2026.<Cite n={N.hpsa} />{" "}The
              states with the most designations are California (602), Texas (424), Missouri
              (347), Alaska (342), Illinois (295) and Florida (293).
            </>
          }
        />

        <Callout tone="caveat" label="Dentists only">
          <p>
            Dental shortage areas measure dentists, not hygienists or assistants. A geographic
            area qualifies at a population-to-dentist ratio of at least 5,000 to 1.
            <Cite n={N.hpsa} />{" "}We found no credible state-by-state source for hygienist or
            assistant vacancy rates.
          </p>
        </Callout>

        <Prose>
          <p>
            Jobs in offices of dentists have still grown. BLS counted 1,057.6 thousand in
            September 2026 (preliminary), up 6.7 percent from 991.0 thousand in February 2020
            and 0.8 percent from a year earlier (DSO Hire calculation).<Cite n={N.blsCes} />
          </p>
        </Prose>
      </ReportSection>

      {/* ── 6. Pipeline ────────────────────────────────────────── */}
      <ReportSection
        id="pipeline"
        kicker="06 · Exits and the pipeline"
        title="Some hygienists left during COVID. Schools are enrolling more, slowly."
      >
        <Prose>
          <p>
            An ADA and ADHA panel found that 7.9 percent of hygienists employed in March 2020
            were not working by September 2020, falling to 4.9 percent by August 2021. As of
            August 2021, fewer than half of those who left had returned. Permanent exits were
            estimated at 1.6 percent, possibly about 3,300 hygienists nationwide.
            <Cite n={N.adaCovid} />
          </p>
          <p>
            In a June 2022 survey, 31.4 percent of hygienists and 33.7 percent of assistants
            said they expected to retire within five years. Those are respondents&rsquo;
            expectations, and the sample included former workers.<Cite n={N.hpi2022} />{" "}The
            same report estimated that assistant and hygienist vacancies had cut practice
            capacity by about 10 percent nationally (the report says 11 percent in its body), and
            found more than 8 in 10 recruiting dentists had raised starting pay. It also found
            DSO employees less likely to report high job satisfaction, and described dental
            assisting enrollment declines as part of a long-term downward trend.
            <Cite n={N.hpi2022} />
          </p>
          <p>
            On the supply side, first-year enrollment in hygiene programs rose 16 percent from
            2020 to 2025, according to HPI.<Cite n={N.hpiPerspectives} />{" "}ADA News reported
            &ldquo;nearly 20%&rdquo; growth from 2020&ndash;21 to 2024&ndash;25; the windows
            differ.<Cite n={N.adaNews2025} />
          </p>
          <p>
            Assistant retention is the other half. DANB&rsquo;s 2024 survey found about a
            quarter of assistants left their job in the prior year,<Cite n={N.danb2025} />{" "}and
            its 2022 survey found nearly one in five changed jobs.<Cite n={N.danb2022} />{" "}In its
            2026 survey, 43 percent of assistants said they feel valued by their employer, down
            from 72 percent in 2020, though that survey had a 3 percent response rate.
            <Cite n={N.danb2026} />{" "}A temp staffing platform&rsquo;s 2026 survey of its own
            audience found 60.6 percent of hygienists reporting burnout; it is a vendor
            convenience sample.<Cite n={N.gotu} />
          </p>
        </Prose>
      </ReportSection>

      {/* ── 7. DSO shift ───────────────────────────────────────── */}
      <ReportSection
        id="dso-shift"
        kicker="07 · The DSO shift"
        title="DSO affiliation more than doubled in a decade, led by younger dentists."
      >
        <Prose>
          <p>
            HPI counts 205,088 professionally active dentists in the U.S. as of 2025.
            <Cite n={N.hpiWorkforcePage} />{" "}(BLS reports 161,400 dentist jobs, a different
            measure.<Cite n={N.blsDds} />) The share affiliated with a DSO rose from 7.2 percent
            in 2015 to 16.1 percent in 2024.<Cite n={N.hpiWorkforce} />{" "}Practice ownership moved
            the other way: 73 percent of dentists owned a practice in 2023, against 85 percent in
            2005.<Cite n={N.hpiWorkforce} />
          </p>
        </Prose>

        <ChartFigure
          kicker="Chart 6 · ADA Health Policy Institute"
          title="Share of U.S. dentists affiliated with a DSO"
          note={
            <>
              HPI, The U.S. Dentist Workforce, data as of August 2025.<Cite n={N.hpiWorkforce} />{" "}
              HPI does not show a 2018 value.
            </>
          }
          table={{
            caption: "DSO affiliation share by year",
            columns: [{ header: "Year" }, { header: "Share of dentists", numeric: true }],
            rows: DSO_YEARS.map((y, i) => {
              const v = DSO_SHARE[i];
              return [y, v == null ? "Not reported" : `${fmt1(v)}%`];
            }),
          }}
        >
          <ColumnChart
            categories={DSO_YEARS}
            series={[{ label: "DSO-affiliated dentists", tone: "heritage", values: DSO_SHARE }]}
            max={20}
            ticks={[0, 5, 10, 15, 20]}
            formatTick={pctTick}
            formatValue={fmt1}
            minWidth="24rem"
            ariaLabel={`Share of U.S. dentists affiliated with a DSO: ${DSO_YEARS.map((y, i) => `${y} ${DSO_SHARE[i] ?? "not reported"}${DSO_SHARE[i] == null ? "" : "%"}`).join(", ")}.`}
          />
        </ChartFigure>

        <Prose>
          <p>
            Younger dentists are driving it. In 2024, 26.5 percent of dentists up to 10 years out
            of dental school were DSO-affiliated, against 14.4 percent at 11 to 25 years and 9.1
            percent beyond 25 years.<Cite n={[N.hpiWorkforce, N.adaNews2025b]} />{" "}Among those
            less than five years out, it was 31 percent. In Arizona, Colorado, Georgia, Nevada,
            Oklahoma, Texas and Florida, roughly a quarter of all dentists are affiliated.
            <Cite n={N.hpiWorkforce} />
          </p>
          <p>
            The next class points the same way. In ADEA&rsquo;s survey of 2025 dental school
            seniors, 32 percent of those heading into private practice said they intend to join a
            DSO, up from 28 percent in 2021, and 35 percent among first-generation students.
            <Cite n={N.adea2025} />{" "}The 2024 class also reported 32 percent, almost double the
            18 percent of 2019.<Cite n={N.adea2024} />{" "}Dental schools graduated a record 6,872
            dentists in 2024.<Cite n={N.hpiWorkforce} />
          </p>
          <p>
            For a DSO, that is good news for dentist recruiting and more support staff to hire:
            each new associate needs a hygiene schedule and assistants to run it.
          </p>
        </Prose>
      </ReportSection>

      {/* ── 8. Wages ───────────────────────────────────────────── */}
      <ReportSection
        id="wages"
        kicker="08 · Wages vs. inflation"
        title="Dental office pay has risen since 2021, but not as fast as prices."
      >
        <Prose>
          <p>
            HPI&rsquo;s Q3 2026 update says hourly earnings of dental office staff rose 21
            percent since January 2021, while overall inflation was 27 percent.
            <Cite n={N.hpiQ3} />{" "}One quarter earlier it reported 23 percent.<Cite n={N.hpiQ2} />{" "}
            We ran the same comparison on the current BLS series and got a somewhat smaller gap,
            but a gap all the same.
          </p>
        </Prose>

        <ChartFigure
          kicker="Chart 7 · BLS series, DSO Hire calculation"
          title="Growth in average hourly earnings in offices of dentists vs. consumer prices, January 2021 to August 2026"
          note={
            <>
              BLS Current Employment Statistics, offices of dentists, seasonally adjusted:
              production and nonsupervisory employees $28.26 to $35.22 an hour (CES6562120008);
              all employees $33.42 to $42.05 (CES6562120003). CPI-U all items 262.687 to 334.131
              (CUSR0000SA0). August 2026 is preliminary.<Cite n={N.blsCes} />
            </>
          }
          table={{
            caption: "Wage and price growth since January 2021",
            columns: [{ header: "Measure" }, { header: "Change", numeric: true }],
            rows: [
              ["Consumer prices (CPI-U), Jan 2021 to Aug 2026", "+27.2%"],
              ["Hourly earnings, all employees", "+25.8%"],
              ["Hourly earnings, production and nonsupervisory", "+24.6%"],
              ["HPI reading, staff earnings (Q3 2026 update)", "+21%"],
              ["HPI reading, inflation (Q3 2026 update)", "+27%"],
            ],
          }}
        >
          <HBarChart
            max={30}
            ticks={[0, 10, 20, 30]}
            formatTick={(n) => `+${n}%`}
            ariaLabel="Change from January 2021 to August 2026: consumer prices up 27.2 percent; hourly earnings in offices of dentists up 25.8 percent for all employees and 24.6 percent for production and nonsupervisory employees."
            rows={[
              { label: "Consumer prices (CPI-U)", value: 27.2, display: "+27.2%", tone: "muted" },
              { label: "Hourly earnings, all employees", value: 25.8, display: "+25.8%", tone: "ink" },
              { label: "Hourly earnings, production and nonsupervisory", value: 24.6, display: "+24.6%", tone: "heritage" },
            ]}
          />
        </ChartFigure>

        <Callout tone="calc">
          <p>
            <strong>Change = (August 2026 value ÷ January 2021 value) − 1</strong>, on BLS
            seasonally adjusted series.
          </p>
          <p>
            Production and nonsupervisory pay: $35.22 ÷ $28.26 = +24.6%. CPI-U: 334.131 ÷
            262.687 = +27.2%. Over the most recent year (August 2025 to August 2026), that pay
            rose 1.4 percent against 3.35 percent for prices.<Cite n={N.blsCes} />
          </p>
        </Callout>

        <Callout tone="caveat" label="Two sources, two numbers">
          <p>
            HPI&rsquo;s 21 percent and our 24.6 percent are not the same, likely because of data
            revisions, seasonal adjustment, or the base used. Both show staff pay trailing
            inflation. HPI also reported in Q1 2026 that inflation-adjusted staff wages were
            unchanged over the prior 12 months,<Cite n={N.hpiQ1} />{" "}and in April that the average
            dental office wage, including hygienists, is &ldquo;actually down from a few years
            ago.&rdquo;<Cite n={N.hpiPerspectives} />
          </p>
        </Callout>

        <Prose>
          <p>
            Staff notice. DANB&rsquo;s 2026 survey reported a typical dental assistant raise of
            1 to 3 percent in the past year, against inflation that &ldquo;often exceeded
            4%,&rdquo; again with a 3 percent response rate.<Cite n={N.danb2026} />
          </p>
        </Prose>
      </ReportSection>

      {/* ── 9. Multi-location ──────────────────────────────────── */}
      <ReportSection
        id="multi-location"
        kicker="09 · For multi-location groups"
        title="What this means for a multi-location group"
      >
        <Prose>
          <ul>
            <li>
              <strong>Plan hygienist hires in months, not weeks.</strong>{" "}Half of filled
              hygienist roles took one to six months, and one in five took longer.
              <Cite n={N.hpiQ3} />{" "}Start searches before a departure or a new location opens, and
              budget for temp coverage in between.
            </li>
            <li>
              <strong>Expect to lose some searches.</strong>{" "}Fewer than half of recruiting
              dentists filled a hygienist role.<Cite n={N.hpiQ3} />{" "}Keep a pipeline open for
              recurring roles instead of starting from zero each time.
            </li>
            <li>
              <strong>Pay and benefits are the levers candidates name.</strong>{" "}Wage and benefit
              demands were the second most cited hygienist recruiting problem, and practices with
              adequate staff offer benefits more often.<Cite n={N.hpiQ1} />{" "}Pay has trailed
              inflation since 2021, so check your offers against current BLS medians ($98,100
              for hygienists, $48,070 for assistants) and your local market.
              <Cite n={[N.bls, N.blsDa, N.blsCes]} />
            </li>
            <li>
              <strong>Retention is cheaper than recruiting.</strong>{" "}About a quarter of
              assistants left a job in a year, and fewer feel valued than in 2020.
              <Cite n={[N.danb2025, N.danb2026]} />{" "}DANB estimates replacing an assistant costs 25
              percent of annual pay, though it does not publish the model, so use that with
              caution.<Cite n={N.danbNumbers} />
            </li>
            <li>
              <strong>Use your DSO pull with new dentists.</strong>{" "}More than a quarter of early-career
              dentists are already DSO-affiliated.<Cite n={N.hpiWorkforce} />{" "}Make sure
              the support-staff side can keep up with associate hiring.
            </li>
            <li>
              <strong>Watch rural and high-need markets.</strong>{" "}64 percent of dental shortage
              areas are rural, and HRSA projects a 46 percent nonmetro dentist shortage in 2038.
              <Cite n={[N.hpsa, N.hrsaProj]} />{" "}Recruiting there will need a longer runway.
            </li>
          </ul>
          <p>
            None of this is solved by software alone. Where it can help is the routine work:
            DSO Hire is a hiring platform for dental groups that runs every location&rsquo;s
            openings in one pipeline, with a flat monthly subscription and no placement fees.{" "}
            <Link href="/pricing">See plan details</Link>.
          </p>
          <p>
            Founder Cam Eslinger walks through these findings in a LinkedIn article,{" "}
            <a href="https://www.linkedin.com/pulse/hygiene-chair-still-empty-heres-what-2026-data-says-cam-eslinger-bxaoc">
              The hygiene chair is still empty
            </a>
            .
          </p>
        </Prose>
      </ReportSection>

      <RelatedReports reports={[STAFFING_COSTS_2026]} />

      <ReportFaq items={FAQ} />
    </ReportShell>
  );
}
