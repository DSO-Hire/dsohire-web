"use client";

/**
 * Client-side template manager (Phase 5D Day 2).
 *
 * Lists existing templates with edit + delete. "New template" opens
 * the same inline editor in create mode. Form submits run through
 * the server actions in ./actions.ts.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Save, X, Loader2 } from "lucide-react";
import {
  createOutreachTemplate,
  updateOutreachTemplate,
  deleteOutreachTemplate,
} from "./actions";
import { SUPPORTED_MERGE_FIELDS } from "@/lib/outreach/merge-fields";
import { InsertMergeFieldButton } from "@/components/outreach/insert-merge-field-button";

interface TemplateRow {
  id: string;
  name: string;
  subject: string;
  body: string;
  last_used_at: string | null;
  usage_count: number;
}

interface TemplatesManagerProps {
  initialTemplates: TemplateRow[];
}

export function TemplatesManager({ initialTemplates }: TemplatesManagerProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const isNew = editingId === "new";

    startTransition(async () => {
      const res = isNew
        ? await createOutreachTemplate(fd)
        : await updateOutreachTemplate(fd);
      if (!res.ok) {
        setError(res.error ?? "Save failed.");
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this template?")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteOutreachTemplate(id);
      if (!res.ok) {
        setError(res.error ?? "Delete failed.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-slate-meta">
          {initialTemplates.length}{" "}
          {initialTemplates.length === 1 ? "template" : "templates"} saved
        </div>
        {editingId !== "new" && (
          <button
            type="button"
            onClick={() => setEditingId("new")}
            disabled={pending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-ink text-ivory text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft disabled:opacity-60"
          >
            <Plus className="h-3 w-3" /> New template
          </button>
        )}
      </div>

      {editingId === "new" && (
        <TemplateForm
          template={null}
          onSubmit={handleSubmit}
          onCancel={() => setEditingId(null)}
          pending={pending}
          error={error}
        />
      )}

      {initialTemplates.length === 0 && editingId !== "new" ? (
        <div className="border border-[var(--rule)] bg-cream/30 p-8 text-center">
          <p className="text-[14px] text-slate-body leading-relaxed max-w-[440px] mx-auto">
            No templates saved yet. Click <strong>New template</strong> to
            create your first one.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {initialTemplates.map((t) =>
            editingId === t.id ? (
              <li key={t.id}>
                <TemplateForm
                  template={t}
                  onSubmit={handleSubmit}
                  onCancel={() => setEditingId(null)}
                  pending={pending}
                  error={error}
                />
              </li>
            ) : (
              <li
                key={t.id}
                className="border border-[var(--rule)] bg-white p-4 flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold text-ink mb-0.5">
                    {t.name}
                  </div>
                  <div className="text-[12px] text-slate-meta mb-2 truncate">
                    {t.subject}
                  </div>
                  <div className="text-[12px] text-slate-body line-clamp-2 whitespace-pre-wrap">
                    {t.body.length > 220
                      ? `${t.body.slice(0, 220).trim()}…`
                      : t.body}
                  </div>
                  {t.usage_count > 0 && (
                    <div className="mt-2 text-[10px] text-slate-meta uppercase tracking-wide">
                      Used {t.usage_count} {t.usage_count === 1 ? "time" : "times"}
                      {t.last_used_at && (
                        <> · last on{" "}
                          {new Date(t.last_used_at).toLocaleDateString()}
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingId(t.id)}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-cream hover:text-ink"
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(t.id)}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}

function TemplateForm({
  template,
  onSubmit,
  onCancel,
  pending,
  error,
}: {
  template: TemplateRow | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  pending: boolean;
  error: string | null;
}) {
  // Controlled subject + body so Insert-variable can patch the value.
  // Name stays uncontrolled — no merge-field UX on it.
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const subjectRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <form
      onSubmit={onSubmit}
      className="border border-[var(--rule-strong)] bg-white p-5 space-y-4"
    >
      {template?.id && (
        <input type="hidden" name="id" value={template.id} />
      )}
      <div>
        <label className="block text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-1.5">
          Template name
        </label>
        <input
          name="name"
          type="text"
          defaultValue={template?.name ?? ""}
          placeholder="e.g. Associate Dentist outreach v1"
          maxLength={80}
          required
          className="w-full px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage"
        />
      </div>
      <div>
        <div className="flex items-baseline justify-between mb-1.5 gap-3">
          <label
            htmlFor="template-subject"
            className="block text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta"
          >
            Subject
          </label>
          <InsertMergeFieldButton
            fieldRef={subjectRef}
            onInsert={setSubject}
          />
        </div>
        <input
          id="template-subject"
          ref={subjectRef}
          name="subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. {{candidate.first_name}}, an Associate Dentist role you'd be perfect for"
          maxLength={200}
          required
          className="w-full px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage"
        />
      </div>
      <div>
        <div className="flex items-baseline justify-between mb-1.5 gap-3">
          <label
            htmlFor="template-body"
            className="block text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta"
          >
            Body
          </label>
          <InsertMergeFieldButton fieldRef={bodyRef} onInsert={setBody} />
        </div>
        <textarea
          id="template-body"
          ref={bodyRef}
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          required
          placeholder="Hi {{candidate.first_name}},&#10;&#10;I'm {{sender.first_name}} at {{dso.name}}. We have an Associate Dentist role opening at our Prairie Village practice and your background looked like a strong fit.&#10;&#10;Open to a quick conversation this week?"
          maxLength={8000}
          className="w-full px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage leading-relaxed resize-y font-mono"
        />
      </div>

      <details className="text-[12px]">
        <summary className="cursor-pointer text-heritage-deep font-semibold inline-flex items-center gap-1">
          Available merge fields
        </summary>
        <ul className="mt-2 space-y-1 pl-3 border-l-2 border-[var(--rule)]">
          {SUPPORTED_MERGE_FIELDS.map((f) => (
            <li key={f.token} className="text-slate-body">
              <code className="bg-cream px-1 py-0.5 rounded text-[11px]">
                {f.token}
              </code>{" "}
              — {f.label} (e.g. {f.example})
            </li>
          ))}
        </ul>
      </details>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-slate-meta hover:text-ink"
        >
          <X className="inline h-3 w-3 mr-1" />
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 px-5 py-2 bg-ink text-ivory text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save template
        </button>
      </div>
    </form>
  );
}
