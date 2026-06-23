/**
 * Minimal, self-contained HTML for the embeddable careers iframe
 * (/embed/companies/[slug]). No app chrome, no external assets — just an inline
 * roles list a DSO can drop into an <iframe> on their own site. Themeable via
 * query params (accent / theme / limit).
 *
 * Takes already-masked PublicJob[] from getPublicJobsForDistribution, so names
 * are safe and comp is only present when visible. All dynamic text is
 * HTML-escaped; the accent color is validated to a hex literal so query input
 * can't inject CSS/markup.
 */

import {
  type PublicJob,
  SITE_URL,
  jobUrl,
  locationLabel,
} from "@/lib/distribution/public-jobs";

export interface EmbedOptions {
  slug: string;
  accent?: string | null;
  theme?: string | null;
  limit?: string | null;
  /** ?source= channel baked into each role link. */
  source: string;
}

const DEFAULT_ACCENT = "#0b5cad";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only accept a #rgb / #rrggbb literal; otherwise fall back to the default. */
function sanitizeAccent(input: string | null | undefined): string {
  if (input && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(input)) return input;
  return DEFAULT_ACCENT;
}

function clampLimit(input: string | null | undefined): number {
  const n = Number.parseInt(input ?? "", 10);
  if (Number.isNaN(n)) return 25;
  return Math.min(50, Math.max(1, n));
}

function compLabel(comp: PublicJob["comp"]): string | null {
  if (!comp) return null;
  const suffix =
    comp.period === "hourly" ? "/hr" : comp.period === "daily" ? "/day" : "/yr";
  const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;
  const range =
    comp.max && comp.max !== comp.min
      ? `${fmt(comp.min)}–${fmt(comp.max)}`
      : fmt(comp.min);
  return `${range}${suffix}`;
}

function locationSummary(job: PublicJob): string {
  const labels = job.locations.map(locationLabel).filter(Boolean);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0]!;
  return `${labels[0]} +${labels.length - 1} more`;
}

export function renderEmbedHtml(jobs: PublicJob[], opts: EmbedOptions): string {
  const accent = sanitizeAccent(opts.accent);
  const dark = opts.theme === "dark";
  const limit = clampLimit(opts.limit);
  const shown = jobs.slice(0, limit);

  const bg = dark ? "#0b0b0c" : "#ffffff";
  const cardBg = dark ? "#18181b" : "#ffffff";
  const text = dark ? "#f4f4f5" : "#111114";
  const sub = dark ? "#a1a1aa" : "#555560";
  const border = dark ? "#27272a" : "#e5e7eb";

  const rows = shown
    .map((job) => {
      const href = `${jobUrl(job)}?source=${encodeURIComponent(opts.source)}`;
      const loc = locationSummary(job);
      const comp = compLabel(job.comp);
      return `
      <a class="dsoh-card" href="${escapeHtml(href)}" target="_blank" rel="noopener">
        <div class="dsoh-main">
          <div class="dsoh-title">${escapeHtml(job.title)}</div>
          <div class="dsoh-meta">${escapeHtml(job.employerName)}${loc ? ` · ${escapeHtml(loc)}` : ""}</div>
        </div>
        ${comp ? `<div class="dsoh-comp">${escapeHtml(comp)}</div>` : ""}
      </a>`;
    })
    .join("");

  const body =
    shown.length > 0
      ? `<div class="dsoh-list">${rows}</div>`
      : `<div class="dsoh-empty">No open roles right now.</div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Open roles</title>
<style>
  :root { --accent: ${accent}; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 12px; background: ${bg}; color: ${text};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .dsoh-list { display: flex; flex-direction: column; gap: 8px; }
  .dsoh-card { display: flex; align-items: center; justify-content: space-between;
    gap: 12px; padding: 14px 16px; border: 1px solid ${border}; border-radius: 10px;
    background: ${cardBg}; text-decoration: none; color: inherit; transition: border-color .15s; }
  .dsoh-card:hover { border-color: var(--accent); }
  .dsoh-title { font-weight: 600; font-size: 15px; color: ${text}; }
  .dsoh-meta { font-size: 13px; color: ${sub}; margin-top: 2px; }
  .dsoh-comp { font-size: 13px; font-weight: 600; color: var(--accent); white-space: nowrap; }
  .dsoh-empty { font-size: 14px; color: ${sub}; padding: 16px; text-align: center; }
  .dsoh-foot { margin-top: 12px; font-size: 11px; color: ${sub}; text-align: right; }
  .dsoh-foot a { color: ${sub}; }
</style>
</head>
<body>
  ${body}
  <div class="dsoh-foot">Powered by <a href="${SITE_URL}" target="_blank" rel="noopener">DSO Hire</a></div>
</body>
</html>
`;
}
