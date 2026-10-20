/**
 * /salary/[role] — role-level salary hub: the national pay distribution,
 * outlook, and a state-by-state table linking to every state page.
 * Figures: comp_benchmarks (hero) + the committed BLS/Projections Central
 * files via @/lib/comp/salary-detail. Every figure cites the Sources list.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canonicalRoleSlug } from "@/lib/comp/salary-seo";
import { SiteShell } from "@/components/marketing/site-shell";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd, faqPageJsonLd } from "@/components/seo/schema";
import { Cite } from "@/components/research/cite";
import { DataTable } from "@/components/research/data-table";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { US_STATES } from "@/lib/us-states";
import {
  SALARY_ROLE_BY_SLUG,
  SALARY_ROLES,
  stateSlug,
  loadNationalSalary,
  fmtAnnual,
  fmtHourly,
  ownerCaveat,
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
  stateProjection,
} from "@/lib/comp/salary-detail";
import { annualText, buildNationalFaq, fmtInt, occupationJsonLd } from "@/lib/comp/salary-content";
import { HIRING_SHORTAGE_2026, STAFFING_COSTS_2026, researchPath } from "@/lib/research/reports";
import { MiniStat, PayDistributionTable, SalarySources, SectionHeading, sourceRegistry } from "../_components/salary-blocks";

type Params = { role: string };

const LINK = "text-ink hover:text-heritage-deep underline underline-offset-4 decoration-[var(--rule-strong)]";

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  const role = SALARY_ROLE_BY_SLUG[p.role];
  if (!role) return { title: "Dental Salary Data" };
  const nd = nationalDetail(role.soc);
  const med = nd ? annualText(nd, "p50") : null;
  return {
    title: `${role.searchTitle} Salary by State (2026)`,
    description: med
      ? `The U.S. median ${role.searchTitle.toLowerCase()} salary is ${med} a year (BLS, ${OEWS_VINTAGE}). Compare pay, employment and job growth in every state, with the full pay range from the 10th to 90th percentile.`
      : `${role.searchTitle} salary across the U.S.: national median plus a state-by-state breakdown, based on the latest BLS data.`,
    alternates: { canonical: `/salary/${canonicalRoleSlug(p.role)}` },
  };
}

export default async function RoleSalaryIndex({ params }: { params: Promise<Params> }) {
  const p = await params;
  const role = SALARY_ROLE_BY_SLUG[p.role];
  if (!role) notFound();

  const supabase = await createSupabaseServerClient();
  const national = await loadNationalSalary(supabase, role.soc);
  const nat = national?.annual ?? national?.hourly ?? null;
  const natUnit: "annual" | "hourly" = national?.annual ? "annual" : "hourly";
  const natMed = nat ? (natUnit === "annual" ? fmtAnnual(nat.p50) : fmtHourly(nat.p50) + "/hr") : null;

  const nd = nationalDetail(role.soc);
  const ooh = OOH_OUTLOOK[role.soc] ?? null;
  const natProj = nationalProjection(role.soc);

  const stateRows = US_STATES.map((s) => ({ s, d: stateDetail(role.soc, s.code), pr: stateProjection(role.soc, s.code) }))
    .filter((x) => x.d && x.d.annual.p50 !== null)
    .sort((a, b) => (b.d!.annual.p50 ?? 0) - (a.d!.annual.p50 ?? 0));

  const { sources, n: N } = sourceRegistry({
    oews: {
      label: `U.S. Bureau of Labor Statistics, Occupational Employment and Wage Statistics, ${OEWS_VINTAGE}: ${role.blsTitle} (${role.soc})`,
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
    ooh: ooh ? { label: `U.S. Bureau of Labor Statistics, Occupational Outlook Handbook, ${ooh.title}`, url: ooh.url, kind: "Government", date: `last modified ${OOH_LAST_MODIFIED}` } : null,
    proj: natProj
      ? { label: `Projections Central, state long-term occupational projections ${PROJECTION_PERIOD}: ${role.blsTitle}`, url: "https://projectionscentral.org/Projections/LongTerm", kind: "Government; state labor market information offices" }
      : null,
  });

  const faq = nd
    ? buildNationalFaq({
        plural: role.plural,
        vintage: OEWS_VINTAGE,
        national: nd,
        topStates: stateRows.slice(0, 3).map((x) => ({ name: x.s.name, median: x.d!.annual.p50 as number })),
        outlook: ooh ? { pct: ooh.pct, period: ooh.period, openings: ooh.openings, descriptor: ooh.descriptor, scope: role.soc === "29-1021" ? "all dentists, including specialists" : undefined } : null,
        ownerHeavy: role.ownerHeavy,
        blsTitle: role.blsTitle,
      })
    : [];

  const occupation = nd
    ? occupationJsonLd({
        name: role.searchTitle,
        description: `${role.searchTitle} pay in the United States: BLS OEWS ${OEWS_VINTAGE} annual wage percentiles.`,
        soc: role.soc,
        blsTitle: role.blsTitle,
        url: `https://dsohire.com/salary/${role.slug}`,
        location: { type: "Country", name: "United States" },
        detail: nd,
      })
    : null;

  const otherRoles = SALARY_ROLES.filter((x) => x.slug !== role.slug);

  return (
    <SiteShell>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Dental Salary Data", path: "/salary" },
          { name: `${role.searchTitle} salary`, path: `/salary/${role.slug}` },
        ])}
      />
      {faq.length > 0 && <JsonLd data={faqPageJsonLd(faq)} />}
      {occupation && <JsonLd data={occupation} />}

      <section className="pt-[140px] pb-12 px-6 sm:px-14">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-2xs font-bold tracking-[3.5px] uppercase text-heritage-deep mb-5">Dental Salary Data · BLS OEWS {OEWS_VINTAGE}</p>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-[-1.5px] leading-[1.04] text-ink mb-6">
            {role.searchTitle} Salary by State
          </h1>
          <p className="text-lg sm:text-xl text-slate-body leading-[1.6] max-w-[760px]">
            {natMed
              ? <>Nationally, the median {role.searchTitle.toLowerCase()} {natUnit === "annual" ? "earns" : "is paid"}{" "}<span className="font-bold text-ink">{natMed}{natUnit === "hourly" ? "" : " a year"}</span>{nd?.hourly.p50 != null && natUnit === "annual" ? <> ({fmtHourly(nd.hourly.p50)} an hour)</> : null}.<Cite n={N.oews!} />{" "}Pick a state for local pay, ranges, and metro areas.</>
              : <>Pick a state below for {role.searchTitle.toLowerCase()} pay, ranges, and metro areas.</>}
          </p>
          <p className="text-xs text-slate-meta mt-5">Updated October 2026 with BLS {OEWS_VINTAGE} wage data, the latest release. BLS category: {role.blsTitle} ({role.soc}).</p>
          {ownerCaveat(role) && (
            <p className="text-xs text-slate-meta italic leading-[1.6] mt-3 max-w-[760px]">{ownerCaveat(role)}</p>
          )}
        </div>
      </section>

      {nd && (
        <section className="px-6 sm:px-14 pb-14" aria-labelledby="range-heading">
          <div className="max-w-[1100px] mx-auto">
            <SectionHeading id="range-heading">The national pay range</SectionHeading>
            <PayDistributionTable
              caption={`${role.searchTitle} wages, United States (BLS OEWS, ${OEWS_VINTAGE})`}
              areas={[{ label: "U.S.", detail: nd }]}
              footnote={<>Source: BLS OEWS, {OEWS_VINTAGE}.<Cite n={N.oews!} />{" "}Gross wages for employees; excludes the self-employed.</>}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {nd.emp !== null && <MiniStat label="Employed in the U.S." value={fmtInt(nd.emp)} hint={`BLS OEWS, ${OEWS_VINTAGE}`} />}
              {ooh && <MiniStat label={`Projected growth, ${ooh.period}`} value={`${ooh.pct}%`} hint={<>BLS Occupational Outlook Handbook{N.ooh && <Cite n={N.ooh} />}</>} />}
              {ooh && <MiniStat label="Openings per year" value={`About ${fmtInt(ooh.openings)}`} hint="Includes replacing workers who leave the field" />}
            </div>
            {ooh && (
              <p className="text-slate-body leading-[1.7] max-w-[760px] mt-6">
                BLS projects {role.soc === "29-1021" ? "dentist (all dentists, including specialists)" : role.plural.replace(/s$/, "")} employment to grow {ooh.pct}% over {ooh.period}, {ooh.descriptor}.<Cite n={N.ooh!} />{" "}
                For the hiring side of these numbers, see{" "}
                <Link href={researchPath(HIRING_SHORTAGE_2026.slug)} className={LINK}>{HIRING_SHORTAGE_2026.shortTitle}</Link>.
              </p>
            )}
          </div>
        </section>
      )}

      {stateRows.length > 0 && (
        <section className="px-6 sm:px-14 pb-14" aria-labelledby="states-heading">
          <div className="max-w-[1100px] mx-auto">
            <SectionHeading id="states-heading">{role.searchTitle} pay in every state</SectionHeading>
            <p className="text-slate-body leading-[1.7] max-w-[760px]">
              Ranked by median annual wage. Location quotient compares the role&apos;s share of jobs in the state to the
              national share (1.00 = the same).<Cite n={N.oewsData!} />
              {N.proj && <>{" "}Growth is each state&apos;s official {PROJECTION_PERIOD} projection.<Cite n={N.proj} /></>}
            </p>
            <DataTable
              caption={`${role.searchTitle} pay by state (BLS OEWS, ${OEWS_VINTAGE})`}
              captionHidden
              minWidth="40rem"
              columns={[
                { header: "State" },
                { header: "Median", numeric: true },
                { header: "Middle half", numeric: true },
                { header: "Employed", numeric: true },
                { header: "Location quotient", numeric: true },
                { header: `Growth ${PROJECTION_PERIOD}`, numeric: true },
              ]}
              rows={stateRows.map(({ s, d, pr }) => [
                <Link key="l" href={`/salary/${role.slug}/${stateSlug(s.name)}`} className={LINK}>{s.name}</Link>,
                annualText(d!, "p50") ?? "Not published",
                annualText(d!, "p25") && annualText(d!, "p75") ? `${annualText(d!, "p25")}–${annualText(d!, "p75")}` : "Not published",
                d!.emp !== null ? fmtInt(d!.emp) : "Not published",
                d!.lq !== null ? d!.lq.toFixed(2) : "Not published",
                pr?.pct !== null && pr?.pct !== undefined ? `${pr.pct}%` : "Not published",
              ])}
              footnote={<>Source: BLS OEWS, {OEWS_VINTAGE}; Projections Central. Not adjusted for cost of living.</>}
            />
          </div>
        </section>
      )}

      {stateRows.length < US_STATES.length && (
        <section className="px-6 sm:px-14 pb-16">
          <div className="max-w-[1100px] mx-auto">
            <h2 className="text-2xl font-extrabold tracking-[-1px] text-ink mb-6">All state pages</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-3 border-t border-[var(--rule)] pt-6">
              {US_STATES.map((s) => (
                <Link key={s.code} href={`/salary/${role.slug}/${stateSlug(s.name)}`} className="text-ink hover:text-heritage-deep text-sm">
                  {s.name}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {faq.length > 0 && (
        <section className="px-6 sm:px-14 pb-16">
          <div className="max-w-[1100px] mx-auto">
            <SectionHeading>{role.searchTitle} salary: FAQ</SectionHeading>
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
      )}

      <section className="px-6 sm:px-14 pb-16">
        <div className="max-w-[1100px] mx-auto bg-heritage p-8 sm:p-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <p className="text-2xs font-bold tracking-[3px] uppercase text-primary-foreground/80 mb-2">Hiring {role.plural}?</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-1px] text-primary-foreground">Fill roles across every location, faster.</h2>
          </div>
          <Link href="/for-dental-groups" className="shrink-0 inline-flex items-center px-8 py-4 bg-ivory text-ink text-xs font-bold tracking-[2px] uppercase hover:bg-card transition-colors">See how it works</Link>
        </div>
      </section>

      <section className="px-6 sm:px-14 pb-16">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-2xs font-bold tracking-[3px] uppercase text-heritage-deep mb-4">Keep exploring</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href={role.hubHref} className={LINK}>{role.searchTitle} careers</Link>
            <Link href={`/jobs?category=${role.jobCategory}`} className={LINK}>{role.searchTitle} jobs</Link>
            <Link href={researchPath(STAFFING_COSTS_2026.slug)} className={LINK}>{STAFFING_COSTS_2026.shortTitle}</Link>
            {otherRoles.map((x) => (
              <Link key={x.slug} href={`/salary/${x.slug}`} className={LINK}>
                {x.searchTitle} salary
              </Link>
            ))}
          </div>
        </div>
      </section>

      <SalarySources sources={sources} />
    </SiteShell>
  );
}
