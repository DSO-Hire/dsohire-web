"use client";

/**
 * <OfferLetterEditor> — two-pane editor for the offer-letter template
 * library (Phase 5A Track E).
 *
 * Left rail: list of templates. Active templates first; archived
 * collapsed in a disclosure at the bottom. "+ New template" creates a
 * blank draft on the right.
 *
 * Right pane: name + body editor. The body textarea is monospace and
 * tall; a sibling "Insert merge field" dropdown injects {{tokens}} at
 * the cursor (grouped by category). Below the editor is a live preview
 * panel that renders the merged result using placeholder values from
 * `buildPreviewValues()`.
 *
 * All mutations route through ./actions.ts; on success we router.refresh()
 * so the server-fetched list stays the source of truth.
 *
 * Per `feedback_settings_layout_already_wraps_shell.md` we render
 * inner content only — no shell wrapping here.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Save,
  Loader2,
  Archive,
  ArchiveRestore,
  Trash2,
  ChevronDown,
  Eye,
  AlertCircle,
  FileSignature,
} from "lucide-react";
import {
  createTemplate,
  updateTemplate,
  archiveTemplate,
  restoreTemplate,
  deleteTemplate,
} from "./actions";
import {
  MERGE_FIELDS,
  buildPreviewValues,
  renderTemplate,
  type MergeFieldDef,
} from "@/lib/offer-letters/merge";

interface TemplateRow {
  id: string;
  name: string;
  body: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  created_by_user_id: string | null;
}

interface OfferLetterEditorProps {
  initialTemplates: TemplateRow[];
  canEdit: boolean;
}

type Selection =
  | { kind: "existing"; id: string }
  | { kind: "new" }
  | { kind: "empty" };

export function OfferLetterEditor({
  initialTemplates,
  canEdit,
}: OfferLetterEditorProps) {
  const router = useRouter();
  const { active, archived } = useMemo(() => splitTemplates(initialTemplates), [
    initialTemplates,
  ]);
  const [selection, setSelection] = useState<Selection>(() =>
    active[0] ? { kind: "existing", id: active[0].id } : { kind: "empty" }
  );
  const [showArchived, setShowArchived] = useState(false);

  // Keep the selection in sync when the parent re-renders post-mutation —
  // e.g., user archives the currently-selected template, we jump them to
  // the next active one.
  useEffect(() => {
    if (selection.kind !== "existing") return;
    const stillExists = initialTemplates.some(
      (t) => t.id === selection.id && !t.is_archived
    );
    if (!stillExists) {
      setSelection(
        active[0] ? { kind: "existing", id: active[0].id } : { kind: "empty" }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTemplates]);

  const selectedTemplate =
    selection.kind === "existing"
      ? initialTemplates.find((t) => t.id === selection.id) ?? null
      : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
      {/* ── Left rail ── */}
      <aside className="min-w-0 space-y-2">
        {canEdit && (
          <button
            type="button"
            onClick={() => setSelection({ kind: "new" })}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-primary/90"
          >
            <Plus className="h-3 w-3" /> New template
          </button>
        )}

        {active.length === 0 && archived.length === 0 ? (
          <div className="border border-[var(--rule)] bg-cream/40 p-4 text-[12px] text-slate-meta leading-relaxed">
            No templates yet.{" "}
            {canEdit ? (
              <>Click <strong>New template</strong> to author your first one.</>
            ) : (
              <>An owner or admin needs to add one.</>
            )}
          </div>
        ) : (
          <ul className="border border-[var(--rule)] bg-card divide-y divide-[var(--rule)]">
            {active.map((t) => (
              <TemplateListItem
                key={t.id}
                t={t}
                active={
                  selection.kind === "existing" && selection.id === t.id
                }
                onClick={() => setSelection({ kind: "existing", id: t.id })}
              />
            ))}
          </ul>
        )}

        {archived.length > 0 && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="w-full inline-flex items-center justify-between px-3 py-2 text-[11px] font-bold tracking-[1.5px] uppercase text-slate-meta hover:text-ink"
            >
              <span>Archived ({archived.length})</span>
              <ChevronDown
                className={`h-3 w-3 transition-transform ${
                  showArchived ? "rotate-180" : ""
                }`}
              />
            </button>
            {showArchived && (
              <ul className="mt-1 border border-[var(--rule)] bg-card divide-y divide-[var(--rule)]">
                {archived.map((t) => (
                  <TemplateListItem
                    key={t.id}
                    t={t}
                    active={
                      selection.kind === "existing" && selection.id === t.id
                    }
                    onClick={() => setSelection({ kind: "existing", id: t.id })}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </aside>

      {/* ── Right pane ── */}
      <main className="min-w-0">
        {selection.kind === "new" ? (
          <TemplateForm
            key="new"
            template={null}
            canEdit={canEdit}
            onSaved={(id) => {
              setSelection({ kind: "existing", id });
              router.refresh();
            }}
            onCancel={() =>
              setSelection(
                active[0]
                  ? { kind: "existing", id: active[0].id }
                  : { kind: "empty" }
              )
            }
          />
        ) : selectedTemplate ? (
          <TemplateForm
            key={selectedTemplate.id}
            template={selectedTemplate}
            canEdit={canEdit}
            onSaved={() => router.refresh()}
            onCancel={() => {
              /* no-op — staying on the same template after a cancel */
            }}
          />
        ) : (
          <div className="border border-dashed border-[var(--rule)] bg-cream/30 p-10 text-center">
            <FileSignature className="h-8 w-8 text-heritage-deep mx-auto mb-3" />
            <p className="text-[14px] text-slate-body leading-relaxed max-w-[420px] mx-auto">
              No template selected. {canEdit ? (
                <>Use <strong>New template</strong> on the left to start one.</>
              ) : (
                <>Once an owner adds a template, it will show up here.</>
              )}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Template list item
 * ───────────────────────────────────────────────────────────── */

function TemplateListItem({
  t,
  active,
  onClick,
}: {
  t: TemplateRow;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={
          "w-full text-left px-3 py-3 transition-colors " +
          (active ? "bg-cream" : "hover:bg-cream/60")
        }
      >
        <div
          className={
            "text-[13px] font-semibold leading-snug truncate " +
            (active ? "text-ink" : "text-ink")
          }
        >
          {t.name}
        </div>
        <div className="text-[11px] text-slate-meta mt-0.5">
          Updated {new Date(t.updated_at).toLocaleDateString()}
        </div>
      </button>
    </li>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Template form (new or edit)
 * ───────────────────────────────────────────────────────────── */

function TemplateForm({
  template,
  canEdit,
  onSaved,
  onCancel,
}: {
  template: TemplateRow | null;
  canEdit: boolean;
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(template?.name ?? "");
  const [body, setBody] = useState(template?.body ?? DEFAULT_BODY);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const isArchived = template?.is_archived === true;
  const readOnly = !canEdit || isArchived;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = template
        ? await updateTemplate({ id: template.id, name, body })
        : await createTemplate({ name, body });
      if (!result.ok) {
        setError(result.error ?? "Save failed.");
        return;
      }
      if (result.templateId) onSaved(result.templateId);
    });
  }

  function handleArchive() {
    if (!template) return;
    if (!confirm(`Archive "${template.name}"? Past sends stay readable.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await archiveTemplate(template.id);
      if (!result.ok) {
        setError(result.error ?? "Archive failed.");
        return;
      }
      router.refresh();
    });
  }

  function handleRestore() {
    if (!template) return;
    setError(null);
    startTransition(async () => {
      const result = await restoreTemplate(template.id);
      if (!result.ok) {
        setError(result.error ?? "Restore failed.");
        return;
      }
      router.refresh();
    });
  }

  function handleDelete() {
    if (!template) return;
    if (
      !confirm(
        `Delete "${template.name}" permanently? This cannot be undone. If this template has historic offer sends, the delete will be refused — archive instead.`
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteTemplate(template.id);
      if (!result.ok) {
        setError(result.error ?? "Delete failed.");
        return;
      }
      router.refresh();
    });
  }

  function insertMergeField(key: string) {
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    if (!el) {
      setBody((v) => v + token);
      return;
    }
    const value = el.value ?? "";
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      try {
        el.setSelectionRange(pos, pos);
      } catch {
        /* some textarea variants reject setSelectionRange; ignore. */
      }
    });
  }

  // Live preview — re-renders on every keystroke. The renderer is
  // pure + cheap (regex pass + a small markdown converter).
  const previewValues = useMemo(() => buildPreviewValues(), []);
  const preview = useMemo(() => renderTemplate(body, previewValues), [
    body,
    previewValues,
  ]);

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-[var(--rule)] bg-card p-5 space-y-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
          {template ? (isArchived ? "Archived template" : "Edit template") : "New template"}
        </div>
        {template && canEdit && (
          <div className="flex items-center gap-1">
            {isArchived ? (
              <button
                type="button"
                onClick={handleRestore}
                disabled={pending}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-[1.5px] uppercase border border-[var(--rule-strong)] text-ink bg-card hover:bg-cream disabled:opacity-60"
              >
                <ArchiveRestore className="h-3 w-3" />
                Restore
              </button>
            ) : (
              <button
                type="button"
                onClick={handleArchive}
                disabled={pending}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-[1.5px] uppercase border border-[var(--rule-strong)] text-slate-body bg-card hover:bg-cream disabled:opacity-60"
              >
                <Archive className="h-3 w-3" />
                Archive
              </button>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-[1.5px] uppercase border border-danger text-danger bg-card hover:bg-danger-bg disabled:opacity-60"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </div>
        )}
      </div>

      <div>
        <label className="block text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-1.5">
          Template name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Associate Dentist standard offer"
          maxLength={120}
          required
          disabled={readOnly || pending}
          className="w-full px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1.5 gap-3">
          <label
            htmlFor="offer-template-body"
            className="block text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta"
          >
            Body
          </label>
          {!readOnly && <InsertMergeFieldDropdown onInsert={insertMergeField} />}
        </div>
        <textarea
          id="offer-template-body"
          ref={bodyRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={18}
          required
          disabled={readOnly || pending}
          className="w-full px-3 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[13px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage leading-relaxed resize-y font-mono disabled:opacity-60 disabled:cursor-not-allowed"
        />
        <p className="mt-2 text-[11px] text-slate-meta leading-relaxed">
          Markdown supported (## heading, **bold**, *italic*, - bullets). Use{" "}
          <code className="bg-cream px-1 py-0.5 rounded">{"{{token}}"}</code>{" "}
          for merge fields — see the dropdown above.
        </p>
      </div>

      <PreviewPanel
        html={preview.html}
        unknownTokens={preview.unknownTokens}
      />

      {error && (
        <div className="rounded-md border border-danger bg-danger-bg px-3 py-2 text-[13px] text-danger flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!readOnly && (
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--rule)] -mx-5 -mb-5 px-5 py-4 bg-cream/40">
          {template === null && (
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-slate-meta hover:text-ink"
            >
              Discard
            </button>
          )}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-primary/90 disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {template ? "Save changes" : "Create template"}
          </button>
        </div>
      )}
    </form>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Insert-merge-field dropdown (grouped by category)
 * ───────────────────────────────────────────────────────────── */

function InsertMergeFieldDropdown({
  onInsert,
}: {
  onInsert: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!open) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const grouped = useMemo(() => groupFields(MERGE_FIELDS), []);

  return (
    <div ref={menuRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep border border-[var(--rule)] bg-card hover:bg-cream"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Plus className="h-2.5 w-2.5" />
        Insert merge field
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 z-30 w-[320px] max-w-[calc(100vw-2rem)] max-h-[400px] overflow-y-auto border border-[var(--rule-strong)] bg-popover shadow-lg"
        >
          {grouped.map((g) => (
            <div key={g.id}>
              <div className="px-3 pt-2.5 pb-1 text-[9px] font-bold tracking-[2px] uppercase text-slate-meta border-b border-[var(--rule)]">
                {g.label}
              </div>
              <ul className="py-1">
                {g.fields.map((f) => (
                  <li key={f.key}>
                    <button
                      type="button"
                      onClick={() => {
                        onInsert(f.key);
                        setOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-cream"
                      role="menuitem"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-bold text-ink">
                          {f.label}
                        </span>
                        {f.required && (
                          <span className="text-[9px] font-bold tracking-[1px] uppercase text-heritage-deep">
                            req
                          </span>
                        )}
                      </div>
                      <code className="mt-0.5 inline-block text-[10px] bg-cream px-1.5 py-0.5 rounded text-heritage-deep">
                        {`{{${f.key}}}`}
                      </code>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Preview panel — renders the merged HTML using catalog example values
 * ───────────────────────────────────────────────────────────── */

function PreviewPanel({
  html,
  unknownTokens,
}: {
  html: string;
  unknownTokens: string[];
}) {
  return (
    <div className="border border-[var(--rule)] bg-cream/40">
      <div className="px-4 py-2 border-b border-[var(--rule)] flex items-center gap-2">
        <Eye className="h-3.5 w-3.5 text-heritage-deep" />
        <span className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep">
          Preview
        </span>
        <span className="text-[11px] text-slate-meta">
          (with placeholder values — actual sends pull from each candidate)
        </span>
      </div>
      <div className="p-5 bg-white">
        {html ? (
          <div
            className="offer-letter-preview"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="text-[13px] text-slate-meta italic">
            Empty template body.
          </p>
        )}
      </div>
      {unknownTokens.length > 0 && (
        <div className="px-4 py-2 border-t border-warning bg-warning-bg text-[12px] text-warning">
          <strong>Unknown tokens:</strong>{" "}
          {unknownTokens.map((t) => `{{${t}}}`).join(", ")}. These will render
          literally in the sent email — pick a real field from the dropdown.
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

function splitTemplates(rows: TemplateRow[]): {
  active: TemplateRow[];
  archived: TemplateRow[];
} {
  const active: TemplateRow[] = [];
  const archived: TemplateRow[] = [];
  for (const r of rows) {
    (r.is_archived ? archived : active).push(r);
  }
  return { active, archived };
}

interface FieldGroup {
  id: MergeFieldDef["category"];
  label: string;
  fields: MergeFieldDef[];
}

const GROUP_LABELS: Record<MergeFieldDef["category"], string> = {
  candidate: "Candidate (auto-filled)",
  job: "Job (auto-filled)",
  dso: "DSO (auto-filled)",
  offer: "Offer (you fill at send time)",
};

const GROUP_ORDER: MergeFieldDef["category"][] = [
  "candidate",
  "job",
  "dso",
  "offer",
];

function groupFields(fields: readonly MergeFieldDef[]): FieldGroup[] {
  const out: Record<MergeFieldDef["category"], MergeFieldDef[]> = {
    candidate: [],
    job: [],
    dso: [],
    offer: [],
  };
  for (const f of fields) out[f.category].push(f);
  return GROUP_ORDER.map((id) => ({
    id,
    label: GROUP_LABELS[id],
    fields: out[id],
  })).filter((g) => g.fields.length > 0);
}

/* ───────────────────────────────────────────────────────────────
 * Default body for a brand-new template — gives DSOs a starting
 * shape so they aren't staring at a blank page. Anonymized address
 * per feedback_no_real_address_in_placeholders.md.
 * ───────────────────────────────────────────────────────────── */

const DEFAULT_BODY = `## Offer of Employment

Dear {{candidate.first_name}},

We're delighted to offer you the position of **{{job.title}}** at **{{dso.name}}**, based at {{job.location}}. Below are the key terms.

### Role & Schedule

- **Position:** {{job.title}}
- **Employment type:** {{job.employment_type}}
- **Reporting to:** {{offer.reporting_to}}
- **Start date:** {{offer.start_date}}

### Compensation

{{offer.compensation}}

{{offer.signing_bonus}}

### Benefits

{{offer.benefits_summary}}

### Next Steps

Please confirm acceptance by **{{offer.deadline_to_accept}}**. If you have questions, simply reply to this email and we'll get back to you the same day.

{{offer.custom_note}}

We're excited about the possibility of having you join {{dso.name}}.

Sincerely,
The {{dso.name}} hiring team
123 Main St, City, State`;
