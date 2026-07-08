/**
 * <CredentialsExpiring> — #9c dashboard roll-up.
 *
 * Surfaces hired/active candidates whose licenses or certs are expired or
 * expiring soon, each linking to that candidate's hire-readiness section.
 * Honest-floor: renders nothing when there's nothing to flag.
 */

import Link from "next/link";
import { AlertTriangle, Clock, ArrowRight } from "lucide-react";
import { Eyebrow } from "@/components/brand/eyebrow";
import type { ExpiringCredential } from "@/lib/credentials/expiring-credentials";

function pill(state: ExpiringCredential["expiryState"]): string {
  switch (state) {
    case "expired":
      return "bg-danger-bg text-danger ring-1 ring-inset ring-danger";
    case "expiring_imminent":
      return "bg-danger-bg text-danger ring-1 ring-inset ring-danger";
    default:
      return "bg-warning-bg text-warning ring-1 ring-inset ring-warning";
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
    <section className="border border-[var(--rule)] bg-card">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--rule)] bg-cream/40">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <Eyebrow as="h2">Credentials expiring</Eyebrow>
        </div>
        <span className="text-2xs font-bold text-slate-meta tabular">
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
                <div className="text-xs font-semibold text-ink truncate">
                  {c.candidateName}
                  {c.hired && (
                    <span className="ml-2 text-2xs font-semibold text-success">
                      Hired
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-body truncate">
                  {c.credentialLabel}
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-2xs font-semibold tabular shrink-0 ${pill(c.expiryState)}`}
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
