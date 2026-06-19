"use client";

/**
 * CustomTemplatesEditor — client orchestrator for the "Custom templates"
 * (Growth+) section of /employer/settings/templates.
 *
 * Layout:
 *   ┌─────────────────────────────────────────┐
 *   │  [+ New custom template]                │
 *   │  ─────────────────────────────────────  │
 *   │  Card: <name>                           │
 *   │    [Edit] [Archive]                     │
 *   │  Card: <name>                           │
 *   │    [Edit] [Archive]                     │
 *   └─────────────────────────────────────────┘
 *
 * Expanding a card opens an inline editor mirroring TemplatesEditor's
 * predefined surface (name + description + subject + Tiptap body + merge-field
 * dropdown + reference panel + live preview). "New custom template" opens
 * the same editor in create mode against the shared custom mergefield groups.
 *
 * Render guarded by tier check in the parent server component — this
 * component never appears for Solo. Server actions are defense-in-depth.
 */

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Sparkles,
} from "lucide-react";
import { TemplateBodyEditor } from "./template-body-editor";
import {
  archiveCustomTemplate,
  createCustomTemplate,
  updateCustomTemplate,
} from "./actions";
import {
  CUSTOM_TEMPLATE_GROUPS,
  type MergefieldGroup,
} from "@/lib/email/templates/manifest";
import {
  buildSampleContext,
  renderTemplate,
} from "@/lib/email/templates/renderer";
import { sanitizeTiptapHtml } from "@/lib/html/sanitize-tiptap";

export interface CustomTemplateInitial {
  id: string;
  kind: string;
  name: string;
  description: string;
  subject: string;
  body_html: string;
  updatedAt: string;
}

interface Props {
  initial: CustomTemplateInitial[];
  canEdit: boolean;
}

const EMPTY_TEMPLATE = {
  name: "",
  description: "",
  subject: "",
  body_html: "<p></p>",
};

export function CustomTemplatesEditor({ initial, canEdit }: Props) {
  const [templates, setTemplates] = useState<CustomTemplateInitial[]>(initial);
  const [creating, setCreating] = useState(false);

  function handleCreated(row: CustomTemplateInitial) {
    setTemplates((prev) =>
      [...prev, row].sort((a, b) => a.name.localeCompare(b.name))
    );
    setCreating(false);
  }

  function handleUpdated(row: CustomTemplateInitial) {
    setTemplates((prev) =>
      prev
        .map((t) => (t.id === row.id ? row : t))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  function handleArchived(id: string) {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="space-y-5">
      {/* "New custom template" CTA / inline create form */}
      {!creating ? (
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={!canEdit}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="size-3.5" />
          New custom template
        </button>
      ) : (
        <CustomTemplateForm
          mode="create"
          initial={{ id: "", kind: "", ...EMPTY_TEMPLATE, updatedAt: "" }}
          canEdit={canEdit}
          onSaved={handleCreated}
          onCancel={() => setCreating(false)}
        />
      )}

      {templates.length === 0 && !creating ? (
        <div className="border border-dashed border-[var(--rule-strong)] bg-cream/30 px-5 py-8 text-center">
          <p className="text-[14px] text-slate-body leading-relaxed">
            No custom templates yet. Use the button above to create your first
            one — interview prep, offer details, follow-ups, whatever you
            send often.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((tpl) => (
            <CustomTemplateCard
              key={tpl.id}
              template={tpl}
              canEdit={canEdit}
              onSaved={handleUpdated}
              onArchived={handleArchived}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Per-template card (collapse/expand)
 * ────────────────────────────────────────────────────────── */

function CustomTemplateCard({
  template,
  canEdit,
  onSaved,
  onArchived,
}: {
  template: CustomTemplateInitial;
  canEdit: boolean;
  onSaved: (row: CustomTemplateInitial) => void;
  onArchived: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [archivePending, setArchivePending] = useTransition();

  function handleArchive(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Archive "${template.name}"? It won't be available to send anymore but past sends are preserved.`)) return;
    setArchivePending(async () => {
      const result = await archiveCustomTemplate({ id: template.id });
      if (!result.ok) {
        alert(result.error);
        return;
      }
      onArchived(template.id);
    });
  }

  return (
    <section className="border border-[var(--rule)] bg-card">
      <header
        className="flex items-start justify-between gap-4 p-5 cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-base font-bold text-ink leading-tight">
            {template.name}
          </h3>
          {template.description && (
            <p className="mt-1 text-[12px] text-slate-meta line-clamp-2">
              {template.description}
            </p>
          )}
          <p className="mt-2 text-[12px] text-slate-meta truncate">
            <span className="font-semibold">Subject:</span> {template.subject}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {canEdit && (
            <button
              type="button"
              onClick={handleArchive}
              disabled={archivePending}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--rule-strong)] bg-card px-2.5 py-1.5 text-[11px] font-semibold text-slate-body hover:bg-cream/60 hover:text-ink disabled:opacity-40"
              title="Archive"
            >
              {archivePending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Archive className="size-3.5" />
              )}
            </button>
          )}
          <button
            type="button"
            aria-label={open ? "Collapse" : "Expand"}
            className="rounded p-1 text-slate-meta hover:bg-cream/60 hover:text-ink"
          >
            {open ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </button>
        </div>
      </header>

      {open && (
        <div className="border-t border-[var(--rule)] p-5">
          <CustomTemplateForm
            mode="edit"
            initial={template}
            canEdit={canEdit}
            onSaved={onSaved}
            onCancel={() => setOpen(false)}
          />
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Form — used in both create + edit modes
 * ────────────────────────────────────────────────────────── */

function CustomTemplateForm({
  mode,
  initial,
  canEdit,
  onSaved,
  onCancel,
}: {
  mode: "create" | "edit";
  initial: CustomTemplateInitial;
  canEdit: boolean;
  onSaved: (row: CustomTemplateInitial) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [subject, setSubject] = useState(initial.subject);
  const [bodyHtml, setBodyHtml] = useState(initial.body_html);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function reset() {
    setError(null);
    setSaved(false);
  }

  function onSave() {
    reset();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!subject.trim()) {
      setError("Subject is required.");
      return;
    }
    if (!bodyHtml.trim()) {
      setError("Body is required.");
      return;
    }

    startTransition(async () => {
      if (mode === "create") {
        const result = await createCustomTemplate({
          name,
          description,
          subject,
          body_html: bodyHtml,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onSaved({
          id: result.id,
          kind: result.kind,
          name: name.trim(),
          description: description.trim(),
          subject: subject.trim(),
          body_html: bodyHtml,
          updatedAt: new Date().toISOString(),
        });
      } else {
        const result = await updateCustomTemplate({
          id: initial.id,
          name,
          description,
          subject,
          body_html: bodyHtml,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSaved(true);
        onSaved({
          ...initial,
          name: name.trim(),
          description: description.trim(),
          subject: subject.trim(),
          body_html: bodyHtml,
          updatedAt: new Date().toISOString(),
        });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Name + description (create-mode shows both prominently) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor={`name-${initial.id || "new"}`}
            className="mb-1.5 block text-[12px] font-semibold text-ink"
          >
            Template name <span className="text-danger">*</span>
          </label>
          <input
            id={`name-${initial.id || "new"}`}
            type="text"
            value={name}
            disabled={!canEdit}
            onChange={(e) => {
              reset();
              setName(e.target.value);
            }}
            maxLength={120}
            placeholder="Interview prep"
            className="w-full rounded border border-[var(--rule-strong)] bg-card px-3 py-2 text-sm text-ink focus:border-heritage focus:outline-none disabled:bg-cream/40 disabled:text-slate-meta"
          />
        </div>
        <div>
          <label
            htmlFor={`desc-${initial.id || "new"}`}
            className="mb-1.5 block text-[12px] font-semibold text-ink"
          >
            Description{" "}
            <span className="text-slate-meta font-normal">(optional)</span>
          </label>
          <input
            id={`desc-${initial.id || "new"}`}
            type="text"
            value={description}
            disabled={!canEdit}
            onChange={(e) => {
              reset();
              setDescription(e.target.value);
            }}
            maxLength={240}
            placeholder="Sent the day before an interview"
            className="w-full rounded border border-[var(--rule-strong)] bg-card px-3 py-2 text-sm text-ink focus:border-heritage focus:outline-none disabled:bg-cream/40 disabled:text-slate-meta"
          />
        </div>
      </div>

      {/* Subject */}
      <div>
        <label
          htmlFor={`subject-${initial.id || "new"}`}
          className="mb-1.5 block text-[12px] font-semibold text-ink"
        >
          Subject <span className="text-danger">*</span>
        </label>
        <input
          id={`subject-${initial.id || "new"}`}
          type="text"
          value={subject}
          disabled={!canEdit}
          onChange={(e) => {
            reset();
            setSubject(e.target.value);
          }}
          maxLength={200}
          placeholder="See you tomorrow at {{job.title}}"
          className="w-full rounded border border-[var(--rule-strong)] bg-card px-3 py-2 text-sm text-ink focus:border-heritage focus:outline-none disabled:bg-cream/40 disabled:text-slate-meta font-mono"
        />
        <p className="mt-1.5 text-[11px] text-slate-meta">
          Mergefields work in the subject too — type{" "}
          <code className="font-mono">{"{{candidate.first_name}}"}</code> etc.
        </p>
      </div>

      {/* Body */}
      <div>
        <label className="mb-1.5 block text-[12px] font-semibold text-ink">
          Body <span className="text-danger">*</span>
        </label>
        <TemplateBodyEditor
          value={bodyHtml}
          onChange={(html) => {
            reset();
            setBodyHtml(html);
          }}
          groups={CUSTOM_TEMPLATE_GROUPS}
          disabled={!canEdit}
        />
      </div>

      {/* Reference panel */}
      <ReferencePanel groups={CUSTOM_TEMPLATE_GROUPS} />

      {/* Live preview */}
      <PreviewPane kind={initial.kind || "custom.preview"} subject={subject} bodyHtml={bodyHtml} />

      {/* Save bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--rule)] pt-4">
        <div className="flex-1 min-w-0 text-sm">
          {error && (
            <p className="inline-flex items-center gap-1.5 text-danger">
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
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--rule-strong)] bg-card px-3 py-2 text-[12px] font-semibold text-slate-body hover:bg-cream/60 hover:text-ink disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={pending || !canEdit}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Saving…
              </>
            ) : mode === "create" ? (
              "Create template"
            ) : (
              "Save changes"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Reference panel + preview (cloned from TemplatesEditor; kept local
 * for now to avoid premature abstraction across two surfaces with
 * subtly different needs).
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
                  className="flex items-baseline justify-between gap-2 px-2 py-1 rounded hover:bg-card/60"
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

function PreviewPane({
  kind,
  subject,
  bodyHtml,
}: {
  kind: string;
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
        <span className="text-[12px] font-semibold text-ink inline-flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-heritage" />
          Preview
        </span>
        <span className="text-[11px] text-slate-meta">
          Rendered with sample data
        </span>
      </div>

      {hasIssues && (
        <div className="mb-3 border border-warning bg-warning-bg px-3 py-2 text-[12px] text-warning">
          <div className="font-semibold inline-flex items-center gap-1.5 mb-1">
            <AlertTriangle className="size-3.5" />
            Unknown mergefields
          </div>
          <p className="mb-1">
            These tokens won&apos;t resolve at send time — typo, or referring
            to a variable that isn&apos;t available for custom templates?
          </p>
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
            <p className="text-[13px] text-slate-meta italic">(body empty)</p>
          )}
        </div>
      </div>
    </div>
  );
}
