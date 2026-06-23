/**
 * Indeed "source-file" XML feed builder (also accepted by LinkedIn Limited
 * Listings and most aggregators). Pure string assembly — no XML library, per
 * codebase convention (see sitemap.ts).
 *
 * Spec shape:
 *   <source>
 *     <publisher>…</publisher><publisherurl>…</publisherurl><lastBuildDate>…</lastBuildDate>
 *     <job>
 *       <title/><date/><referencenumber/><url/><company/><city/><state/>
 *       <country/><postalcode/><description/><salary/><jobtype/>
 *     </job>
 *   </source>
 *
 * All free-text + HTML values are CDATA-wrapped. A job with multiple locations
 * emits one <job> per location (distinct referencenumber, same url) — the way
 * aggregators expect multi-site roles. The <url> carries ?source= so Vantage
 * can credit the channel.
 *
 * This builder takes already-masked PublicJob[] (from
 * getPublicJobsForDistribution), so company names are safe and comp is only
 * present when visible. An empty list yields a valid empty <source> document.
 */

import {
  type PublicJob,
  SITE_URL,
  indeedJobType,
  jobUrl,
} from "@/lib/distribution/public-jobs";

/** CDATA-wrap, neutralizing any embedded "]]>" terminator. */
function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

/** Human-readable salary string for Indeed's free-text <salary> field. */
function formatSalary(comp: PublicJob["comp"]): string | null {
  if (!comp) return null;
  const unit =
    comp.period === "hourly"
      ? "an hour"
      : comp.period === "daily"
        ? "a day"
        : "a year";
  const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;
  const range =
    comp.max && comp.max !== comp.min
      ? `${fmt(comp.min)} - ${fmt(comp.max)}`
      : fmt(comp.min);
  return `${range} ${unit}`;
}

function jobElement(
  job: PublicJob,
  loc: PublicJob["locations"][number] | null,
  referenceNumber: string,
  postedDate: string,
  source: string,
): string {
  const url = `${jobUrl(job)}?source=${encodeURIComponent(source)}`;
  const salary = formatSalary(job.comp);
  const jobtype = indeedJobType(job.employmentType);
  const parts: string[] = [
    `      <title>${cdata(job.title)}</title>`,
    `      <date>${cdata(postedDate)}</date>`,
    `      <referencenumber>${cdata(referenceNumber)}</referencenumber>`,
    `      <url>${cdata(url)}</url>`,
    `      <company>${cdata(job.employerName)}</company>`,
    `      <city>${cdata(loc?.city ?? "")}</city>`,
    `      <state>${cdata(loc?.state ?? "")}</state>`,
    `      <country>${cdata("US")}</country>`,
    `      <postalcode>${cdata(loc?.postalCode ?? "")}</postalcode>`,
    `      <description>${cdata(job.descriptionHtml)}</description>`,
  ];
  if (salary) parts.push(`      <salary>${cdata(salary)}</salary>`);
  if (jobtype) parts.push(`      <jobtype>${cdata(jobtype)}</jobtype>`);
  return `    <job>\n${parts.join("\n")}\n    </job>`;
}

export function buildIndeedFeedXml(
  jobs: PublicJob[],
  opts: { source: string; buildDate: string },
): string {
  const jobEls: string[] = [];
  for (const job of jobs) {
    const postedDate = job.postedAt
      ? new Date(job.postedAt).toUTCString()
      : opts.buildDate;
    if (job.locations.length === 0) {
      jobEls.push(jobElement(job, null, job.id, postedDate, opts.source));
    } else {
      job.locations.forEach((loc, i) => {
        const ref =
          job.locations.length === 1 ? job.id : `${job.id}-${i + 1}`;
        jobEls.push(jobElement(job, loc, ref, postedDate, opts.source));
      });
    }
  }

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<source>",
    `  <publisher>${cdata("DSO Hire")}</publisher>`,
    `  <publisherurl>${cdata(SITE_URL)}</publisherurl>`,
    `  <lastBuildDate>${cdata(opts.buildDate)}</lastBuildDate>`,
    ...jobEls,
    "</source>",
    "",
  ].join("\n");
}
