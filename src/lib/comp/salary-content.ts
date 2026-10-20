/**
 * salary-content.ts — pure builders for the data-driven copy on the /salary
 * pages: the national comparison (a labeled DSO Hire calculation), the FAQ
 * array (rendered visibly AND fed to FAQPage JSON-LD, so they can't drift),
 * and the schema.org Occupation markup.
 *
 * Every sentence is assembled from figures passed in; nothing here invents
 * a number. Unit-tested in salary-content.test.ts.
 */
import type { FaqEntry } from "@/components/seo/schema";
import type { JsonLdObject } from "@/components/seo/json-ld";
import type { OewsDetail, Projection } from "./salary-detail";

export function fmtUsd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}
export function fmtUsdHr(n: number): string {
  return "$" + n.toFixed(2);
}
export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

const TOP_ANNUAL = "$239,200 or more";

/** Annual percentile as display text, honoring BLS top-coding. */
export function annualText(d: OewsDetail, key: "p10" | "p25" | "p50" | "p75" | "p90"): string | null {
  const field = `a${key.slice(1)}`;
  if (d.topCoded.has(field)) return TOP_ANNUAL;
  const v = d.annual[key];
  return v === null ? null : fmtUsd(v);
}
export function hourlyText(d: OewsDetail, key: "p10" | "p25" | "p50" | "p75" | "p90"): string | null {
  const field = `h${key.slice(1)}`;
  if (d.topCoded.has(field)) return "$115.00 or more";
  const v = d.hourly[key];
  return v === null ? null : fmtUsdHr(v);
}

export type Comparison = {
  /** Signed percent difference, rounded to a whole number. */
  pct: number;
  /** Signed dollar difference (same unit as inputs). */
  diff: number;
  dir: "higher than" | "lower than" | "about the same as";
};

/** (local - national) / national. "About the same" inside +/-1%. */
export function compareToNational(local: number, national: number): Comparison | null {
  if (!(national > 0) || !Number.isFinite(local)) return null;
  const raw = ((local - national) / national) * 100;
  const pct = Math.round(raw);
  const dir = raw >= 1 ? "higher than" : raw <= -1 ? "lower than" : "about the same as";
  return { pct, diff: local - national, dir };
}

/** Plain-English read of a location quotient. */
export function lqPhrase(lq: number): string {
  if (lq >= 1.1) return "more concentrated than the national average";
  if (lq <= 0.9) return "less concentrated than the national average";
  return "close to the national average";
}

export type MetroMedian = { name: string; median: number };

export type StateFaqInput = {
  plural: string; // "dental hygienists"
  stateName: string;
  vintage: string; // "May 2025"
  state: OewsDetail;
  national: OewsDetail | null;
  /** Metros in the state with an annual median, sorted high to low. */
  metros: readonly MetroMedian[];
  projection: Projection | null;
  nationalProjection: Projection | null;
  projectionPeriod: string;
  /** Verified licensing Q&A for this role + state, if any. */
  licensingFaq: FaqEntry | null;
  /** Owner-heavy roles (dentists): OEWS excludes self-employed owners. */
  ownerHeavy?: boolean;
  /** Official BLS occupation title, named in the owner-heavy scope note. */
  blsTitle?: string;
};

function scopeNote(plural: string, blsTitle?: string): string {
  return blsTitle
    ? `These figures cover employed workers in the BLS "${blsTitle}" category and exclude practice owners.`
    : `These figures cover employed ${plural} only, not practice owners.`;
}

/** 4–6 FAQs built only from the page's own figures. */
export function buildStateFaq(i: StateFaqInput): FaqEntry[] {
  const out: FaqEntry[] = [];
  const s = i.state;
  const med = annualText(s, "p50");
  const medHr = hourlyText(s, "p50");
  const p25 = annualText(s, "p25");
  const p75 = annualText(s, "p75");
  const p10 = annualText(s, "p10");
  const p90 = annualText(s, "p90");

  if (med) {
    const parts = [
      `The median annual wage for ${i.plural} in ${i.stateName} was ${med}${medHr ? ` (${medHr} an hour)` : ""} in ${i.vintage}, according to the Bureau of Labor Statistics.`,
    ];
    if (p25 && p75) parts.push(`The middle half earned between ${p25} and ${p75}.`);
    if (p10 && p90) parts.push(`The lowest-paid 10% earned under ${p10} and the top 10% earned ${p90 === TOP_ANNUAL ? p90 : `over ${p90}`}.`);
    if (i.ownerHeavy) parts.push(scopeNote(i.plural, i.blsTitle));
    out.push({ q: `How much do ${i.plural} make in ${i.stateName}?`, a: parts.join(" ") });
  }

  const natMed = i.national?.annual.p50 ?? null;
  if (s.annual.p50 !== null && natMed !== null) {
    const c = compareToNational(s.annual.p50, natMed);
    if (c) {
      const gap = c.dir === "about the same as" ? "" : ` That is ${fmtUsd(Math.abs(c.diff))} (${Math.abs(c.pct)}%) ${c.dir.replace(" than", "")}.`;
      out.push({
        q: `Do ${i.plural} in ${i.stateName} earn more than the national median?`,
        a: `${c.dir === "higher than" ? "Yes." : c.dir === "lower than" ? "No." : "About the same."} The ${i.stateName} median of ${fmtUsd(s.annual.p50)} is ${c.dir} the U.S. median of ${fmtUsd(natMed)}.${gap} This is a DSO Hire calculation from BLS figures and does not adjust for cost of living.`,
      });
    }
  }

  if (i.metros.length >= 2) {
    const top = i.metros[0];
    const low = i.metros[i.metros.length - 1];
    out.push({
      q: `Which ${i.stateName} metro area pays ${i.plural} the most?`,
      a: `Among the ${i.metros.length} ${i.stateName} metro areas with published BLS data, ${top.name} has the highest median at ${fmtUsd(top.median)} a year. ${low.name} has the lowest, at ${fmtUsd(low.median)}.`,
    });
  }

  if (s.emp !== null) {
    const who = i.ownerHeavy && i.blsTitle ? `workers in the BLS "${i.blsTitle}" category` : i.plural;
    const bits = [`BLS estimates ${fmtInt(s.emp)} ${who} were employed in ${i.stateName} in ${i.vintage}.`];
    if (s.per1000 !== null) bits.push(`That is ${s.per1000.toFixed(2)} per 1,000 jobs in the state.`);
    if (s.lq !== null) bits.push(`The location quotient is ${s.lq.toFixed(2)}, meaning the role is ${lqPhrase(s.lq)}.`);
    out.push({ q: `How many ${i.plural} work in ${i.stateName}?`, a: bits.join(" ") });
  }

  const pr = i.projection;
  if (pr && pr.pct !== null) {
    const nat = i.nationalProjection?.pct;
    const bits = [
      `${i.stateName}'s official long-term projections expect employment of ${i.plural} to ${pr.pct >= 0 ? "grow" : "change"} ${Math.abs(pr.pct)}% over ${i.projectionPeriod}${pr.base !== null && pr.projected !== null ? `, from ${fmtInt(pr.base)} to ${fmtInt(pr.projected)} jobs` : ""}.`,
    ];
    if (pr.openings !== null) bits.push(`That works out to about ${fmtInt(pr.openings)} openings a year, including replacements for people who leave the field.`);
    if (nat !== null && nat !== undefined) bits.push(`The national projection for the same period is ${nat}%.`);
    out.push({ q: `Is demand for ${i.plural} growing in ${i.stateName}?`, a: bits.join(" ") });
  }

  if (i.licensingFaq && out.length < 6) out.push(i.licensingFaq);
  return out.slice(0, 6);
}

/** National role page FAQ (same rules). */
export function buildNationalFaq(i: {
  plural: string;
  vintage: string;
  national: OewsDetail;
  topStates: readonly MetroMedian[];
  outlook: { pct: number; period: string; openings: number; descriptor: string; scope?: string } | null;
  ownerHeavy?: boolean;
  blsTitle?: string;
}): FaqEntry[] {
  const out: FaqEntry[] = [];
  const d = i.national;
  const med = annualText(d, "p50");
  const p25 = annualText(d, "p25");
  const p75 = annualText(d, "p75");
  const p10 = annualText(d, "p10");
  const p90 = annualText(d, "p90");
  const medHr = hourlyText(d, "p50");
  if (med) {
    const parts = [`The U.S. median annual wage for ${i.plural} was ${med}${medHr ? ` (${medHr} an hour)` : ""} in ${i.vintage}, according to the Bureau of Labor Statistics.`];
    if (p25 && p75) parts.push(`The middle half earned between ${p25} and ${p75}.`);
    if (p10 && p90) parts.push(`The lowest-paid 10% earned under ${p10} and the top 10% earned ${p90 === TOP_ANNUAL ? p90 : `over ${p90}`}.`);
    if (i.ownerHeavy) parts.push(scopeNote(i.plural, i.blsTitle));
    out.push({ q: `How much do ${i.plural} make?`, a: parts.join(" ") });
  }
  if (i.topStates.length >= 3) {
    const [a, b, c] = i.topStates;
    out.push({
      q: `Which states pay ${i.plural} the most?`,
      a: `By BLS median annual wage, the top three are ${a.name} (${fmtUsd(a.median)}), ${b.name} (${fmtUsd(b.median)}) and ${c.name} (${fmtUsd(c.median)}). Figures are not adjusted for cost of living.`,
    });
  }
  if (d.emp !== null) {
    const who = i.ownerHeavy && i.blsTitle ? `workers in the BLS "${i.blsTitle}" category` : i.plural;
    out.push({ q: `How many ${i.plural} are there in the U.S.?`, a: `BLS estimates ${fmtInt(d.emp)} ${who} were employed in ${i.vintage}. The count excludes the self-employed.` });
  }
  if (i.outlook) {
    out.push({
      q: `What is the job outlook for ${i.plural}?`,
      a: `BLS projects employment${i.outlook.scope ? ` of ${i.outlook.scope}` : ""} to grow ${i.outlook.pct}% over ${i.outlook.period}, ${i.outlook.descriptor}, with about ${fmtInt(i.outlook.openings)} openings a year.`,
    });
  }
  return out;
}

/**
 * schema.org Occupation with an annual MonetaryAmountDistribution. Only
 * percentiles BLS actually published are included (top-coded ones omitted).
 */
export function occupationJsonLd(i: {
  name: string;
  description: string;
  soc: string;
  blsTitle: string;
  url: string;
  location: { type: "State" | "Country" | "Place"; name: string };
  detail: OewsDetail;
}): JsonLdObject {
  const a = i.detail.annual;
  const dist: Record<string, unknown> = {
    "@type": "MonetaryAmountDistribution",
    name: "base",
    currency: "USD",
    duration: "P1Y",
  };
  const put = (k: string, field: string, v: number | null) => {
    if (v !== null && !i.detail.topCoded.has(field)) dist[k] = v;
  };
  put("percentile10", "a10", a.p10);
  put("percentile25", "a25", a.p25);
  put("median", "a50", a.p50);
  put("percentile75", "a75", a.p75);
  put("percentile90", "a90", a.p90);
  return {
    "@context": "https://schema.org",
    "@type": "Occupation",
    name: i.name,
    description: i.description,
    occupationalCategory: `${i.soc} ${i.blsTitle}`,
    occupationLocation: [{ "@type": i.location.type, name: i.location.name }],
    estimatedSalary: [dist],
    mainEntityOfPage: i.url,
  };
}
