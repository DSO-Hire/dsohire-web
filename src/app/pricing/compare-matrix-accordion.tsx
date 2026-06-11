"use client";

/**
 * <CompareMatrixAccordion> — the Model-03 accordion matrix (Day 32 v2,
 * Cam's call after seeing both: "the accordion felt so clean and fresh").
 *
 * Replaces the flat sticky table: one sticky tier header, then collapsible
 * category bands. Band headers carry computed per-tier coverage chips
 * ("Full" / "12 of 14" / "—") so skimmers get the answer without opening
 * anything — the scroll tax of ~60 always-expanded rows is gone, and
 * features stop skating by unread because each band is now a deliberate
 * click. First band opens by default; the consolidated "On the roadmap"
 * band ships closed and visually quieter.
 *
 * Rendering rules ported 1:1 from the old MatrixGroupBlock: boolean →
 * check/dash, soft labels (roadmap + modality markers) de-emphasized,
 * capacity strings semibold; the featured tier's column stays navy with
 * heritage rails through every state.
 */

import { useState } from "react";
import { Check, ChevronRight } from "lucide-react";

export interface MatrixRowData {
  feature: string;
  values: Record<string, string | boolean>;
}

export interface MatrixGroupData {
  label: string;
  rows: MatrixRowData[];
}

export interface MatrixTierHead {
  id: string;
  name: string;
  featured: boolean;
  /** Pre-formatted "$1,499/mo" price line. */
  priceLine: string;
  /** "billed annually" subline or null. */
  subLine: string | null;
}

const SOFT_LABEL = /^(H[12] 20\d{2}|Phase \d|Public|Candidate-side|Coming)/;

/** A value counts as "available" unless false or a roadmap marker. */
function isAvailable(v: string | boolean): boolean {
  if (typeof v === "boolean") return v;
  return !/^(H[12] 20\d{2}|Phase \d)/.test(v);
}

function coverageChip(group: MatrixGroupData, tierId: string): string {
  const total = group.rows.length;
  if (total === 0) return "—";
  let n = 0;
  for (const row of group.rows) {
    if (isAvailable(row.values[tierId])) n++;
  }
  if (n === 0) return "—";
  if (n === total) return "Full";
  return `${n} of ${total}`;
}

const GRID = "grid grid-cols-[minmax(220px,1.4fr)_repeat(4,minmax(118px,1fr))]";

export function CompareMatrixAccordion({
  groups,
  tiers,
}: {
  groups: MatrixGroupData[];
  tiers: MatrixTierHead[];
}) {
  const [open, setOpen] = useState<Set<number>>(() => new Set([0]));
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px] border border-[var(--rule-strong)]">
        {/* ── Sticky tier header ── */}
        <div
          className={`${GRID} sticky top-[80px] z-20 bg-ink shadow-[0_4px_12px_-8px_rgba(7,15,28,0.25)]`}
        >
          <div className="py-5 pl-5 pr-4 flex items-end text-[10px] font-bold tracking-[2.5px] uppercase text-ivory/60">
            Category
          </div>
          {tiers.map((t) => (
            <div
              key={t.id}
              className={`relative py-5 px-4 ${
                t.featured ? "bg-ink-soft border-l-2 border-r-2 border-heritage" : ""
              }`}
            >
              {t.featured && (
                <span className="absolute top-2 right-2.5 inline-flex items-center px-2 py-0.5 bg-heritage text-ivory text-[8px] font-bold tracking-[1.5px] uppercase">
                  Most Popular
                </span>
              )}
              <div className="text-[15px] font-extrabold tracking-[-0.4px] text-ivory mb-0.5">
                {t.name}
              </div>
              <div className="text-[12px] font-semibold text-ivory/55">
                {t.priceLine}
              </div>
              {t.subLine && (
                <div className="text-[9px] font-bold tracking-[1px] uppercase text-ivory/40 mt-0.5">
                  {t.subLine}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Bands ── */}
        {groups.map((group, gi) => {
          const isRoadmap = group.label.startsWith("On the roadmap");
          const isOpen = open.has(gi);
          return (
            <div
              key={group.label}
              className={gi === 0 ? "" : "border-t border-[var(--rule-strong)]"}
            >
              <button
                type="button"
                onClick={() => toggle(gi)}
                aria-expanded={isOpen}
                className={`${GRID} w-full text-left transition-colors ${
                  isRoadmap ? "" : "bg-cream hover:bg-ivory-deep/60"
                }`}
                style={
                  isRoadmap ? { background: "var(--heritage-tint)" } : undefined
                }
              >
                <span className="flex items-center gap-2.5 py-4 pl-5 pr-4 text-[11px] font-bold tracking-[2px] uppercase text-heritage-deep">
                  <ChevronRight
                    aria-hidden
                    className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
                      isOpen ? "rotate-90" : ""
                    }`}
                  />
                  {group.label}
                  <span className="normal-case tracking-normal font-semibold text-slate-meta text-[11px]">
                    · {group.rows.length}
                  </span>
                </span>
                {tiers.map((t) => (
                  <span
                    key={t.id}
                    className={`flex items-center py-4 px-4 text-[9px] font-bold tracking-[1.2px] uppercase ${
                      t.featured
                        ? "bg-ink text-ivory/70 border-l-2 border-r-2 border-heritage"
                        : "text-slate-meta"
                    }`}
                  >
                    {isRoadmap ? "" : coverageChip(group, t.id)}
                  </span>
                ))}
              </button>

              {isOpen &&
                group.rows.map((row) => (
                  <div
                    key={row.feature}
                    className={`${GRID} border-t border-[var(--rule)] bg-white hover:bg-cream/40 transition-colors`}
                  >
                    <div className="text-[14px] text-ink py-3.5 pl-[42px] pr-6 leading-snug font-medium">
                      {row.feature}
                    </div>
                    {tiers.map((t) => (
                      <ValueCell
                        key={t.id}
                        value={row.values[t.id]}
                        featured={t.featured}
                      />
                    ))}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ValueCell({
  value,
  featured,
}: {
  value: string | boolean;
  featured: boolean;
}) {
  const isSoft = typeof value === "string" && SOFT_LABEL.test(value);
  return (
    <div
      className={`flex items-center py-3.5 px-4 text-[14px] ${
        featured ? "bg-ink border-l-2 border-r-2 border-heritage" : ""
      }`}
    >
      {typeof value === "boolean" ? (
        value ? (
          <>
            <Check
              aria-hidden="true"
              className={`h-4 w-4 ${featured ? "text-ivory" : "text-heritage"}`}
              strokeWidth={3}
            />
            <span className="sr-only">Included</span>
          </>
        ) : (
          <span
            className={`text-[18px] leading-none font-light ${
              featured ? "text-ivory/30" : "text-slate-meta/30"
            }`}
          >
            <span aria-hidden="true">—</span>
            <span className="sr-only">Not included</span>
          </span>
        )
      ) : isSoft ? (
        <span
          className={`text-[10px] font-bold tracking-[1.5px] uppercase whitespace-nowrap ${
            featured ? "text-ivory/55" : "text-slate-meta"
          }`}
        >
          {value}
        </span>
      ) : (
        <span className={`font-semibold ${featured ? "text-ivory" : "text-ink"}`}>
          {value}
        </span>
      )}
    </div>
  );
}
