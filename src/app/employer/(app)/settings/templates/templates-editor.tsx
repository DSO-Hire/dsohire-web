"use client";

/**
 * TemplatesEditor — client orchestrator for /employer/settings/templates
 * (Phase 4.5.f).
 *
 * Renders one card per template (3 total). Each card is collapsed by
 * default showing the current state (custom or default + last-edited
 * timestamp). Click "Edit" to expand inline:
 *
 *   ┌─────────────────────────────────────────┐
 *   │  Subject                                │
 *   │  [text input with mergefield support]   │
 *   │  Body                                   │
 *   │  [TemplateBodyEditor with toolbar]      │
 *   │  Reference panel (chips)                │
 *   │  Preview pane (rendered with samples)   │
 *   │  [Revert to default] [Save]             │
 *   └─────────────────────────────────────────┘
 *
 * The Save action calls upsertTemplate(); Revert calls revertTemplate()
 * which deletes the row so the dispatcher falls back to the default.
 */

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { TemplateBodyEditor } from "./template-body-editor";
import { upsertTemplate, revertTemplate } from "./actions";
import {
  type PredefinedTemplateKind,
  type TemplateMeta,
  type MergefieldGroup,
} from "@/lib/email/templates/manifest";
import {
  renderTemplate,
  buildSampleContext,
} from "@/lib/email/templates/renderer";
import { sanitizeTiptapHtml } from "@/lib/html/sanitize-tiptap";
import type { TemplateInitial } from "./templates-data";

interface TemplatesEditorProps {
  initial: TemplateInitial[];
  canEdit: boolean;
  templateMeta: Record<PredefinedTemplateKind, TemplateMeta>;
}

export function TemplatesEditor({
  initial,
  canEdit,
  templateMeta,
}: TemplatesEditorProps) {
  return (
    <div className="space-y-5">
      {initial.map((tpl) => (
        <TemplateCard
          key={tpl.kind}
          template={tpl}
          meta={templateMeta[tpl.kind]}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Per-template card
 * ────────────────────────────────────────────────────────── */

function TemplateCard({
  template,
  meta,
  canEdit,
}: {
  template: TemplateInitial;
  meta: TemplateMeta;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(template.subject);
  const [bodyHtml, setBodyHtml] = useState(template.body_html);
  const [snapshot, setSnapshot] = useState({
    subject: template.subject,
    bodyHtml: template.body_html,
  });
  const [isCustom, setIsCustom] = useState(template.isCustom);
  const [updatedAt, setUpdatedAt] = useState<string | null>(template.updatedAt);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    subject !== snapshot.subject || bodyHtml !== snapshot.bodyHtml;

  const onSave = () => {
    setError(null);
    setSaved(false);
    if (!subject.trim()) {
      setError("Subject is required.");
      return;
    }
    if (!bodyHtml.trim()) {
      setError("Body is required.");
      return;
    }
    startTransition(async () => {
      const result = await upsertTemplate({
        kind: template.kind,
        subject,
        body_html: bodyHtml,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSnapshot({ subject, bodyHtml });
      setIsCustom(true);
      setUpdatedAt(new Date().toISOString());
      setSaved(true);
    });
  };

  const onRevert = () => {
    if (
      !confirm(
        "Revert to the system default? Your customized subject and body will be removed."
      )
    ) {
      return;
    }
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await revertTemplate({ kind: template.kind });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The action revalidates — we can also reset client state from props
      // on next render. Here we optimistically reset to the default values
      // the editor was originally seeded with.
      setIsCustom(false);
      setUpdatedAt(null);
      setSaved(true);
    });
  };

  return (
    <section className="border border-[var(--rule)] bg-white">
      <header
        className="flex items-start justify-between gap-4 p-5 sm:p-6 cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep">
              {meta.label}
            </span>
            <StatusPill isCustom={isCustom} updatedAt={updatedAt} />
            {!meta.dispatchWired && (
              <span
                className="text-[10px] tracking-[1px] uppercase text-slate-meta inline-flex items-center gap-1 border border-[var(--rule)] px-1.5 py-0.5 rounded"
                title="Saved here, but the dispatch path that sends this email isn't wired yet — it will be in a follow-up."
              >
                Not auto-sending yet
              </span>
            )}
          </div>
          <h2 className="font-display text-lg font-bold text-ink leading-tight">
            {meta.description}
          </h2>
          <p className="mt-2 text-[12px] text-slate-meta truncate">
            <span className="font-semibold">Subject:</span> {snapshot.subject}
          </p>
        </div>
        <button
          type="button"
          aria-label={open ? "Collapse" : "Expand"}
          className="shrink-0 mt-1 rounded p-1 text-slate-meta hover:bg-cream/60 hover:text-ink"
        >
          {open ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </button>
      </header>

      {open && (
        <div className="border-t border-[var(--rule)] p-5 sm:p-6 space-y-6">
          {/* Subject */}
          <div>
            <label
              htmlFor={`subject-${template.kind}`}
              className="mb-1.5 block text-[12px] font-semibold text-ink"
            >
              Subject
            </label>
            <input
              id={`subject-${template.kind}`}
              type="text"
              value={subject}
              disabled={!canEdit}
              onChange={(e) => {
                setSaved(false);
                setError(null);
                setSubject(e.target.value);
              }}
              maxLength={200}
              className="w-full rounded border border-[var(--rule-strong)] bg-white px-3 py-2 text-sm text-ink focus:border-heritage focus:outline-none disabled:bg-cream/40 disabled:text-slate-meta font-mono"
            />
            <p className="mt-1.5 text-[11px] text-slate-meta">
              Mergefields work in the subject too — type{" "}
              <code className="font-mono">{"{{candidate.first_name}}"}</code>{" "}
              etc.
            </p>
          </div>

          {/* Body */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-ink">
              Body
            </label>
            <TemplateBodyEditor
              value={bodyHtml}
              onChange={(html) => {
                setSaved(false);
                setError(null);
                setBodyHtml(html);
              }}
              groups={meta.groups}
              disabled={!canEdit}
            />
          </div>

          {/* Reference panel */}
          <ReferencePanel groups={meta.groups} />

          {/* Live preview */}
          <PreviewPane
            kind={template.kind}
            subject={subject}
            bodyHtml={bodyHtml}
          />

          {/* Save bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--rule)] pt-4">
            <div className="flex-1 min-w-0 text-sm">
              {error && (
                <p className="inline-flex items-center gap-1.5 text-red-700">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  {error}
                </p>
              )}
              {!error && saved && (
                <p className="inline-flex items-center gap-1.5 text-heritage-deep">
                  <CheckCircle2 className="size-3.5" />
                  <span className="font-semibold">Saved.</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isCustom && canEdit && (
                <button
                  type="button"
                  onClick={onRevert}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--rule-strong)] bg-white px-3 py-2 text-[12px] font-semibold text-slate-body hover:bg-cream/60 hover:text-ink disabled:opacity-40"
                >
                  <RotateCcw className="size-3.5" />
                  Revert to default
                </button>
              )}
              <button
                type="button"
                onClick={onSave}
                disabled={!dirty || pending || !canEdit}
                className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-ivory transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save template"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Status pill (Custom / Default + last-edited)
 * ────────────────────────────────────────────────────────── */

function StatusPill({
  isCustom,
  updatedAt,
}: {
  isCustom: boolean;
  updatedAt: string | null;
}) {
  if (!isCustom) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--rule)] bg-cream/40 px-2 py-0.5 text-[10px] font-semibold tracking-[0.5px] uppercase text-slate-meta">
        System default
      </span>
    );
  }
  const ts = updatedAt ? new Date(updatedAt) : null;
  const tsLabel = ts ? formatRelativeTime(ts) : null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-heritage-deep/10 px-2 py-0.5 text-[10px] font-semibold tracking-[0.5px] uppercase text-heritage-deep">
      <Sparkles className="size-3" />
      Custom{tsLabel ? ` · ${tsLabel}` : ""}
    </span>
  );
}

function formatRelativeTime(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ─────────────────────────────────────────────────────────────
 * Reference panel (clickable variable list under the editor)
 * ────────────────────────────────────────────────────────── */

function ReferencePanel({ groups }: { groups: readonly MergefieldGroup[] }) {
  return (
    <details className="border border-[var(--rule)] bg-cream/30 px-4 py-3">
      <summary className="cursor-pointer text-[12px] font-semibold text-ink">
        Available mergefields
      </summary>
      <div className="mt-3 space-y-3">
        {groups.map((group) => (
          <div key={group.id}>
            <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep mb-1.5">
              {group.label}
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {group.fields.map((f) => (
                <div
                  key={f.token}
                  className="flex items-baseline justify-between gap-2 px-2 py-1 rounded hover:bg-white/60"
                >
                  <code className="font-mono text-[11px] text-ink">
                    {`{{${f.token}}}`}
                  </code>
                  <span className="text-[11px] text-slate-meta truncate">
                    {f.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Live preview pane — renders mergefields against sample context
 * ────────────────────────────────────────────────────────── */

function PreviewPane({
  kind,
  subject,
  bodyHtml,
}: {
  kind: PredefinedTemplateKind;
  subject: string;
  bodyHtml: string;
}) {
  const sample = useMemo(() => buildSampleContext(kind), [kind]);

  const subjectResult = useMemo(
    () =>
      renderTemplate({
        kind,
        template: subject,
        context: sample,
        mode: "subject",
      }),
    [kind, subject, sample]
  );
  const bodyResult = useMemo(
    () =>
      renderTemplate({
        kind,
        template: bodyHtml,
        context: sample,
        mode: "preview",
      }),
    [kind, bodyHtml, sample]
  );

  // Sanitize the rendered preview (mergefield-renderer's preview mode
  // wraps unknown tokens in <mark>, which is whitelisted? actually no —
  // the sanitizer drops <mark>. So sanitize first, then accept that
  // unknown-token warnings only show in the editor's diagnostics list,
  // not the preview pane itself).
  const cleanBody = useMemo(
    () => sanitizeTiptapHtml(bodyResult.output),
    [bodyResult.output]
  );

  const hasIssues =
    subjectResult.unknownTokens.length > 0 ||
    bodyResult.unknownTokens.length > 0;
  const allUnknown = Array.from(
    new Set([...subjectResult.unknownTokens, ...bodyResult.unknownTokens])
  );

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-semibold text-ink">Preview</span>
        <span className="text-[11px] text-slate-meta">
          Rendered with sample data
        </span>
      </div>

      {hasIssues && (
        <div className="mb-3 border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          <div className="font-semibold inline-flex items-center gap-1.5 mb-1">
            <AlertTriangle className="size-3.5" />
            Unknown mergefields
          </div>
          <p className="mb-1">These tokens won&apos;t resolve at send time — typo or wrong template?</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {allUnknown.map((t) => (
              <li key={t}>
                <code className="font-mono">{`{{${t}}}`}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border border-[var(--rule)] bg-cream/30 overflow-hidden">
        <div className="border-b border-[var(--rule)] bg-white px-4 py-2.5">
          <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-0.5">
            Subject
          </div>
          <div className="text-[14px] font-semibold text-ink">
            {subjectResult.output || (
              <span className="text-slate-meta italic">
                (subject missing)
              </span>
            )}
          </div>
        </div>
        <div className="bg-white px-5 py-4">
          {cleanBody ? (
            <div
              className="dso-prose text-[14px] text-ink"
              dangerouslySetInnerHTML={{ __html: cleanBody }}
            />
          ) : (
            <p className="text-[13px] text-slate-meta italic">
              (body empty)
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
