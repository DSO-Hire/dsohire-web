"use client";

/**
 * AffiliationCard — surfaces the DSO-affiliation reveal state for a
 * single application + the "Reveal DSO to candidate" button when the
 * DSO's policy is per_application and the bit hasn't been flipped yet.
 *
 * Lives on /employer/applications/[id]. Self-contained so the parent
 * page just passes props; all the policy-branch logic lives here.
 *
 * Render matrix (driven by props):
 *   isPublicAffiliated = true                            → don't render anything
 *   policy = 'never'                                     → "Always private" status only
 *   policy = 'after_hire' AND status != 'hired'          → "Reveals at hire" status
 *   policy = 'after_hire' AND status = 'hired'           → "Revealed at hire" status
 *   policy = 'per_application' AND !revealed             → status + Reveal button
 *   policy = 'per_application' AND revealed              → "Revealed by {who} at {when}" status
 */

import { useState, useTransition } from "react";
import { Eye, EyeOff, Check, AlertCircle, Lock, ShieldCheck } from "lucide-react";
import { revealDsoToCandidate } from "@/lib/dso/affiliation-reveal";

interface AffiliationCardProps {
  /**
   * Whether the application's job is publicly DSO-affiliated. When
   * true (every linked location has public_dso_affiliation = true OR
   * the job is regional/corporate scope), this card doesn't render at
   * all — there's nothing to reveal.
   */
  isPublicAffiliated: boolean;
  /** The DSO's reveal policy. Drives which case we render. */
  policy: "never" | "after_hire" | "per_application";
  /** The application's status, needed for the after_hire case. */
  applicationStatus: string;
  /** Has this application's per-app reveal bit been flipped? */
  alreadyRevealed: boolean;
  /** When the bit was flipped, for the audit display. ISO string. */
  revealedAt: string | null;
  /** Display name of the DSO admin who flipped the bit, if known. */
  revealedByName: string | null;
  /** The application's id — passed to the server action. */
  applicationId: string;
  /** Display copy values. */
  dsoName: string;
  candidateFirstName: string;
}

export function AffiliationCard({
  isPublicAffiliated,
  policy,
  applicationStatus,
  alreadyRevealed,
  revealedAt,
  revealedByName,
  applicationId,
  dsoName,
  candidateFirstName,
}: AffiliationCardProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimisticRevealed, setOptimisticRevealed] = useState(alreadyRevealed);

  // Public-affiliated jobs: nothing to reveal — short-circuit.
  if (isPublicAffiliated) return null;

  const onReveal = () => {
    setError(null);
    startTransition(async () => {
      const result = await revealDsoToCandidate(applicationId);
      if (!result.ok) {
        setError(result.error ?? "Failed to reveal. Try again.");
        return;
      }
      setOptimisticRevealed(true);
    });
  };

  const revealed = optimisticRevealed;

  return (
    <section className="border border-[var(--rule-strong)] bg-cream/40 px-5 py-4">
      <div className="flex items-start gap-3">
        {revealed ? (
          <Eye className="h-4 w-4 text-heritage-deep mt-1 flex-shrink-0" />
        ) : (
          <EyeOff className="h-4 w-4 text-slate-meta mt-1 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep mb-1">
            DSO Affiliation
          </div>

          {policy === "never" && (
            <p className="text-[13px] text-slate-body leading-relaxed">
              <strong className="text-ink">{candidateFirstName}</strong>{" "}
              will <strong className="text-ink">never see</strong> the{" "}
              <strong className="text-ink">{dsoName}</strong> name in
              DSO Hire. Your DSO&apos;s reveal policy is set to{" "}
              <em>Never</em> — change it on{" "}
              <a
                href="/employer/settings/affiliation"
                className="text-heritage-deep underline underline-offset-2 font-semibold"
              >
                Settings → Affiliation
              </a>
              .
            </p>
          )}

          {policy === "after_hire" && applicationStatus !== "hired" && (
            <p className="text-[13px] text-slate-body leading-relaxed">
              <strong className="text-ink">{candidateFirstName}</strong>{" "}
              will see the <strong className="text-ink">{dsoName}</strong>{" "}
              name <strong className="text-ink">when you mark them hired</strong>.
              Currently they only see the practice name. Policy:{" "}
              <em>After hire</em>.
            </p>
          )}

          {policy === "after_hire" && applicationStatus === "hired" && (
            <p className="text-[13px] text-slate-body leading-relaxed">
              <strong className="text-ink">{candidateFirstName}</strong>{" "}
              now sees the{" "}
              <strong className="text-ink">{dsoName}</strong> name —
              they were marked hired and your policy is{" "}
              <em>After hire</em>.
            </p>
          )}

          {policy === "per_application" && !revealed && (
            <>
              <p className="text-[13px] text-slate-body leading-relaxed mb-3">
                <strong className="text-ink">{candidateFirstName}</strong>{" "}
                currently doesn&apos;t see the{" "}
                <strong className="text-ink">{dsoName}</strong> name —
                they only see the practice name. Reveal manually if you
                want them to know the corporate connection (one-way
                flip; they can&apos;t un-see it).
              </p>
              <button
                type="button"
                onClick={onReveal}
                disabled={pending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-ink text-ivory text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Eye className="h-3 w-3" />
                {pending ? "Revealing…" : `Reveal ${dsoName}`}
              </button>
              {error && (
                <div className="mt-3 bg-red-50 border-l-4 border-red-500 p-2 flex items-start gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-red-700 mt-0.5 flex-shrink-0" />
                  <p className="text-[12px] text-red-900">{error}</p>
                </div>
              )}
            </>
          )}

          {policy === "per_application" && revealed && (
            <p className="text-[13px] text-slate-body leading-relaxed">
              <Check className="inline h-3.5 w-3.5 text-heritage-deep mr-1" />
              <strong className="text-ink">{candidateFirstName}</strong>{" "}
              now sees the{" "}
              <strong className="text-ink">{dsoName}</strong> name.
              {revealedByName && revealedAt && (
                <span className="block mt-1 text-[12px] text-slate-meta">
                  Revealed by {revealedByName} on{" "}
                  {formatDate(revealedAt)}.
                </span>
              )}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
