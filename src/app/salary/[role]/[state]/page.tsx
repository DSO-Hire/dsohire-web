/**
 * /salary/[role]/[state] — programmatic SEO salary pages.
 * Server component (SiteShell uses cookies → dynamic). Inherits the site-wide
 * noindex robots from layout.tsx, so these stay invisible to crawlers until the
 * launch flip. Data comes from comp_benchmarks (BLS OEWS) via @/lib/comp/salary.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/marketing/site-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SALARY_ROLES,
  SALARY_ROLE_BY_SLUG,
  STATE_BY_SLUG,
  stateSlug,
  loadStateSalary,
  loadNationalSalary,
  loadTopMetros,
  fmtAnnual,
  fmtHourly,
  metroShort,
  ownerCaveat,
  type SalaryData,
  type PayTriple,
} from "@/lib/comp/salary";

type Params = { role: string; state: string };

const FEATURED_STATES = [
  "California", "Texas", "Florida", "New York", "Illinois",
  "Pennsylvania", "Ohio", "Georgia", "North Carolina", "Arizona",
];

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
  const title = `${r.role.searchTitle} Salary in ${r.state.name} (2026)`;
  const description = `What does a ${r.role.searchTitle.toLowerCase()} earn in ${r.state.name}? Median pay, the typical range (25th–75th percentile), and the top-paying metro areas — based on the latest BLS data.`;
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

  const [metros, national] = await Promise.all([
    data.level === "state" ? loadTopMetros(supabase, role.soc, state.code) : Promise.resolve([]),
    data.level === "state" ? loadNationalSalary(supabase, role.soc) : Promise.resolve(null),
  ]);

  const med = fmt(prim.triple.p50, prim.unit);
  const low = fmt(prim.triple.p25, prim.unit);
  const high = fmt(prim.triple.p75, prim.unit);
  const isState = data.level === "state";

  // national comparison
  const natPrim = national ? primary(national) : null;
  let compare: { pct: number; dir: "above" | "below" | "in line with" } | null = null;
  if (isState && natPrim && natPrim.unit === prim.unit && natPrim.triple.p50 > 0) {
    const pct = Math.round(((prim.triple.p50 - natPrim.triple.p50) / natPrim.triple.p50) * 100);
    compare = { pct: Math.abs(pct), dir: pct > 1 ? "above" : pct < -1 ? "below" : "in line with" };
  }

  const topMetro = metros[0];

  const faq: { q: string; a: string }[] = [
    {
      q: `What is the average ${role.searchTitle.toLowerCase()} salary in ${state.name}?`,
      a: `The median ${role.searchTitle.toLowerCase()} ${prim.unit === "annual" ? "salary" : "wage"} in ${isState ? state.name : "the United States"} is about ${med}${prim.unit === "annual" && data.hourly ? ` per year (${fmtHourly(data.hourly.p50)}/hr)` : prim.unit === "hourly" && data.annual ? ` per hour (${fmtAnnual(data.annual.p50)}/yr)` : ""}, based on ${data.source} data (${data.vintage}). Most earn between ${low} and ${high}.`,
    },
    compare
      ? {
          q: `How does ${state.name} compare to the national average?`,
          a: `At a ${med} median, ${role.searchTitle.toLowerCase()} pay in ${state.name} runs about ${compare.pct}% ${compare.dir} the national median. Local cost of living and demand drive most of the difference.`,
        }
      : {
          q: `Does ${role.searchTitle.toLowerCase()} pay vary within ${state.name}?`,
          a: `Yes — pay varies by metro area, employer type, and experience. Larger metros and group/DSO settings often pay toward the upper end of the range.`,
        },
    topMetro
      ? {
          q: `Which ${state.name} cities pay ${role.searchTitle.toLowerCase()}s the most?`,
          a: `Among ${state.name} metros, ${metroShort(topMetro.name)} is at the top, with a median around ${fmt((topMetro.annual ?? topMetro.hourly)!.p50, topMetro.annual ? "annual" : "hourly")}.`,
        }
      : {
          q: `Is demand for ${role.searchTitle.toLowerCase()}s strong?`,
          a: `Demand across dentistry is high — staffing is consistently ranked among dentists' top operational challenges, and open roles can take well over two months to fill.`,
        },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const otherRoles = SALARY_ROLES.filter((x) => x.slug !== role.slug);
  const otherStates = FEATURED_STATES.filter((n) => n !== state.name).slice(0, 8);

  return (
    <SiteShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* HERO */}
      <section className="pt-[140px] pb-12 px-6 sm:px-14">
        <div className="max-w-[1100px] mx-auto">
          <nav className="text-[12px] text-slate-meta mb-5">
            <Link href={`/salary/${role.slug}`} className="hover:text-heritage-deep underline underline-offset-2">{role.searchTitle} salary</Link>
            <span className="mx-2">/</span>
            <span className="text-ink">{state.name}</span>
          </nav>
          <p className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-5">
            Dental Salary Data · {data.source} {data.vintage}
          </p>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-[-1.5px] leading-[1.04] text-ink mb-6">
            {role.searchTitle} Salary in {state.name}
          </h1>
          <p className="text-lg sm:text-xl text-slate-body leading-[1.6] max-w-[760px]">
            The median {role.searchTitle.toLowerCase()} {prim.unit === "annual" ? "earns" : "is paid"}{" "}
            <span className="font-bold text-ink">{med}{prim.unit === "hourly" ? "/hr" : " a year"}</span>{" "}
            in {isState ? state.name : "the U.S."}, with most between {low} and {high}.
            {!isState && (
              <span className="block mt-2 text-sm text-slate-meta">
                State-level data isn&apos;t available for this role yet — showing national figures.
              </span>
            )}
          </p>
        </div>
      </section>

      {/* STAT PANEL */}
      <section className="px-6 sm:px-14 pb-14">
        <div className="max-w-[1100px] mx-auto bg-hero p-8 sm:p-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <Stat label="25th percentile" value={low} hint="Entry / lower range" />
            <Stat label="Median" value={med} hint="The typical pay" emphasis />
            <Stat label="75th percentile" value={high} hint="Experienced / upper range" />
          </div>
          {data.annual && data.hourly && (
            <p className="text-[13px] text-heritage-light mt-8 pt-6 border-t border-hero-foreground/10">
              That&apos;s roughly {fmtAnnual(data.annual.p50)} per year or {fmtHourly(data.hourly.p50)}/hr at the median.
              {compare && ` ${state.name} runs about ${compare.pct}% ${compare.dir} the national median.`}
            </p>
          )}
        </div>
      </section>

      {ownerCaveat(role) && (
        <section className="px-6 sm:px-14 pb-10 -mt-4">
          <p className="max-w-[1100px] mx-auto text-[13px] text-slate-meta italic leading-[1.6]">{ownerCaveat(role)}</p>
        </section>
      )}

      {/* TOP METROS */}
      {metros.length > 0 && (
        <section className="px-6 sm:px-14 pb-16">
          <div className="max-w-[1100px] mx-auto">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-1px] text-ink mb-6">
              Top-paying metros in {state.name}
            </h2>
            <div className="border border-[var(--rule)]">
              <div className="grid grid-cols-12 px-5 py-3 bg-cream text-[11px] font-bold uppercase tracking-[1.5px] text-slate-meta">
                <div className="col-span-6">Metro area</div>
                <div className="col-span-3 text-right">Median</div>
                <div className="col-span-3 text-right">Typical range</div>
              </div>
              {metros.map((m) => {
                const t = m.annual ?? m.hourly!;
                const u: "annual" | "hourly" = m.annual ? "annual" : "hourly";
                return (
                  <Link key={m.name} href={`/salary/${role.slug}/${p.state}/${m.slug}`} className="grid grid-cols-12 px-5 py-4 border-t border-[var(--rule)] items-center hover:bg-cream transition-colors">
                    <div className="col-span-6 text-ink font-semibold">{metroShort(m.name)}</div>
                    <div className="col-span-3 text-right text-ink font-bold">{fmt(t.p50, u)}{u === "hourly" ? "/hr" : ""}</div>
                    <div className="col-span-3 text-right text-slate-meta text-sm">{fmt(t.p25, u)}–{fmt(t.p75, u)}</div>
                  </Link>
                );
              })}
            </div>
            <p className="text-[12px] text-slate-meta mt-3">Source: {data.source}, {data.vintage}. Figures are gross wages, not adjusted for cost of living.</p>
          </div>
        </section>
      )}

      {/* CONTEXT / DSO ANGLE */}
      <section className="px-6 sm:px-14 pb-16">
        <div className="max-w-[1100px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-1px] text-ink mb-4">What drives {role.searchTitle.toLowerCase()} pay in {state.name}</h2>
            <p className="text-slate-body leading-[1.7] mb-4">
              Pay for a {role.searchTitle.toLowerCase()} depends on experience, setting, and metro. Group practices and
              dental support organizations (DSOs) often sit toward the upper end of the range, since they compete for
              talent across multiple locations and can offer benefits and advancement a single practice can&apos;t.
            </p>
            <p className="text-slate-body leading-[1.7]">
              Across dentistry, hiring is hard and getting harder — staffing is consistently ranked among dentists&apos;
              top challenges, and open roles routinely take well over two months to fill. For candidates, that means
              leverage; for employers, it means speed and fit matter more than ever.
            </p>
          </div>
          <div className="bg-cream p-8">
            <p className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-3">For dental pros</p>
            <h3 className="text-xl font-extrabold text-ink mb-3">Know your worth, then go get it</h3>
            <p className="text-slate-body leading-[1.7] mb-6 text-[15px]">
              Build a free, ATS-ready résumé and get matched to practices that fit how you want to work — in {state.name} and beyond.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/resume-templates" className="inline-flex items-center px-7 py-3.5 bg-primary text-primary-foreground text-[12px] font-bold tracking-[2px] uppercase hover:bg-primary/90 transition-colors">
                Build a free résumé
              </Link>
              <Link href="/jobs" className="inline-flex items-center px-7 py-3.5 border border-[var(--rule-strong)] text-ink text-[12px] font-bold tracking-[2px] uppercase hover:border-ink transition-colors">
                Browse dental jobs
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 sm:px-14 pb-16">
        <div className="max-w-[1100px] mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-1px] text-ink mb-6">
            {role.searchTitle} salary in {state.name}: FAQ
          </h2>
          <div className="divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
            {faq.map((f) => (
              <div key={f.q} className="py-5">
                <h3 className="text-lg font-bold text-ink mb-2">{f.q}</h3>
                <p className="text-slate-body leading-[1.7] text-[15px]">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* EMPLOYER CTA */}
      <section className="px-6 sm:px-14 pb-16">
        <div className="max-w-[1100px] mx-auto bg-heritage p-8 sm:p-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <p className="text-[10px] font-bold tracking-[3px] uppercase text-primary-foreground/80 mb-2">Hiring in {state.name}?</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-1px] text-primary-foreground">Fill {role.searchTitle.toLowerCase()} roles across every location.</h2>
          </div>
          <Link href="/for-dental-groups" className="shrink-0 inline-flex items-center px-8 py-4 bg-ivory text-ink text-[12px] font-bold tracking-[2px] uppercase hover:bg-card transition-colors">
            See how it works
          </Link>
        </div>
      </section>

      {/* INTERNAL LINKS */}
      <section className="px-6 sm:px-14 pb-24">
        <div className="max-w-[1100px] mx-auto grid grid-cols-1 sm:grid-cols-2 gap-10">
          <div>
            <p className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-4">Other roles in {state.name}</p>
            <ul className="space-y-2">
              {otherRoles.map((x) => (
                <li key={x.slug}>
                  <Link href={`/salary/${x.slug}/${p.state}`} className="text-ink hover:text-heritage-deep underline underline-offset-4 decoration-[var(--rule-strong)]">
                    {x.searchTitle} salary in {state.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-4">{role.searchTitle} salary by state</p>
            <ul className="space-y-2">
              {otherStates.map((n) => (
                <li key={n}>
                  <Link href={`/salary/${role.slug}/${stateSlug(n)}`} className="text-ink hover:text-heritage-deep underline underline-offset-4 decoration-[var(--rule-strong)]">
                    {role.searchTitle} salary in {n}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

function Stat({ label, value, hint, emphasis }: { label: string; value: string; hint: string; emphasis?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[2px] text-heritage-light mb-2">{label}</p>
      <p className={`font-extrabold text-hero-foreground tracking-[-1px] ${emphasis ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl"}`}>{value}</p>
      <p className="text-[12px] text-hero-foreground/50 mt-1">{hint}</p>
    </div>
  );
}
