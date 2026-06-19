/**
 * "Interested in you" — inbound candidate interest on the employer dashboard
 * (v3 Phase D, mutual interest).
 *
 * Candidates who SAVED one of this practice's jobs. Their PracticeFit is shown
 * for context but NEVER gates the list — a genuinely interested candidate with
 * a low (or unscored) fit still appears. A "Mutual" badge marks the ones the
 * practice has also saved. Identity masking is handled upstream in
 * getInterestedCandidates.
 */

import Link from "next/link";
import { ArrowRight, EyeOff, Hand, Heart } from "lucide-react";
import type { InterestedCandidate } from "@/lib/talent-pool/mutual-interest";

// Token-based classes (themed) instead of inline-style hex, so the fit
// buckets flip in dark mode like every other status color in the app.
const BUCKET_STYLE: Record<string, { label: string; cls: string }> = {
  excellent: { label: "Excellent fit", cls: "bg-success-bg text-success" },
  strong: { label: "Strong fit", cls: "bg-success-bg text-success" },
  solid: { label: "Solid fit", cls: "bg-heritage/10 text-heritage-deep" },
  light: { label: "Light fit", cls: "bg-warning-bg text-warning" },
  low: { label: "Low fit", cls: "bg-danger-bg text-danger" },
};

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86_400_000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function InterestedInYou({
  candidates,
}: {
  candidates: InterestedCandidate[];
}) {
  if (candidates.length === 0) return null;

  return (
    <section className="mb-6 border border-[var(--rule)] bg-card">
      <header className="px-6 py-4 border-b border-[var(--rule)] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-heritage-deep">
          <Hand className="h-3.5 w-3.5" />
          <span className="text-[10px] font-bold tracking-[2.5px] uppercase">
            Interested in you
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
        Candidates who saved one of your jobs. Fit is shown for context — reach
        out to anyone who caught your eye, score aside.
      </div>
      <ul>
        {candidates.map((c) => {
          const style = c.fit ? BUCKET_STYLE[c.fit.bucket] ?? BUCKET_STYLE.solid : null;
          return (
            <li
              key={c.candidate_id}
              className="px-6 py-4 border-b border-[var(--rule)] last:border-b-0 flex items-center gap-4"
            >
              <Avatar fullName={c.full_name} avatarUrl={c.avatar_url} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Link
                    href={`/employer/candidates/${c.candidate_id}`}
                    className="text-[14px] font-bold text-ink hover:text-heritage-deep truncate inline-block max-w-full"
                  >
                    {c.full_name ?? "Candidate"}
                  </Link>
                  {c.mutual && (
                    <span
                      title="You saved them too"
                      className="inline-flex items-center gap-1 rounded-full bg-heritage/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[1px] text-heritage-deep shrink-0"
                    >
                      <Heart className="h-3 w-3" /> Mutual
                    </span>
                  )}
                  {c.anonymized && (
                    <span
                      title="Anonymous until they apply"
                      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[1px] text-slate-meta shrink-0"
                    >
                      <EyeOff className="h-3 w-3" /> Anon
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-slate-body truncate mt-0.5">
                  Saved{" "}
                  <Link
                    href={`/employer/jobs/${c.saved_job_id}`}
                    className="font-semibold text-heritage-deep hover:text-ink"
                  >
                    {c.saved_job_title}
                  </Link>{" "}
                  · {relTime(c.saved_at)}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {style && c.fit ? (
                  <>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-bold rounded-full ${style.cls}`}
                    >
                      {style.label}
                    </span>
                    <span className="tabular-nums font-extrabold text-ink text-[14px]">
                      {Math.round(c.fit.score)}
                    </span>
                  </>
                ) : (
                  <span className="text-[11px] text-slate-meta">Not scored</span>
                )}
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
