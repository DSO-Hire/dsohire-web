/**
 * Activity timeline — BOH Remodel Lane 3 commit 1 (pure extraction from
 * page.tsx, markup unchanged): every stage transition for this
 * application, oldest first. Server-component-safe.
 */

import {
  KIND_DEFAULT_LABELS,
  type StageKind,
} from "@/lib/applications/stages";

export interface ActivityEvent {
  id: string;
  from_stage_kind: string | null;
  to_stage_kind: string;
  from_stage_label: string | null;
  to_stage_label: string | null;
  actor_type: string;
  note: string | null;
  created_at: string;
}

export function ActivityTimeline({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-[14px] text-slate-meta italic">
        No activity recorded yet.
      </p>
    );
  }
  return (
    <ol className="list-none space-y-4 border-l-2 border-[var(--rule)] pl-5">
      {events.map((ev) => {
        // Prefer the DSO-customized label snapshot (recorded at event
        // time) over the kind default. Events from before the
        // label-snapshot migration only have kind, so we fall back
        // gracefully.
        const fromLabel = ev.from_stage_label
          ? ev.from_stage_label
          : ev.from_stage_kind
            ? KIND_DEFAULT_LABELS[ev.from_stage_kind as StageKind] ??
              ev.from_stage_kind
            : null;
        const toLabel = ev.to_stage_label
          ? ev.to_stage_label
          : KIND_DEFAULT_LABELS[ev.to_stage_kind as StageKind] ??
            ev.to_stage_kind;
        return (
          <li key={ev.id} className="relative">
            <span className="absolute -left-[27px] top-1.5 block w-3 h-3 bg-ink rounded-full border-2 border-ivory" />
            <div className="text-[13px] font-bold text-ink">
              {fromLabel
                ? `${fromLabel} → ${toLabel}`
                : `Submitted as ${toLabel}`}
            </div>
            <div className="text-[12px] text-slate-meta mt-0.5">
              {ev.actor_type} · {new Date(ev.created_at).toLocaleString()}
            </div>
            {ev.note && (
              <div className="text-[13px] text-slate-body mt-1 leading-snug">
                {ev.note}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
