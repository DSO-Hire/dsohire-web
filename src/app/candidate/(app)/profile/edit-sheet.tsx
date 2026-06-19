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
      <div className="relative z-10 flex h-full w-full flex-col overflow-hidden bg-card shadow-2xl sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-[680px] sm:rounded-lg">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </header>

        {banner && (
          <div className="shrink-0 border-b border-border px-5 py-3 sm:px-6">
            {banner}
          </div>
        )}

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          {children}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-muted px-5 py-3 sm:px-6">
          <div>{footerLeft}</div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => !saving && onClose()}
              disabled={saving}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving || saveDisabled}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
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
  type?: "text" | "tel" | "url" | "number" | "date";
  required?: boolean;
  helper?: string;
  maxLength?: number;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">
        {props.label}
        {props.required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {props.helper && (
        <span className="mb-1.5 block text-xs text-muted-foreground">
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
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm focus:border-heritage focus:outline-none focus:ring-1 focus:ring-heritage"
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
      <span className="mb-1 block text-sm font-medium text-foreground">
        {props.label}
      </span>
      {props.helper && (
        <span className="mb-1.5 block text-xs text-muted-foreground">
          {props.helper}
        </span>
      )}
      <textarea
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        rows={props.rows ?? 3}
        maxLength={props.maxLength}
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm focus:border-heritage focus:outline-none focus:ring-1 focus:ring-heritage"
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
  /**
   * #93 (Day 28) — when true (and `options` supplied), only canonical values
   * can be added: a typed value/label is resolved to its option `value`, and
   * anything with no match is rejected. Kills the free-text typo loop that
   * silently excludes a candidate from employers' structured search. Leave
   * false (default) for genuinely open fields like locations/timeline.
   */
  restrictToOptions?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [showAll, setShowAll] = useState(false);

  const add = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    // #93 — resolve a typed value or label to its canonical option value so we
    // store the slug, not the typed text. With restrictToOptions, a non-match
    // is ignored (the user picks a quick-add chip instead).
    let resolved = v;
    if (props.options) {
      const lower = v.toLowerCase();
      const match = props.options.find(
        (o) => o.value.toLowerCase() === lower || o.label.toLowerCase() === lower
      );
      if (match) resolved = match.value;
      else if (props.restrictToOptions) return;
    }
    if (props.values.includes(resolved)) {
      setDraft("");
      return;
    }
    props.onChange([...props.values, resolved]);
    setDraft("");
  };
  const remove = (idx: number) =>
    props.onChange(props.values.filter((_, i) => i !== idx));

  // Quick-add options that aren't already selected.
  const allRemainingOptions = props.options?.filter(
    (opt) => !props.values.includes(opt.value)
  );
  // v1.7 — typing into the search box filters the quick-add chips
  // (case-insensitive substring on label + value). When typing, we
  // also drop the 12-chip cap so the user can scan the full filtered
  // result. Default (no draft) keeps the cap with a "Show all" toggle.
  const draftLower = draft.trim().toLowerCase();
  const filteredOptions = allRemainingOptions
    ? draftLower
      ? allRemainingOptions.filter((opt) =>
          (opt.label + " " + opt.value).toLowerCase().includes(draftLower)
        )
      : allRemainingOptions
    : undefined;
  const isFiltering = Boolean(draftLower);
  const remainingOptions =
    filteredOptions && (showAll || isFiltering)
      ? filteredOptions
      : filteredOptions?.slice(0, 12);
  const hiddenCount =
    !isFiltering && filteredOptions
      ? Math.max(0, filteredOptions.length - 12)
      : 0;

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-foreground">
        {props.label}
      </span>
      {props.helper && (
        <span className="mb-1.5 block text-xs text-muted-foreground">
          {props.helper}
        </span>
      )}
      <div className="mb-2 flex flex-wrap gap-2">
        {props.values.length === 0 ? (
          <span className="text-xs italic text-meta-foreground">None added yet.</span>
        ) : (
          props.values.map((v, i) => (
            <span
              key={`${v}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-heritage/10 px-3 py-1 text-sm text-foreground"
            >
              {props.labelFor ? props.labelFor(v) : v}
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-heritage hover:text-foreground"
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
          className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm focus:border-heritage focus:outline-none focus:ring-1 focus:ring-heritage"
        />
        <button
          type="button"
          onClick={() => add(draft)}
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          <Plus className="size-4" />
          Add
        </button>
      </div>
      {remainingOptions && remainingOptions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground">
            {isFiltering
              ? `Matching (${remainingOptions.length}):`
              : "Quick add:"}
          </span>
          {remainingOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => add(opt.value)}
              className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:border-heritage hover:text-foreground"
            >
              + {opt.label}
            </button>
          ))}
          {/* Show all / show less toggle. Only renders when there are
              hidden options AND we're not actively filtering — search
              already widens the visible set, so the toggle would be
              redundant during search. */}
          {!isFiltering && hiddenCount > 0 && !showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-xs font-semibold text-heritage hover:text-foreground underline underline-offset-2"
            >
              Show all ({hiddenCount} more)
            </button>
          )}
          {!isFiltering && showAll && (
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="text-xs font-semibold text-heritage hover:text-foreground underline underline-offset-2"
            >
              Show less
            </button>
          )}
        </div>
      )}
      {isFiltering && remainingOptions && remainingOptions.length === 0 && (
        <p className="mt-3 text-xs italic text-meta-foreground">
          {props.restrictToOptions
            ? "No matches. Pick from the list — custom values aren't allowed for this field."
            : `No matches — press Enter to add “${draft.trim()}” as a custom value.`}
        </p>
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
      <span className="mb-1 block text-sm font-medium text-foreground">
        {props.label}
        {props.required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {props.helper && (
        <span className="mb-1.5 block text-xs text-muted-foreground">
          {props.helper}
        </span>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-left text-sm shadow-sm focus:border-heritage focus:outline-none focus:ring-1 focus:ring-heritage"
      >
        <span className={props.value ? "" : "text-meta-foreground"}>
          {props.value ? currentLabel : "Select…"}
        </span>
        <span className="text-xs text-meta-foreground">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-xl">
          <input
            autoFocus
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            className="mb-1 w-full rounded-sm border border-border px-2 py-1 text-sm focus:border-heritage focus:outline-none"
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
              className={`block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted ${
                opt.value === props.value
                  ? "bg-heritage/10 font-medium text-foreground"
                  : "text-foreground"
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
              className="block w-full rounded-sm px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
            >
              Use custom: <strong>{filter.trim()}</strong>
            </button>
          )}
          {matched.length === 0 && !props.allowCustom && (
            <p className="px-2 py-2 text-xs italic text-muted-foreground">
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
    <p role="alert" className="text-sm text-danger">
      {message}
    </p>
  );
}
