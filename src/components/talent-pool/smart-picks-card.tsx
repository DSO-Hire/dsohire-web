/**
 * Smart Picks card on /employer/jobs/[id] (Phase 5D Day 2).
 *
 * Renders the top N Practice-Fit-ranked candidates from the opted-in
 * pool with bucket colors + fit %. Each row links to the candidate
 * detail page; a save-to-pool toggle lives on the right.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PracticeFitWordmark } from "@/components/practice-fit/brand/practice-fit-wordmark";
import type { SmartPick } from "@/lib/talent-pool/smart-picks";
import { SmartPicksSaveButton } from "./smart-picks-save-button";

interface SmartPicksCardProps {
  picks: SmartPick[];
}

const BUCKET_STYLE: Record<
  string,
  { label: string; bg: string; fg: string }
> = {
  excellent: { label: "Excellent fit", bg: "#DCFCE7", fg: "#166534" },
  strong: { label: "Strong fit", bg: "#DCFCE7", fg: "#166534" },
  solid: { label: "Solid fit", bg: "#E8EFEB", fg: "#2F5D4F" },
  light: { label: "Light fit", bg: "#FEF3C7", fg: "#B45309" },
  low: { label: "Low fit", bg: "#FEE2E2", fg: "#B91C1C" },
};

export function SmartPicksCard({ picks }: SmartPicksCardProps) {
  if (picks.length === 0) return null;

  return (
    <section className="mb-10 border border-[var(--rule)] bg-white">
      <header className="px-6 py-4 border-b border-[var(--rule)] flex items-center justify-between">
        <div className="flex items-center gap-2 text-heritage-deep">
          <span className="text-[10px] font-bold tracking-[2.5px] uppercase">
            Smart picks ·
          </span>
          <PracticeFitWordmark surface="inherit" className="text-[14px]" />
        </div>
        <Link
          href="/employer/talent-pool"
          className="text-[11px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink inline-flex items-center gap-1"
        >
          Open talent pool <ArrowRight className="h-3 w-3" />
        </Link>
      </header>
      <div className="px-6 py-3 text-[12px] text-slate-meta border-b border-[var(--rule)]">
        Top {picks.length} opted-in candidates ranked by PracticeFit for
        this role. Already-applied candidates are excluded.
      </div>
      <ul>
        {picks.map((p) => {
          const style = BUCKET_STYLE[p.fit.bucket] ?? BUCKET_STYLE.solid;
          return (
            <li
              key={p.candidate_id}
              className="px-6 py-4 border-b border-[var(--rule)] last:border-b-0 flex items-center gap-4"
            >
              <Avatar fullName={p.full_name} avatarUrl={p.avatar_url} />

              <div className="flex-1 min-w-0">
                <Link
                  href={`/employer/candidates/${p.candidate_id}`}
                  className="text-[14px] font-bold text-ink hover:text-heritage-deep truncate inline-block max-w-full"
                >
                  {p.full_name ?? "Unnamed candidate"}
                </Link>
                {p.headline && (
                  <div className="text-[12px] text-slate-body truncate mt-0.5">
                    {p.headline}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-meta mt-1">
                  {p.current_title && <span>{p.current_title}</span>}
                  {p.years_experience !== null && (
                    <span>
                      {p.years_experience} yr
                      {p.years_experience === 1 ? "" : "s"} exp
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center px-2 py-0.5 text-[11px] font-bold rounded-full"
                    style={{
                      backgroundColor: style.bg,
                      color: style.fg,
                    }}
                  >
                    {style.label}
                  </span>
                  <span className="tabular-nums font-extrabold text-ink text-[14px]">
                    {Math.round(p.fit.score)}
                  </span>
                </div>
                <SmartPicksSaveButton
                  candidateId={p.candidate_id}
                  initialEntryId={p.pool_entry_id}
                />
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
    <div className="h-11 w-11 rounded-full bg-heritage text-ivory flex items-center justify-center font-bold text-[13px] shrink-0">
      {initials || "?"}
    </div>
  );
}
