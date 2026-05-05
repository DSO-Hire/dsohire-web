/**
 * Sparkline — tiny inline SVG line chart for KPI tiles + dashboard widgets.
 *
 * Designed to read at 80–160px wide and 24–40px tall. No axes, no labels,
 * just a single brand-colored stroke with optional area fill underneath.
 * Renders gracefully on sparse / empty data:
 *   - 0 points → renders nothing (just whitespace)
 *   - 1 point  → renders a single dot at the right edge
 *   - 2+ points → renders the line + optional area fill
 *
 * Brand-coherent: sharp edges, no gradient (just a solid stroke + a
 * translucent area fill in heritage). Uses the same heritage palette
 * already in CSS variables. No animation by default.
 */

interface SparklineProps {
  /** Series of numeric values, oldest first. */
  data: number[];
  /** Pixel width of the rendered SVG. Default 120. */
  width?: number;
  /** Pixel height of the rendered SVG. Default 32. */
  height?: number;
  /** Stroke color. Default heritage. */
  stroke?: string;
  /** Optional fill color for the area beneath the line. */
  fill?: string;
  /** Stroke width in px. Default 1.5. */
  strokeWidth?: number;
  /** Show a dot at the most recent (rightmost) point. Default true. */
  showLastDot?: boolean;
  /** Accessible description for screen readers. */
  ariaLabel?: string;
}

export function Sparkline({
  data,
  width = 120,
  height = 32,
  stroke = "var(--heritage)",
  fill = "rgba(77,122,96,0.10)",
  strokeWidth = 1.5,
  showLastDot = true,
  ariaLabel,
}: SparklineProps) {
  if (data.length === 0) {
    return <div style={{ width, height }} aria-hidden />;
  }

  if (data.length === 1) {
    // Single data point — render a dot at the right edge of the canvas.
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel ?? "One data point"}
      >
        <circle
          cx={width - 3}
          cy={height / 2}
          r={2.5}
          fill={stroke}
        />
      </svg>
    );
  }

  // Two or more points — draw the line + area fill.
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1; // avoid divide-by-zero on flat series
  const padding = strokeWidth + 1;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const stepX = innerWidth / (data.length - 1);

  const points = data.map((v, i) => ({
    x: padding + i * stepX,
    y: padding + innerHeight - ((v - min) / range) * innerHeight,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");

  // Area path closes back to the bottom of the chart.
  const areaPath =
    `${linePath} ` +
    `L ${points[points.length - 1].x.toFixed(2)} ${(height - padding).toFixed(2)} ` +
    `L ${points[0].x.toFixed(2)} ${(height - padding).toFixed(2)} Z`;

  const last = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={
        ariaLabel ??
        `Trend over ${data.length} periods, latest ${data[data.length - 1]}`
      }
    >
      <path d={areaPath} fill={fill} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showLastDot && (
        <circle cx={last.x} cy={last.y} r={2.5} fill={stroke} />
      )}
    </svg>
  );
}
