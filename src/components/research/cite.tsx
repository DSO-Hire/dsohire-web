/**
 * Cite: inline superscript citation, "[n]", linking to #src-n in the
 * report's SourcesList. Pass an array for a run of sources ([3][4]).
 * Server component.
 */

export function Cite({ n }: { n: number | readonly number[] }) {
  const ns = typeof n === "number" ? [n] : n;
  return (
    <sup className="ml-0.5 whitespace-nowrap text-2xs font-bold leading-none tabular">
      {ns.map((k) => (
        <a
          key={k}
          href={`#src-${k}`}
          aria-label={`Source ${k}`}
          className="text-heritage-deep no-underline hover:text-ink hover:underline underline-offset-2 transition-colors"
        >
          [{k}]
        </a>
      ))}
    </sup>
  );
}
