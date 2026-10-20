/**
 * Shared building blocks for the /salary pages (server components).
 *
 * - sourceRegistry(): numbers only the sources a page actually uses, in the
 *   order given, so <Cite n /> marks and the SourcesList always agree.
 * - PayDistributionTable: 10th/25th/median/75th/90th + mean, hourly or
 *   annual, for one or more areas side by side.
 */
import { DataTable } from "@/components/research/data-table";
import { SourcesList } from "@/components/research/sources-list";
import type { ResearchSource } from "@/lib/research/reports";
import type { OewsDetail } from "@/lib/comp/salary-detail";
import { annualText, hourlyText, fmtUsd, fmtUsdHr } from "@/lib/comp/salary-content";

export function sourceRegistry<K extends string>(entries: Record<K, ResearchSource | null>) {
  const keys = (Object.keys(entries) as K[]).filter((k) => entries[k] !== null);
  const sources = keys.map((k) => entries[k] as ResearchSource);
  const n = Object.fromEntries(keys.map((k, i) => [k, i + 1])) as Partial<Record<K, number>>;
  return { sources, n };
}

const ROWS = [
  { key: "p10", label: "10th percentile" },
  { key: "p25", label: "25th percentile" },
  { key: "p50", label: "Median" },
  { key: "p75", label: "75th percentile" },
  { key: "p90", label: "90th percentile" },
] as const;

export function PayDistributionTable({
  caption,
  areas,
  footnote,
  annualOnly = false,
}: {
  caption: string;
  areas: readonly { label: string; detail: OewsDetail }[];
  footnote?: React.ReactNode;
  /** Show only annual columns (for 3+ areas side by side). */
  annualOnly?: boolean;
}) {
  const columns = [
    { header: "Percentile" },
    ...areas.flatMap((a) =>
      annualOnly
        ? [{ header: `${a.label} annual`, numeric: true }]
        : [
            { header: `${a.label} hourly`, numeric: true },
            { header: `${a.label} annual`, numeric: true },
          ],
    ),
  ];
  const dash = "Not published";
  const rows: React.ReactNode[][] = ROWS.map((r) => [
    r.label,
    ...areas.flatMap((a) =>
      annualOnly
        ? [annualText(a.detail, r.key) ?? dash]
        : [hourlyText(a.detail, r.key) ?? dash, annualText(a.detail, r.key) ?? dash],
    ),
  ]);
  rows.push([
    "Mean (average)",
    ...areas.flatMap((a) => {
      const annual = a.detail.annualMean !== null ? fmtUsd(a.detail.annualMean) : dash;
      return annualOnly ? [annual] : [a.detail.hourlyMean !== null ? fmtUsdHr(a.detail.hourlyMean) : dash, annual];
    }),
  ]);
  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={rows}
      footnote={footnote}
      minWidth={areas.length > 1 ? "40rem" : "28rem"}
    />
  );
}

export function SalarySources({ sources }: { sources: readonly ResearchSource[] }) {
  if (!sources.length) return null;
  return (
    <section className="px-6 sm:px-14 pb-24" aria-labelledby="sources-heading">
      <div className="max-w-[1100px] mx-auto">
        <h2 id="sources-heading" className="text-xl sm:text-2xl font-extrabold tracking-[-0.5px] text-ink mb-4">
          Sources
        </h2>
        <SourcesList sources={sources} accessed="October 19, 2026" />
      </div>
    </section>
  );
}

export function SectionHeading({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="text-2xl sm:text-3xl font-extrabold tracking-[-1px] text-ink mb-4">
      {children}
    </h2>
  );
}

/** Small bordered stat used in the jobs/concentration strip. */
export function MiniStat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="border border-[var(--rule)] bg-card p-5">
      <p className="text-2xs font-bold uppercase tracking-[1.5px] text-slate-meta mb-2">{label}</p>
      <p className="text-2xl sm:text-3xl font-extrabold tracking-[-0.5px] text-ink tabular">{value}</p>
      {hint && <p className="text-xs text-slate-meta mt-1 leading-[1.5]">{hint}</p>}
    </div>
  );
}
