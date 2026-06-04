/**
 * PracticeFit proof card (v3.2 Phase E) — shown on the analytics Overview tab.
 *
 * Renders the descriptive proof loop from getFitOutcomeProof: how each fit
 * bucket advanced through the pipeline. Empty-safe — below the data threshold
 * it shows an honest "building" state instead of noisy rates; renders nothing
 * at all until at least one scored application exists.
 */

import { PracticeFitWordmark } from "@/components/practice-fit/brand/practice-fit-wordmark";
import type { FitOutcomeProof } from "@/lib/analytics/fit-outcomes";

const BUCKET_META: Record<string, { label: string; bar: string }> = {
  excellent: { label: "Excellent", bar: "#166534" },
  strong: { label: "Strong", bar: "#2F7D4F" },
  solid: { label: "Solid", bar: "#2F5D4F" },
  light: { label: "Light", bar: "#B45309" },
  low: { label: "Low", bar: "#B91C1C" },
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function FitProofCard({ proof }: { proof: FitOutcomeProof }) {
  // Nothing scored yet → don't clutter the page.
  if (proof.total_scored === 0) return null;

  return (
    <section className="mb-6 border border-[var(--rule)] bg-white p-6 sm:p-7">
      <header className="mb-4 flex items-center gap-2 text-heritage-deep">
        <span className="text-[10px] font-bold tracking-[2.5px] uppercase">
          Proof ·
        </span>
        <PracticeFitWordmark surface="inherit" className="text-[14px]" />
      </header>

      {!proof.enough_data ? (
        <div>
          <h3 className="font-display text-lg font-bold text-ink">
            Your proof is still building.
          </h3>
          <p className="mt-1.5 text-[13px] text-slate-body leading-relaxed max-w-[560px]">
            As candidates move through your pipeline, we track how PracticeFit
            predicted who advanced. You&apos;ve got{" "}
            <span className="font-bold text-ink">{proof.total_scored}</span>{" "}
            scored {proof.total_scored === 1 ? "application" : "applications"} so
            far — once you reach about 10, you&apos;ll see your advance rate by
            fit level here.
          </p>
        </div>
      ) : (
        <div>
          {proof.strong_advance_rate !== null &&
            proof.weak_advance_rate !== null && (
              <p className="mb-5 text-[15px] leading-relaxed text-ink max-w-[640px]">
                Your <strong>excellent &amp; strong</strong> fits advanced past
                initial review{" "}
                <strong className="text-heritage-deep">
                  {pct(proof.strong_advance_rate)}
                </strong>{" "}
                of the time — vs{" "}
                <strong>{pct(proof.weak_advance_rate)}</strong> for light &amp;
                low fits.
              </p>
            )}

          <div className="space-y-3">
            {proof.buckets.map((b) => {
              const meta = BUCKET_META[b.bucket] ?? BUCKET_META.solid;
              return (
                <div key={b.bucket} className="flex items-center gap-3">
                  <div className="w-20 shrink-0 text-[12px] font-bold text-ink">
                    {meta.label}
                  </div>
                  <div className="relative h-6 flex-1 overflow-hidden rounded-sm bg-cream">
                    <div
                      className="h-full rounded-sm transition-all"
                      style={{
                        width: `${Math.max(2, Math.round(b.advance_rate * 100))}%`,
                        backgroundColor: meta.bar,
                      }}
                    />
                  </div>
                  <div className="w-32 shrink-0 text-right text-[12px] text-slate-body tabular-nums">
                    <span className="font-bold text-ink">
                      {pct(b.advance_rate)}
                    </span>{" "}
                    <span className="text-slate-meta">
                      · {b.advanced}/{b.total}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-[11px] text-slate-meta leading-relaxed max-w-[560px]">
            &ldquo;Advanced&rdquo; = reached interview, offer, or hire at any
            point (counts candidates who interviewed even if not ultimately
            hired). Based on {proof.total_scored} scored applications.
          </p>
        </div>
      )}
    </section>
  );
}
