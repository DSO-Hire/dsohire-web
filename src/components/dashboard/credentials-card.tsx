/**
 * CredentialsCard — Day 35 (Direction A v2.1 rail). A candidate-facing
 * window on the dental-credential data we already store
 * (candidate_licenses + candidate_certifications, with issued/expires
 * dates). Surfaces upcoming expirations so a candidate stays
 * employer-ready — the candidate side of our credentialing moat.
 *
 * Honest: we only show what's on file. Clinical roles additionally track
 * state license / DEA / malpractice / NPI (noted, not faked here). No
 * primary-source verification is implied.
 *
 * Server-rendered — links only.
 */

import Link from "next/link";
import { ShieldCheck, AlertTriangle, Check, ArrowRight } from "lucide-react";

export interface CredItem {
  id: string;
  /** Display name, e.g. "RDH License" or "CPR / BLS". */
  label: string;
  /** Optional qualifier, e.g. state or level. */
  detail?: string | null;
  /** ISO date or null when the credential doesn't expire / unknown. */
  expiresDate?: string | null;
}

type Tone = "ok" | "warn" | "soon";

function status(expiresDate: string | null | undefined): {
  tone: Tone;
  text: string;
  action?: string;
  /** Lower = more urgent (drives sort). null-expiry sorts last. */
  rank: number;
} {
  if (!expiresDate) {
    return { tone: "ok", text: "On file", rank: Number.MAX_SAFE_INTEGER - 1 };
  }
  const days = Math.floor(
    (new Date(expiresDate).getTime() - Date.now()) / 86_400_000,
  );
  if (days < 0) return { tone: "warn", text: "Expired", action: "Renew", rank: -1 };
  if (days <= 45) {
    return {
      tone: "soon",
      text: `Expires in ${humanize(days)}`,
      action: "Renew",
      rank: days,
    };
  }
  return { tone: "ok", text: `Current · renews in ${humanize(days)}`, rank: days };
}

function humanize(days: number): string {
  if (days <= 0) return "0 days";
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}

export function CredentialsCard({
  items,
  addHref = "/candidate/profile",
}: {
  items: CredItem[];
  addHref?: string;
}) {
  const ranked = items
    .map((it) => ({ it, st: status(it.expiresDate) }))
    .sort((a, b) => a.st.rank - b.st.rank)
    .slice(0, 5);

  return (
    <section className="border border-[var(--rule)] bg-card p-5">
      <h3 className="mb-3.5 flex items-center gap-2 text-[10px] font-extrabold tracking-[2px] uppercase text-heritage-deep">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        Credentials &amp; CE
      </h3>

      {ranked.length === 0 ? (
        <div>
          <p className="text-[13px] leading-relaxed text-slate-body">
            Add your license &amp; certifications so practices can see you’re
            ready to work.
          </p>
          <Link
            href={addHref}
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.5px] uppercase text-heritage hover:text-heritage-deep transition-colors"
          >
            Add credentials
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      ) : (
        <div className="flex flex-col">
          {ranked.map(({ it, st }, i) => (
            <div
              key={it.id}
              className={`flex items-center gap-3 py-2.5 ${
                i < ranked.length - 1 ? "border-b border-dashed border-[var(--rule)]" : ""
              }`}
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
                  st.tone === "ok"
                    ? "bg-heritage/10 text-heritage-deep"
                    : "bg-warning-bg text-warning"
                }`}
              >
                {st.tone === "ok" ? (
                  <Check className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold leading-tight text-ink">
                  {it.label}
                  {it.detail ? (
                    <span className="font-normal text-slate-meta"> · {it.detail}</span>
                  ) : null}
                </div>
                <div className="text-[11.5px] text-slate-meta">{st.text}</div>
              </div>
              {st.action ? (
                <Link
                  href={addHref}
                  className="shrink-0 text-[11px] font-bold text-warning hover:underline"
                >
                  {st.action} →
                </Link>
              ) : (
                <span className="shrink-0 text-[11px] font-bold text-heritage-deep">
                  Verified
                </span>
              )}
            </div>
          ))}
          <p className="mt-3 text-[11px] leading-relaxed text-slate-meta">
            We track expirations so a practice never has to ask. Clinical roles
            also track state license, DEA &amp; malpractice — no other ATS does
            this for dental.
          </p>
        </div>
      )}
    </section>
  );
}
