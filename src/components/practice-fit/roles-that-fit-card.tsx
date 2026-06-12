/**
 * <RolesThatFitCard /> — candidate dashboard "Roles that fit you" feed (B.1).
 *
 * Compact ranked list of the candidate's strongest open-role matches by
 * PracticeFit. Server component, pure rendering — the caller passes the
 * already-ranked roles from getTopFitJobsForCandidate.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PracticeFitWordmark } from "@/components/practice-fit/brand/practice-fit-wordmark";
import { DsoFitWordmark } from "@/components/practice-fit/brand/dsofit-wordmark";
import { PracticeFitChip } from "@/components/practice-fit/practice-fit-chip";
import type { RoleThatFits } from "@/lib/practice-fit/roles-that-fit";

function formatLocations(
  locs: Array<{ city: string | null; state: string | null }>
): string | null {
  if (locs.length === 0) return null;
  const first = [locs[0].city, locs[0].state].filter(Boolean).join(", ");
  if (!first) return null;
  return locs.length > 1 ? `${first} +${locs.length - 1} more` : first;
}

/**
 * Lane 7 (Model 06) — WHY chips: lead with the reason, not just the
 * number. Reuses the engine's own top_factors (top scored dims by
 * contribution) with an honesty floor: only dims that genuinely scored
 * strong (raw ≥ 70) become chips. Weak matches show no chips rather
 * than dressing up a low score.
 */
function whyChips(fit: RoleThatFits["fit"]): string[] {
  const factors = fit.top_factors ?? [];
  const chips: string[] = [];
  for (const key of factors) {
    const dim = fit.dimensions?.[key];
    if (!dim || !dim.scored || dim.raw < 70) continue;
    if (dim.label) chips.push(dim.label);
    if (chips.length >= 2) break;
  }
  return chips;
}

export function RolesThatFitCard({
  roles,
  product = "practicefit",
}: {
  roles: RoleThatFits[];
  /** Which fit brand to show in the header (#55). Defaults to PracticeFit. */
  product?: "practicefit" | "dsofit";
}) {
  if (roles.length === 0) return null;
  return (
    <section className="mb-6">
      <div className="flex items-end justify-between gap-4 mb-3">
        <div className="flex items-center gap-2 text-heritage-deep">
          <span className="text-[10px] font-bold tracking-[2.5px] uppercase">
            Roles that fit you ·
          </span>
          {product === "dsofit" ? (
            <DsoFitWordmark surface="light" className="text-[14px]" />
          ) : (
            <PracticeFitWordmark surface="light" className="text-[14px]" />
          )}
        </div>
        <Link
          href="/candidate/jobs"
          className="text-[10px] font-bold tracking-[1.5px] uppercase text-heritage hover:text-heritage-deep transition-colors"
        >
          Browse all
        </Link>
      </div>
      <div className="border border-[var(--rule)] bg-white divide-y divide-[var(--rule)]">
        {roles.map((r) => {
          const loc = formatLocations(r.locations);
          const sub = [r.dso_name, loc].filter(Boolean).join(" · ");
          const chips = whyChips(r.fit);
          return (
            <Link
              key={r.job_id}
              href={`/jobs/${r.job_id}`}
              className="group flex items-center justify-between gap-3 px-4 py-3 hover:bg-cream transition-colors"
            >
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-ink truncate group-hover:text-heritage-deep transition-colors">
                  {r.title}
                </p>
                {sub && (
                  <p className="text-[12px] text-slate-meta truncate">{sub}</p>
                )}
                {chips.length > 0 && (
                  <span className="mt-1.5 hidden sm:flex items-center gap-1.5 flex-wrap">
                    {chips.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center px-1.5 py-0.5 bg-heritage/10 text-heritage-deep text-[9.5px] font-bold tracking-[0.6px] uppercase"
                      >
                        {c}
                      </span>
                    ))}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <PracticeFitChip fit={r.fit} size="sm" showScore />
                <ArrowRight className="h-3.5 w-3.5 text-slate-meta group-hover:text-heritage-deep transition-colors" />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
