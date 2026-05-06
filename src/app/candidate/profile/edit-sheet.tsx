"use client";

/**
 * EditSheet — shared modal shell used by every section editor on
 * /candidate/profile (Phase 4.2.b).
 *
 * Mobile: full-viewport sheet. Desktop: centered dialog at 600-720px wide
 * with sticky Save/Cancel footer. Built on the existing Dialog primitive
 * (radix-ui-backed shadcn shell) so focus trap + escape-to-close + outside-
 * click-to-close work without extra wiring.
 *
 * Also exports the small input primitives the section modals lean on:
 *   • TextField        — labeled input with optional helper text
 *   • TextAreaField    — same shape for multi-line
 *   • ChipArrayInput   — chip multi-select with controlled add/remove
 *   • ComboboxField    — filtered select against a CanonicalOption list
 *   • InlineError      — <p role="alert"> with consistent styling
 *
 * Keeping these here (vs. /components/ui) because they're tuned for the
 * profile editor specifically — not yet a shared design system primitive.
 * Promote when 4.3 / 4.5 settings need them.
 */

import { useEffect, useRef, useState } from "react";
import { X, Plus } from "lucide-react";
import type { CanonicalOption } from "@/lib/candidate/canonical-lists";

// ─────────────────────────────────────────────────────────────────────
// EditSheet
// ─────────────────────────────────────────────────────────────────────

export interface EditSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Left side of the footer (typically a delete button on edit-existing). */
  footerLeft?: React.ReactNode;
  /** Save button label. Defaults to "Save". */
  saveLabel?: string;
  saving?: boolean;
  /** Disable the save button. */
  saveDisabled?: boolean;
  onSave: () => void | Promise<void>;
  /** Optional banner under the title (e.g., redaction disclosure). */
  banner?: React.ReactNode;
}

export function EditSheet({
  open,
  onClose,
  title,
  description,
  children,
  footerLeft,
  saveLabel = "Save",
  saving = false,
  saveDisabled = false,
  onSave,
  banner,
}: EditSheetProps) {
  // Lock body scroll while open. Manual handling is fine here since we're
  // not using radix's Dialog wrapper for this overlay.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // Esc-to-close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-center sm:p-6"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={() => !saving && onClose()}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        tabIndex={-1}
      />

      {/* Sheet */}
      <div className="relative z-10 flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-[680px] sm:rounded-lg">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-display text-lg font-bold text-[#14233F]">
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-sm text-slate-600">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </header>

        {banner && (
          <div className="shrink-0 border-b border-slate-200 px-5 py-3 sm:px-6">
            {banner}
          </div>
        )}

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          {children}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:px-6">
          <div>{footerLeft}</div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => !saving && onClose()}
              disabled={saving}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving || saveDisabled}
              className="rounded-md bg-[#14233F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d172b] disabled:opacity-60"
            >
              {saving ? "Saving…" : saveLabel}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Field primitives
// ─────────────────────────────────────────────────────────────────────

export function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "tel" | "url" | "number";
  required?: boolean;
  helper?: string;
  maxLength?: number;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-800">
        {props.label}
        {props.required && <span className="ml-0.5 text-red-700">*</span>}
      </span>
      {props.helper && (
        <span className="mb-1.5 block text-xs text-slate-500">
          {props.helper}
        </span>
      )}
      <input
        type={props.type ?? "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        maxLength={props.maxLength}
        autoComplete={props.autoComplete}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#4D7A60] focus:outline-none focus:ring-1 focus:ring-[#4D7A60]"
      />
    </label>
  );
}

export function TextAreaField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  helper?: string;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-800">
        {props.label}
      </span>
      {props.helper && (
        <span className="mb-1.5 block text-xs text-slate-500">
          {props.helper}
        </span>
      )}
      <textarea
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        rows={props.rows ?? 3}
        maxLength={props.maxLength}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#4D7A60] focus:outline-none focus:ring-1 focus:ring-[#4D7A60]"
      />
    </label>
  );
}

export function ChipArrayInput(props: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  /** Optional canonical options surfaced as quick-add buttons. */
  options?: ReadonlyArray<CanonicalOption>;
  placeholder?: string;
  helper?: string;
  /** Render each chip's label via this lookup (e.g., role label from value). */
  labelFor?: (value: string) => string;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    if (props.values.includes(v)) {
      setDraft("");
      return;
    }
    props.onChange([...props.values, v]);
    setDraft("");
  };
  const remove = (idx: number) =>
    props.onChange(props.values.filter((_, i) => i !== idx));

  // Quick-add options that aren't already selected.
  const remainingOptions = props.options?.filter(
    (opt) => !props.values.includes(opt.value)
  );

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-800">
        {props.label}
      </span>
      {props.helper && (
        <span className="mb-1.5 block text-xs text-slate-500">
          {props.helper}
        </span>
      )}
      <div className="mb-2 flex flex-wrap gap-2">
        {props.values.length === 0 ? (
          <span className="text-xs italic text-slate-400">None added yet.</span>
        ) : (
          props.values.map((v, i) => (
            <span
              key={`${v}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-[#4D7A60]/10 px-3 py-1 text-sm text-[#14233F]"
            >
              {props.labelFor ? props.labelFor(v) : v}
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-[#4D7A60] hover:text-[#14233F]"
                aria-label={`Remove ${v}`}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder={props.placeholder}
          className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#4D7A60] focus:outline-none focus:ring-1 focus:ring-[#4D7A60]"
        />
        <button
          type="button"
          onClick={() => add(draft)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Plus className="size-4" />
          Add
        </button>
      </div>
      {remainingOptions && remainingOptions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-xs text-slate-500">Quick add:</span>
          {remainingOptions.slice(0, 12).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => add(opt.value)}
              className="rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-xs text-slate-600 hover:border-[#4D7A60] hover:text-[#14233F]"
            >
              + {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ComboboxField(props: {
  label: string;
  value: string;
  options: ReadonlyArray<CanonicalOption>;
  onChange: (v: string) => void;
  helper?: string;
  required?: boolean;
  allowCustom?: boolean;
}) {
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const matched = filter
    ? props.options.filter((o) =>
        (o.label + " " + o.value)
          .toLowerCase()
          .includes(filter.toLowerCase())
      )
    : props.options;

  const currentLabel =
    props.options.find((o) => o.value === props.value)?.label ?? props.value;

  return (
    <div ref={ref} className="relative">
      <span className="mb-1 block text-sm font-medium text-slate-800">
        {props.label}
        {props.required && <span className="ml-0.5 text-red-700">*</span>}
      </span>
      {props.helper && (
        <span className="mb-1.5 block text-xs text-slate-500">
          {props.helper}
        </span>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm shadow-sm focus:border-[#4D7A60] focus:outline-none focus:ring-1 focus:ring-[#4D7A60]"
      >
        <span className={props.value ? "" : "text-slate-400"}>
          {props.value ? currentLabel : "Select…"}
        </span>
        <span className="text-xs text-slate-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-xl">
          <input
            autoFocus
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="mb-1 w-full rounded-sm border border-slate-200 px-2 py-1 text-sm focus:border-[#4D7A60] focus:outline-none"
          />
          {matched.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                props.onChange(opt.value);
                setOpen(false);
                setFilter("");
              }}
              className={`block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-[#F7F4ED] ${
                opt.value === props.value
                  ? "bg-[#4D7A60]/10 font-medium text-[#14233F]"
                  : "text-slate-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
          {matched.length === 0 && props.allowCustom && filter.trim() && (
            <button
              type="button"
              onClick={() => {
                props.onChange(filter.trim());
                setOpen(false);
                setFilter("");
              }}
              className="block w-full rounded-sm px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-[#F7F4ED]"
            >
              Use custom: <strong>{filter.trim()}</strong>
            </button>
          )}
          {matched.length === 0 && !props.allowCustom && (
            <p className="px-2 py-2 text-xs italic text-slate-500">
              No matches.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-red-700">
      {message}
    </p>
  );
}
