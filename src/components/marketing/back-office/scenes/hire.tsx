"use client";

import { AlertTriangle, Check, Loader2, PenLine, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCursor, On } from "../engine";
import { useBeats } from "../use-player";
import { Panel, Kicker, FauxButton, SceneTitle, Avatar, LivePill } from "../atoms";
import {
  HERO,
  OFFER_ROWS,
  OFFER_GUARDRAIL,
  APPROVERS,
  HIRE_STATS,
  HIRED_LABEL,
  OFFER_LABEL,
} from "../story";
import type { SceneProps } from "./types";

export function HireScene({ active, enhanced, nonce }: SceneProps) {
  const cursor = useCursor();
  const s = useBeats(active, enhanced, nonce, (at) => {
    at(80, null, () => {
      cursor.show();
      cursor.to("hire-submit", { ms: 800 });
    });
    at(950, 1, () => cursor.click());
    at(2500, 2);
    at(3100, null, () => cursor.to("hire-send"));
    at(3850, 3, () => cursor.click());
    at(5100, 4);
    at(6100, 5, () => cursor.hide());
  });

  const hired = s >= 5;

  return (
    <div className="relative">
      <SceneTitle
        title={
          <span className="inline-flex items-center gap-2.5">
            <Avatar initials={HERO.initials} tone="heritage" size={30} />
            Offer · {HERO.name}
          </span>
        }
        sub={`${HERO.role} · ${HERO.city}`}
        right={
          <span
            key={hired ? "h" : "o"}
            className={cn(
              "bx-swap inline-flex items-center gap-1.5 px-2 py-1 text-2xs font-extrabold uppercase tracking-[1.2px]",
              hired ? "bg-heritage text-ivory" : "bg-stage-bronze/15 text-stage-bronze"
            )}
          >
            {hired && <Check className="size-3" strokeWidth={3} />}
            {hired ? HIRED_LABEL : OFFER_LABEL}
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* The offer */}
        <Panel className="p-4">
          <Kicker className="mb-2.5">Offer letter</Kicker>
          <dl className="grid gap-1.5">
            {OFFER_ROWS.map((r) => (
              <div
                key={r.label}
                className="flex items-center justify-between gap-3 border-b border-[var(--rule)] pb-1.5 last:border-0"
              >
                <dt className="text-2xs font-bold uppercase tracking-[1px] text-slate-meta">{r.label}</dt>
                <dd className="text-xs font-bold text-ink text-right">{r.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex items-start gap-2 border-l-2 border-warning bg-warning-bg px-3 py-2">
            <AlertTriangle className="size-3.5 mt-0.5 shrink-0 text-warning" />
            <p className="text-2xs leading-snug text-ink/80">{OFFER_GUARDRAIL}</p>
          </div>
          <div className="mt-3 flex justify-end">
            <FauxButton cur="hire-submit" variant={s >= 1 ? "outline" : "primary"} pressed={s === 1}>
              {s >= 1 ? (
                <>
                  <Check className="size-3.5" strokeWidth={3} /> Submitted
                </>
              ) : (
                "Submit for approval"
              )}
            </FauxButton>
          </div>
        </Panel>

        {/* Approval chain → send → signed */}
        <Panel className="p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <Kicker>Approval chain</Kicker>
            {s === 2 && <LivePill>Approved just now</LivePill>}
          </div>
          <ol className="grid gap-2 list-none">
            {APPROVERS.map((a, i) => {
              const done = i === 0 ? s >= 1 : s >= 2;
              const working = i === 1 && s === 1;
              return (
                <li
                  key={a.role}
                  className={cn(
                    "flex items-center gap-2.5 border px-3 py-2 transition-colors duration-500",
                    done ? "border-heritage/40 bg-heritage/[0.05]" : "border-[var(--rule)]"
                  )}
                >
                  <Avatar initials={a.initials} tone={i === 0 ? "ink" : "slate"} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-ink">{a.who}</div>
                    <div className="text-2xs text-slate-meta">{a.role}</div>
                  </div>
                  {done ? (
                    <span className="bx-pop grid place-items-center size-5 bg-heritage text-ivory">
                      <Check className="size-3" strokeWidth={3.5} />
                    </span>
                  ) : working ? (
                    <Loader2 className="size-4 text-slate-meta bx-spin" />
                  ) : (
                    <span className="size-5 border border-dashed border-[var(--rule-strong)]" />
                  )}
                </li>
              );
            })}
            <li
              className={cn(
                "flex items-center gap-2.5 border px-3 py-2 transition-colors duration-500",
                s >= 4 ? "border-heritage/40 bg-heritage/[0.05]" : "border-[var(--rule)]"
              )}
            >
              <Avatar initials={HERO.initials} tone="heritage" size={26} />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-ink">{HERO.name}</div>
                <div className="text-2xs text-slate-meta">
                  {s >= 4 ? "Signed the offer" : s >= 3 ? "Offer delivered · reviewing" : "Candidate"}
                </div>
              </div>
              {s >= 4 ? (
                <span className="bx-pop inline-flex items-center gap-1 bg-heritage px-1.5 py-1 text-2xs font-bold text-ivory">
                  <PenLine className="size-3" /> Signed
                </span>
              ) : s >= 3 ? (
                <Loader2 className="size-4 text-slate-meta bx-spin" />
              ) : (
                <span className="size-5 border border-dashed border-[var(--rule-strong)]" />
              )}
            </li>
          </ol>
          <div className="mt-auto pt-3 flex justify-end">
            <FauxButton
              cur="hire-send"
              variant={s >= 2 && s < 3 ? "heritage" : "outline"}
              pressed={s === 3}
              className={cn(s < 2 && "opacity-45")}
            >
              <Send className="size-3.5" />
              {s >= 3 ? "Offer sent" : "Send offer"}
            </FauxButton>
          </div>
        </Panel>
      </div>

      {/* The payoff: collapsed until the hire lands, then the frame grows
          open to make room (0fr → 1fr row), so there's no reserved void. */}
      <div className="bx-collapse" data-open={hired ? "true" : "false"}>
      <div className="min-h-0 overflow-hidden">
      <On
        on={hired}
        className="bx-hired mt-4 relative overflow-hidden bg-hero text-ivory grid gap-4 sm:grid-cols-[auto_1fr] items-center p-4 sm:p-5"
      >
        <span aria-hidden className={cn("bx-sweep absolute inset-0", hired && enhanced && "is-on")} />
        <div className="flex items-center gap-3">
          <span className="bx-stamp grid place-items-center size-11 bg-heritage text-ivory">
            <Check className="size-6" strokeWidth={3} />
          </span>
          <div>
            <Kicker className="text-heritage-bright">{HIRED_LABEL}</Kicker>
            <div className="text-lg font-extrabold tracking-[-0.02em] leading-tight">{HERO.name}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-px bg-ivory/10">
          {HIRE_STATS.map((st, i) => (
            <On key={st.k} on={hired} delay={250 + i * 140} className="bg-hero px-3 py-2">
              <div className="text-2xs font-bold uppercase tracking-[1px] text-ivory/50 leading-tight">{st.k}</div>
              <div
                className={cn(
                  "text-base sm:text-xl font-extrabold tracking-[-0.02em] tabular mt-0.5",
                  i === 1 ? "text-heritage-bright" : i === 2 ? "text-ivory/45 line-through decoration-2" : "text-ivory"
                )}
              >
                {st.v}
              </div>
            </On>
          ))}
        </div>
      </On>
      </div>
      </div>
    </div>
  );
}
