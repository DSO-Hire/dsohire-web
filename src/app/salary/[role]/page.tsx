/**
 * /salary/[role] — role-level salary hub: national overview + links to every
 * state page. A pure internal-linking hub. Inherits the noindex gate until launch.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/marketing/site-shell";
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

type Params = { role: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  const role = SALARY_ROLE_BY_SLUG[p.role];
  if (!role) return { title: "Dental Salary Data" };
  return {
    title: `${role.searchTitle} Salary by State (2026)`,
    description: `${role.searchTitle} salary across the U.S. — national median plus a state-by-state breakdown, based on the latest BLS data.`,
    alternates: { canonical: `/salary/${p.role}` },
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

  const otherRoles = SALARY_ROLES.filter((x) => x.slug !== role.slug);

  return (
    <SiteShell>
      <section className="pt-[140px] pb-12 px-6 sm:px-14">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-5">Dental Salary Data · BLS OEWS</p>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-[-1.5px] leading-[1.04] text-ink mb-6">
            {role.searchTitle} Salary by State
          </h1>
          <p className="text-lg sm:text-xl text-slate-body leading-[1.6] max-w-[760px]">
            {natMed
              ? <>Nationally, the median {role.searchTitle.toLowerCase()} {natUnit === "annual" ? "earns" : "is paid"} <span className="font-bold text-ink">{natMed}{natUnit === "hourly" ? "/hr" : " a year"}</span>. Pick a state for local pay, ranges, and top-paying metros.</>
              : <>Pick a state below for {role.searchTitle.toLowerCase()} pay, ranges, and top-paying metros.</>}
          </p>
          {ownerCaveat(role) && (
            <p className="text-[13px] text-slate-meta italic leading-[1.6] mt-5 max-w-[760px]">{ownerCaveat(role)}</p>
          )}
        </div>
      </section>

      <section className="px-6 sm:px-14 pb-16">
        <div className="max-w-[1100px] mx-auto">
          <h2 className="text-2xl font-extrabold tracking-[-1px] text-ink mb-6">Choose a state</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-3 border-t border-[var(--rule)] pt-6">
            {US_STATES.map((s) => (
              <Link key={s.code} href={`/salary/${role.slug}/${stateSlug(s.name)}`} className="text-ink hover:text-heritage-deep text-[15px]">
                {s.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 sm:px-14 pb-16">
        <div className="max-w-[1100px] mx-auto bg-heritage p-8 sm:p-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <p className="text-[10px] font-bold tracking-[3px] uppercase text-ivory/80 mb-2">Hiring {role.searchTitle.toLowerCase()}s?</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-1px] text-ivory">Fill roles across every location, faster.</h2>
          </div>
          <Link href="/for-dental-groups" className="shrink-0 inline-flex items-center px-8 py-4 bg-ivory text-ink text-[12px] font-bold tracking-[2px] uppercase hover:bg-white transition-colors">See how it works</Link>
        </div>
      </section>

      <section className="px-6 sm:px-14 pb-24">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-4">Other dental roles</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href={role.hubHref} className="text-ink hover:text-heritage-deep underline underline-offset-4 decoration-[var(--rule-strong)]">{role.searchTitle} careers →</Link>
            {otherRoles.map((x) => (
              <Link key={x.slug} href={`/salary/${x.slug}`} className="text-ink hover:text-heritage-deep underline underline-offset-4 decoration-[var(--rule-strong)]">
                {x.searchTitle} salary
              </Link>
            ))}
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
