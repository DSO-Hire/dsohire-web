"use client";

/**
 * BackOfficeShowcase — "The job board is the lobby. This is the building."
 * (Fable spec 2026-07-08; replaces the static film-strip.)
 *
 * A guided, touchable player: five chapters built from real product labels
 * (see track.ts) driven by a scripted demo track. Autoplays; hover, offscreen,
 * hidden-tab, and the pause button all pause; clicking a chapter chip jumps.
 * Each chapter has one real interaction (CH1: drag/advance the card; CH4:
 * press "Draft with AI").
 *
 * Reuse vs twin: FrameChrome + Kanban cards + comp rows are presentational
 * TWINS (real product components are server/RLS-coupled) whose labels import
 * from the source-of-truth modules. CountUp personality is shared via the
 * same ease-out-quint (chapter cues need timed triggers, not viewport ones).
 *
 * SSR/no-JS/SEO: every chapter server-renders its final resting state
 * (hidden panels included — full content in the HTML). Reduced motion:
 * enhanced=false → final states, no autoplay, no animation.
 * House rules: no site-shell imports; no scroll-jacking; 300–600ms settles.
 */

import { useRef } from "react";
import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import { Eyebrow } from "@/components/brand/eyebrow";
import { FrameChrome } from "./ui";
import { CHAPTERS } from "./track";
import { usePlayer } from "./use-player";
import { PipelineChapter } from "./chapters/pipeline";
import { CompChapter } from "./chapters/comp";
import { TwoSidedChapter } from "./chapters/two-sided";
import { JdChapter } from "./chapters/jd";
import { SourcingChapter } from "./chapters/sourcing";

const DURATIONS = CHAPTERS.map((c) => c.durationMs);

const PANELS = [PipelineChapter, CompChapter, TwoSidedChapter, JdChapter, SourcingChapter];

export function BackOfficeShowcase() {
  const player = usePlayer(DURATIONS);
  const { current, enhanced, paused, playNonce, go, next, prev, toggle, setHover, sectionRef } =
    player;
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // aria-live announces on text CHANGE, so deriving from `current` is enough.
  const announce = `Chapter ${current + 1} of ${CHAPTERS.length}: ${CHAPTERS[current].title}`;

  const onTablistKeyDown = (e: React.KeyboardEvent) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const n = (current + dir + CHAPTERS.length) % CHAPTERS.length;
    go(n);
    tabRefs.current[n]?.focus();
  };

  return (
    <section
      ref={sectionRef as React.RefObject<HTMLElement>}
      className="relative bg-hero text-hero-foreground py-24 overflow-hidden"
    >
      {/* brand grid wash */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(color-mix(in srgb, var(--ivory) 4%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--ivory) 4%, transparent) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />
      <div className="relative max-w-[1140px] mx-auto px-6 sm:px-14">
        <Eyebrow data-reveal className="text-heritage-bright">
          Walk the back office
        </Eyebrow>
        <h2
          data-reveal
          style={{ "--mk-delay": "70ms" } as React.CSSProperties}
          className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] mt-2.5 mb-3"
        >
          The job board is the lobby.
          <br />
          This is the building.
        </h2>
        <p
          data-reveal
          style={{ "--mk-delay": "140ms" } as React.CSSProperties}
          className="text-sm text-hero-foreground/60 leading-[1.7] max-w-[620px] mb-7"
        >
          Behind every posting is a full hiring operating system — the same
          machinery enterprise recruiting teams pay five figures for, built
          dental-only. Watch it run.
        </p>

        {/* Chapter chips */}
        <div
          role="tablist"
          aria-label="Back-office chapters"
          onKeyDown={onTablistKeyDown}
          data-reveal
          className="flex flex-wrap gap-2 mb-4"
        >
          {CHAPTERS.map((c, i) => {
            const on = i === current;
            return (
              <button
                key={c.kicker}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                role="tab"
                type="button"
                id={`bo-tab-${i}`}
                aria-selected={on}
                aria-controls={`bo-panel-${i}`}
                tabIndex={on ? 0 : -1}
                onClick={() => go(i)}
                className={`relative overflow-hidden flex-1 min-w-[140px] text-left px-3 py-2.5 border transition-colors duration-200 ${
                  on
                    ? "bg-heritage-bright/15 border-heritage-bright text-hero-foreground"
                    : "bg-hero-foreground/5 border-hero-foreground/15 text-hero-foreground/70 hover:bg-hero-foreground/10"
                }`}
              >
                <span className="block text-2xs font-extrabold tracking-[1.4px] uppercase text-heritage-bright/85">
                  {c.kicker}
                </span>
                <span className="block text-xs font-bold mt-0.5 leading-tight">{c.title}</span>
                <span
                  ref={(el) => {
                    player.barRefs.current[i] = el;
                  }}
                  aria-hidden
                  className="absolute left-0 bottom-0 h-[3px] bg-heritage-bright"
                  style={{ width: 0 }}
                />
              </button>
            );
          })}
        </div>

        {/* Device frame + chapters */}
        <div
          data-reveal
          style={{ "--mk-delay": "120ms" } as React.CSSProperties}
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
        >
          <FrameChrome url={CHAPTERS[current].url}>
            {/* All panels stack in ONE grid cell so the frame keeps the
                tallest chapter's height — no layout jump when chapters
                advance. Inactive panels are visibility-hidden (still in the
                DOM for SSR/SEO, out of the a11y tree + not focusable). */}
            <div className="grid">
              {PANELS.map((Panel, i) => (
                <div
                  key={i}
                  role="tabpanel"
                  id={`bo-panel-${i}`}
                  aria-labelledby={`bo-tab-${i}`}
                  aria-hidden={i !== current}
                  className={`[grid-area:1/1] min-w-0 ${i === current ? "" : "invisible"}`}
                >
                  <Panel active={i === current} enhanced={enhanced} nonce={playNonce} />
                </div>
              ))}
            </div>
          </FrameChrome>
        </div>

        {/* Controls + caption */}
        <div className="flex flex-wrap items-center gap-3 mt-4" data-reveal>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={prev}
              aria-label="Previous chapter"
              className="w-[38px] h-[38px] inline-flex items-center justify-center border border-hero-foreground/25 text-hero-foreground hover:bg-heritage hover:border-heritage transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={toggle}
              aria-label={paused ? "Play" : "Pause"}
              aria-pressed={paused}
              className="w-[38px] h-[38px] inline-flex items-center justify-center border border-hero-foreground/25 text-hero-foreground hover:bg-heritage hover:border-heritage transition-colors"
            >
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next chapter"
              className="w-[38px] h-[38px] inline-flex items-center justify-center border border-hero-foreground/25 text-hero-foreground hover:bg-heritage hover:border-heritage transition-colors"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <span className="text-xs text-hero-foreground/70 leading-snug flex-1 min-w-[220px]">
            <b className="text-hero-foreground">{CHAPTERS[current].title}</b>
            {" — "}
            {CHAPTERS[current].caption}
          </span>
        </div>
        <span aria-live="polite" className="sr-only">
          {announce}
        </span>
        <div className="mt-4 text-2xs font-semibold text-hero-foreground/35">
          Illustrations of the live product · sample data
        </div>
      </div>
    </section>
  );
}
