"use client";

/**
 * Phase 5D — AI Job Description generator panel.
 *
 * Surfaced inside the job posting wizard's Description step. Emits structured
 * JD output (title, summary, responsibilities, qualifications, whatWeOffer)
 * that the operator can fold into existing wizard fields with per-section
 * "Use this" buttons or an "Apply all" master button.
 *
 * The component is presentational + locally-stateful. The actual LLM call
 * lives in jd-generator-action.ts. Cost meta surfaced under each result so
 * employers see the usage meter from day one (matches the locked AI cap
 * policy: build the meter into every AI feature).
 */

import { useState, useTransition } from "react";
import { Sparkles, RefreshCcw, Check } from "lucide-react";
import {
  generateJobDescription,
  type JdGeneratorOutput,
} from "./jd-generator-action";

interface JdGeneratorPanelProps {
  roleCategory: string;
  roleLabel: string;
  /** Called when the operator clicks "Use this" for the title. */
  onApplyTitle: (title: string) => void;
  /** Called when the operator applies any prose body — Tiptap HTML. */
  onApplyDescription: (html: string) => void;
  /** Called when the operator applies "Apply all" — returns both. */
  onApplyAll: (args: { title: string; descriptionHtml: string }) => void;
}

type Tone = "professional" | "friendly" | "concise";

const TONE_OPTIONS: Array<{ value: Tone; label: string }> = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "concise", label: "Concise" },
];

export function JdGeneratorPanel({
  roleCategory,
  roleLabel,
  onApplyTitle,
  onApplyDescription,
  onApplyAll,
}: JdGeneratorPanelProps) {
  const [brief, setBrief] = useState("");
  const [tone, setTone] = useState<Tone>("professional");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<JdGeneratorOutput | null>(null);
  const [usage, setUsage] = useState<{
    cost_usd: number;
    elapsed_ms: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    const startedAt = Date.now();
    startTransition(async () => {
      const res = await generateJobDescription({
        roleCategory,
        brief,
        tone,
      });
      const elapsed = Date.now() - startedAt;
      if (!res.ok) {
        setError(res.error);
        setResult(null);
        setUsage(null);
        return;
      }
      setResult(res.jd);
      setUsage({ cost_usd: res.usage.cost_usd, elapsed_ms: elapsed });
    });
  }

  return (
    <section
      aria-label="Draft with AI"
      className="border border-heritage/40 bg-heritage/[0.04] p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center bg-heritage/15 text-heritage-deep flex-shrink-0">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
            Draft with AI
          </div>
          <h3 className="mt-0.5 text-[15px] font-bold text-ink">
            Get a starting draft in seconds.
          </h3>
          <p className="mt-1 text-[13px] text-slate-meta leading-relaxed">
            Available on every paid tier. Drop a few notes about the role
            and we&apos;ll write a clean structured posting. You stay in
            control — apply each section individually or accept it all.
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-[1fr,auto] gap-3">
        <div>
          <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
            Role
          </label>
          <div className="flex h-[44px] items-center px-4 bg-cream border border-[var(--rule-strong)] text-ink text-[14px]">
            {roleLabel}
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
            Tone
          </label>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as Tone)}
            disabled={pending}
            className="h-[44px] px-4 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors disabled:opacity-60"
          >
            {TONE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
          Brief (optional)
        </label>
        <textarea
          rows={3}
          maxLength={800}
          placeholder="e.g. 5+ years GP experience, implant focus, weekend coverage available, mentorship-friendly"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          disabled={pending}
          className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors resize-vertical disabled:opacity-60"
        />
        <div className="mt-1 text-[10px] text-slate-meta tracking-[0.5px]">
          {brief.length} / 800
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink text-ivory text-[10px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending ? (
            <>
              <Spinner />
              Generating…
            </>
          ) : result ? (
            <>
              <RefreshCcw className="h-3.5 w-3.5" />
              Regenerate
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              Generate
            </>
          )}
        </button>
        {usage && !pending && (
          <span className="text-[10px] text-slate-meta tracking-[0.5px]">
            Generated in {(usage.elapsed_ms / 1000).toFixed(1)}s · ~$
            {usage.cost_usd.toFixed(4)}
          </span>
        )}
      </div>

      {error && (
        <div className="mt-4 bg-red-50 border-l-4 border-red-500 p-4 flex items-start justify-between gap-3">
          <p className="text-[14px] text-red-900">
            AI generation failed. Try again or simplify the brief.
            <span className="block mt-1 text-[12px] text-red-800/80">
              {error}
            </span>
          </p>
          <button
            type="button"
            onClick={run}
            disabled={pending}
            className="text-[10px] font-bold tracking-[1.5px] uppercase text-red-900 hover:text-red-700 transition-colors flex-shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {result && !pending && (
        <ResultCard
          jd={result}
          onApplyTitle={() => onApplyTitle(result.title)}
          onApplyDescription={() =>
            onApplyDescription(buildDescriptionHtml(result))
          }
          onApplyAll={() =>
            onApplyAll({
              title: result.title,
              descriptionHtml: buildDescriptionHtml(result),
            })
          }
        />
      )}
    </section>
  );
}

/* ───── Result preview ───── */

function ResultCard({
  jd,
  onApplyTitle,
  onApplyDescription,
  onApplyAll,
}: {
  jd: JdGeneratorOutput;
  onApplyTitle: () => void;
  onApplyDescription: () => void;
  onApplyAll: () => void;
}) {
  return (
    <div className="mt-5 border border-[var(--rule-strong)] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--rule)]">
        <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep">
          AI draft preview
        </div>
        <button
          type="button"
          onClick={onApplyAll}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-heritage text-ivory text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-heritage-deep transition-colors"
        >
          <Check className="h-3 w-3" />
          Apply all
        </button>
      </div>

      <Section
        label="Title"
        actionLabel="Use this title"
        onUse={onApplyTitle}
      >
        <p className="text-[15px] font-bold text-ink">{jd.title}</p>
      </Section>

      <Section
        label="Description (summary + lists)"
        actionLabel="Use this description"
        onUse={onApplyDescription}
      >
        <div className="space-y-3 text-[14px] text-ink leading-relaxed">
          <p className="whitespace-pre-wrap">{jd.summary}</p>

          <SubSection label="Responsibilities" items={jd.responsibilities} />
          <SubSection label="Qualifications" items={jd.qualifications} />
          <SubSection label="What we offer" items={jd.whatWeOffer} />
        </div>
      </Section>
    </div>
  );
}

function Section({
  label,
  actionLabel,
  onUse,
  children,
}: {
  label: string;
  actionLabel: string;
  onUse: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 first:mt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-bold tracking-[2px] uppercase text-slate-body">
          {label}
        </div>
        <button
          type="button"
          onClick={onUse}
          className="text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink transition-colors"
        >
          {actionLabel}
        </button>
      </div>
      {children}
    </div>
  );
}

function SubSection({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="text-[12px] font-bold uppercase tracking-[1.5px] text-slate-meta mb-1">
        {label}
      </div>
      <ul className="list-disc pl-5 space-y-1">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
    />
  );
}

/* ───── Build Tiptap-compatible HTML from the structured JD ───── */

function buildDescriptionHtml(jd: JdGeneratorOutput): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const summaryParas = jd.summary
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escape(p)}</p>`)
    .join("");

  const list = (items: string[]) =>
    `<ul>${items.map((i) => `<li>${escape(i)}</li>`).join("")}</ul>`;

  return [
    summaryParas,
    `<h2>Responsibilities</h2>`,
    list(jd.responsibilities),
    `<h2>Qualifications</h2>`,
    list(jd.qualifications),
    `<h2>What we offer</h2>`,
    list(jd.whatWeOffer),
  ].join("");
}
