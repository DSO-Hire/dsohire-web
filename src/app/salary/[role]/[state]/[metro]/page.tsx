/**
 * /salary/[role]/[state]/[metro] — metro-level salary pages.
 *
 * Metros are resolved from comp_benchmarks (BLS OEWS) by city slug, then
 * enriched from the committed BLS file (oews-detail.json): full percentile
 * curve, employment, jobs per 1,000 and location quotient for THIS metro,
 * plus its rank among the state's metros. That metro-specific data is what
 * keeps these pages from being near-duplicates of the state page.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canonicalRoleSlug, metroPrincipalStateSlug, metroSalaryRobots } from "@/lib/comp/salary-seo";
import { SiteShell } from "@/components/marketing/site-shell";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd, faqPageJsonLd, type FaqEntry } from "@/components/seo/schema";
import { Cite } from "@/components/research/cite";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SALARY_ROLES,
  resolveRoleState,
  loadStateMetros,
  loadStateSalary,
  loadNationalSalary,
  fmtAnnual,
  fmtHourly,
  metroShort,
  ownerCaveat,
  type PayTriple,
} from "@/lib/comp/salary";
import { OEWS_VINTAGE, metroDetail, nationalDetail, oewsProfileUrl, stateDetail } from "@/lib/comp/salary-detail";
import { annualText, compareToNational, fmtInt, lqPhrase, occupationJsonLd } from "@/lib/comp/salary-content";
import { MiniStat, PayDistributionTable, SalarySources, SectionHeading, sourceRegistry } from "../../../_components/salary-blocks";

type Params = { role: string; state: string; metro: string };

const LINK = "text-ink hover:text-heritage-deep underline underline-offset-4 decoration-[var(--rule-strong)]";

function pick(m: { annual: PayTriple | null; hourly: PayTriple | null }): { triple: PayTriple; unit: "annual" | "hourly" } | null {
  if (m.annual) return { triple: m.annual, unit: "annual" };
  if (m.hourly) return { triple: m.hourly, unit: "hourly" };
  return null;
}
function fmt(n: number, unit: "annual" | "hourly"): string {
  return unit === "annual" ? fmtAnnual(n) : fmtHourly(n) + "/hr";
}
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  const r = resolveRoleState(p.role, p.state);
  if (!r) return { title: "Dental Salary Data" };
  const supabase = await createSupabaseServerClient();
  const metros = await loadStateMetros(supabase, r.role.soc, r.state.code);
  const metro = metros.find((m) => m.slug === p.metro);
  if (!metro) return { title: `${r.role.searchTitle} Salary in ${r.state.name}` };
  const city = metroShort(metro.name);
  const d = metroDetail(r.role.soc, metro.code);
  const med = d ? annualText(d, "p50") : null;
  return {
    title: `${r.role.searchTitle} Salary in ${city} (2026)`,
    description: med
      ? `${r.role.searchTitle}s in the ${city} area earn a median ${med} a year (BLS, ${OEWS_VINTAGE}). Full pay range, local employment, and how ${city} compares to ${r.state.name} and the U.S.`
      : `${r.role.searchTitle} pay in ${city}: median, the typical range, and how it compares to ${r.state.name} and the U.S., based on the latest BLS data.`,
    alternates: {
      canonical: `/salary/${canonicalRoleSlug(p.role)}/${metroPrincipalStateSlug(metro.name) ?? p.state}/${p.metro}`,
    },
    robots: metroSalaryRobots(r.role, metro.code),
  };
}

export default async function MetroSalaryPage({ params }: { params: Promise<Params> }) {
  const p = await params;
  const r = resolveRoleState(p.role, p.state);
  if (!r) notFound();
  const { role, state } = r;

  const supabase = await createSupabaseServerClient();
  const metros = await loadStateMetros(supabase, role.soc, state.code);
  const metro = metros.find((m) => m.slug === p.metro);
  if (!metro) notFound();
  const prim = pick(metro);
  if (!prim) notFound();
  const pr = prim; // non-null capture for use inside the closure below

  const [stateData, national] = await Promise.all([
    loadStateSalary(supabase, role.soc, state.code),
    loadNationalSalary(supabase, role.soc),
  ]);

  const md = metroDetail(role.soc, metro.code);
  const sd = stateDetail(role.soc, state.code);
  const nd = nationalDetail(role.soc);

  const city = metroShort(metro.name);
  const med = fmt(pr.triple.p50, pr.unit);
  const low = fmt(pr.triple.p25, pr.unit);
  const high = fmt(pr.triple.p75, pr.unit);

  function deltaVs(other: { annual: PayTriple | null; hourly: PayTriple | null } | null) {
    if (!other) return null;
    const op = pick(other);
    if (!op || op.unit !== pr.unit) return null;
    return compareToNational(pr.triple.p50, op.triple.p50);
  }
  const vsState = stateData?.level === "state" ? deltaVs(stateData) : null;
  const vsNational = deltaVs(national);
  const rank = metros.findIndex((m) => m.slug === metro.slug) + 1; // metros sorted by median desc
  const empShareOfState = md?.emp && sd?.emp ? (md.emp / sd.emp) * 100 : null;
  const phrase = (c: NonNullable<typeof vsState>) =>
    c.dir === "about the same as" ? "about the same as" : `about ${Math.abs(c.pct)}% ${c.dir}`;

  const { sources, n: N } = sourceRegistry({
    oews: {
      label: `U.S. Bureau of Labor Statistics, Occupational Employment and Wage Statistics, ${OEWS_VINTAGE}: ${role.blsTitle} (${role.soc}), metropolitan area estimates`,
      url: oewsProfileUrl(role.soc),
      kind: "Government",
      date: OEWS_VINTAGE,
    },
    oewsData: md
      ? {
          label: `U.S. Bureau of Labor Statistics, OEWS ${OEWS_VINTAGE} time-series data files (percentiles, employment, location quotients)`,
          url: "https://download.bls.gov/pub/time.series/oe/",
          kind: "Government; data file",
          date: "released May 15, 2026",
        }
      : null,
  });

  const faq: FaqEntry[] = [
    {
      q: `How much do ${role.plural} make in ${city}?`,
      a: `The median ${role.searchTitle.toLowerCase()} ${prim.unit === "annual" ? "salary" : "wage"} in the ${city} metro area is ${med}, with the middle half earning between ${low} and ${high} (BLS OEWS, ${OEWS_VINTAGE}).${md && annualText(md, "p10") && annualText(md, "p90") ? ` The full range runs from ${annualText(md, "p10")} at the 10th percentile to ${annualText(md, "p90")} at the 90th.` : ""}`,
    },
    ...(vsState
      ? [{ q: `Is ${city} higher or lower than the rest of ${state.name}?`, a: `${city} runs ${phrase(vsState)} the ${state.name} state median for ${role.plural}. It ranks ${ordinal(rank)} of ${metros.length} ${state.name} metro areas by median pay. (DSO Hire calculation from BLS figures.)` }]
      : []),
    ...(vsNational
      ? [{ q: `How does ${city} compare nationally?`, a: `${role.searchTitle} pay in ${city} is ${phrase(vsNational)} the U.S. median. (DSO Hire calculation from BLS figures, not adjusted for cost of living.)` }]
      : []),
    ...(md?.emp
      ? [{
          q: `How many ${role.plural} work in the ${city} area?`,
          a: `BLS estimates ${fmtInt(md.emp)} ${role.plural} were employed in the ${city} metro area in ${OEWS_VINTAGE}.${md.lq !== null ? ` Its location quotient is ${md.lq.toFixed(2)}, so the role is ${lqPhrase(md.lq)}.` : ""}`,
        }]
      : []),
  ];

  const pageUrl = `https://dsohire.com/salary/${p.role}/${p.state}/${p.metro}`;
  const occupation = md
    ? occupationJsonLd({
        name: role.searchTitle,
        description: `${role.searchTitle} pay in the ${city} metro area: BLS OEWS ${OEWS_VINTAGE} annual wage percentiles.`,
        soc: role.soc,
        blsTitle: role.blsTitle,
        url: pageUrl,
        location: { type: "Place", name: metro.name },
        detail: md,
      })
    : null;

  const siblingMetros = metros.filter((m) => m.slug !== metro.slug).slice(0, 6);
  const otherRoles = SALARY_ROLES.filter((x) => x.slug !== role.slug);

  return (
    <SiteShell>
      <JsonLd data={faqPageJsonLd(faq)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Dental Salary Data", path: "/salary" },
          { name: `${role.searchTitle} salary`, path: `/salary/${role.slug}` },
          { name: state.name, path: `/salary/${p.role}/${p.state}` },
          { name: city, path: `/salary/${p.role}/${p.state}/${p.metro}` },
        ])}
      />
      {occupation && <JsonLd data={occupation} />}

      <section className="pt-[140px] pb-12 px-6 sm:px-14">
        <div className="max-w-[1100px] mx-auto">
          <nav aria-label="Breadcrumb" className="text-xs text-slate-meta mb-5">
            <Link href={`/salary/${role.slug}`} className="hover:text-heritage-deep underline underline-offset-2">{role.searchTitle} salary</Link>
            <span className="mx-2">/</span>
            <Link href={`/salary/${role.slug}/${p.state}`} className="hover:text-heritage-deep underline underline-offset-2">{state.name}</Link>
            <span className="mx-2">/</span>
            <span className="text-ink">{city}</span>
          </nav>
          <p className="text-2xs font-bold tracking-[3.5px] uppercase text-heritage-deep mb-5">Dental Salary Data · BLS OEWS {OEWS_VINTAGE}</p>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-[-1.5px] leading-[1.04] text-ink mb-6">
            {role.searchTitle} Salary in {city}
          </h1>
          <p className="text-lg sm:text-xl text-slate-body leading-[1.6] max-w-[760px]">
            The median {role.searchTitle.toLowerCase()} {prim.unit === "annual" ? "earns" : "is paid"}{" "}
            <span className="font-bold text-ink">{med}{prim.unit === "hourly" ? "" : " a year"}</span>{" "}
            in the {city} metro, with the middle half between {low} and {high}.
            <Cite n={N.oews!} />
          </p>
        </div>
      </section>

      <section className="px-6 sm:px-14 pb-14">
        <div className="max-w-[1100px] mx-auto bg-hero p-8 sm:p-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <Stat label="25th percentile" value={low} hint="Lower end of the middle half" />
            <Stat label="Median" value={med} hint="Half earn more, half earn less" emphasis />
            <Stat label="75th percentile" value={high} hint="Upper end of the middle half" />
          </div>
          {(vsState || vsNational) && (
            <p className="text-xs text-heritage-light mt-8 pt-6 border-t border-hero-foreground/10">
              {vsState && `${city} runs ${phrase(vsState)} the ${state.name} median and ranks ${ordinal(rank)} of ${metros.length} ${state.name} metros. `}
              {vsNational && `It is ${phrase(vsNational)} the national median.`}
            </p>
          )}
        </div>
      </section>

      {ownerCaveat(role) && (
        <section className="px-6 sm:px-14 pb-10 -mt-4">
          <p className="max-w-[1100px] mx-auto text-xs text-slate-meta italic leading-[1.6]">{ownerCaveat(role)}</p>
        </section>
      )}

      {md && (
        <section className="px-6 sm:px-14 pb-14" aria-labelledby="range-heading">
          <div className="max-w-[1100px] mx-auto">
            <SectionHeading id="range-heading">{city} pay range vs. {state.name} and the U.S.</SectionHeading>
            <PayDistributionTable
              caption={`${role.searchTitle} annual wages: ${city} vs. ${state.name} vs. U.S. (BLS OEWS, ${OEWS_VINTAGE})`}
              annualOnly
              areas={[
                { label: "Metro", detail: md },
                ...(sd ? [{ label: state.name, detail: sd }] : []),
                ...(nd ? [{ label: "U.S.", detail: nd }] : []),
              ]}
              footnote={<>Source: BLS OEWS, {OEWS_VINTAGE}.<Cite n={N.oewsData!} />{" "}Gross wages for employees; excludes the self-employed. Comparisons in this page are DSO Hire calculations and are not adjusted for cost of living.</>}
            />
            {md.emp !== null && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
                <MiniStat label="Employed in metro" value={fmtInt(md.emp)} hint={empShareOfState !== null ? `About ${empShareOfState.toFixed(0)}% of ${state.name}'s total (calculation)` : undefined} />
                <MiniStat label="Per 1,000 jobs" value={md.per1000 !== null ? md.per1000.toFixed(2) : "Not published"} hint={sd?.per1000 != null ? `${state.name}: ${sd.per1000.toFixed(2)}` : undefined} />
                <MiniStat label="Location quotient" value={md.lq !== null ? md.lq.toFixed(2) : "Not published"} hint={md.lq !== null ? `1.00 = U.S. average; ${lqPhrase(md.lq)}` : undefined} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* candidate CTA */}
      <section className="px-6 sm:px-14 pb-16">
        <div className="max-w-[1100px] mx-auto bg-cream p-8 sm:p-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="max-w-[560px]">
            <p className="text-2xs font-bold tracking-[3px] uppercase text-heritage-deep mb-2">For dental pros in {city}</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-1px] text-ink">Build a free resume and get matched to practices that fit you.</h2>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <Link href="/resume-templates" className="inline-flex items-center px-7 py-3.5 bg-primary text-primary-foreground text-xs font-bold tracking-[2px] uppercase hover:bg-primary/90 transition-colors">Build a free resume</Link>
            <Link href={`/jobs?category=${role.jobCategory}&state=${state.code}`} className="inline-flex items-center px-7 py-3.5 border border-[var(--rule-strong)] text-ink text-xs font-bold tracking-[2px] uppercase hover:border-ink transition-colors">Browse {state.name} jobs</Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 sm:px-14 pb-16">
        <div className="max-w-[1100px] mx-auto">
          <SectionHeading>{role.searchTitle} salary in {city}: FAQ</SectionHeading>
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

      {/* internal links */}
      <section className="px-6 sm:px-14 pb-16">
        <div className="max-w-[1100px] mx-auto grid grid-cols-1 sm:grid-cols-2 gap-10">
          <div>
            <p className="text-2xs font-bold tracking-[3px] uppercase text-heritage-deep mb-4">Other {state.name} metros</p>
            <ul className="space-y-2">
              <li>
                <Link href={`/salary/${role.slug}/${p.state}`} className={LINK}>
                  {role.searchTitle} salary in {state.name} (all metros)
                </Link>
              </li>
              {siblingMetros.map((m) => (
                <li key={m.slug}>
                  <Link href={`/salary/${role.slug}/${p.state}/${m.slug}`} className={LINK}>
                    {role.searchTitle} salary in {metroShort(m.name)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-2xs font-bold tracking-[3px] uppercase text-heritage-deep mb-4">Other roles in {state.name}</p>
            <ul className="space-y-2">
              {otherRoles.slice(0, 6).map((x) => (
                <li key={x.slug}>
                  <Link href={`/salary/${x.slug}/${p.state}`} className={LINK}>
                    {x.searchTitle} salary in {state.name}
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
