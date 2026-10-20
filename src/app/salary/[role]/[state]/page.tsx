/**
 * /salary/[role]/[state] — programmatic SEO salary pages.
 *
 * Data:
 *   - comp_benchmarks (BLS OEWS p25/p50/p75, Supabase) via @/lib/comp/salary:
 *     drives the hero and decides whether the page exists.
 *   - oews-detail.json / state-projections.json via @/lib/comp/salary-detail:
 *     full percentile distribution, employment, location quotient, metro
 *     detail, and official state projections (scripts/fetch-salary-data.mjs).
 *   - state-licensing.ts: board facts verified on official sites (7 states).
 * Every figure is cited to the numbered Sources list at the bottom; derived
 * comparisons are labeled as DSO Hire calculations.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/marketing/site-shell";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd, faqPageJsonLd } from "@/components/seo/schema";
import { Cite } from "@/components/research/cite";
import { DataTable } from "@/components/research/data-table";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SALARY_ROLES,
  SALARY_ROLE_BY_SLUG,
  STATE_BY_SLUG,
  stateSlug,
  loadStateSalary,
  loadNationalSalary,
  loadStateMetros,
  fmtAnnual,
  fmtHourly,
  metroShort,
  ownerCaveat,
  type SalaryData,
  type PayTriple,
} from "@/lib/comp/salary";
import {
  OEWS_VINTAGE,
  OOH_LAST_MODIFIED,
  OOH_OUTLOOK,
  PROJECTION_PERIOD,
  nationalDetail,
  nationalProjection,
  oewsProfileUrl,
  stateDetail,
  stateMetroDetails,
  stateProjection,
} from "@/lib/comp/salary-detail";
import {
  annualText,
  buildStateFaq,
  compareToNational,
  fmtInt,
  fmtUsd,
  lqPhrase,
  occupationJsonLd,
} from "@/lib/comp/salary-content";
import { LICENSING_VERIFIED_ON, licensingForRole } from "@/lib/comp/state-licensing";
import { HIRING_SHORTAGE_2026, STAFFING_COSTS_2026, researchPath } from "@/lib/research/reports";
import { MiniStat, PayDistributionTable, SalarySources, SectionHeading, sourceRegistry } from "../../_components/salary-blocks";

type Params = { role: string; state: string };

const FEATURED_STATES = [
  "California", "Texas", "Florida", "New York", "Illinois",
  "Pennsylvania", "Ohio", "Georgia", "North Carolina", "Arizona",
];

const LINK = "text-ink hover:text-heritage-deep underline underline-offset-4 decoration-[var(--rule-strong)]";

function resolve(params: Params) {
  const role = SALARY_ROLE_BY_SLUG[params.role];
  const state = STATE_BY_SLUG[params.state];
  if (!role || !state) return null;
  return { role, state };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  const r = resolve(p);
  if (!r) return { title: "Dental Salary Data" };
  const d = stateDetail(r.role.soc, r.state.code);
  const med = d ? annualText(d, "p50") : null;
  const title = `${r.role.searchTitle} Salary in ${r.state.name} (2026)`;
  const description = med
    ? `${r.role.searchTitle}s in ${r.state.name} earn a median ${med} a year (BLS, ${OEWS_VINTAGE}). See the full pay range from the 10th to 90th percentile, pay by metro, job growth projections and how ${r.state.name} compares to the U.S.`
    : `What does a ${r.role.searchTitle.toLowerCase()} earn in ${r.state.name}? Median pay, the typical range, and the top-paying metro areas, based on the latest BLS data.`;
  return {
    title,
    description,
    alternates: { canonical: `/salary/${p.role}/${p.state}` },
  };
}

function primary(data: SalaryData): { triple: PayTriple; unit: "annual" | "hourly" } | null {
  if (data.annual) return { triple: data.annual, unit: "annual" };
  if (data.hourly) return { triple: data.hourly, unit: "hourly" };
  return null;
}
function fmt(n: number, unit: "annual" | "hourly"): string {
  return unit === "annual" ? fmtAnnual(n) : fmtHourly(n) + "/hr";
}

export default async function SalaryPage({ params }: { params: Promise<Params> }) {
  const p = await params;
  const r = resolve(p);
  if (!r) notFound();
  const { role, state } = r;

  const supabase = await createSupabaseServerClient();
  const data = await loadStateSalary(supabase, role.soc, state.code);
  if (!data) notFound();
  const prim = primary(data);
  if (!prim) notFound();
  const isState = data.level === "state";

  const [dbMetros, national] = await Promise.all([
    isState ? loadStateMetros(supabase, role.soc, state.code) : Promise.resolve([]),
    isState ? loadNationalSalary(supabase, role.soc) : Promise.resolve(null),
  ]);

  // Official-data enrichment (committed BLS + Projections Central files).
  const sd = isState ? stateDetail(role.soc, state.code) : null;
  const nd = nationalDetail(role.soc);
  const proj = isState ? stateProjection(role.soc, state.code) : null;
  const natProj = nationalProjection(role.soc);
  const ooh = OOH_OUTLOOK[role.soc] ?? null;
  const lic = isState ? licensingForRole(role.slug, state.code, state.name) : null;

  // Metro rows: every metro BLS publishes for the state, joined to the
  // pages we have (comp_benchmarks) for links.
  const pageByCode = new Map(dbMetros.map((m) => [m.code.padStart(7, "0"), m]));
  const metroRows = isState
    ? stateMetroDetails(role.soc, state.code)
        .filter((m) => m.annual.p50 !== null)
        .sort((a, b) => (b.annual.p50 ?? 0) - (a.annual.p50 ?? 0))
        .map((m) => ({ ...m, page: pageByCode.get(m.code) ?? null }))
    : [];

  const med = fmt(prim.triple.p50, prim.unit);
  const low = fmt(prim.triple.p25, prim.unit);
  const high = fmt(prim.triple.p75, prim.unit);

  const natPrim = national ? primary(national) : null;
  const cmp =
    sd && nd && sd.annual.p50 !== null && nd.annual.p50 !== null
      ? compareToNational(sd.annual.p50, nd.annual.p50)
      : isState && natPrim && natPrim.unit === prim.unit
        ? compareToNational(prim.triple.p50, natPrim.triple.p50)
        : null;
  const cmp90 = sd && nd && sd.annual.p90 !== null && nd.annual.p90 !== null ? compareToNational(sd.annual.p90, nd.annual.p90) : null;
  const cmp10 = sd && nd && sd.annual.p10 !== null && nd.annual.p10 !== null ? compareToNational(sd.annual.p10, nd.annual.p10) : null;
  const empShare = sd?.emp && nd?.emp ? (sd.emp / nd.emp) * 100 : null;

  // Sources: numbered in this order, only those the page uses.
  const { sources, n: N } = sourceRegistry({
    oews: {
      label: `U.S. Bureau of Labor Statistics, Occupational Employment and Wage Statistics, ${OEWS_VINTAGE}: ${role.blsTitle} (${role.soc}), national, state and metro estimates`,
      url: oewsProfileUrl(role.soc),
      kind: "Government",
      date: OEWS_VINTAGE,
    },
    oewsData: {
      label: `U.S. Bureau of Labor Statistics, OEWS ${OEWS_VINTAGE} time-series data files (percentiles, employment, location quotients)`,
      url: "https://download.bls.gov/pub/time.series/oe/",
      kind: "Government; data file",
      date: "released May 15, 2026",
    },
    proj: proj
      ? {
          label: `Projections Central, ${state.name} long-term occupational projections ${PROJECTION_PERIOD}: ${role.blsTitle}`,
          url: "https://projectionscentral.org/Projections/LongTerm",
          kind: `Government; produced by ${state.name}'s labor market information office`,
        }
      : null,
    ooh: ooh
      ? { label: `U.S. Bureau of Labor Statistics, Occupational Outlook Handbook, ${ooh.title}`, url: ooh.url, kind: "Government", date: `last modified ${OOH_LAST_MODIFIED}` }
      : null,
    board: lic ? { label: lic.board.name, url: lic.board.url, kind: "State licensing board", date: `checked ${LICENSING_VERIFIED_ON}` } : null,
    boardDetail:
      lic && lic.detailUrl && lic.detailUrl !== lic.board.url
        ? { label: `${lic.board.name}, ${role.slug === "dental-assistants" ? "dental assistant credentials" : "licensure requirements"}`, url: lic.detailUrl, kind: lic.detailUrl.includes("danb.org") ? "Certification board (DANB)" : "State licensing board", date: `checked ${LICENSING_VERIFIED_ON}` }
        : null,
    danb: lic?.danbUrl && lic.danbUrl !== lic.detailUrl
      ? { label: `DANB, ${state.name} dental assisting state requirements`, url: lic.danbUrl, kind: "Certification board (DANB)", date: `checked ${LICENSING_VERIFIED_ON}` }
      : null,
  });

  const faq = sd
    ? buildStateFaq({
        plural: role.plural,
        stateName: state.name,
        vintage: OEWS_VINTAGE,
        state: sd,
        national: nd,
        metros: metroRows.map((m) => ({ name: metroShort(m.name), median: m.annual.p50 as number })),
        projection: proj,
        nationalProjection: natProj,
        projectionPeriod: PROJECTION_PERIOD,
        licensingFaq: lic?.faq ?? null,
        ownerHeavy: role.ownerHeavy,
        blsTitle: role.blsTitle,
      })
    : [
        {
          q: `What is the average ${role.searchTitle.toLowerCase()} salary in ${state.name}?`,
          a: `BLS does not publish a ${state.name} estimate for this role, so this page shows the national median: about ${med}, with most earning between ${low} and ${high} (${data.source}, ${data.vintage}).`,
        },
      ];

  const pageUrl = `https://dsohire.com/salary/${p.role}/${p.state}`;
  const crumbs = breadcrumbJsonLd([
    { name: "Dental Salary Data", path: "/salary" },
    { name: `${role.searchTitle} salary`, path: `/salary/${role.slug}` },
    { name: state.name, path: `/salary/${p.role}/${p.state}` },
  ]);
  const occupation = sd
    ? occupationJsonLd({
        name: role.searchTitle,
        description: `${role.searchTitle} pay in ${state.name}: BLS OEWS ${OEWS_VINTAGE} annual wage percentiles.`,
        soc: role.soc,
        blsTitle: role.blsTitle,
        url: pageUrl,
        location: { type: "State", name: state.name },
        detail: sd,
      })
    : null;

  const otherRoles = SALARY_ROLES.filter((x) => x.slug !== role.slug);
  const otherStates = FEATURED_STATES.filter((n) => n !== state.name).slice(0, 8);
  const jobsHref = `/jobs?category=${role.jobCategory}&state=${state.code}`;

  return (
    <SiteShell>
      <JsonLd data={faqPageJsonLd(faq)} />
      <JsonLd data={crumbs} />
      {occupation && <JsonLd data={occupation} />}

      {/* HERO */}
      <section className="pt-[140px] pb-12 px-6 sm:px-14">
        <div className="max-w-[1100px] mx-auto">
          <nav aria-label="Breadcrumb" className="text-xs text-slate-meta mb-5">
            <Link href="/salary" className="hover:text-heritage-deep underline underline-offset-2">Salary data</Link>
            <span className="mx-2">/</span>
            <Link href={`/salary/${role.slug}`} className="hover:text-heritage-deep underline underline-offset-2">{role.searchTitle} salary</Link>
            <span className="mx-2">/</span>
            <span className="text-ink">{state.name}</span>
          </nav>
          <p className="text-2xs font-bold tracking-[3.5px] uppercase text-heritage-deep mb-5">
            Dental Salary Data · {data.source} {data.vintage}
          </p>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-[-1.5px] leading-[1.04] text-ink mb-6">
            {role.searchTitle} Salary in {state.name}
          </h1>
          <p className="text-lg sm:text-xl text-slate-body leading-[1.6] max-w-[760px]">
            The median {role.searchTitle.toLowerCase()} {prim.unit === "annual" ? "earns" : "is paid"}{" "}
            <span className="font-bold text-ink">{med}{prim.unit === "hourly" ? "" : " a year"}</span>{" "}
            in {isState ? state.name : "the U.S."}
            {prim.unit === "annual" && data.hourly ? <> ({fmtHourly(data.hourly.p50)} an hour)</> : null}, with the middle half earning between {low} and {high}.
            {N.oews && <Cite n={N.oews} />}
            {!isState && (
              <span className="block mt-2 text-sm text-slate-meta">
                {`BLS doesn't publish a ${state.name} estimate for this role, so we're showing national figures.`}
              </span>
            )}
          </p>
          <p className="text-xs text-slate-meta mt-5">
            Updated October 2026 with BLS {OEWS_VINTAGE} wage data, the latest release.
          </p>
        </div>
      </section>

      {/* STAT PANEL */}
      <section className="px-6 sm:px-14 pb-14">
        <div className="max-w-[1100px] mx-auto bg-hero p-8 sm:p-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <Stat label="25th percentile" value={low} hint="Lower end of the middle half" />
            <Stat label="Median" value={med} hint="Half earn more, half earn less" emphasis />
            <Stat label="75th percentile" value={high} hint="Upper end of the middle half" />
          </div>
          {data.annual && data.hourly && (
            <p className="text-xs text-heritage-light mt-8 pt-6 border-t border-hero-foreground/10">
              That&apos;s roughly {fmtAnnual(data.annual.p50)} per year or {fmtHourly(data.hourly.p50)}/hr at the median.
              {cmp && cmp.dir !== "about the same as" && ` ${state.name} runs about ${Math.abs(cmp.pct)}% ${cmp.dir} the national median.`}
              {cmp && cmp.dir === "about the same as" && ` That's about the same as the national median.`}
            </p>
          )}
        </div>
      </section>

      {ownerCaveat(role) && (
        <section className="px-6 sm:px-14 pb-10 -mt-4">
          <p className="max-w-[1100px] mx-auto text-xs text-slate-meta italic leading-[1.6]">{ownerCaveat(role)}</p>
        </section>
      )}

      {/* FULL DISTRIBUTION */}
      {sd && (
        <section className="px-6 sm:px-14 pb-14" aria-labelledby="range-heading">
          <div className="max-w-[1100px] mx-auto">
            <SectionHeading id="range-heading">The full pay range in {state.name}</SectionHeading>
            <p className="text-slate-body leading-[1.7] max-w-[760px]">
              BLS publishes five points on the pay curve. The 10th percentile is a reasonable read on entry pay, and the
              90th shows what the best-paid {role.plural} in {state.name} earn. The U.S. figures are shown alongside for
              comparison.<Cite n={[N.oews!, N.oewsData!]} />
            </p>
            <PayDistributionTable
              caption={`${role.searchTitle} wages, ${state.name} vs. U.S. (BLS OEWS, ${OEWS_VINTAGE})`}
              areas={[{ label: state.name, detail: sd }, ...(nd ? [{ label: "U.S.", detail: nd }] : [])]}
              footnote={<>Source: BLS OEWS, {OEWS_VINTAGE}. Wages are gross pay for employees and exclude the self-employed. Annual figures assume full-time, year-round work (hourly rate × 2,080 hours) where BLS reports hourly pay.</>}
            />
          </div>
        </section>
      )}

      {/* JOBS + CONCENTRATION */}
      {sd && sd.emp !== null && (
        <section className="px-6 sm:px-14 pb-14" aria-labelledby="jobs-heading">
          <div className="max-w-[1100px] mx-auto">
            <SectionHeading id="jobs-heading">How many {role.plural} work in {state.name}</SectionHeading>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
              <MiniStat label="Employed" value={fmtInt(sd.emp)} hint={empShare !== null ? `About ${empShare.toFixed(1)}% of all U.S. ${role.plural} (calculation)` : undefined} />
              <MiniStat label="Per 1,000 jobs" value={sd.per1000 !== null ? sd.per1000.toFixed(2) : "Not published"} hint="Share of all jobs in the state" />
              <MiniStat label="Location quotient" value={sd.lq !== null ? sd.lq.toFixed(2) : "Not published"} hint={sd.lq !== null ? `1.00 = U.S. average; ${state.name} is ${lqPhrase(sd.lq)}` : undefined} />
            </div>
            <p className="text-xs text-slate-meta mt-3">
              Source: BLS OEWS, {OEWS_VINTAGE}.<Cite n={N.oewsData!} />{" "}A location quotient above 1 means the role makes up a bigger share of jobs here than nationally.
            </p>
          </div>
        </section>
      )}

      {/* HOW THIS COMPARES (calculation) */}
      {sd && nd && cmp && (
        <section className="px-6 sm:px-14 pb-14" aria-labelledby="compare-heading">
          <div className="max-w-[1100px] mx-auto">
            <SectionHeading id="compare-heading">How {state.name} compares to the U.S.</SectionHeading>
            <ul className="space-y-3 text-slate-body leading-[1.7] max-w-[760px] list-disc pl-5">
              <li>
                Median pay: <strong className="text-ink">{fmtUsd(sd.annual.p50!)}</strong>{" "}in {state.name} vs.{" "}
                <strong className="text-ink">{fmtUsd(nd.annual.p50!)}</strong>{" "}nationally,{" "}
                {cmp.dir === "about the same as" ? "about the same." : <>{fmtUsd(Math.abs(cmp.diff))} ({Math.abs(cmp.pct)}%) {cmp.dir.replace(" than", "")}.</>}
              </li>
              {cmp10 && (
                <li>
                  Entry pay (10th percentile): {annualText(sd, "p10")} vs. {annualText(nd, "p10")},{" "}
                  {cmp10.dir === "about the same as" ? "about the same." : `${Math.abs(cmp10.pct)}% ${cmp10.dir.replace(" than", "")}.`}
                </li>
              )}
              {cmp90 && (
                <li>
                  Top pay (90th percentile): {annualText(sd, "p90")} vs. {annualText(nd, "p90")},{" "}
                  {cmp90.dir === "about the same as" ? "about the same." : `${Math.abs(cmp90.pct)}% ${cmp90.dir.replace(" than", "")}.`}
                </li>
              )}
              {proj?.pct !== null && proj?.pct !== undefined && natProj?.pct !== null && natProj?.pct !== undefined && (
                <li>
                  Projected job growth ({PROJECTION_PERIOD}): {proj.pct}% in {state.name} vs. {natProj.pct}% nationally.
                </li>
              )}
            </ul>
            <p className="text-xs text-slate-meta mt-4 leading-[1.6] max-w-[760px]">
              DSO Hire calculation: (state figure minus U.S. figure) divided by the U.S. figure, from BLS OEWS {OEWS_VINTAGE}
              <Cite n={N.oews!} />
              {proj && N.proj && <> and Projections Central<Cite n={N.proj} /></>}. Not adjusted for cost of living.
            </p>
          </div>
        </section>
      )}

      {/* METROS */}
      {metroRows.length > 0 && (
        <section className="px-6 sm:px-14 pb-14" aria-labelledby="metros-heading">
          <div className="max-w-[1100px] mx-auto">
            <SectionHeading id="metros-heading">{role.searchTitle} pay by metro area in {state.name}</SectionHeading>
            <p className="text-slate-body leading-[1.7] max-w-[760px]">
              {metroRows.length === 1
                ? <>BLS publishes one {state.name} metro area for this role.</>
                : <>All {metroRows.length} {state.name} metro areas with published BLS data, highest median first.</>}
              <Cite n={N.oewsData!} />
            </p>
            <DataTable
              caption={`${role.searchTitle} pay by ${state.name} metro area (BLS OEWS, ${OEWS_VINTAGE})`}
              captionHidden
              columns={[
                { header: "Metro area" },
                { header: "Median", numeric: true },
                { header: "Middle half", numeric: true },
                { header: "Employed", numeric: true },
              ]}
              rows={metroRows.map((m) => [
                m.page ? (
                  <Link key="l" href={`/salary/${role.slug}/${p.state}/${m.page.slug}`} className={LINK}>
                    {metroShort(m.name)}
                  </Link>
                ) : (
                  metroShort(m.name)
                ),
                annualText(m, "p50") ?? "Not published",
                annualText(m, "p25") && annualText(m, "p75") ? `${annualText(m, "p25")}–${annualText(m, "p75")}` : "Not published",
                m.emp !== null ? fmtInt(m.emp) : "Not published",
              ])}
              footnote={<>Source: BLS OEWS, {OEWS_VINTAGE}. Gross wages, not adjusted for cost of living. Metro areas cross state lines where noted in the name.</>}
            />
          </div>
        </section>
      )}

      {/* OUTLOOK */}
      {(proj || ooh) && (
        <section className="px-6 sm:px-14 pb-14" aria-labelledby="outlook-heading">
          <div className="max-w-[1100px] mx-auto">
            <SectionHeading id="outlook-heading">Job outlook for {role.plural} in {state.name}</SectionHeading>
            <div className="space-y-4 text-slate-body leading-[1.7] max-w-[760px]">
              {proj && proj.pct !== null && (
                <p>
                  {state.name}&apos;s official long-term projections expect employment of {role.plural} to{" "}
                  {proj.pct >= 0 ? "grow" : "change"}{" "}
                  <strong className="text-ink">{Math.abs(proj.pct)}%</strong>{" "}over {PROJECTION_PERIOD}
                  {proj.base !== null && proj.projected !== null && <>, from {fmtInt(proj.base)} to {fmtInt(proj.projected)} jobs</>}
                  {proj.openings !== null && <>, with about {fmtInt(proj.openings)} openings a year</>}.
                  {N.proj && <Cite n={N.proj} />}
                  {natProj?.pct !== null && natProj?.pct !== undefined && <>{" "}The national projection for the same period is {natProj.pct}%.</>}
                </p>
              )}
              {ooh && (
                <p>
                  Nationally, the BLS Occupational Outlook Handbook projects{" "}
                  {role.soc === "29-1021" ? "dentist (all dentists, including specialists)" : role.plural.replace(/s$/, "")}{" "}
                  employment to grow <strong className="text-ink">{ooh.pct}%</strong>{" "}over {ooh.period}, {ooh.descriptor},
                  with about {fmtInt(ooh.openings)} openings a year.{N.ooh && <Cite n={N.ooh} />}
                </p>
              )}
              <p className="text-sm">
                Openings include replacements for people who retire or change careers, which is why they can far exceed net
                growth. For what this means for hiring, see{" "}
                <Link href={researchPath(HIRING_SHORTAGE_2026.slug)} className={LINK}>{HIRING_SHORTAGE_2026.shortTitle}</Link>.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* LICENSING */}
      {lic && (
        <section className="px-6 sm:px-14 pb-14" aria-labelledby="license-heading">
          <div className="max-w-[1100px] mx-auto">
            <SectionHeading id="license-heading">
              {role.slug === "dental-assistants" ? `Dental assistant credentials in ${state.name}` : `Licensing for ${role.plural} in ${state.name}`}
            </SectionHeading>
            <div className="bg-cream p-6 sm:p-8 max-w-[860px] space-y-3 text-slate-body leading-[1.7]">
              <p>
                <span className="font-bold text-ink">Licensing board:</span>{" "}
                <a href={lic.board.url} target="_blank" rel="noopener noreferrer" className={LINK}>{lic.board.name}</a>
                {N.board && <Cite n={N.board} />}
                {role.slug !== "dental-assistants" && <>{" "}(licenses {lic.board.licenses})</>}
              </p>
              {lic.requirement && (
                <p>
                  <span className="font-bold text-ink">Path to a license:</span>{" "}{lic.requirement}
                  {N.boardDetail && <Cite n={N.boardDetail} />}
                </p>
              )}
              {lic.credentials.length > 0 && (
                <div>
                  <p className="font-bold text-ink">Credentials:</p>
                  <ul className="list-disc pl-5">
                    {lic.credentials.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                </div>
              )}
              {lic.note && (
                <p>
                  {lic.note}
                  {N.boardDetail && <Cite n={N.boardDetail} />}
                  {N.danb && <Cite n={N.danb} />}
                </p>
              )}
              <p className="text-xs text-slate-meta">
                Checked on the official site{lic.danbUrl ? " and DANB" : ""} on {LICENSING_VERIFIED_ON}. Requirements change, so confirm with the board before you apply.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* CONTEXT / DSO ANGLE */}
      <section className="px-6 sm:px-14 pb-16">
        <div className="max-w-[1100px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div>
            <SectionHeading>What drives {role.searchTitle.toLowerCase()} pay in {state.name}</SectionHeading>
            <p className="text-slate-body leading-[1.7] mb-4">
              Pay for a {role.searchTitle.toLowerCase()} depends on experience, setting, and metro. The metro table above
              shows how much location alone moves the median. Group practices and dental support organizations (DSOs) compete
              for talent across many locations, and benefits, schedules and bonuses can matter as much as base pay.
            </p>
            <p className="text-slate-body leading-[1.7]">
              Hiring an outside agency is one way practices fill gaps, and it is expensive. See what agencies charge in{" "}
              <Link href={researchPath(STAFFING_COSTS_2026.slug)} className={LINK}>{STAFFING_COSTS_2026.shortTitle}</Link>.
            </p>
          </div>
          <div className="bg-cream p-8">
            <p className="text-2xs font-bold tracking-[3px] uppercase text-heritage-deep mb-3">For dental pros</p>
            <h3 className="text-xl font-extrabold text-ink mb-3">Know your worth, then go get it</h3>
            <p className="text-slate-body leading-[1.7] mb-6 text-sm">
              Browse open {role.searchTitle.toLowerCase()} roles in {state.name}, or build a free, ATS-ready resume and get matched to practices that fit how you want to work.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href={jobsHref} className="inline-flex items-center px-7 py-3.5 bg-primary text-primary-foreground text-xs font-bold tracking-[2px] uppercase hover:bg-primary/90 transition-colors">
                {state.name} {role.searchTitle.toLowerCase()} jobs
              </Link>
              <Link href="/resume-templates" className="inline-flex items-center px-7 py-3.5 border border-[var(--rule-strong)] text-ink text-xs font-bold tracking-[2px] uppercase hover:border-ink transition-colors">
                Build a free resume
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 sm:px-14 pb-16">
        <div className="max-w-[1100px] mx-auto">
          <SectionHeading>{role.searchTitle} salary in {state.name}: FAQ</SectionHeading>
          <div className="divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
            {faq.map((f) => (
              <div key={f.q} className="py-5">
                <h3 className="text-lg font-bold text-ink mb-2">{f.q}</h3>
                <p className="text-slate-body leading-[1.7] text-sm">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* EMPLOYER CTA */}
      <section className="px-6 sm:px-14 pb-16">
        <div className="max-w-[1100px] mx-auto bg-heritage p-8 sm:p-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <p className="text-2xs font-bold tracking-[3px] uppercase text-primary-foreground/80 mb-2">Hiring in {state.name}?</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-1px] text-primary-foreground">Fill {role.searchTitle.toLowerCase()} roles across every location.</h2>
          </div>
          <Link href="/for-dental-groups" className="shrink-0 inline-flex items-center px-8 py-4 bg-ivory text-ink text-xs font-bold tracking-[2px] uppercase hover:bg-card transition-colors">
            See how it works
          </Link>
        </div>
      </section>

      {/* INTERNAL LINKS */}
      <section className="px-6 sm:px-14 pb-16">
        <div className="max-w-[1100px] mx-auto grid grid-cols-1 sm:grid-cols-3 gap-10">
          <div>
            <p className="text-2xs font-bold tracking-[3px] uppercase text-heritage-deep mb-4">Keep exploring</p>
            <ul className="space-y-2">
              <li><Link href={jobsHref} className={LINK}>{role.searchTitle} jobs in {state.name}</Link></li>
              <li><Link href={role.hubHref} className={LINK}>{role.searchTitle} careers on DSO Hire</Link></li>
              <li><Link href={`/salary/${role.slug}`} className={LINK}>{role.searchTitle} salary by state</Link></li>
              <li><Link href={researchPath(HIRING_SHORTAGE_2026.slug)} className={LINK}>{HIRING_SHORTAGE_2026.shortTitle}</Link></li>
              <li><Link href={researchPath(STAFFING_COSTS_2026.slug)} className={LINK}>{STAFFING_COSTS_2026.shortTitle}</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-2xs font-bold tracking-[3px] uppercase text-heritage-deep mb-4">Other roles in {state.name}</p>
            <ul className="space-y-2">
              {otherRoles.map((x) => (
                <li key={x.slug}>
                  <Link href={`/salary/${x.slug}/${p.state}`} className={LINK}>
                    {x.searchTitle} salary in {state.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-2xs font-bold tracking-[3px] uppercase text-heritage-deep mb-4">{role.searchTitle} salary by state</p>
            <ul className="space-y-2">
              {otherStates.map((n) => (
                <li key={n}>
                  <Link href={`/salary/${role.slug}/${stateSlug(n)}`} className={LINK}>
                    {role.searchTitle} salary in {n}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <SalarySources sources={sources} />
    </SiteShell>
  );
}

function Stat({ label, value, hint, emphasis }: { label: string; value: string; hint: string; emphasis?: boolean }) {
  return (
    <div>
      <p className="text-2xs font-bold uppercase tracking-[2px] text-heritage-light mb-2">{label}</p>
      <p className={`font-extrabold text-hero-foreground tracking-[-1px] ${emphasis ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl"}`}>{value}</p>
      <p className="text-xs text-hero-foreground/50 mt-1">{hint}</p>
    </div>
  );
}
