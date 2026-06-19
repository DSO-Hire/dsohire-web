"use client";

/**
 * <TagsSection> — manage candidate tags on the application detail page.
 * Renders the current chips (with remove) and an inline add control with a
 * small color picker. Optimistic local state; server actions enforce auth +
 * revalidate the kanban board so chips stay in sync.
 */

import { useState, useTransition } from "react";
import { X, Plus, Check } from "lucide-react";
import {
  TAG_COLORS,
  TAG_COLOR_CLASSES,
  TAG_SWATCH_CLASSES,
  MAX_TAG_LABEL_LENGTH,
  type ApplicationTag,
  type TagColor,
} from "@/lib/applications/tags";
import { addApplicationTag, removeApplicationTag } from "./tag-actions";

/** Seeded quick-add tags. Free text still works; these are one-click. */
const SUGGESTED_TAGS: ReadonlyArray<{ label: string; color: TagColor }> = [
  { label: "Top candidate", color: "green" },
  { label: "Strong fit", color: "green" },
  { label: "Needs follow-up", color: "amber" },
  { label: "Phone screen done", color: "blue" },
  { label: "On hold", color: "amber" },
  { label: "Not a fit", color: "rose" },
];

export function TagsSection({
  applicationId,
  initialTags,
}: {
  applicationId: string;
  initialTags: ApplicationTag[];
}) {
  const [tags, setTags] = useState<ApplicationTag[]>(initialTags);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<TagColor>("slate");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    const trimmed = label.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const res = await addApplicationTag(applicationId, trimmed, color);
      if (res.ok) {
        setTags((t) => [...t, res.tag]);
        setLabel("");
        setColor("slate");
        setAdding(false);
      } else {
        setError(res.error);
      }
    });
  }

  function quickAdd(presetLabel: string, presetColor: TagColor) {
    if (tags.some((t) => t.label.toLowerCase() === presetLabel.toLowerCase())) return;
    setError(null);
    startTransition(async () => {
      const res = await addApplicationTag(applicationId, presetLabel, presetColor);
      if (res.ok) setTags((t) => [...t, res.tag]);
      else setError(res.error);
    });
  }

  function handleRemove(id: string) {
    setError(null);
    const prev = tags;
    setTags((t) => t.filter((x) => x.id !== id));
    startTransition(async () => {
      const res = await removeApplicationTag(id, applicationId);
      if (!res.ok) {
        setTags(prev);
        setError(res.error);
      }
    });
  }

  return (
    <section className="border border-[var(--rule)] bg-card p-5">
      <h3 className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
        Tags
      </h3>

      <div className="flex flex-wrap items-center gap-2">
        {tags.map((tag) => (
          <span
            key={tag.id}
            className={`inline-flex items-center gap-1.5 px-2 py-1 text-[12px] font-semibold border ${TAG_COLOR_CLASSES[tag.color]}`}
          >
            {tag.label}
            <button
              type="button"
              onClick={() => handleRemove(tag.id)}
              disabled={pending}
              aria-label={`Remove tag ${tag.label}`}
              className="opacity-60 hover:opacity-100 disabled:opacity-30"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 px-2 py-1 text-[12px] font-semibold text-slate-body border border-dashed border-[var(--rule-strong)] hover:text-ink hover:border-ink transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add tag
          </button>
        )}

        {tags.length === 0 && !adding && (
          <span className="text-[13px] text-slate-meta">
            No tags yet.
          </span>
        )}
      </div>

      {adding && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={label}
            autoFocus
            maxLength={MAX_TAG_LABEL_LENGTH}
            placeholder="e.g. Top candidate"
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              } else if (e.key === "Escape") {
                setAdding(false);
                setLabel("");
                setError(null);
              }
            }}
            className="px-3 py-1.5 bg-cream border border-[var(--rule-strong)] text-ink text-[13px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
          />
          <div className="flex items-center gap-1.5" role="group" aria-label="Tag color">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                className={`h-5 w-5 rounded-full ${TAG_SWATCH_CLASSES[c]} flex items-center justify-center ring-offset-1 ${
                  color === c ? "ring-2 ring-ink" : ""
                }`}
              >
                {color === c && <Check className="h-3 w-3 text-white" />}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={pending || label.trim().length === 0}
            className="px-3 py-1.5 bg-primary text-primary-foreground text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setLabel("");
              setError(null);
            }}
            className="text-[12px] text-slate-meta hover:text-ink underline underline-offset-2"
          >
            Cancel
          </button>
          </div>

          {SUGGESTED_TAGS.some(
            (s) => !tags.some((t) => t.label.toLowerCase() === s.label.toLowerCase())
          ) && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-meta">Or pick one:</span>
              {SUGGESTED_TAGS.filter(
                (s) => !tags.some((t) => t.label.toLowerCase() === s.label.toLowerCase())
              ).map((s) => (
                <button
                  key={s.label}
                  type="button"
                  disabled={pending}
                  onClick={() => quickAdd(s.label, s.color)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold border ${TAG_COLOR_CLASSES[s.color]} hover:opacity-80 disabled:opacity-50`}
                >
                  <Plus className="h-2.5 w-2.5" /> {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[12px] text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
