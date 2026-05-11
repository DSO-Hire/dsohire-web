"use client";

/**
 * Interactive applications sparkline (Phase 5C / E6.1.b, shipped 2026-05-11).
 *
 * Client island inside the otherwise-server PerJobAnalyticsCard. Each
 * day-dot is a button:
 *   - Hover → small tooltip showing the date + count of applications
 *   - Click → if count==1 → navigate to that application's detail page
 *           → if count>1 → expand a small popover listing the apps with
 *             links; same click pattern as the kanban card
 *
 * Date labels render below the chart at the leftmost, middle, and
 * rightmost positions ("30d ago", "15d ago", "Today").
 */

import { useState } from "react";
import Link from "next/link";
import type { SparklineDay } from "@/lib/analytics/metrics";

interface AppsSparklineProps {
  data: SparklineDay[];
}

const SVG_WIDTH = 600;
const SVG_HEIGHT = 80;
const PAD_X = 6;
const PAD_Y = 8;

function formatDateLabel(iso: string): string {
  // iso is YYYY-MM-DD (UTC); render in local timezone short month + day.
  const [y, m, d] = iso.split("-").map(Number);
  // Construct as local Date for display so "today" matches user's clock.
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function AppsSparkline({ data }: AppsSparklineProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  if (data.length === 0 || data.every((d) => d.count === 0)) {
    return (
      <div className="h-20 flex items-center text-[12px] text-slate-meta italic">
        No applications yet in this window.
      </div>
    );
  }

  const innerW = SVG_WIDTH - PAD_X * 2;
  const innerH = SVG_HEIGHT - PAD_Y * 2;
  const max = Math.max(...data.map((d) => d.count), 1);
  const step = data.length > 1 ? innerW / (data.length - 1) : 0;

  const points = data.map((d, i) => {
    const x = PAD_X + i * step;
    const y = PAD_Y + innerH - (d.count / max) * innerH;
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const areaPath =
    linePath +
    ` L${(PAD_X + (data.length - 1) * step).toFixed(1)},${(PAD_Y + innerH).toFixed(1)}` +
    ` L${PAD_X.toFixed(1)},${(PAD_Y + innerH).toFixed(1)} Z`;

  // Show the popover/tooltip for whichever is set (hover preferred for
  // mouse; activeIdx for click). On the click of a non-dot area, we
  // close the popover.
  const shownIdx = activeIdx ?? hoverIdx;
  const shownDay = shownIdx !== null ? data[shownIdx] : null;
  const shownPoint = shownIdx !== null ? points[shownIdx] : null;

  const leftLabel = data[0] ? formatDateLabel(data[0].date) : "";
  const midIdx = Math.floor(data.length / 2);
  const midLabel = data[midIdx] ? formatDateLabel(data[midIdx].date) : "";
  const rightLabel = data[data.length - 1]
    ? formatDateLabel(data[data.length - 1].date)
    : "";

  return (
    <div
      className="relative"
      onClick={(e) => {
        // Click outside a dot dismisses the popover.
        if ((e.target as HTMLElement).dataset.role !== "spark-dot") {
          setActiveIdx(null);
        }
      }}
    >
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        preserveAspectRatio="none"
        className="w-full h-20"
        role="img"
        aria-label={`Applications per day, last ${data.length} days, peak ${max}`}
      >
        <path d={areaPath} fill="#4D7A60" fillOpacity="0.12" />
        <path
          d={linePath}
          fill="none"
          stroke="#4D7A60"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Invisible wide hover targets per day so users can mouse anywhere
            along the column, not just on the 2px dot. */}
        {points.map(([x], i) => (
          <rect
            key={`hit-${i}`}
            x={x - step / 2}
            y={0}
            width={step}
            height={SVG_HEIGHT}
            fill="transparent"
            style={{ cursor: data[i].count > 0 ? "pointer" : "default" }}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            onClick={(e) => {
              e.stopPropagation();
              if (data[i].count === 0) return;
              setActiveIdx(activeIdx === i ? null : i);
            }}
            data-role="spark-dot"
          />
        ))}
        {/* Visible dots only where count > 0 */}
        {points.map(([x, y], i) =>
          data[i].count > 0 ? (
            <circle
              key={`dot-${i}`}
              cx={x}
              cy={y}
              r={shownIdx === i ? 4 : 2.5}
              fill="#14233F"
              stroke="#fff"
              strokeWidth={shownIdx === i ? 1.5 : 0}
            />
          ) : null
        )}
      </svg>

      {/* X-axis labels */}
      <div className="mt-1 flex justify-between text-[10px] text-slate-meta uppercase tracking-wide">
        <span>{leftLabel}</span>
        <span>{midLabel}</span>
        <span>{rightLabel}</span>
      </div>

      {/* Tooltip / popover */}
      {shownDay && shownDay.count > 0 && shownPoint && (
        <SparkPopover
          day={shownDay}
          xPct={(shownPoint[0] / SVG_WIDTH) * 100}
          isClicked={activeIdx !== null}
        />
      )}
    </div>
  );
}

function SparkPopover({
  day,
  xPct,
  isClicked,
}: {
  day: SparklineDay;
  xPct: number;
  isClicked: boolean;
}) {
  const dateLabel = formatDateLabel(day.date);
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `${xPct}%`,
        transform: "translate(-50%, -100%)",
        bottom: "100%",
        marginBottom: "8px",
      }}
    >
      <div
        className="rounded-md bg-[#14233F] text-white px-3 py-2 text-[12px] shadow-lg whitespace-nowrap pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
        data-role="spark-dot"
      >
        <div className="font-bold mb-1">
          {dateLabel} · {day.count}{" "}
          {day.count === 1 ? "application" : "applications"}
        </div>
        {isClicked && day.count === 1 ? (
          <Link
            href={`/employer/applications/${day.application_ids[0]}`}
            className="text-[#A8D4B6] hover:text-white underline underline-offset-2"
          >
            View application →
          </Link>
        ) : isClicked && day.count > 1 ? (
          <ul className="mt-1 space-y-0.5">
            {day.application_ids.map((id, i) => (
              <li key={id}>
                <Link
                  href={`/employer/applications/${id}`}
                  className="text-[#A8D4B6] hover:text-white underline underline-offset-2"
                >
                  Open application {i + 1}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-[#A8D4B6] text-[11px]">Click to open</div>
        )}
      </div>
    </div>
  );
}
