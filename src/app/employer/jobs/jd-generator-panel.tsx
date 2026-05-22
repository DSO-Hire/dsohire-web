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
import { Sparkles, RefreshCcw, Check, Wand2 } from "lucide-react";
import {
  generateJobDescription,
  type JdGeneratorOutput,
} from "./jd-generator-action";
import { templatesForRole, type JdTemplate } from "@/lib/jd-templates/templates";

interface JdGeneratorPanelProps {
  roleCategory: string;
  roleLabel: string;
  /**
   * dso_locations.id values currently selected on the wizard. Used by
   * the action to determine whether to mask the DSO name in the
   * generated copy (Phase 4.5.b launch-blocker affiliation toggle).
   * If any selected location is private-affiliation, the AI uses the
   * practice name only.
   */
  locationIds?: string[];
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
  locationIds,
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
  // Cam 2026-05-07: after apply, the editor below WAS already editable —
  // but operators were missing it because the preview card stayed visible
  // and there was no signal that the description landed. Track applied
  // state + scroll to the editor so the next move (manual tweaking)
  // is obvious.
  const [appliedFlash, setAppliedFlash] = useState<
    "title" | "description" | "all" | null
  >(null);

  function flashApplied(which: "title" | "description" | "all") {
    setAppliedFlash(which);
    // Scroll the description editor into view so the operator sees that
    // their AI draft is now sitting in an editable state below.
    if (which !== "title" && typeof document !== "undefined") {
      const editor = document.querySelector(
        '[data-jd-editor-anchor="true"]'
      );
      if (editor) {
        editor.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    window.setTimeout(() => setAppliedFlash(null), 3500);
  }

  function run() {
    setError(null);
    setAppliedFlash(null);
    const startedAt = Date.now();
    startTransition(async () => {
      const res = await generateJobDescription({
        roleCategory,
        brief,
        tone,
        locationIds,
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
      // Note 2 (Dave's call, 2026-05-22) — auto-apply the draft straight
      // into the wizard fields; no separate "Apply all" step required. The
      // preview below stays as a read-only record + granular re-apply.
      onApplyAll({
        title: res.jd.title,
        descriptionHtml: buildDescriptionHtml(res.jd),
      });
      setAppliedFlash("all");
      window.setTimeout(() => setAppliedFlash(null), 3500);
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
            and we&apos;ll write a clean structured posting. The draft drops
            straight into your editor below — tweak freely, re-apply any
            section, or regenerate anytime.
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

      {/* E1.3 — Template chips filtered to the selected role_category.
          Clicking one prefills the brief + (optionally) seeds the title
          via onApplyTitle. The operator still hits Generate to actually
          invoke Haiku — templates are a starting point, not a finisher. */}
      {(() => {
        const templates: JdTemplate[] = templatesForRole(roleCategory);
        if (templates.length === 0) return null;
        return (
          <div className="mt-4">
            <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
              Start from a template <span className="text-slate-meta font-normal normal-case tracking-[0.3px]">(optional)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setBrief(t.brief);
                    // Seed the title too so Apply All has a starting
                    // value. The AI will overwrite during Generate, but
                    // if the operator skips Generate they still have the
                    // template's title sitting in the wizard.
                    onApplyTitle(t.title_seed);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold border border-[var(--rule-strong)] bg-white text-ink hover:border-heritage hover:bg-heritage/[0.06] transition-colors disabled:opacity-50"
                >
                  <Wand2 className="h-3 w-3 text-heritage-deep" aria-hidden />
                  {t.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-meta leading-relaxed">
              Drops a starter brief + title into the fields below. Edit
              freely, then hit Generate to draft the full description.
            </p>
          </div>
        );
      })()}

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
            {/* Cost intentionally hidden client-side (Cam 2026-05-13): showing
                "~$0.0027" undercuts the premium positioning of the AI feature.
                Server-side ai_usage_events still logs cost for the usage-cap
                policy and overage billing math. */}
            Generated in {(usage.elapsed_ms / 1000).toFixed(1)}s
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
          appliedFlash={appliedFlash}
          onApplyTitle={() => {
            onApplyTitle(result.title);
            flashApplied("title");
          }}
          onApplyDescription={() => {
            onApplyDescription(buildDescriptionHtml(result));
            flashApplied("description");
          }}
          onApplyAll={() => {
            onApplyAll({
              title: result.title,
              descriptionHtml: buildDescriptionHtml(result),
            });
            flashApplied("all");
          }}
        />
      )}
    </section>
  );
}

/* ───── Result preview ───── */

function ResultCard({
  jd,
  appliedFlash,
  onApplyTitle,
  onApplyDescription,
  onApplyAll,
}: {
  jd: JdGeneratorOutput;
  appliedFlash: "title" | "description" | "all" | null;
  onApplyTitle: () => void;
  onApplyDescription: () => void;
  onApplyAll: () => void;
}) {
  return (
    <div className="mt-5 border border-[var(--rule-strong)] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--rule)]">
        <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep">
          AI draft · applied to your editor below
        </div>
        <button
          type="button"
          onClick={onApplyAll}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-heritage text-ivory text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-heritage-deep transition-colors"
        >
          <Check className="h-3 w-3" />
          {appliedFlash === "all" ? "Applied ✓" : "Re-apply all"}
        </button>
      </div>

      {/* Cam 2026-05-07 fix: clear post-apply signal so operators don't
          think the AI output got "locked." Banner appears for ~3.5s
          after any apply action and links the eye to the editor below. */}
      {appliedFlash && (
        <div className="mt-3 px-3 py-2 bg-heritage/10 border-l-2 border-heritage text-[12.5px] text-heritage-deep">
          ✓ Applied to the editor below. Scroll down to tweak the wording —
          everything stays editable.
        </div>
      )}

      <Section
        label="Title"
        actionLabel={appliedFlash === "title" ? "Applied ✓" : "Use this title"}
        onUse={onApplyTitle}
      >
        <p className="text-[15px] font-bold text-ink">{jd.title}</p>
      </Section>

      <Section
        label="Description (summary + lists)"
        actionLabel={
          appliedFlash === "description" || appliedFlash === "all"
            ? "Applied ✓"
            : "Use this description"
        }
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
      // The AI's JSON strings are meant to be plain text, but Haiku
      // sometimes emits HTML entities (e.g. "M&amp;A"). Decode first so we
      // don't double-encode into "M&amp;amp;A" — which renders as a literal
      // "M&amp;A" on the page. Decode-then-escape converges both plain text
      // and already-encoded text to one correct level of escaping.
      .replace(/&(amp|#38);/g, "&")
      .replace(/&(lt|#60);/g, "<")
      .replace(/&(gt|#62);/g, ">")
      .replace(/&(quot|#34);/g, '"')
      .replace(/&(apos|#39);/g, "'")
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
