/**
 * /salary — top-level dental salary hub. Links to each role's salary index.
 * Inherits the noindex gate until launch.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/marketing/site-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SALARY_ROLES, fmtAnnual, fmtHourly } from "@/lib/comp/salary";

export const metadata: Metadata = {
  title: "Dental Salary Data by Role & State (2026)",
  description: "Dental salary data for hygienists, assistants, dentists, office managers, and more — national medians plus a state-by-state breakdown, based on the latest BLS data.",
  alternates: { canonical: "/salary" },
};

export default async function SalaryHome() {
  const supabase = await createSupabaseServerClient();
  const res = await supabase
    .from("comp_benchmarks")
    .select("soc_code, pay_unit, p50")
    .eq("area_level", "national")
    .eq("area_code", "US");
  const rows = (res.data ?? []) as Record<string, unknown>[];
  const bySoc = new Map<string, { annual: number | null; hourly: number | null }>();
  for (const r of rows) {
    const soc = r.soc_code as string;
    const p50 = r.p50 === null || r.p50 === undefined ? null : Number(r.p50);
    if (p50 === null || !Number.isFinite(p50)) continue;
    const cur = bySoc.get(soc) ?? { annual: null, hourly: null };
    if (r.pay_unit === "annual") cur.annual = p50;
    else if (r.pay_unit === "hourly") cur.hourly = p50;
    bySoc.set(soc, cur);
  }

  return (
    <SiteShell>
      <section className="pt-[140px] pb-12 px-6 sm:px-14">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-5">Dental Salary Data · BLS OEWS</p>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-[-1.5px] leading-[1.04] text-ink mb-6">
            Dental Salary Data
          </h1>
          <p className="text-lg sm:text-xl text-slate-body leading-[1.6] max-w-[760px]">
            What dental professionals earn — by role, state, and metro. Median pay and typical ranges, straight from the latest Bureau of Labor Statistics data.
          </p>
        </div>
      </section>

      <section className="px-6 sm:px-14 pb-24">
        <div className="max-w-[1100px] mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SALARY_ROLES.map((role) => {
            const m = bySoc.get(role.soc);
            const med = m?.annual ? fmtAnnual(m.annual) + " / yr" : m?.hourly ? fmtHourly(m.hourly) + " / hr" : null;
            return (
              <Link key={role.slug} href={`/salary/${role.slug}`} className="group border border-[var(--rule)] hover:border-ink p-6 transition-colors flex items-center justify-between gap-4">
                <div>
                  <p className="text-lg font-bold text-ink group-hover:text-heritage-deep">{role.searchTitle} Salary</p>
                  <p className="text-[13px] text-slate-meta mt-1">By state &amp; metro</p>
                </div>
                {med && <span className="text-[15px] font-bold text-heritage-deep shrink-0">{med}</span>}
              </Link>
            );
          })}
        </div>
      </section>
    </SiteShell>
  );
}
