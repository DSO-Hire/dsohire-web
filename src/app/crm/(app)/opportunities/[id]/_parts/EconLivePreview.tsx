"use client";

import { useEffect, useRef, useState } from "react";
import { PLAN_LABELS, fmtMoney } from "../../../format";

/*
 * Live math under "Edit economics": as the plan, billing, monthly value or
 * probability change, it shows what the opportunity works out to before
 * saving. A typed monthly value wins; blanks fall back to the plan's list
 * price (from prices.ts, passed in) and the stage weight. Indicative only.
 */
export default function EconLivePreview({
  prices,
  stageProbability,
}: {
  prices: Record<string, { monthly: number | null; annual: number | null }>;
  stageProbability: number;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [text, setText] = useState<string>("");

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const raw = (k: string) => String(new FormData(form).get(k) ?? "").trim();
    const num = (k: string) => {
      const v = raw(k).replace(/[$,\s%]/g, "");
      if (!v) return null;
      const x = Number(v);
      return Number.isFinite(x) ? x : null;
    };
    const run = () => {
      const tier = raw("plan_tier");
      const billing = raw("billing") === "annual" ? "annual" : "monthly";
      const list = tier && prices[tier] ? prices[tier][billing] : null;
      const typed = num("mrr");
      const mrr = typed ?? list;
      if (mrr === null || mrr <= 0) {
        setText("Pick a plan, or type a monthly value, and MRR, ACV and weighted ACV work themselves out.");
        return;
      }
      const prob = num("close_probability") ?? stageProbability;
      const acv = mrr * 12;
      const src = typed !== null ? "your monthly value" : `${PLAN_LABELS[tier] ?? tier} list price, ${billing}`;
      setText(
        `MRR ${fmtMoney(mrr)} (${src}), ACV ${fmtMoney(acv)}, weighted ${fmtMoney((acv * prob) / 100)} at ${prob}%.`,
      );
    };
    run();
    form.addEventListener("input", run);
    form.addEventListener("change", run);
    return () => {
      form.removeEventListener("input", run);
      form.removeEventListener("change", run);
    };
  }, [prices, stageProbability]);

  return (
    <p ref={ref} className="dx-help dx-live" aria-live="polite">
      {text}
    </p>
  );
}
