/**
 * <ComingSoon> — shared placeholder block for settings sub-routes whose
 * full implementation lands in a later 4.5 sub-phase. Keeps the IA
 * scaffold (Phase 4.5.a) navigable while individual surfaces (4.5.b–h)
 * fill in.
 *
 * Visual treatment: subdued cream card with phase tag + ETA copy + an
 * optional bullet list of what's planned for that section. Designed to
 * be substantive enough that a customer demo doesn't read as "this is
 * empty" — they read as "this is on the roadmap and we're transparent
 * about it."
 */

import { Sparkles } from "lucide-react";

interface ComingSoonProps {
  /** Eyebrow tag, e.g. "Phase 4.5.c" */
  phaseTag: string;
  /** Primary headline. */
  title: string;
  /** Lead paragraph. */
  description: string;
  /** Bullets of what's coming — keep short. */
  bullets?: string[];
}

export function ComingSoon({
  phaseTag,
  title,
  description,
  bullets,
}: ComingSoonProps) {
  return (
    <div className="border border-[var(--rule)] bg-cream/40 p-7 sm:p-8 max-w-[760px]">
      <div className="flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
        <Sparkles className="h-3.5 w-3.5" />
        <span>{phaseTag}</span>
      </div>
      <h2 className="text-xl font-extrabold tracking-[-0.4px] text-ink mb-3">
        {title}
      </h2>
      <p className="text-[14px] text-slate-body leading-relaxed mb-5 max-w-[600px]">
        {description}
      </p>
      {bullets && bullets.length > 0 && (
        <ul className="space-y-2">
          {bullets.map((b, i) => (
            <li
              key={i}
              className="flex items-start gap-2.5 text-[13px] text-ink leading-relaxed"
            >
              <span className="mt-1 size-1.5 rounded-full bg-heritage-deep flex-shrink-0" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
