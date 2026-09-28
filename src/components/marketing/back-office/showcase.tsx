"use client";

/**
 * BackOfficeShowcase v2 — "One hire, start to finish" (2026-09-28).
 *
 * One candidate (Dr. Sarah Chen) followed through ONE app shell across five
 * scenes: Post → Source → Match → Interview → Hire. A scripted cursor does
 * the clicking, the sidebar and breadcrumb move with the story, the frame
 * morphs to each scene's height (no empty voids), and a journey rail
 * replaces the v1 chapter chips. v1 (2026-07-08) showed five unrelated
 * slides behind a full-frame veil.
 *
 * Kept from v1 (the parts that were right): the usePlayer clock (autoplay;
 * hover / offscreen / hidden-tab / button pause), tablist keyboard nav, SSR
 * of every scene's settled state (inactive scenes are `hidden`, still in the
 * HTML for search), and reduced motion = settled states, no autoplay, no
 * cursor. House rules: no scroll-jacking, no parallax, no visitor-cursor
 * effects (the pointer here is a scripted in-frame actor).
 */

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Briefcase,
  ClipboardCheck,
  FileText,
  Inbox,
  LayoutDashboard,
  Pause,
  Play,
  Search,
  SquareKanban,
  UsersRound,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/brand/eyebrow";
import { DEMO_URL } from "@/lib/marketing/demo";
import { CursorStage } from "./engine";
import { usePlayer } from "./use-player";
import { Avatar } from "./atoms";
import { HERO, SCENES, type NavId } from "./story";
import { PostScene } from "./scenes/post";
import { SourceScene } from "./scenes/source";
import { MatchScene } from "./scenes/match";
import { PipelineScene } from "./scenes/pipeline";
import { HireScene } from "./scenes/hire";

const DURATIONS = SCENES.map((c) => c.durationMs);
const PANELS = [PostScene, SourceScene, MatchScene, PipelineScene, HireScene];

/** Her status in the follow chip, per scene. */
const FOLLOW = [
  { who: "Associate Dentist · Boise", stage: "Role opened" },
  { who: HERO.masked, stage: "Sourced" },
  { who: HERO.name, stage: "Applied" },
  { who: HERO.name, stage: "Interview" },
  { who: HERO.name, stage: "Offer" },
];

/* Sidebar twin of employer-shell NAV (labels verbatim). Fixed row heights so
   the active marker's offset is arithmetic, not measured. */
type Row = { kind: "group"; label: string } | { kind: "item"; id: NavId; label: string; Icon: React.ElementType };
const NAV_ROWS: Row[] = [
  { kind: "group", label: "Hire" },
  { kind: "item", id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { kind: "item", id: "jobs", label: "Jobs", Icon: Briefcase },
  { kind: "item", id: "pipeline", label: "Pipeline HQ", Icon: SquareKanban },
  { kind: "item", id: "applications", label: "Applications", Icon: FileText },
  { kind: "item", id: "talent", label: "Talent Pool", Icon: UsersRound },
  { kind: "item", id: "inbox", label: "Inbox", Icon: Inbox },
  { kind: "group", label: "Insight" },
  { kind: "item", id: "analytics", label: "Analytics", Icon: BarChart3 },
  { kind: "group", label: "Operate" },
  { kind: "item", id: "automations", label: "Automations", Icon: Workflow },
  { kind: "item", id: "approvals", label: "Offer approvals", Icon: ClipboardCheck },
];
const GROUP_H = 30;
const ITEM_H = 34;
function navOffset(id: NavId): number {
  let y = 0;
  for (const r of NAV_ROWS) {
    if (r.kind === "item" && r.id === id) return y;
    y += r.kind === "group" ? GROUP_H : ITEM_H;
  }
  return 0;
}

export function BackOfficeShowcase() {
  const player = usePlayer(DURATIONS);
  const { current, enhanced, paused, playNonce, wipeKey, go, toggle, setHover, sectionRef, barRefs } =
    player;
  const scene = SCENES[current];
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const announce = `Step ${current + 1} of ${SCENES.length}: ${scene.title}`;

  /* Height morph: the viewport animates to the active scene's height. */
  const sceneRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!enhanced) return;
    const el = sceneRefs.current[current];
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setHeight(Math.ceil(entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [current, enhanced]);

  const onTablistKeyDown = (e: React.KeyboardEvent) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const n = (current + dir + SCENES.length) % SCENES.length;
    go(n);
    tabRefs.current[n]?.focus();
  };

  const exiting = wipeKey !== null;

  return (
    <section
      ref={sectionRef as React.RefObject<HTMLElement>}
      className="relative bg-hero text-hero-foreground py-24 sm:py-28 overflow-hidden grain"
    >
      {/* brand grid wash + stage glow */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(color-mix(in srgb, var(--ivory) 4%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--ivory) 4%, transparent) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          maskImage: "linear-gradient(180deg, #000 0%, #000 55%, transparent 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 w-[1100px] h-[700px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center, rgba(77,122,96,0.28), transparent 62%)" }}
      />

      <div className="relative max-w-[1200px] mx-auto px-5 sm:px-10">
        <div className="max-w-[760px]">
          <Eyebrow data-reveal className="text-heritage-bright">
            Walk the back office
          </Eyebrow>
          <h2
            data-reveal
            style={{ "--mk-delay": "70ms" } as React.CSSProperties}
            className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-[-0.04em] leading-[1.03] mt-3 mb-4 text-balance"
          >
            The job board is the lobby.{" "}
            <span className="text-heritage-bright">This is the building.</span>
          </h2>
          <p
            data-reveal
            style={{ "--mk-delay": "140ms" } as React.CSSProperties}
            className="text-base text-hero-foreground/65 leading-[1.7] max-w-[600px] mb-10 text-pretty"
          >
            Follow one hire through the whole platform, from an empty job post
            to a signed offer. Every step is a real feature, shown with sample
            data.
          </p>
        </div>

        {/* ── The frame ── */}
        <div
          data-reveal
          style={{ "--mk-delay": "120ms" } as React.CSSProperties}
          className="bx-tilt"
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
        >
          <div className="relative border border-ivory/15 bg-ink-1000 shadow-[0_60px_120px_-40px_rgba(0,0,0,0.75),0_0_0_1px_rgba(255,255,255,0.03)_inset]">
            {/* Chrome */}
            <div className="flex items-center gap-3 px-3.5 py-2.5 border-b border-ivory/10">
              <div className="flex gap-1.5" aria-hidden>
                <span className="size-2 bg-ivory/20" />
                <span className="size-2 bg-ivory/20" />
                <span className="size-2 bg-ivory/20" />
              </div>
              <div className="flex-1 min-w-0 flex justify-center">
                <span className="inline-flex max-w-full items-center gap-2 bg-ivory/[0.06] px-3 py-1 text-2xs tracking-[0.4px] text-hero-foreground/55">
                  <span aria-hidden className="size-1.5 bg-heritage-bright/80" />
                  <span key={scene.url} className="bx-swap truncate">
                    {scene.url}
                  </span>
                </span>
              </div>
              <span className="hidden sm:inline text-2xs font-bold uppercase tracking-[1.2px] text-hero-foreground/35">
                Sample data
              </span>
            </div>

            <CursorStage enabled={enhanced} className="grid grid-cols-1 md:grid-cols-[196px_minmax(0,1fr)] bg-ivory text-ink">
              {/* Sidebar */}
              <aside aria-hidden className="hidden md:flex flex-col bg-hero text-hero-foreground px-2.5 py-3">
                <div className="flex items-center gap-2 px-2 pb-3 mb-2 border-b border-ivory/10">
                  <span className="grid place-items-center size-7 bg-heritage text-2xs font-extrabold">BD</span>
                  <div className="min-w-0">
                    <div className="text-2xs font-bold truncate">Bridgeway Dental</div>
                    <div className="text-2xs text-hero-foreground/45">12 locations</div>
                  </div>
                </div>
                <div className="relative">
                  <span
                    className="bx-navmark absolute left-0 right-0 bg-ivory/[0.09] border-l-2 border-heritage-bright"
                    style={{ height: ITEM_H, transform: `translateY(${navOffset(scene.nav)}px)` }}
                  />
                  {NAV_ROWS.map((r, i) =>
                    r.kind === "group" ? (
                      <div
                        key={`g${i}`}
                        className="flex items-end px-2 pb-1.5 text-2xs font-bold uppercase tracking-[1.3px] text-hero-foreground/35"
                        style={{ height: GROUP_H }}
                      >
                        {r.label}
                      </div>
                    ) : (
                      <div
                        key={r.id}
                        className={cn(
                          "relative flex items-center gap-2.5 px-2.5 text-xs font-semibold transition-colors duration-300",
                          r.id === scene.nav ? "text-hero-foreground" : "text-hero-foreground/55"
                        )}
                        style={{ height: ITEM_H }}
                      >
                        <r.Icon className="size-3.5 shrink-0" />
                        <span className="truncate">{r.label}</span>
                      </div>
                    )
                  )}
                </div>
              </aside>

              {/* Main */}
              <div className="min-w-0 flex flex-col">
                <div className="flex items-center gap-3 px-4 sm:px-6 h-12 border-b border-[var(--rule)] bg-card/60">
                  <nav aria-hidden className="flex items-center gap-1.5 min-w-0 text-2xs font-semibold text-slate-meta">
                    {scene.crumbs.map((c, i) => (
                      <span key={`${current}-${i}`} className="bx-swap flex items-center gap-1.5 min-w-0" style={{ animationDelay: `${i * 50}ms` }}>
                        {i > 0 && <span className="text-slate-meta/50">/</span>}
                        <span className={cn("truncate", i === scene.crumbs.length - 1 && "text-ink font-bold")}>{c}</span>
                      </span>
                    ))}
                  </nav>
                  <div className="ml-auto flex items-center gap-2.5 shrink-0">
                    <span aria-hidden className="hidden lg:inline-flex items-center gap-2 border border-[var(--rule)] bg-card px-2.5 py-1 text-2xs text-slate-meta">
                      <Search className="size-3" /> Search <kbd className="font-sans text-2xs border border-[var(--rule)] px-1">⌘K</kbd>
                    </span>
                    <span
                      aria-hidden
                      className="hidden sm:inline-flex items-center gap-2 border border-heritage/35 bg-heritage/[0.07] pl-1 pr-2.5 py-1"
                    >
                      <Avatar initials={HERO.initials} tone="heritage" size={20} masked={current === 1} />
                      <span key={current} className="bx-swap text-2xs font-bold text-ink whitespace-nowrap">
                        {FOLLOW[current].stage}
                      </span>
                    </span>
                  </div>
                </div>

                <div
                  className="bx-viewport relative overflow-hidden"
                  style={enhanced && height ? { height } : undefined}
                >
                  {PANELS.map((Panel, i) => (
                    <div
                      key={i}
                      ref={(el) => {
                        sceneRefs.current[i] = el;
                      }}
                      role="tabpanel"
                      id={`bo-panel-${i}`}
                      aria-labelledby={`bo-tab-${i}`}
                      hidden={i !== current}
                      className={cn("bx-scene p-4 sm:p-6", i === current && exiting && "bx-exit")}
                    >
                      <Panel active={i === current} enhanced={enhanced} nonce={playNonce} />
                    </div>
                  ))}
                </div>
              </div>
            </CursorStage>
          </div>
        </div>

        {/* ── Journey rail ── */}
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start" data-reveal>
          <div>
            <div
              role="tablist"
              aria-label="Follow one hire"
              onKeyDown={onTablistKeyDown}
              className="grid grid-cols-5"
            >
              {SCENES.map((c, i) => {
                const on = i === current;
                const past = i < current;
                return (
                  <button
                    key={c.step}
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
                    className="group text-left pr-2 focus-visible:outline-none"
                  >
                    <span className="flex items-center">
                      <span
                        className={cn(
                          "relative grid place-items-center size-3 shrink-0 border-2 transition-colors duration-300",
                          on || past ? "border-heritage-bright bg-heritage-bright" : "border-ivory/30 bg-transparent group-hover:border-ivory/60",
                          on && "bx-node-on"
                        )}
                      />
                      <span className="relative flex-1 h-[2px] bg-ivory/12 overflow-hidden">
                        <span className={cn("absolute inset-0 bg-heritage-bright origin-left transition-transform duration-500", past ? "scale-x-100" : "scale-x-0")} />
                        <span
                          ref={(el) => {
                            barRefs.current[i] = el;
                          }}
                          aria-hidden
                          className="absolute inset-0 bg-heritage-bright origin-left"
                          style={{ transform: "scaleX(0)" }}
                        />
                      </span>
                    </span>
                    <span className="mt-3 block text-2xs font-bold uppercase tracking-[1.4px] text-hero-foreground/40 tabular">
                      0{i + 1}
                    </span>
                    <span
                      className={cn(
                        "block text-sm sm:text-base font-extrabold tracking-[-0.01em] transition-colors duration-300 group-focus-visible:underline",
                        on ? "text-hero-foreground" : "text-hero-foreground/45 group-hover:text-hero-foreground/80"
                      )}
                    >
                      {c.step}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex items-start gap-4">
              <button
                type="button"
                onClick={toggle}
                aria-label={paused ? "Play" : "Pause"}
                aria-pressed={paused}
                className="btn-lift shrink-0 grid place-items-center size-9 border border-ivory/25 text-hero-foreground hover:bg-heritage hover:border-heritage"
              >
                {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
              </button>
              <div key={current} className="bx-swap min-w-0">
                <div className="text-base font-extrabold text-hero-foreground leading-snug">{scene.title}</div>
                <p className="text-sm text-hero-foreground/60 leading-relaxed mt-1 max-w-[640px]">{scene.caption}</p>
              </div>
            </div>
          </div>

          <a
            href={DEMO_URL}
            target="_blank"
            rel="noopener"
            className="btn-lift group inline-flex items-center gap-3 self-start border border-ivory/20 bg-ivory/[0.04] px-5 py-4 hover:border-heritage-bright hover:bg-ivory/[0.07]"
          >
            <span>
              <span className="block text-2xs font-bold uppercase tracking-[1.4px] text-heritage-bright">
                Rather drive?
              </span>
              <span className="block text-sm font-extrabold text-hero-foreground mt-0.5">
                Click around the real thing
              </span>
            </span>
            <ArrowUpRight className="size-5 text-heritage-bright transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </a>
        </div>

        <span aria-live="polite" className="sr-only">
          {announce}
        </span>
      </div>
    </section>
  );
}
