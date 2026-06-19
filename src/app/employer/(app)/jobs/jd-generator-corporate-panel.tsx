"use client";

/**
 * Phase 5G.d — Corporate AI Job Description generator panel.
 *
 * Parallel to jd-generator-panel.tsx (the dental generator panel), surfaced
 * inside the CORPORATE job wizard's Description step
 * (/employer/jobs/new/corporate). Emits the same structured JD output
 * (title, summary, responsibilities, qualifications, whatWeOffer) and
 * exposes the SAME callback contract as the dental panel — onApplyTitle,
 * onApplyDescription, onApplyAll — so the wizard wiring is drop-in.
 *
 * Differences from the dental panel:
 *   • Props carry corporateFunction / authorityLevel / workMode instead
 *     of roleCategory + roleLabel. The "Role" box shows the corporate
 *     function label.
 *   • Template chips come from corporate-templates.ts (keyed by function).
 *   • The accent is the slate-blue corporate accent (#3D5266) instead of
 *     heritage-green — matches the rest of the corporate wizard surface.
 *   • Calls generateCorporateJobDescription.
 *
 * The component is presentational + locally-stateful. The LLM call lives
 * in jd-generator-corporate-action.ts.
 */

import { useState, useTransition } from "react";
import { Sparkles, RefreshCcw, Check, Wand2 } from "lucide-react";
import { generateCorporateJobDescription } from "./jd-generator-corporate-action";
// JdGeneratorOutput comes straight from the dental action — never re-exported
// through a "use server" module (that ReferenceErrors at request time).
import type { JdGeneratorOutput } from "./jd-generator-action";
import { getCorporateFunction } from "@/lib/corporate/functions";
import {
  AUTHORITY_LEVEL_LABELS,
  WORK_MODE_LABELS,
  type AuthorityLevel,
  type WorkMode,
} from "@/lib/corporate/job-fields";
import {
  corporateTemplatesForFunction,
  type JdTemplate,
} from "@/lib/jd-templates/corporate-templates";

/** Slate-blue corporate accent — the corporate wizard's analogue to heritage-green. */
const CORP_ACCENT = "#3D5266";

interface JdGeneratorCorporatePanelProps {
  /** A valid CorporateFunction slug (see src/lib/corporate/functions.ts). */
  corporateFunction: string;
  /** A valid AuthorityLevel value (see src/lib/corporate/job-fields.ts). */
  authorityLevel: string;
  /** A valid WorkMode value (see src/lib/corporate/job-fields.ts). */
  workMode: string;
  /**
   * dso_locations.id values currently selected on the wizard. Corporate
   * jobs are often anchor-optional (0 locations) — the action resolves
   * affiliation masking via corporate_affiliation_policy in that case.
   */
  locationIds?: string[];
  /**
   * Day 24 — comp + role context, collected on the (now-earlier) Compensation
   * step so the AI can ground the draft in this job's actual pay/role data.
   */
  compMin?: number | null;
  compMax?: number | null;
  compPeriod?: string;
  benefits?: string[];
  reportsTo?: string;
  educationRequirement?: string;
  industryExperience?: string;
  minYears?: number | null;
  maxYears?: number | null;
  travelExpectation?: string;
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

export function JdGeneratorCorporatePanel({
  corporateFunction,
  authorityLevel,
  workMode,
  locationIds,
  compMin,
  compMax,
  compPeriod,
  benefits,
  reportsTo,
  educationRequirement,
  industryExperience,
  minYears,
  maxYears,
  travelExpectation,
  onApplyTitle,
  onApplyDescription,
  onApplyAll,
}: JdGeneratorCorporatePanelProps) {
  const [brief, setBrief] = useState("");
  const [tone, setTone] = useState<Tone>("professional");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<JdGeneratorOutput | null>(null);
  const [usage, setUsage] = useState<{
    cost_usd: number;
    elapsed_ms: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appliedFlash, setAppliedFlash] = useState<
    "title" | "description" | "all" | null
  >(null);

  // Resolve display labels for the three corporate inputs.
  const functionLabel =
    getCorporateFunction(corporateFunction)?.label ?? corporateFunction;
  const authorityLabel =
    AUTHORITY_LEVEL_LABELS[authorityLevel as AuthorityLevel] ?? authorityLevel;
  const workModeLabel =
    WORK_MODE_LABELS[workMode as WorkMode] ?? workMode;

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
      const res = await generateCorporateJobDescription({
        corporateFunction,
        authorityLevel: authorityLevel as AuthorityLevel,
        workMode: workMode as WorkMode,
        brief,
        tone,
        locationIds,
        compMin: compMin ?? null,
        compMax: compMax ?? null,
        compPeriod,
        benefits,
        reportsTo,
        educationRequirement,
        industryExperience,
        minYears: minYears ?? null,
        maxYears: maxYears ?? null,
        travelExpectation,
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
      // into the wizard fields; no separate "Apply all" step required.
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
      className="border p-5 sm:p-6"
      style={{
        borderColor: `${CORP_ACCENT}66`,
        backgroundColor: `${CORP_ACCENT}0A`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-8 w-8 items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${CORP_ACCENT}26`, color: CORP_ACCENT }}
        >
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="text-[10px] font-bold tracking-[2.5px] uppercase"
            style={{ color: CORP_ACCENT }}
          >
            Draft with AI
          </div>
          <h3 className="mt-0.5 text-[15px] font-bold text-ink">
            Get a starting draft in seconds.
          </h3>
          <p className="mt-1 text-[13px] text-slate-meta leading-relaxed">
            Available on every paid tier. Drop a few notes about this
            corporate role and we&apos;ll write a clean structured posting
            tuned for DSO-wide hiring. You stay in control — apply each
            section individually or accept it all.
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-[1fr,auto] gap-3">
        <div>
          <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
            Corporate role
          </label>
          <div className="flex min-h-[44px] items-center px-4 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px]">
            <span>
              {functionLabel}
              {/* authority/work-mode are picked across later steps — only
                  show the parts the operator has actually set, no dangling
                  separators. */}
              {[authorityLevel ? authorityLabel : null, workMode ? workModeLabel : null]
                .filter(Boolean)
                .map((part) => (
                  <span key={part as string} className="text-slate-meta">
                    {" "}
                    · {part}
                  </span>
                ))}
            </span>
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
            className="h-[44px] px-4 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none transition-colors disabled:opacity-60"
            style={{ outlineColor: CORP_ACCENT }}
          >
            {TONE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Corporate template chips, filtered to the selected corporate
          function. Clicking one prefills the brief + seeds the title via
          onApplyTitle. The operator still hits Generate to invoke Haiku. */}
      {(() => {
        const templates: JdTemplate[] =
          corporateTemplatesForFunction(corporateFunction);
        if (templates.length === 0) return null;
        return (
          <div className="mt-4">
            <label className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2">
              Start from a template{" "}
              <span className="text-slate-meta font-normal normal-case tracking-[0.3px]">
                (optional)
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setBrief(t.brief);
                    // Seed the title too so Apply All has a starting value.
                    onApplyTitle(t.title_seed);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold border border-[var(--rule-strong)] bg-card text-ink transition-colors disabled:opacity-50 hover:bg-[var(--corp-tint)]"
                  style={
                    {
                      "--corp-tint": `${CORP_ACCENT}10`,
                    } as React.CSSProperties
                  }
                >
                  <Wand2
                    className="h-3 w-3"
                    style={{ color: CORP_ACCENT }}
                    aria-hidden
                  />
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
          placeholder="e.g. owns FP&A and capital structure, 10+ years finance leadership, PE-backed DSO scaling through acquisition, comp includes equity"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          disabled={pending}
          className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none transition-colors resize-vertical disabled:opacity-60"
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
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-[10px] font-bold tracking-[2px] uppercase hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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
            {/* Cost intentionally hidden client-side (Cam 2026-05-13).
                Server-side ai_usage_events still logs cost. */}
            Generated in {(usage.elapsed_ms / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      {error && (
        <div className="mt-4 bg-danger-bg border-l-4 border-danger p-4 flex items-start justify-between gap-3">
          <p className="text-[14px] text-danger">
            AI generation failed. Try again or simplify the brief.
            <span className="block mt-1 text-[12px] text-danger/80">
              {error}
            </span>
          </p>
          <button
            type="button"
            onClick={run}
            disabled={pending}
            className="text-[10px] font-bold tracking-[1.5px] uppercase text-danger hover:text-danger/80 transition-colors flex-shrink-0"
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
    <div className="mt-5 border border-[var(--rule-strong)] bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--rule)]">
        <div
          className="text-[10px] font-bold tracking-[2px] uppercase"
          style={{ color: CORP_ACCENT }}
        >
          AI draft · applied to your editor below
        </div>
        <button
          type="button"
          onClick={onApplyAll}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-primary-foreground text-[10px] font-bold tracking-[1.5px] uppercase transition-colors"
          style={{ backgroundColor: CORP_ACCENT }}
        >
          <Check className="h-3 w-3" />
          {appliedFlash === "all" ? "Applied ✓" : "Re-apply all"}
        </button>
      </div>

      {appliedFlash && (
        <div
          className="mt-3 px-3 py-2 border-l-2 text-[12.5px]"
          style={{
            backgroundColor: `${CORP_ACCENT}1A`,
            borderColor: CORP_ACCENT,
            color: CORP_ACCENT,
          }}
        >
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
          className="text-[10px] font-bold tracking-[1.5px] uppercase transition-colors hover:text-ink"
          style={{ color: CORP_ACCENT }}
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

/* ───── Build Tiptap-compatible HTML from the structured JD ─────
   Copied verbatim from jd-generator-panel.tsx — buildDescriptionHtml is
   a module-private pure helper there, not exported, so it can't be
   imported. Kept byte-identical so both panels emit the same HTML. */

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
