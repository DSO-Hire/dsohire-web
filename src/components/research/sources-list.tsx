/**
 * SourcesList: the numbered bibliography. Each item carries id="src-n" so
 * <Cite n /> links land on it (scroll-mt clears the fixed site nav).
 * The source type is shown on every row so readers can weigh vendor
 * figures against government and association data.
 */

import type { ResearchSource } from "@/lib/research/reports";

export function SourcesList({
  sources,
  accessed,
}: {
  sources: readonly ResearchSource[];
  /** Access date shown once for the whole list, e.g. "October 19, 2026". */
  accessed?: string;
}) {
  return (
    <div>
      {accessed && (
        <p className="text-xs text-slate-meta mb-4">All sources accessed {accessed}.</p>
      )}
      <ol className="list-none border-t border-[var(--rule)]">
        {sources.map((s, i) => (
          <li
            key={`${s.url}-${i}`}
            id={`src-${i + 1}`}
            className="scroll-mt-28 grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 py-3 border-b border-[var(--rule)] target:bg-[var(--heritage-tint)]"
          >
            <span className="text-xs font-extrabold text-heritage-deep tabular pt-px">
              {i + 1}.
            </span>
            <span className="min-w-0">
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-ink font-semibold leading-snug hover:text-heritage-deep underline decoration-[var(--rule-strong)] underline-offset-2 break-words"
              >
                {s.label}
              </a>
              <span className="block text-xs text-slate-meta mt-0.5">
                {s.kind}
                {s.date ? ` · ${s.date}` : ""}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
