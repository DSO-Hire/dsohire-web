"use client";

import { useRef } from "react";
import { Check, Sparkles, Globe2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCursor, On } from "../engine";
import { useBeats, animateCount } from "../use-player";
import { Panel, Kicker, FauxButton, Toast, SceneTitle } from "../atoms";
import {
  COMP_ROWS,
  COMP_ESTIMATE,
  DRAFT_BUTTON_LABEL,
  JD_PARAGRAPHS,
  POST_LOCATIONS,
} from "../story";
import type { SceneProps } from "./types";

/* Tokenize the JD once: paragraphs → segments → words, with a global word
   index for the stream delay. Grounded segments stay one inline wrapper so
   their highlight runs continuously across the spaces between words. */
type Tok = { w: string; i: number };
const PARAS: Array<Array<{ b?: boolean; toks: Tok[] }>> = (() => {
  let i = 0;
  return JD_PARAGRAPHS.map((para) =>
    para.map((seg) => ({
      b: seg.b,
      toks: seg.t
        .split(/(\s+)/)
        .filter((w) => w.length > 0)
        .map((w) => ({ w, i: /\s/.test(w) ? i : i++ })),
    }))
  );
})();

function Words({ toks }: { toks: Tok[] }) {
  return (
    <>
      {toks.map((tok, ti) =>
        /\s/.test(tok.w) ? (
          " "
        ) : (
          <span key={ti} className="bx-word" style={{ "--i": tok.i } as React.CSSProperties}>
            {tok.w}
          </span>
        )
      )}
    </>
  );
}

export function PostScene({ active, enhanced, nonce }: SceneProps) {
  const cursor = useCursor();
  const minRef = useRef<HTMLSpanElement>(null);
  const maxRef = useRef<HTMLSpanElement>(null);

  const s = useBeats(active, enhanced, nonce, (at) => {
    at(80, null, () => {
      cursor.show();
      cursor.to("post-row-0", { ms: 700 });
    });
    COMP_ROWS.forEach((_, i) => {
      const t = 700 + i * 560;
      if (i > 0) at(t - 320, null, () => cursor.to(`post-row-${i}`));
      at(t, i + 1, () => cursor.click());
    });
    at(3000, 5, () => {
      animateCount(minRef.current, COMP_ESTIMATE.min, { prefix: "$", suffix: "k", duration: 900 });
      animateCount(maxRef.current, COMP_ESTIMATE.max, { prefix: "$", suffix: "k", duration: 1000 });
    });
    at(3500, null, () => cursor.to("post-draft"));
    at(4250, 6, () => cursor.click());
    at(4700, 7, () => cursor.to("post-jd", { at: [0.7, 0.85], ms: 900 }));
    at(6900, 8);
    at(7250, null, () => cursor.to("post-publish"));
    at(7950, 9, () => cursor.click());
    at(8350, 10);
  });

  const drafting = s === 6;
  const streaming = s >= 7;

  return (
    <div className="relative">
      <SceneTitle
        title="New job · Associate Dentist"
        sub="Boise, ID · Meridian · Eagle"
        right={
          <span className="text-2xs font-bold uppercase tracking-[1.2px] text-slate-meta">
            Draft saved
          </span>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.3fr)]">
        {/* Comp model */}
        <div className="grid gap-3 content-start">
          <Panel className="p-4">
            <div className="flex items-center justify-between mb-3">
              <Kicker>Compensation</Kicker>
              <span className="text-2xs font-extrabold uppercase tracking-[1.2px] text-heritage-deep bg-heritage/10 px-1.5 py-0.5">
                Dental-native
              </span>
            </div>
            <div className="grid gap-1.5">
              {COMP_ROWS.map((row, i) => (
                <div
                  key={row.label}
                  data-cur={`post-row-${i}`}
                  className={cn(
                    "flex items-center justify-between gap-3 border px-3 py-2 transition-colors duration-300",
                    s === i + 1
                      ? "border-heritage bg-heritage/[0.06]"
                      : "border-[var(--rule)] bg-ivory/60"
                  )}
                >
                  <span className="text-2xs font-bold uppercase tracking-[1.1px] text-slate-meta shrink-0">
                    {row.label}
                  </span>
                  <On on={s >= i + 1} as="span" className="min-w-0 text-xs font-bold text-ink text-right sm:truncate">
                    {row.value}
                  </On>
                </div>
              ))}
            </div>
          </Panel>
          <Panel className="bg-hero border-hero text-ivory p-4 relative overflow-hidden">
            <span
              aria-hidden
              className={cn("bx-sweep absolute inset-0", s === 5 && "is-on")}
            />
            <Kicker className="text-heritage-bright">Estimated annual</Kicker>
            <div className="relative text-2xl sm:text-3xl font-extrabold tracking-[-0.03em] tabular mt-1.5">
              {/* Spans always mounted so the count-up has refs on its beat. */}
              <span className={cn("transition-opacity duration-300", s >= 5 ? "opacity-100" : "opacity-0")}>
                <span ref={minRef}>${COMP_ESTIMATE.min}k</span>
                <span className="text-ivory/50"> – </span>
                <span ref={maxRef}>${COMP_ESTIMATE.max}k</span>
              </span>
              {s < 5 && <span className="absolute left-0 top-0 text-ivory/30">$ —</span>}
            </div>
            <div className="text-2xs text-ivory/55 mt-1.5 leading-snug">
              Modeled from guarantee, production %, and adjusted production.
              The way dentists actually get paid.
            </div>
          </Panel>
        </div>

        {/* JD */}
        <Panel className="p-4 flex flex-col min-h-[300px]" data-cur="post-jd">
          <div className="flex items-center justify-between gap-3 mb-3">
            <Kicker>Job description</Kicker>
            <FauxButton cur="post-draft" variant="ai" pressed={drafting}>
              <Sparkles className={cn("size-3.5", drafting && "bx-spin")} />
              {drafting ? "Drafting…" : DRAFT_BUTTON_LABEL}
            </FauxButton>
          </div>

          <div className="relative flex-1 text-xs leading-[1.7] text-slate-body">
            {!streaming ? (
              <div className={cn("grid gap-2 pt-1", drafting && "bx-shimmer")}>
                {[92, 100, 84, 96, 60].map((w, i) => (
                  <span key={i} className="block h-2.5 bg-ink/[0.07]" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : (
              <div
                className={cn("bx-stream grid gap-2.5", s >= 8 && "is-done")}
                data-on={streaming ? "true" : "false"}
              >
                <div className="text-sm font-extrabold text-ink">Associate Dentist · Boise, ID</div>
                {PARAS.map((para, pi) => (
                  <p key={pi}>
                    {para.map((seg, si) =>
                      seg.b ? (
                        <span key={si} className="bx-grounded font-bold text-ink">
                          <Words toks={seg.toks} />
                        </span>
                      ) : (
                        <Words key={si} toks={seg.toks} />
                      )
                    )}
                  </p>
                ))}
                {s === 7 && <span aria-hidden className="bx-caret" />}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--rule)] pt-3 mt-3">
            <div className="flex flex-wrap gap-1.5">
              {POST_LOCATIONS.map((loc, i) => (
                <span
                  key={loc}
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-1 text-2xs font-bold border transition-all duration-300",
                    s >= 9
                      ? "border-heritage bg-heritage text-ivory"
                      : "border-[var(--rule-strong)] text-slate-body"
                  )}
                  style={{ transitionDelay: s >= 9 ? `${i * 120}ms` : "0ms" }}
                >
                  {s >= 9 && <Check className="size-3" strokeWidth={3} />}
                  {loc}
                </span>
              ))}
            </div>
            <FauxButton cur="post-publish" variant="heritage" pressed={s === 9}>
              Publish to {POST_LOCATIONS.length} locations
            </FauxButton>
          </div>
        </Panel>
      </div>

      <Toast
        on={s >= 10}
        tone="heritage"
        className="right-3 top-3"
        icon={<Globe2 className="size-4" />}
        kicker="Live"
        title={`Posted to ${POST_LOCATIONS.length} locations in one step`}
        sub="Structured for Google for Jobs · candidates apply direct"
      />
    </div>
  );
}
