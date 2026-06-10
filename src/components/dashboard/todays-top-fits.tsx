/**
 * "Today's top fits" — the cross-job PracticeFit roll-up on the employer
 * dashboard (v3 Phase C).
 *
 * The per-job version (Smart Picks) lives on each job page; this aggregates
 * across all of a practice's open roles and shows each candidate at their
 * single best-matched role. Identity masking + eligibility are handled
 * upstream in getTodaysTopFits → getSmartPicks (anonymous-but-discoverable
 * candidates arrive already masked), so this component just renders.
 */

import Link from "next/link";
import { ArrowRight, EyeOff, Hand } from "lucide-react";
import type { TodaysTopFit } from "@/lib/talent-pool/smart-picks";

const BUCKET_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  excellent: { label: "Excellent fit", bg: "#DCFCE7", fg: "#166534" },
  strong: { label: "Strong fit", bg: "#DCFCE7", fg: "#166534" },
  solid: { label: "Solid fit", bg: "#E8EFEB", fg: "#2F5D4F" },
  light: { label: "Light fit", bg: "#FEF3C7", fg: "#B45309" },
  low: { label: "Low fit", bg: "#FEE2E2", fg: "#B91C1C" },
};

export function TodaysTopFits({ fits }: { fits: TodaysTopFit[] }) {
  if (fits.length === 0) return null;

  return (
    <section className="mb-6 border border-[var(--rule)] bg-white">
      <header className="px-6 py-4 border-b border-[var(--rule)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-heritage-deep">
          <span className="text-[10px] font-bold tracking-[2.5px] uppercase">
            Today&apos;s top fits
          </span>
        </div>
        <Link
          href="/employer/talent-pool"
          className="text-[11px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink inline-flex items-center gap-1 shrink-0"
        >
          Talent pool <ArrowRight className="h-3 w-3" />
        </Link>
      </header>
      <div className="px-6 py-3 text-[12px] text-slate-meta border-b border-[var(--rule)]">
        Your best-fit candidates across every open role, ranked by fit.
        Already-applied candidates show up in your pipeline instead.
      </div>
      <ul>
        {fits.map((p) => {
          const style = BUCKET_STYLE[p.fit.bucket] ?? BUCKET_STYLE.solid;
          return (
            <li
              key={p.candidate_id}
              className="px-6 py-4 border-b border-[var(--rule)] last:border-b-0 flex items-center gap-4"
            >
              <Avatar fullName={p.full_name} avatarUrl={p.avatar_url} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Link
                    href={`/employer/candidates/${p.candidate_id}`}
                    className="text-[14px] font-bold text-ink hover:text-heritage-deep truncate inline-block max-w-full"
                  >
                    {p.full_name ?? "Candidate"}
                  </Link>
                  {p.anonymized && (
                    <span
                      title="Anonymous until they apply"
                      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[1px] text-slate-meta shrink-0"
                    >
                      <EyeOff className="h-3 w-3" /> Anon
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-slate-body truncate mt-0.5">
                  Best fit for{" "}
                  <Link
                    href={`/employer/jobs/${p.best_job_id}`}
                    className="font-semibold text-heritage-deep hover:text-ink"
                  >
                    {p.best_job_title}
                  </Link>
                  {p.interested && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-bold text-heritage-deep">
                      <Hand className="h-3 w-3" /> Interested in you
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className="inline-flex items-center px-2 py-0.5 text-[11px] font-bold rounded-full"
                  style={{ backgroundColor: style.bg, color: style.fg }}
                >
                  {style.label}
                </span>
                <span className="tabular-nums font-extrabold text-ink text-[14px]">
                  {Math.round(p.fit.score)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Avatar({
  fullName,
  avatarUrl,
}: {
  fullName: string | null;
  avatarUrl: string | null;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className="h-11 w-11 rounded-full object-cover bg-cream shrink-0"
      />
    );
  }
  const initials = (fullName ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  return (
    <div className="h-11 w-11 rounded-full bg-cream flex items-center justify-center text-[13px] font-bold text-slate-body shrink-0">
      {initials || "?"}
    </div>
  );
}
