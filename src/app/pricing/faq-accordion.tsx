"use client";

/**
 * FaqAccordion — interactive FAQ on /pricing.
 *
 * Click a question to expand its answer; clicking another question closes the
 * previous one (single-open at a time). Smooth height transition uses the
 * `grid-template-rows: 0fr → 1fr` technique so we don't have to measure
 * content height in JS.
 */

import { useState } from "react";
import { Plus } from "lucide-react";

interface FaqItem {
  q: string;
  a: string;
}

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <ul className="list-none border-t border-[var(--rule)]">
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <li key={i} className="border-b border-[var(--rule)]">
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              aria-expanded={isOpen}
              aria-controls={`faq-answer-${i}`}
              className="w-full flex items-start justify-between gap-6 py-7 text-left group transition-colors"
            >
              <h3 className="text-[15.5px] font-extrabold tracking-[-0.2px] text-ink leading-snug pr-4">
                {item.q}
              </h3>
              <span
                className={`flex-shrink-0 w-7 h-7 mt-0.5 border flex items-center justify-center transition-all duration-200 ${
                  isOpen
                    ? "bg-ink border-ink text-heritage rotate-45"
                    : "border-[var(--rule-strong)] text-ink group-hover:bg-ink group-hover:text-ivory group-hover:border-ink"
                }`}
                aria-hidden="true"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            </button>
            <div
              id={`faq-answer-${i}`}
              className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <p className="text-[14.5px] text-slate-body leading-[1.7] pb-7 pr-12 max-w-[760px]">
                  {item.a}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
