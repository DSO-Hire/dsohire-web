/**
 * <CredentialsExpiring> — #9c dashboard roll-up.
 *
 * Surfaces hired/active candidates whose licenses or certs are expired or
 * expiring soon, each linking to that candidate's hire-readiness section.
 * Honest-floor: renders nothing when there's nothing to flag.
 */

import Link from "next/link";
import { AlertTriangle, Clock, ArrowRight } from "lucide-react";
import type { ExpiringCredential } from "@/lib/credentials/expiring-credentials";

function pill(state: ExpiringCredential["expiryState"]): string {
  switch (state) {
    case "expired":
      return "bg-red-50 text-red-800 ring-1 ring-inset ring-red-300";
    case "expiring_imminent":
      return "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200";
    default:
      return "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200";
  }
}

function shortLabel(c: ExpiringCredential): string {
  if (c.expiryState === "expired") {
    const ago = Math.abs(c.daysLeft);
    return `Expired ${ago}d ago`;
  }
  return c.daysLeft === 0 ? "Expires today" : `${c.daysLeft}d left`;
}

export function CredentialsExpiring({ items }: { items: ExpiringCredential[] }) {
  if (items.length === 0) return null;

  return (
    <section className="border border-[var(--rule)] bg-white">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--rule)] bg-cream/40">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-700" />
          <h2 className="text-[11px] font-bold tracking-[2px] uppercase text-[#14233F]">
            Credentials expiring
          </h2>
        </div>
        <span className="text-[11px] font-bold text-slate-meta">
          {items.length} to review
        </span>
      </div>
      <ul className="divide-y divide-[var(--rule)]">
        {items.map((c, i) => (
          <li key={`${c.applicationId}-${i}`}>
            <Link
              href={`/employer/applications/${c.applicationId}#hire-readiness`}
              className="flex items-center gap-3 px-5 py-3 hover:bg-cream/50 transition-colors group"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-ink truncate">
                  {c.candidateName}
                  {c.hired && (
                    <span className="ml-2 text-[10px] font-bold tracking-[1px] uppercase text-emerald-700">
                      Hired
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-slate-body truncate">
                  {c.credentialLabel}
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold shrink-0 ${pill(c.expiryState)}`}
              >
                {c.expiryState === "expiring_soon" ? (
                  <Clock className="h-3 w-3" />
                ) : (
                  <AlertTriangle className="h-3 w-3" />
                )}
                {shortLabel(c)}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-meta opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
