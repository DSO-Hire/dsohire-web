/**
 * PullQuote: an editorial pull quote. Quote text must be verbatim from a
 * cited source (or clearly our own words, attributed to DSO Hire).
 */

export function PullQuote({
  children,
  attribution,
}: {
  children: React.ReactNode;
  attribution: React.ReactNode;
}) {
  return (
    <figure className="my-12 border-l-[3px] border-heritage pl-6 sm:pl-8 max-w-[720px]">
      <blockquote className="text-2xl sm:text-3xl font-extrabold tracking-[-0.03em] leading-[1.22] text-ink text-balance">
        {children}
      </blockquote>
      <figcaption className="mt-4 text-xs text-slate-meta">{attribution}</figcaption>
    </figure>
  );
}
