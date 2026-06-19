/**
 * Shared section chrome for the application workspace — BOH Remodel
 * Lane 3 commit 1 (pure extraction from page.tsx, markup unchanged).
 *
 * DetailSection: numbered eyebrow + title + optional subtitle/badge,
 * with anchored scroll-margin so rail links land cleanly. `tone` lets a
 * section opt into the candidate-facing or internal visual accent
 * without repeating the markup at every call site.
 */

import { Lock, Sparkles } from "lucide-react";

export function DetailSection({
  id,
  num,
  title,
  subtitle,
  icon,
  tone,
  badge,
  children,
}: {
  id: string;
  /** Optional eyebrow number — the tabbed workspace (Lane 3) drops the
      old 01–13 numbering; icon-only eyebrows render when absent. */
  num?: string;
  title: React.ReactNode;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "candidate" | "internal";
  badge?: string;
  children: React.ReactNode;
}) {
  const Icon = icon;
  const eyebrowColor =
    tone === "internal"
      ? "text-slate-meta"
      : tone === "candidate"
        ? "text-heritage-deep"
        : "text-slate-meta";
  return (
    <section id={id} className="scroll-mt-6">
      <header className="mb-4">
        <div
          className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] font-bold tracking-[2.5px] uppercase ${eyebrowColor} mb-1.5`}
        >
          <span className="inline-flex items-center gap-1.5">
            {tone === "internal" && <Lock className="h-3 w-3" />}
            <Icon className="h-3.5 w-3.5" />
            {num && <span>{num}</span>}
          </span>
          {badge && (
            <span className="text-[9px] font-bold tracking-[1.5px] uppercase px-2 py-0.5 bg-heritage/15 text-heritage-deep">
              {badge}
            </span>
          )}
        </div>
        <h2 className="text-xl sm:text-2xl font-extrabold tracking-[-0.6px] text-ink leading-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="text-[13px] text-slate-meta mt-2 leading-relaxed">
            {subtitle}
          </p>
        )}
      </header>
      <div>{children}</div>
    </section>
  );
}

/**
 * Fit-unavailable banner — appears when getPracticeFit returns null.
 * v1.2 made the copy honest about the multiple causes:
 *   • candidate has practice_fit_consent='off' (RLS blocks the read)
 *   • role-as-filter rejected the pair (candidate's desired_roles
 *     doesn't include this job's role_category, post-canonicalization)
 *   • score hasn't been computed yet (rare — first-render races)
 *
 * We don't disambiguate here because RLS prevents us from knowing
 * whether the candidate has consent off vs role-filtered without
 * leaking whether the candidate exists. Generic copy + neutral tone.
 */
export function PracticeFitConsentOffBanner() {
  return (
    <div className="border border-[var(--rule)] bg-cream/40 p-6">
      <div className="flex items-start gap-3">
        <Sparkles className="h-4 w-4 text-heritage-deep mt-0.5 shrink-0" />
        <div>
          <p className="text-[13px] font-semibold text-ink mb-1">
            PracticeFit isn&apos;t available for this pair
          </p>
          <p className="text-[13px] text-slate-body leading-relaxed">
            This can happen when the candidate&apos;s privacy settings
            keep their score private, or when their role preferences
            don&apos;t cover this posting. Their application stands on
            its own — PracticeFit is informational only and never
            gates hiring decisions.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * RailCard — compact bordered card for the pipeline rail (Lane 3
 * commit 2): uppercase eyebrow label + content, sized for the 340px
 * right rail (full-width on mobile).
 */
export function RailCard({
  id,
  label,
  children,
}: {
  id?: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="border border-[var(--rule)] bg-card p-4 scroll-mt-6"
    >
      <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
        {label}
      </div>
      {children}
    </section>
  );
}

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold tracking-[2px] uppercase text-slate-meta mb-1">
        {label}
      </div>
      <div className="text-[14px] text-ink leading-snug">{value}</div>
    </div>
  );
}
