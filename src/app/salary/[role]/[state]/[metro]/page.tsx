/**
 * /salary/[role]/[state]/[metro] — metro-level salary pages.
 * Server component; inherits the site-wide noindex gate until launch.
 * Metros are resolved from comp_benchmarks (BLS OEWS) by city slug.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/marketing/site-shell";
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

type Params = { role: string; state: string; metro: string };

function pick(m: { annual: PayTriple | null; hourly: PayTriple | null }): { triple: PayTriple; unit: "annual" | "hourly" } | null {
  if (m.annual) return { triple: m.annual, unit: "annual" };
  if (m.hourly) return { triple: m.hourly, unit: "hourly" };
  return null;
}
function fmt(n: number, unit: "annual" | "hourly"): string {
  return unit === "annual" ? fmtAnnual(n) : fmtHourly(n) + "/hr";
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
  return {
    title: `${r.role.searchTitle} Salary in ${city} (2026)`,
    description: `${r.role.searchTitle} pay in ${city}: median, the typical range, and how it compares to ${r.state.name} and the U.S. — based on the latest BLS data.`,
    alternates: { canonical: `/salary/${p.role}/${p.state}/${p.metro}` },
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

  const city = metroShort(metro.name);
  const med = fmt(pr.triple.p50, pr.unit);
  const low = fmt(pr.triple.p25, pr.unit);
  const high = fmt(pr.triple.p75, pr.unit);

  function deltaVs(other: { annual: PayTriple | null; hourly: PayTriple | null } | null): { pct: number; dir: "above" | "below" | "in line with" } | null {
    if (!other) return null;
    const op = pick(other);
    if (!op || op.unit !== pr.unit || op.triple.p50 <= 0) return null;
    const pct = Math.round(((pr.triple.p50 - op.triple.p50) / op.triple.p50) * 100);
    return { pct: Math.abs(pct), dir: pct > 1 ? "above" : pct < -1 ? "below" : "in line with" };
  }
  const vsState = stateData?.level === "state" ? deltaVs(stateData) : null;
  const vsNational = deltaVs(national);

  const faq = [
    {
      q: `What is the average ${role.searchTitle.toLowerCase()} salary in ${city}?`,
      a: `The median ${role.searchTitle.toLowerCase()} ${prim.unit === "annual" ? "salary" : "wage"} in the ${city} area is about ${med}, with most earning between ${low} and ${high} (BLS OEWS, latest release).`,
    },
    vsState
      ? { q: `Is ${city} higher or lower than the rest of ${state.name}?`, a: `${city} runs about ${vsState.pct}% ${vsState.dir} the ${state.name} state median for ${role.searchTitle.toLowerCase()}s.` }
      : { q: `Does pay vary across the ${city} area?`, a: `Yes — employer type and experience drive most of the spread, from ${low} at the lower end to ${high} at the upper end.` },
    vsNational
      ? { q: `How does ${city} compare nationally?`, a: `Compared to the national median, ${role.searchTitle.toLowerCase()} pay in ${city} is about ${vsNational.pct}% ${vsNational.dir} average.` }
      : { q: `Is demand strong in ${city}?`, a: `Dental hiring is competitive nationwide, and metro markets like ${city} are no exception — open roles can take well over two months to fill.` },
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  const siblingMetros = metros.filter((m) => m.slug !== metro.slug).slice(0, 6);
  const otherRoles = SALARY_ROLES.filter((x) => x.slug !== role.slug);

  return (
    <SiteShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="pt-[140px] pb-12 px-6 sm:px-14">
        <div className="max-w-[1100px] mx-auto">
          <nav className="text-[12px] text-slate-meta mb-5">
            <Link href={`/salary/${role.slug}`} className="hover:text-heritage-deep underline underline-offset-2">{role.searchTitle} salary</Link>
            <span className="mx-2">/</span>
            <Link href={`/salary/${role.slug}/${p.state}`} className="hover:text-heritage-deep underline underline-offset-2">{state.name}</Link>
            <span className="mx-2">/</span>
            <span className="text-ink">{city}</span>
          </nav>
          <p className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-5">Dental Salary Data · BLS OEWS</p>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-[-1.5px] leading-[1.04] text-ink mb-6">
            {role.searchTitle} Salary in {city}
          </h1>
          <p className="text-lg sm:text-xl text-slate-body leading-[1.6] max-w-[760px]">
            The median {role.searchTitle.toLowerCase()} {prim.unit === "annual" ? "earns" : "is paid"}{" "}
            <span className="font-bold text-ink">{med}{prim.unit === "hourly" ? "/hr" : " a year"}</span>{" "}
            in the {city} metro, with most between {low} and {high}.
          </p>
        </div>
      </section>

      <section className="px-6 sm:px-14 pb-14">
        <div className="max-w-[1100px] mx-auto bg-hero p-8 sm:p-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <Stat label="25th percentile" value={low} hint="Entry / lower range" />
            <Stat label="Median" value={med} hint="The typical pay" emphasis />
            <Stat label="75th percentile" value={high} hint="Experienced / upper range" />
          </div>
          {(vsState || vsNational) && (
            <p className="text-[13px] text-heritage-light mt-8 pt-6 border-t border-hero-foreground/10">
              {vsState && `${city} runs about ${vsState.pct}% ${vsState.dir} the ${state.name} median. `}
              {vsNational && `Versus the national median, it's about ${vsNational.pct}% ${vsNational.dir} average.`}
            </p>
          )}
        </div>
      </section>

      {ownerCaveat(role) && (
        <section className="px-6 sm:px-14 pb-10 -mt-4">
          <p className="max-w-[1100px] mx-auto text-[13px] text-slate-meta italic leading-[1.6]">{ownerCaveat(role)}</p>
        </section>
      )}

      {/* candidate CTA */}
      <section className="px-6 sm:px-14 pb-16">
        <div className="max-w-[1100px] mx-auto bg-cream p-8 sm:p-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="max-w-[560px]">
            <p className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">For dental pros in {city}</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-1px] text-ink">Build a free résumé and get matched to practices that fit you.</h2>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <Link href="/resume-templates" className="inline-flex items-center px-7 py-3.5 bg-primary text-primary-foreground text-[12px] font-bold tracking-[2px] uppercase hover:bg-primary/90 transition-colors">Build a free résumé</Link>
            <Link href="/jobs" className="inline-flex items-center px-7 py-3.5 border border-[var(--rule-strong)] text-ink text-[12px] font-bold tracking-[2px] uppercase hover:border-ink transition-colors">Browse jobs</Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 sm:px-14 pb-16">
        <div className="max-w-[1100px] mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-1px] text-ink mb-6">{role.searchTitle} salary in {city}: FAQ</h2>
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

      {/* internal links */}
      <section className="px-6 sm:px-14 pb-24">
        <div className="max-w-[1100px] mx-auto grid grid-cols-1 sm:grid-cols-2 gap-10">
          {siblingMetros.length > 0 && (
            <div>
              <p className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-4">Other {state.name} metros</p>
              <ul className="space-y-2">
                {siblingMetros.map((m) => (
                  <li key={m.slug}>
                    <Link href={`/salary/${role.slug}/${p.state}/${m.slug}`} className="text-ink hover:text-heritage-deep underline underline-offset-4 decoration-[var(--rule-strong)]">
                      {role.searchTitle} salary in {metroShort(m.name)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-4">Other roles in {state.name}</p>
            <ul className="space-y-2">
              {otherRoles.slice(0, 6).map((x) => (
                <li key={x.slug}>
                  <Link href={`/salary/${x.slug}/${p.state}`} className="text-ink hover:text-heritage-deep underline underline-offset-4 decoration-[var(--rule-strong)]">
                    {x.searchTitle} salary in {state.name}
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
