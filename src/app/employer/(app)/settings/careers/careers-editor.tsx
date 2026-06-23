"use client";

/**
 * CareersEditor — the single Careers & Distribution screen (Phase 4).
 *
 * Sections: hosted careers URL · embed codes (JS + iframe) with a live preview ·
 * per-job distribution toggles · syndication feed + submit instructions.
 *
 * The live preview iframe loads the real /embed route on this origin, so it
 * shows exactly what a visitor would see (empty until distribution goes live).
 * Toggles persist via the setJobDistribution server action with optimistic UI.
 */

import { useState, useTransition } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Lock,
  Code2,
  Globe,
  Rss,
} from "lucide-react";
import { setJobDistribution } from "./actions";

export interface CareersJobRow {
  id: string;
  title: string;
  distributionEnabled: boolean;
  /** When set, the job is excluded from distribution and the toggle is locked. */
  excludedReason: "confidential" | "internal" | null;
  /** "City, ST" (or "City, ST +N more") to disambiguate same-titled roles. */
  locationLabel: string | null;
}

export interface CareersEditorProps {
  slug: string;
  dsoName: string;
  siteUrl: string;
  jobs: CareersJobRow[];
}

export function CareersEditor({
  slug,
  dsoName,
  siteUrl,
  jobs,
}: CareersEditorProps) {
  const [tab, setTab] = useState<"js" | "iframe">("js");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [accent, setAccent] = useState("#0b5cad");
  const [limit, setLimit] = useState(10);

  if (!slug) {
    return (
      <div className="border-l-2 border-heritage bg-cream/60 px-4 py-3 text-[13px] text-slate-body">
        Finish your{" "}
        <a
          href="/employer/settings/profile"
          className="text-heritage-deep underline underline-offset-2 font-semibold"
        >
          public profile
        </a>{" "}
        first — your careers page and embeds need a company URL.
      </div>
    );
  }

  const careersUrl = `${siteUrl}/companies/${slug}`;
  const feedUrl = `${siteUrl}/feeds/companies/${slug}/jobs.xml`;
  const accentParam = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(accent)
    ? accent
    : "#0b5cad";

  const jsSnippet = `<div id="dsohire-jobs"></div>
<script src="${siteUrl}/embed/widget.js"
        data-dso="${slug}"
        data-accent="${accentParam}"
        data-limit="${limit}"></script>`;

  const iframeUrl = `${siteUrl}/embed/companies/${slug}?theme=${theme}&accent=${encodeURIComponent(accentParam)}&limit=${limit}`;
  const iframeSnippet = `<iframe src="${iframeUrl}"
        width="100%" height="600" style="border:0"
        title="Open roles at ${dsoName}"></iframe>`;

  // Same-origin relative preview so it works in any environment.
  const previewSrc = `/embed/companies/${slug}?theme=${theme}&accent=${encodeURIComponent(accentParam)}&limit=${limit}`;

  return (
    <div className="space-y-8">
      {/* ── Hosted careers page ── */}
      <SectionCard icon={Globe} title="Hosted careers page">
        <p className="text-[13px] text-slate-body leading-relaxed mb-4">
          A ready-made page listing all of {dsoName}&apos;s open roles. Link to
          it from your website nav or share it directly.
        </p>
        <CopyField value={careersUrl} />
        <a
          href={careersUrl}
          target="_blank"
          rel="noopener"
          className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-heritage-deep hover:text-ink transition-colors"
        >
          Open careers page <ExternalLink className="h-3 w-3" />
        </a>
      </SectionCard>

      {/* ── Embed ── */}
      <SectionCard icon={Code2} title="Embed on your website">
        <p className="text-[13px] text-slate-body leading-relaxed mb-4">
          Drop your live roles straight onto your own site. The widget restyles
          to match; the iframe is the simplest drop-in.
        </p>

        {/* Appearance controls */}
        <div className="flex flex-wrap items-end gap-4 mb-5">
          <label className="flex flex-col gap-1 text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta">
            Theme
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as "light" | "dark")}
              className="rounded border border-[var(--rule)] bg-card px-2 py-1.5 text-[13px] text-ink"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta">
            Accent
            <input
              type="color"
              value={accentParam}
              onChange={(e) => setAccent(e.target.value)}
              className="h-9 w-14 rounded border border-[var(--rule)] bg-card p-0.5"
              aria-label="Accent color"
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta">
            Max roles
            <input
              type="number"
              min={1}
              max={50}
              value={limit}
              onChange={(e) =>
                setLimit(
                  Math.min(50, Math.max(1, Number(e.target.value) || 10)),
                )
              }
              className="w-20 rounded border border-[var(--rule)] bg-card px-2 py-1.5 text-[13px] text-ink"
            />
          </label>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[var(--rule)] mb-4">
          {(["js", "iframe"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={
                "px-3 py-2 text-[12px] font-bold tracking-[1px] uppercase transition-colors border-b-2 -mb-px " +
                (tab === t
                  ? "border-heritage-deep text-ink"
                  : "border-transparent text-slate-meta hover:text-ink")
              }
            >
              {t === "js" ? "JavaScript widget" : "iframe"}
            </button>
          ))}
        </div>

        <CodeBlock value={tab === "js" ? jsSnippet : iframeSnippet} />

        {/* Live preview */}
        <div className="mt-5">
          <div className="text-[10px] font-bold tracking-[2px] uppercase text-slate-meta mb-2">
            Live preview
          </div>
          <div className="rounded-lg border border-[var(--rule)] overflow-hidden bg-card">
            <iframe
              key={previewSrc}
              src={previewSrc}
              title="Careers embed preview"
              className="w-full h-[320px] bg-white"
            />
          </div>
          <p className="mt-2 text-[12px] text-slate-meta">
            The preview (and embeds) stay empty until distribution goes live at
            launch.
          </p>
        </div>
      </SectionCard>

      {/* ── Per-job distribution ── */}
      <SectionCard icon={Globe} title="Which roles get distributed">
        <p className="text-[13px] text-slate-body leading-relaxed mb-4">
          Every public active role is distributed by default. Turn one off to
          keep it on your DSO Hire job page but out of the feed, API, and embeds.
          Confidential and internal-only roles are always excluded.
        </p>
        {jobs.length === 0 ? (
          <p className="text-[13px] text-slate-meta py-2">
            No active roles yet.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--rule)]">
            {jobs.map((job) => (
              <JobToggleRow key={job.id} job={job} />
            ))}
          </ul>
        )}
      </SectionCard>

      {/* ── Syndication feed ── */}
      <SectionCard icon={Rss} title="List on Indeed & LinkedIn">
        <p className="text-[13px] text-slate-body leading-relaxed mb-4">
          Your roles are formatted as a standard jobs XML feed. Submit this URL
          once and the aggregator re-crawls it automatically.
        </p>
        <CopyField value={feedUrl} />
        <ol className="mt-4 space-y-2 text-[13px] text-slate-body list-decimal pl-5">
          <li>
            <strong className="text-ink">Indeed:</strong> in your Indeed employer
            account, add an XML feed source and paste the URL above.
          </li>
          <li>
            <strong className="text-ink">LinkedIn:</strong> share the same URL
            with your LinkedIn Limited Listings / job wrapping contact.
          </li>
          <li>
            <strong className="text-ink">Google for Jobs</strong> needs no feed —
            it indexes your job pages automatically from structured data.
          </li>
        </ol>
      </SectionCard>
    </div>
  );
}

/* ───────────────────────── building blocks ───────────────────────── */

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-[var(--rule)] bg-card p-6 sm:p-8">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-4 w-4 text-heritage-deep" />
        <h3 className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        });
      }}
      className="inline-flex items-center gap-1.5 shrink-0 bg-primary px-3 py-2 text-[11px] font-bold tracking-[1px] uppercase text-primary-foreground hover:bg-primary/90 transition-colors"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" /> Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" /> Copy
        </>
      )}
    </button>
  );
}

function CopyField({ value }: { value: string }) {
  return (
    <div className="flex items-stretch gap-2">
      <input
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="flex-1 min-w-0 rounded border border-[var(--rule)] bg-cream/40 px-3 py-2 text-[13px] text-ink font-mono"
      />
      <CopyButton value={value} />
    </div>
  );
}

function CodeBlock({ value }: { value: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded border border-[var(--rule)] bg-cream/40 p-4 pr-24 text-[12px] leading-relaxed text-ink font-mono whitespace-pre-wrap break-all">
        {value}
      </pre>
      <div className="absolute top-3 right-3">
        <CopyButton value={value} />
      </div>
    </div>
  );
}

function JobToggleRow({ job }: { job: CareersJobRow }) {
  const [enabled, setEnabled] = useState(job.distributionEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const locked = job.excludedReason !== null;

  const onToggle = () => {
    if (locked || pending) return;
    const next = !enabled;
    setEnabled(next); // optimistic
    setError(null);
    startTransition(async () => {
      const res = await setJobDistribution(job.id, next);
      if (!res.ok) {
        setEnabled(!next); // revert
        setError(res.error ?? "Couldn't save.");
      }
    });
  };

  return (
    <li className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-ink truncate">
          {job.title}
          {job.locationLabel && (
            <span className="ml-2 font-normal text-slate-meta">
              · {job.locationLabel}
            </span>
          )}
        </p>
        {locked ? (
          <span className="inline-flex items-center gap-1 mt-0.5 text-[11px] text-slate-meta">
            <Lock className="h-3 w-3" />
            Excluded —{" "}
            {job.excludedReason === "confidential"
              ? "confidential"
              : "internal only"}
          </span>
        ) : error ? (
          <span className="mt-0.5 text-[11px] text-danger">{error}</span>
        ) : (
          <span className="mt-0.5 text-[11px] text-slate-meta">
            {enabled ? "Distributed" : "Not distributed"}
          </span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={locked ? false : enabled}
        aria-label={`Distribute ${job.title}`}
        onClick={onToggle}
        disabled={locked || pending}
        className={`relative h-5 w-9 rounded-full transition shrink-0 ${
          locked
            ? "bg-slate-200 cursor-not-allowed opacity-60"
            : enabled
              ? "bg-heritage cursor-pointer"
              : "bg-slate-300 cursor-pointer"
        }`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-card transition ${
            enabled && !locked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
    </li>
  );
}
