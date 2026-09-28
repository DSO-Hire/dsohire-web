/**
 * FeeStrip: "what one hire actually costs you," three ways, side by side.
 *
 * Adapted from the EDC site's fee comparator ("proceeds blocks"): a
 * percentage is abstract, twenty squares with four of them gone is not.
 * Each block is 5% of one associate's first-year salary.
 *
 * Numbers are the same ranges the rest of the site already publishes
 * (agency 15–25% of first-year salary; sponsored listings commonly
 * $200–$600 per posting per month) and the example salary is labeled
 * illustrative. Entry price comes from prices.ts via props.
 */

import { Eyebrow } from "@/components/brand/eyebrow";
import { cn } from "@/lib/utils";

const EXAMPLE_SALARY = 180_000;

export function FeeStrip({ entryPrice }: { entryPrice: number }) {
  return (
    <section className="relative bg-cream border-y border-[var(--rule)] px-6 sm:px-14 py-24 sm:py-28">
      <div className="max-w-[1240px] mx-auto">
        <Eyebrow data-kick className="text-heritage-deep mb-3.5">
          The math today
        </Eyebrow>
        <h2
          data-reveal
          className="text-3xl sm:text-5xl font-extrabold tracking-[-0.035em] leading-[1.06] text-ink max-w-[820px] mb-5 text-balance"
        >
          Agencies charge you per hire. Job boards charge you per post.{" "}
          <span className="text-heritage">We charge neither.</span>
        </h2>
        <p className="text-base text-slate-body leading-[1.7] max-w-[620px] mb-12 text-pretty">
          Here is one associate dentist hire (illustrative{" "}
          <span className="tabular">${(EXAMPLE_SALARY / 1000).toFixed(0)}K</span>{" "}
          first-year salary) priced three ways. Every square is 5% of that
          salary.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-[var(--rule)] border border-[var(--rule)] shadow-2">
          <FeeCol
            label="Staffing agency"
            figure="15–25%"
            unit="of first-year salary, per hire"
            body="A $27K to $45K invoice for one associate, and the next hire starts the meter over. Routine roles move at the agency's pace."
            taken={4}
            takenLabel="20% midpoint, gone"
            tone="loss"
            delay={0}
          />
          <FeeCol
            label="Per-listing job boards"
            figure="$200–$600"
            unit="per listing, per location, per month"
            body="Post the same hygienist role at five offices and you pay five meters, every month it stays open. Then re-enter it everywhere."
            meter
            tone="loss"
            delay={90}
          />
          <FeeCol
            label="DSO Hire"
            figure="$0"
            unit={`per hire, per post. One flat fee from $${entryPrice}/mo`}
            body="Every location, every role, one subscription. Hire ten people or a hundred; the invoice doesn't move."
            taken={0}
            takenLabel="Your whole budget, kept"
            tone="keep"
            delay={180}
          />
        </div>
      </div>
    </section>
  );
}

function FeeCol({
  label,
  figure,
  unit,
  body,
  taken,
  takenLabel,
  meter,
  tone,
  delay,
}: {
  label: string;
  figure: string;
  unit: string;
  body: string;
  taken?: number;
  takenLabel?: string;
  meter?: boolean;
  tone: "loss" | "keep";
  delay: number;
}) {
  const keep = tone === "keep";
  return (
    <div
      data-reveal
      style={{ "--mk-delay": `${delay}ms` } as React.CSSProperties}
      className={cn(
        "relative p-8 sm:p-10 flex flex-col",
        keep ? "bg-hero text-hero-foreground" : "bg-card"
      )}
    >
      {keep && <span aria-hidden className="absolute top-0 inset-x-0 h-[3px] bg-heritage" />}
      <Eyebrow className={cn("mb-5", keep ? "text-heritage-bright" : "text-slate-body")}>
        {label}
      </Eyebrow>
      <div
        className={cn(
          "text-5xl sm:text-6xl font-extrabold tracking-[-0.04em] leading-none tabular",
          keep ? "text-heritage-bright" : "text-ink"
        )}
      >
        {figure}
      </div>
      <div
        className={cn(
          "text-xs font-semibold mt-2.5 mb-6",
          keep ? "text-hero-foreground/60" : "text-slate-meta"
        )}
      >
        {unit}
      </div>

      <div className="mb-6">
        {meter ? <ListingMeter /> : <Blocks taken={taken ?? 0} keep={keep} />}
        <div
          className={cn(
            "text-2xs font-bold uppercase tracking-[1.3px] mt-2.5",
            keep ? "text-heritage-bright" : "text-stage-brick"
          )}
        >
          {meter ? "5 locations × 12 months, all billed" : takenLabel}
        </div>
      </div>

      <p
        className={cn(
          "text-sm leading-[1.65] mt-auto",
          keep ? "text-hero-foreground/75" : "text-slate-body"
        )}
      >
        {body}
      </p>
    </div>
  );
}

/** 20 squares = one first-year salary; `taken` of them go to the fee. */
function Blocks({ taken, keep }: { taken: number; keep: boolean }) {
  return (
    <div
      role="img"
      aria-label={
        taken
          ? `${taken * 5}% of the salary goes to the fee`
          : "None of the salary goes to a fee"
      }
      className="fee-blocks grid grid-cols-10 gap-1"
    >
      {Array.from({ length: 20 }, (_, i) => {
        const lost = i >= 20 - taken;
        return (
          <i
            key={i}
            style={{ "--i": i } as React.CSSProperties}
            className={cn(
              "block aspect-square",
              lost
                ? "fee-lost bg-stage-brick"
                : keep
                  ? "bg-heritage-bright/85"
                  : "bg-ink/15"
            )}
          />
        );
      })}
    </div>
  );
}

/** 5 location rows × 12 months, every cell billed. */
function ListingMeter() {
  return (
    <div
      role="img"
      aria-label="Five locations each billed every month for a year"
      className="fee-meter grid gap-1"
    >
      {Array.from({ length: 5 }, (_, r) => (
        <div key={r} className="grid grid-cols-12 gap-1">
          {Array.from({ length: 12 }, (_, c) => (
            <i
              key={c}
              style={{ "--i": r * 12 + c } as React.CSSProperties}
              className="fee-tick block h-[7px] bg-stage-brick/70"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
