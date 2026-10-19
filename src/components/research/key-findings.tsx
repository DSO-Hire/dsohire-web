/**
 * KeyFindings: the numbered findings box at the top of a report. Each
 * finding is a ReactNode so it can carry inline <Cite /> marks.
 */

import { Eyebrow } from "@/components/brand/eyebrow";

export function KeyFindings({
  title = "Key findings",
  findings,
}: {
  title?: string;
  findings: readonly React.ReactNode[];
}) {
  return (
    <section
      aria-labelledby="key-findings-heading"
      className="relative bg-card border border-[var(--rule-strong)] shadow-1 px-6 sm:px-10 py-8 sm:py-10"
    >
      <span aria-hidden className="absolute top-0 inset-x-0 h-[3px] bg-heritage" />
      <Eyebrow className="text-heritage-deep mb-2">At a glance</Eyebrow>
      <h2
        id="key-findings-heading"
        className="text-2xl sm:text-3xl font-extrabold tracking-[-0.03em] leading-[1.15] text-ink mb-6"
      >
        {title}
      </h2>
      <ol className="list-none grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-0">
        {findings.map((f, i) => (
          <li
            key={i}
            className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 py-4 border-t border-[var(--rule)] text-sm leading-[1.6] text-slate-body [&_strong]:text-ink [&_strong]:font-bold"
          >
            <span className="text-lg font-extrabold text-heritage tabular leading-[1.3]" aria-hidden>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
