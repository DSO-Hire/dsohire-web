"use client";

/**
 * <PostingPreview> — Lane 6 (Job Studio, Model 05): the live right-pane
 * mirror of the public job page, updating per keystroke from wizard
 * state. The pattern the résumé builder proved in-house: type on the
 * left, watch the real artifact form on the right.
 *
 * Pure presentation — props in, markup out. No fetches, no state, no
 * server deps (safe inside both client wizards).
 *
 * Fidelity rules:
 *   • comp formatting mirrors the public page's formatComp branches
 *     (app/jobs/[id]/page.tsx) — if that changes shape, update here;
 *   • only REAL facts render: no invented "posted today" timestamps on
 *     a draft, no fabricated apply-time estimates — the screening
 *     count is shown because it's true;
 *   • anonymized-location masking + confidential gating apply at
 *     publish on the real page; the fine print says so.
 */

import { Briefcase, Clock, DollarSign, Eye, MapPin } from "lucide-react";

const DAY_LABELS: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** Compress selected days into run labels ("Mon–Thu", "Mon–Fri, Sat"). */
function scheduleSummary(days: string[]): string | null {
  const idxs = DAY_ORDER.map((d, i) => (days.includes(d) ? i : -1)).filter(
    (i) => i >= 0
  );
  if (idxs.length === 0) return null;
  const runs: Array<[number, number]> = [];
  for (const i of idxs) {
    const last = runs[runs.length - 1];
    if (last && i === last[1] + 1) last[1] = i;
    else runs.push([i, i]);
  }
  return runs
    .map(([s, e]) =>
      s === e
        ? DAY_LABELS[DAY_ORDER[s]]
        : `${DAY_LABELS[DAY_ORDER[s]]}–${DAY_LABELS[DAY_ORDER[e]]}`
    )
    .join(", ");
}

/** Mirrors the public page's formatComp (app/jobs/[id]/page.tsx). */
function formatComp(input: {
  compType: string;
  compMin: string;
  compMax: string;
  compPeriod: string;
}): string | null {
  if (input.compType === "doe") return "Discussed at offer";
  const min = input.compMin ? Number(input.compMin) : null;
  const max = input.compMax ? Number(input.compMax) : null;
  const minOk = min !== null && Number.isFinite(min) && min > 0;
  const maxOk = max !== null && Number.isFinite(max) && max > 0;
  if (!minOk && !maxOk) return null;
  const fmt = new Intl.NumberFormat("en-US");
  const num = (n: number) =>
    input.compPeriod === "annual"
      ? `$${Math.round(n / 1000)}K`
      : `$${fmt.format(n)}`;
  const periodLabel =
    { hourly: "/hr", daily: "/day", annual: "/yr" }[input.compPeriod] ?? "";
  let range: string;
  if (input.compType === "exact" && minOk) range = num(min!);
  else if (input.compType === "starting_at" && minOk)
    range = `From ${num(min!)}`;
  else if (input.compType === "up_to" && maxOk) range = `Up to ${num(max!)}`;
  else if (minOk && maxOk) range = `${num(min!)}–${num(max!)}`;
  else if (minOk) range = `${num(min!)}+`;
  else range = `Up to ${num(max!)}`;
  return `${range}${periodLabel}`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface PostingPreviewProps {
  title: string;
  roleLabel: string;
  employmentTypeLabel: string;
  dsoName?: string;
  locationNames: string[];
  compVisible: boolean;
  compType: string;
  compMin: string;
  compMax: string;
  compPeriod: string;
  scheduleDays: string[];
  scheduleEvenings: boolean;
  scheduleWeekends: boolean;
  benefits: string[];
  skills: string[];
  /** Tiptap HTML — stripped to text for the opening lines. */
  descriptionHtml: string;
  questionCount: number;
}

export function PostingPreview(props: PostingPreviewProps) {
  const comp = props.compVisible ? formatComp(props) : null;
  const schedule = scheduleSummary(props.scheduleDays);
  const opening = stripHtml(props.descriptionHtml);
  const locationLine =
    props.locationNames.length === 0
      ? null
      : props.locationNames.length <= 2
        ? props.locationNames.join(" · ")
        : `${props.locationNames[0]} +${props.locationNames.length - 1} more`;

  return (
    <div className="border border-[var(--rule-strong)] bg-white">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--rule)] bg-cream/60">
        <Eye className="h-3.5 w-3.5 text-heritage-deep" aria-hidden />
        <span className="text-[9px] font-bold tracking-[2px] uppercase text-heritage-deep">
          Live preview
        </span>
        <span className="text-[10px] text-slate-meta">
          — what candidates will see
        </span>
      </div>

      <div className="px-5 py-4">
        <h3 className="text-[19px] font-extrabold tracking-[-0.4px] leading-tight text-ink">
          {props.title.trim() || (
            <span className="text-slate-meta font-semibold">
              Your job title…
            </span>
          )}
        </h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-slate-meta">
          {locationLine && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden />
              {locationLine}
            </span>
          )}
          {props.dsoName && <span>· {props.dsoName}</span>}
          <span>· {props.employmentTypeLabel}</span>
        </p>

        {(comp || schedule || props.scheduleEvenings || props.scheduleWeekends) && (
          <p className="mt-3 flex flex-wrap gap-1.5">
            {comp && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-heritage/10 text-[11px] font-bold text-heritage-deep">
                <DollarSign className="h-3 w-3" aria-hidden />
                {comp}
              </span>
            )}
            {schedule && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-cream text-[11px] font-semibold text-slate-body border border-[var(--rule)]">
                <Clock className="h-3 w-3" aria-hidden />
                {schedule}
              </span>
            )}
            {props.scheduleEvenings && (
              <span className="px-2 py-1 bg-cream text-[11px] font-semibold text-slate-body border border-[var(--rule)]">
                Evenings
              </span>
            )}
            {props.scheduleWeekends && (
              <span className="px-2 py-1 bg-cream text-[11px] font-semibold text-slate-body border border-[var(--rule)]">
                Weekends
              </span>
            )}
          </p>
        )}

        <div className="mt-3 text-[13px] leading-relaxed text-slate-body">
          {opening ? (
            <p className="line-clamp-4">{opening}</p>
          ) : (
            <p className="italic text-slate-meta">
              Your description opens here — the first lines are what
              candidates read in search results.
            </p>
          )}
        </div>

        {props.skills.length > 0 && (
          <p className="mt-3 flex flex-wrap gap-1">
            {props.skills.slice(0, 6).map((s) => (
              <span
                key={s}
                className="px-1.5 py-0.5 text-[10px] font-semibold text-slate-body bg-ivory-deep"
              >
                {s}
              </span>
            ))}
            {props.skills.length > 6 && (
              <span className="text-[10px] text-slate-meta self-center">
                +{props.skills.length - 6} more
              </span>
            )}
          </p>
        )}

        <div className="mt-4 pt-3 border-t border-[var(--rule)] flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-meta">
            <Briefcase className="h-3 w-3" aria-hidden />
            {props.questionCount === 0
              ? "No screening questions"
              : `${props.questionCount} screening question${
                  props.questionCount === 1 ? "" : "s"
                }`}
          </span>
          <span className="px-3 py-1.5 bg-ink text-ivory text-[9px] font-bold tracking-[1.5px] uppercase select-none">
            Apply
          </span>
        </div>
      </div>

      <p className="px-5 pb-3 text-[10px] leading-snug text-slate-meta">
        Approximation — anonymized locations and confidential-search
        settings apply when the posting goes live.
      </p>
    </div>
  );
}
