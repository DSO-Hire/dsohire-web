/**
 * /admin/liquidity — Marketplace Liquidity Radar (Tranche 1, Phase 2).
 *
 * Tier-1 read surface (the (app) layout gates admin_users). Aggregate-only:
 * supply/demand by role × metro, liquidity leaks, and velocity. No PII — the
 * candidate side is counts; nothing EEO; deleted_at filtered in the RPCs.
 */

import type { Metadata } from "next";
import {
  getLiquiditySnapshot,
  liquidityFlag,
  humanizeRole,
  type LiquidityTone,
} from "@/lib/admin/liquidity";

export const metadata: Metadata = {
  title: "Liquidity · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const MATRIX_LIMIT = 40;

const TONE_CLASS: Record<LiquidityTone, string> = {
  under: "text-danger bg-danger/10",
  over: "text-heritage-deep bg-heritage/10",
  balanced: "text-slate-body bg-cream",
  neutral: "text-slate-meta bg-cream",
};

export default async function LiquidityRadar() {
  const { matrix, sellerLeaks, buyerLeakCount, velocity } =
    await getLiquiditySnapshot();

  const shownMatrix = matrix.slice(0, MATRIX_LIMIT);

  return (
    <>
      <header className="mb-8">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          Marketplace health
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink">
          Liquidity Radar
        </h1>
        <p className="mt-3 text-[14px] text-slate-body leading-relaxed max-w-[680px]">
          Supply vs demand by role &amp; metro, where the funnel leaks, and how
          fast roles get their first applicant. Aggregate-only — the spots to
          point GTM at.
        </p>
      </header>

      {/* Velocity */}
      <Section title="Time to first applicant · by role">
        {velocity.length === 0 ? (
          <Empty>No applications with posting dates yet.</Empty>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <Th3 a="Role" b="Jobs w/ apps" c="Median days" />
            </thead>
            <tbody>
              {velocity.map((v) => (
                <tr key={v.role_category} className="border-b border-[var(--rule)]/60">
                  <td className="py-1.5 text-ink font-semibold">
                    {humanizeRole(v.role_category)}
                  </td>
                  <td className="py-1.5 text-right text-slate-body tabular-nums">
                    {v.jobs_with_apps}
                  </td>
                  <td className="py-1.5 text-right text-ink font-bold tabular-nums">
                    {v.median_days == null ? "—" : `${v.median_days}d`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Supply / demand matrix */}
      <Section
        title={`Supply vs demand · role × metro${
          matrix.length > MATRIX_LIMIT
            ? ` (top ${MATRIX_LIMIT} of ${matrix.length})`
            : ""
        }`}
      >
        {shownMatrix.length === 0 ? (
          <Empty>No active jobs or searchable candidates with location yet.</Empty>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta border-b border-[var(--rule)]">
                <th className="text-left py-2 font-bold">Role</th>
                <th className="text-left py-2 font-bold">Metro</th>
                <th className="text-right py-2 font-bold">Demand</th>
                <th className="text-right py-2 font-bold">Supply</th>
                <th className="text-right py-2 font-bold">Signal</th>
              </tr>
            </thead>
            <tbody>
              {shownMatrix.map((c) => {
                const flag = liquidityFlag(c.demand, c.supply);
                return (
                  <tr
                    key={`${c.role_category}|${c.metro}`}
                    className="border-b border-[var(--rule)]/60"
                  >
                    <td className="py-1.5 text-ink font-semibold">
                      {humanizeRole(c.role_category)}
                    </td>
                    <td className="py-1.5 text-slate-body">{c.metro}</td>
                    <td className="py-1.5 text-right text-ink tabular-nums">
                      {c.demand}
                    </td>
                    <td className="py-1.5 text-right text-ink tabular-nums">
                      {c.supply}
                    </td>
                    <td className="py-1.5 text-right">
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] font-bold tracking-[0.5px] uppercase ${TONE_CLASS[flag.tone]}`}
                      >
                        {flag.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* Leaks */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-1 border border-[var(--rule)] bg-card p-6">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
            Buyer illiquidity
          </div>
          <div className="text-4xl font-extrabold tracking-[-1px] text-ink leading-none tabular-nums">
            {buyerLeakCount}
          </div>
          <div className="mt-2 text-[13px] text-slate-body leading-snug">
            searchable candidates with zero applications — supply sitting idle.
          </div>
        </div>

        <div className="lg:col-span-2 border border-[var(--rule)] bg-card p-6">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
            Seller illiquidity · active jobs with 0 applications
          </div>
          {sellerLeaks.length === 0 ? (
            <Empty>Every active job has at least one applicant. 🎉</Empty>
          ) : (
            <ul className="list-none divide-y divide-[var(--rule)]/60">
              {sellerLeaks.map((j) => (
                <li
                  key={j.job_id}
                  className="flex items-center justify-between gap-4 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] text-ink font-semibold truncate">
                      {j.title}
                    </div>
                    <div className="text-[11px] text-slate-meta truncate">
                      {j.dso_name} · {j.metro}
                    </div>
                  </div>
                  <div className="shrink-0 text-[12px] text-slate-meta tabular-nums">
                    {j.days_live}d live
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="mt-8 text-[11px] text-slate-meta leading-relaxed">
        Metro v1 = &ldquo;City, ST&rdquo; (dso_locations for demand, candidate
        current location for supply). Matches are exact-string; a CBSA crosswalk
        upgrade is a later tranche. Counts are aggregate — no candidate identity
        is rendered here.
      </p>
    </>
  );
}

/* ───── presentational helpers ───── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 border border-[var(--rule)] bg-card p-6">
      <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
        {title}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-slate-meta italic">{children}</p>;
}

function Th3({ a, b, c }: { a: string; b: string; c: string }) {
  return (
    <tr className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta border-b border-[var(--rule)]">
      <th className="text-left py-2 font-bold">{a}</th>
      <th className="text-right py-2 font-bold">{b}</th>
      <th className="text-right py-2 font-bold">{c}</th>
    </tr>
  );
}
