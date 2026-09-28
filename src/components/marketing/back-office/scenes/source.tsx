"use client";

import { Check, EyeOff, Send, ShieldCheck, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCursor, On } from "../engine";
import { useBeats } from "../use-player";
import { Panel, Kicker, FauxButton, Toast, SceneTitle, Avatar, FitBadge, LivePill } from "../atoms";
import {
  HERO,
  POOL,
  POOL_FILTERS,
  OUTREACH_MESSAGE,
  SOURCING_STEPS,
  CONSENT_BADGE,
} from "../story";
import type { SceneProps } from "./types";

export function SourceScene({ active, enhanced, nonce }: SceneProps) {
  const cursor = useCursor();
  const s = useBeats(active, enhanced, nonce, (at) => {
    at(80, null, () => {
      cursor.show();
      cursor.to("src-filter", { ms: 700 });
    });
    at(900, 1, () => cursor.to("src-hero", { ms: 800 }));
    at(1850, 2, () => cursor.click());
    at(3300, null, () => cursor.to("src-send"));
    at(4000, 3, () => cursor.click());
    at(5200, 4);
    at(6300, 5);
    at(7400, 6);
  });

  const stepIdx = s >= 6 ? 3 : s >= 4 ? 2 : s >= 3 ? 1 : 0;
  const revealed = s >= 5;

  return (
    <div className="relative">
      <SceneTitle
        title="Talent Pool"
        sub="Candidates who opted in to be discovered"
        right={
          <div className="flex flex-wrap gap-1.5" data-cur="src-filter">
            {POOL_FILTERS.map((f) => (
              <span
                key={f}
                className="px-2 py-1 text-2xs font-bold border border-[var(--rule-strong)] bg-card text-ink"
              >
                {f}
              </span>
            ))}
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* Pool */}
        <div className="grid grid-cols-2 gap-2 content-start">
          {POOL.map((c, i) => {
            const isHero = c.id === "hero";
            const hot = isHero && s >= 1;
            return (
              <On key={c.id} on={s >= 0} delay={i * 50}>
                <div
                  data-cur={isHero ? "src-hero" : undefined}
                  className={cn(
                    "bx-flip relative h-[84px] [perspective:900px]",
                  )}
                  data-flipped={isHero && revealed ? "true" : "false"}
                >
                  {/* Front: masked */}
                  <div
                    className={cn(
                      "bx-face absolute inset-0 bg-card border p-3 flex gap-2.5 transition-[border-color,box-shadow] duration-300",
                      hot
                        ? "border-heritage shadow-[0_0_0_3px_rgba(77,122,96,0.18)]"
                        : "border-[var(--rule)]"
                    )}
                  >
                    <Avatar initials="" masked size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold italic text-slate-body truncate">{c.masked}</div>
                      <div className="text-2xs text-slate-meta truncate">{c.meta}</div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <FitBadge fit={c.fit} strong={isHero} />
                        <EyeOff aria-hidden className="size-3 text-slate-meta" />
                      </div>
                    </div>
                  </div>
                  {/* Back: revealed with consent */}
                  {isHero && (
                    <div className="bx-face bx-back absolute inset-0 bg-card border border-heritage p-3 flex gap-2.5 shadow-[0_0_0_3px_rgba(77,122,96,0.18)]">
                      <Avatar initials={HERO.initials} tone="heritage" size={30} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-extrabold text-ink truncate">{HERO.name}</div>
                        <div className="text-2xs text-slate-meta truncate">{c.meta}</div>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <FitBadge fit={c.fit} strong />
                          <span className="inline-flex items-center gap-1 text-2xs font-bold text-heritage-deep">
                            <ShieldCheck className="size-3" /> <span className="hidden sm:inline">Consented</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </On>
            );
          })}
        </div>

        {/* Outreach drawer */}
        <Panel className="relative p-4 min-h-[280px] overflow-hidden">
          {s < 2 ? (
            <div className="h-full grid place-items-center text-center py-10">
              <div>
                <EyeOff className="size-5 mx-auto text-slate-meta mb-2" />
                <div className="text-xs font-bold text-ink">Names stay hidden</div>
                <div className="text-2xs text-slate-meta mt-1 max-w-[220px]">
                  Pick a candidate to send a double-blind intro.
                </div>
              </div>
            </div>
          ) : (
            <On on className="bx-drawer grid gap-3">
              <div className="flex items-center justify-between gap-2">
                <Kicker>Double-blind outreach</Kicker>
                {s >= 4 && s < 6 && <LivePill>She said yes</LivePill>}
              </div>
              <div className="flex items-center gap-2.5">
                <Avatar initials={HERO.initials} tone="heritage" masked={!revealed} size={34} />
                <div className="min-w-0">
                  <div className={cn("text-sm font-extrabold", revealed ? "text-ink" : "italic text-slate-body")}>
                    <span key={revealed ? "r" : "m"} className="bx-swap inline-block">
                      {revealed ? HERO.name : HERO.masked}
                    </span>
                  </div>
                  <div className="text-2xs text-slate-meta">
                    {HERO.role} · {HERO.city} · {HERO.years} yrs
                  </div>
                </div>
              </div>
              <div
                className={cn(
                  "relative border border-dashed px-3 py-2.5 text-xs leading-relaxed text-slate-body transition-colors duration-300",
                  s >= 3 ? "border-heritage/50 bg-heritage/[0.05]" : "border-[var(--rule-strong)]"
                )}
              >
                {OUTREACH_MESSAGE}
                {s >= 3 && (
                  <span className="absolute -top-2 right-2 inline-flex items-center gap-1 bg-heritage px-1.5 py-0.5 text-2xs font-bold text-ivory">
                    <Check className="size-3" strokeWidth={3} /> Sent
                  </span>
                )}
              </div>

              {/* Real prospect stages */}
              <div className="grid grid-cols-4 gap-1">
                {SOURCING_STEPS.map((label, i) => (
                  <div key={label} className="grid gap-1">
                    <span
                      className={cn(
                        "h-1.5 transition-colors duration-500",
                        i <= stepIdx ? "bg-heritage" : "bg-ink/10"
                      )}
                      style={{ transitionDelay: `${i * 60}ms` }}
                    />
                    <span
                      className={cn(
                        "text-2xs font-bold uppercase tracking-[0.8px] truncate",
                        i <= stepIdx ? "text-heritage-deep" : "text-slate-meta"
                      )}
                    >
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2">
                {revealed ? (
                  <span className="inline-flex items-center gap-1.5 text-2xs font-bold text-heritage-deep">
                    <ShieldCheck className="size-3.5" /> {CONSENT_BADGE}
                  </span>
                ) : (
                  <span className="text-2xs text-slate-meta">Private until she chooses to share.</span>
                )}
                <FauxButton cur="src-send" variant={s >= 3 ? "outline" : "primary"} pressed={s === 3}>
                  <Send className="size-3.5" />
                  {s >= 3 ? "Intro sent" : "Send intro"}
                </FauxButton>
              </div>
            </On>
          )}
        </Panel>
      </div>

      <Toast
        on={s >= 6}
        className="right-3 top-3"
        icon={<UserCheck className="size-4" />}
        kicker="New applicant"
        title={`${HERO.name} applied to Associate Dentist · Boise`}
        sub="Sourced, contacted, converted · one timeline"
      />
    </div>
  );
}
