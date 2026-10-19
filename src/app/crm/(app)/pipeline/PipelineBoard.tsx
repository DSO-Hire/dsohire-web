"use client";

import Link from "next/link";
import { photoClass, photoStyle } from "../avatars";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { markOpportunityLostInline, setOpportunityStage } from "./actions";
import { LOST_REASONS, PLAN_LABELS, TEMPLATE_STAGES, effectiveStages, fmtMoney, stageLabel } from "../format";
import { countdown } from "../opportunities/_lib/dates";
import { initials } from "../opportunities/_lib/labels";
import type { PipelineOpp } from "./_lib/load";
import { staleTone } from "./_lib/tone";

type Admin = { id: string; email: string | null; full_name: string | null };
type Toast = { id: string; name: string; from: string; to: string } | null;

const TEMPLATE = TEMPLATE_STAGES as readonly string[];

function colOf(d: { stage: string }): string {
  return TEMPLATE.includes(d.stage) ? d.stage : "custom";
}

function OwnerChip({ owner, ownerId }: { owner: Admin | undefined; ownerId: string | null }) {
  if (!ownerId) return null;
  if (!owner)
    return (
      <span className="ownchip" title="Another founder">
        ?
      </span>
    );
  return (
    <span className={`ownchip${photoClass(owner)}`} style={photoStyle(owner)} title={owner.email ?? ""}>
      {initials(owner)}
    </span>
  );
}

export default function PipelineBoard({
  opps,
  admins,
  compact,
}: {
  opps: PipelineOpp[];
  admins: Admin[];
  compact: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [optimistic, applyMove] = useOptimistic(opps, (state, move: { id: string; stage: string }) =>
    move.stage === "lost"
      ? state.filter((d) => d.id !== move.id)
      : state.map((d) => (d.id === move.id ? { ...d, stage: move.stage } : d)),
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [blockedCol, setBlockedCol] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [toast, setToast] = useState<Toast>(null);
  const [lostPrompt, setLostPrompt] = useState<{ id: string; name: string } | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const focusAfter = useRef<string | null>(null);
  const adminById = new Map(admins.map((a) => [a.id, a]));

  const columns = [...TEMPLATE, "custom"];
  const colOpps = (col: string) =>
    col === "custom" ? optimistic.filter((d) => !TEMPLATE.includes(d.stage)) : optimistic.filter((d) => d.stage === col);

  /* the moved card keeps focus after the board re-renders */
  useEffect(() => {
    if (!focusAfter.current) return;
    const el = cardRefs.current.get(focusAfter.current);
    if (el) {
      el.focus();
      focusAfter.current = null;
    }
  });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const move = useCallback(
    (id: string, stage: string, opts: { undo?: boolean; keepFocus?: boolean } = {}) => {
      const opp = optimistic.find((d) => d.id === id);
      if (!opp || opp.stage === stage) return;
      if (!effectiveStages(opp.custom_stages).includes(stage)) {
        setErr(`"${opp.name}" runs a custom stage list without "${stageLabel(stage)}". Set its stage from the opportunity page.`);
        return;
      }
      setErr(null);
      const from = opp.stage;
      if (opts.keepFocus) focusAfter.current = id;
      startTransition(async () => {
        applyMove({ id, stage });
        let res: { error: string | null };
        try {
          res = await setOpportunityStage(id, stage);
        } catch {
          res = { error: "The connection dropped before the move saved. Try again." };
        }
        if (res.error) {
          setErr(`Stage was not moved: ${res.error}`);
          setAnnounce(`${opp.name} was not moved.`);
        } else {
          setAnnounce(`${opp.name} moved to ${stageLabel(stage)}`);
          setToast(opts.undo ? null : { id, name: opp.name, from, to: stage });
        }
        router.refresh();
      });
    },
    [optimistic, applyMove, router],
  );

  function drop(col: string) {
    setOverCol(null);
    setBlockedCol(null);
    const id = dragId;
    setDragId(null);
    if (!id) return;
    if (col === "lost") {
      const d = optimistic.find((x) => x.id === id);
      if (d) setLostPrompt({ id, name: d.name });
      return;
    }
    move(id, col);
  }

  function step(d: PipelineOpp, dir: 1 | -1) {
    const stages = effectiveStages(d.custom_stages);
    const idx = stages.indexOf(d.stage);
    const next = stages[Math.max(0, Math.min(stages.length - 1, (idx < 0 ? 0 : idx) + dir))];
    if (next && next !== d.stage) move(d.id, next, { keepFocus: true });
  }

  function focusCard(id: string | undefined) {
    if (id) cardRefs.current.get(id)?.focus();
  }

  function onCardKey(e: React.KeyboardEvent<HTMLDivElement>, d: PipelineOpp) {
    const target = e.target as HTMLElement;
    if (target !== e.currentTarget) return; /* links, buttons, menus inside the card handle their own keys */
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const col = colOf(d);
    const list = colOpps(col);
    const pos = list.findIndex((x) => x.id === d.id);
    if (e.key === "Enter") {
      e.preventDefault();
      router.push(`/crm/opportunities/${d.id}`);
    } else if (e.key === "ArrowDown" && !e.shiftKey) {
      e.preventDefault();
      focusCard(list[pos + 1]?.id);
    } else if (e.key === "ArrowUp" && !e.shiftKey) {
      e.preventDefault();
      focusCard(list[pos - 1]?.id);
    } else if ((e.key === "ArrowRight" && e.shiftKey) || e.key === "]") {
      e.preventDefault();
      step(d, 1);
    } else if ((e.key === "ArrowLeft" && e.shiftKey) || e.key === "[") {
      e.preventDefault();
      step(d, -1);
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const ci = columns.indexOf(col);
      const dir = e.key === "ArrowRight" ? 1 : -1;
      for (let c = ci + dir; c >= 0 && c < columns.length; c += dir) {
        const other = colOpps(columns[c]);
        if (other.length) {
          focusCard(other[Math.min(pos, other.length - 1)].id);
          break;
        }
      }
    }
  }

  return (
    <>
      <div className="ws-sr" aria-live="polite" role="status">
        {announce}
      </div>
      <p id="dx-board-keys" className="ws-sr">
        Enter opens the opportunity. Arrow keys move between cards. Shift plus arrow right or the right bracket moves it
        forward a stage; Shift plus arrow left or the left bracket moves it back.
      </p>
      {err ? (
        <div className="action-err" role="alert">
          <b>THAT DID NOT SAVE</b> {err}
        </div>
      ) : null}
      <div className={`board${compact ? " dx-compactboard" : ""}`}>
        {columns.map((col) => {
          const list = colOpps(col);
          if (col === "custom" && list.length === 0) return null;
          const colValue = list.reduce((s, d) => s + d.acv, 0);
          const colWtd = list.reduce((s, d) => s + d.weighted, 0);
          const dragOpp = dragId ? optimistic.find((d) => d.id === dragId) : undefined;
          const blocked = !!dragOpp && col !== "custom" && !effectiveStages(dragOpp.custom_stages).includes(col);
          return (
            <div
              className={`col${overCol === col ? " over" : ""}${blockedCol === col ? " dx-blocked" : ""}`}
              key={col}
              onDragOver={(e) => {
                if (col === "custom") return;
                if (blocked) {
                  setBlockedCol(col);
                  return;
                }
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOverCol(col);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setOverCol(null);
                  setBlockedCol(null);
                }
              }}
              onDrop={(e) => {
                if (col === "custom" || blocked) return;
                e.preventDefault();
                drop(col);
              }}
            >
              <div className="col-h">
                <b>{col === "custom" ? "Custom stages" : stageLabel(col)}</b>
                <span className="n">{list.length}</span>
                {colValue > 0 && !compact ? (
                  <span className="dx-colval num" title="Annual contract value, unweighted">
                    {fmtMoney(colValue)}
                  </span>
                ) : null}
                {colWtd > 0 && col !== "won" ? (
                  <span className="colev num" title="Stage-weighted ACV, indicative weights">
                    wtd {fmtMoney(colWtd)}
                  </span>
                ) : null}
              </div>
              {blockedCol === col ? <div className="dx-blockhint">not in this opportunity&apos;s stage list</div> : null}
              {list.map((d) => {
                const tone = staleTone(d);
                const owner = d.owner_id ? adminById.get(d.owner_id) : undefined;
                const nsd = countdown(d.next_step_due);
                const stages = effectiveStages(d.custom_stages);
                const acct = d.account;
                return (
                  <div
                    className={`dcard dx-card${dragId === d.id ? " dragging dx-drag-ghost" : ""}${compact ? " dx-compact" : ""}`}
                    key={d.id}
                    ref={(el) => {
                      if (el) cardRefs.current.set(d.id, el);
                      else cardRefs.current.delete(d.id);
                    }}
                    tabIndex={0}
                    aria-label={`${d.name}, ${stageLabel(d.stage)}`}
                    aria-describedby="dx-board-keys"
                    draggable
                    onKeyDown={(e) => onCardKey(e, d)}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(d.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverCol(null);
                      setBlockedCol(null);
                    }}
                  >
                    {d.overdueCount > 0 ? (
                      <span className="dx-overdue" title={`${d.overdueCount} overdue task${d.overdueCount === 1 ? "" : "s"}`}>
                        {d.overdueCount}
                        <span className="ws-sr"> overdue</span>
                      </span>
                    ) : null}
                    <div className="dx-cardtop">
                      <span
                        className={`dx-dot ${tone}`}
                        title={tone === "crit" ? "stalled" : tone === "warn" ? "quiet 5+ days" : "touched this week"}
                      />
                      <Link href={`/crm/opportunities/${d.id}`} className="cn" draggable={false} tabIndex={-1}>
                        {d.name}
                      </Link>
                      {compact ? (
                        <span className="dx-compactnums num">
                          {d.acv > 0 ? fmtMoney(d.acv) : "n/a"} · {d.probability}%
                          <OwnerChip owner={owner} ownerId={d.owner_id} />
                        </span>
                      ) : null}
                      <details className="dx-moveto" onClick={(e) => e.stopPropagation()}>
                        <summary className="iconbtn" aria-label={`Move ${d.name} to another stage`}>
                          ⋯
                        </summary>
                        <div className="dx-movemenu" role="menu">
                          {stages.map((s) => (
                            <button
                              key={s}
                              type="button"
                              role="menuitem"
                              className="dx-moveitem"
                              disabled={s === d.stage}
                              onClick={(e) => {
                                (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                                move(d.id, s, { keepFocus: true });
                              }}
                            >
                              {stageLabel(s)}
                            </button>
                          ))}
                          <button
                            type="button"
                            role="menuitem"
                            className="dx-moveitem dx-moveitem-lost"
                            onClick={(e) => {
                              (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                              setLostPrompt({ id: d.id, name: d.name });
                            }}
                          >
                            Mark lost…
                          </button>
                        </div>
                      </details>
                    </div>
                    {!compact ? (
                      <>
                        <div className="prof">
                          {acct?.name
                            ? `${acct.locations ? `${acct.locations}-loc · ` : ""}${acct.name}${acct.hq_state ? ` · ${acct.hq_state}` : ""}`
                            : "no account linked"}
                        </div>
                        <div className="nums">
                          {d.plan_tier ? (
                            <span>
                              PLAN <b>{PLAN_LABELS[d.plan_tier] ?? d.plan_tier}</b>
                              {d.billing === "annual" ? " ANNUAL" : ""}
                            </span>
                          ) : null}
                          {d.mrr > 0 ? (
                            <span title={d.mrrSet ? "set on the opportunity" : "plan list price"}>
                              MRR <b>{fmtMoney(d.mrr)}</b>
                              {!d.mrrSet ? (
                                <span className="dx-srcglyph" aria-label="from the plan list price">
                                  $
                                </span>
                              ) : null}
                            </span>
                          ) : null}
                          {d.acv > 0 ? (
                            <span>
                              ACV <b>{fmtMoney(d.acv)}</b>
                            </span>
                          ) : null}
                        </div>
                        {d.next_step ? (
                          <div className="dx-cardnext">
                            <span className="dx-cardnext-t">{d.next_step}</span>
                            {d.next_step_due ? <span className={`dx-nsd ${nsd.tone}`}>{nsd.label}</span> : null}
                          </div>
                        ) : null}
                        <div className="foot2 dx-foot">
                          <span className="pill navy">{stageLabel(d.stage)}</span>
                          <span
                            className="dx-prob num"
                            title={d.probabilitySource === "set" ? "set on the opportunity" : "stage weight, indicative"}
                          >
                            {d.probability}%
                          </span>
                          <OwnerChip owner={owner} ownerId={d.owner_id} />
                          {d.oldestTask ? (
                            <span className={`pill ball${d.oldestTask.days >= 5 ? " dx-ballwarn" : ""}`} title={d.oldestTask.title}>
                              {d.oldestTask.ball.toUpperCase()} {d.oldestTask.days}d
                            </span>
                          ) : null}
                          <span className="days" title="days in stage">
                            {d.daysInStage}d
                          </span>
                          <span className="grip" aria-hidden="true">
                            ⠿
                          </span>
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })}
              {overCol === col && dragId && !list.some((d) => d.id === dragId) ? (
                <div className="dx-dropline" aria-hidden="true" />
              ) : null}
              {list.length === 0 && col !== "custom" ? <div className="col-empty">Drop an opportunity here</div> : null}
            </div>
          );
        })}
      </div>

      {dragId ? (
        <div
          className={`dx-lostzone${overCol === "lost" ? " over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setOverCol("lost");
          }}
          onDragLeave={() => setOverCol(null)}
          onDrop={(e) => {
            e.preventDefault();
            drop("lost");
          }}
        >
          Drop here to mark the opportunity lost
        </div>
      ) : null}

      {lostPrompt ? (
        <LostPrompt
          name={lostPrompt.name}
          onCancel={() => setLostPrompt(null)}
          onConfirm={(reason, note) => {
            const target = lostPrompt;
            setLostPrompt(null);
            startTransition(async () => {
              applyMove({ id: target.id, stage: "lost" });
              let res: { error: string | null };
              try {
                res = await markOpportunityLostInline(target.id, reason, note);
              } catch {
                res = { error: "The connection dropped before it saved. Try again." };
              }
              if (res.error) {
                setErr(res.error);
                setAnnounce(`${target.name} was not marked lost.`);
              } else {
                setAnnounce(`${target.name} marked lost`);
              }
              router.refresh();
            });
          }}
        />
      ) : null}

      {toast ? (
        <div className="dx-toast" role="status">
          <span>
            <b>{toast.name}</b> moved to {stageLabel(toast.to)}.
          </span>
          <button
            type="button"
            className="dx-undo"
            onClick={() => {
              const t = toast;
              setToast(null);
              move(t.id, t.from, { undo: true, keepFocus: true });
            }}
          >
            Undo
          </button>
        </div>
      ) : null}
    </>
  );
}

function LostPrompt({
  name,
  onCancel,
  onConfirm,
}: {
  name: string;
  onCancel: () => void;
  onConfirm: (reason: string, note: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const firstRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);
  return (
    <div
      className="dx-lostprompt"
      role="dialog"
      aria-modal="false"
      aria-label={`Mark ${name} lost`}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <form
        className="dform"
        onSubmit={(e) => {
          e.preventDefault();
          if (reason) onConfirm(reason, note);
        }}
      >
        <b>Mark {name} lost</b>
        <div>
          <label htmlFor="dx-lp-reason">REASON</label>
          <select id="dx-lp-reason" ref={firstRef} required value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="" disabled>
              choose…
            </option>
            {Object.entries(LOST_REASONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="dx-lp-note">NOTE (OPTIONAL)</label>
          <input id="dx-lp-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="dx-lpbtns">
          <button className="dbtn dbtn-line dbtn-sm" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="dbtn dbtn-green dbtn-sm" type="submit" disabled={!reason}>
            Mark lost
          </button>
        </div>
      </form>
    </div>
  );
}
