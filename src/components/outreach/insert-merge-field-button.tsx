"use client";

/**
 * Insert-variable dropdown for plain-text fields (Phase 5D Day 2).
 *
 * Parallel to the Tiptap-based InsertVariableMenu at
 * /employer/settings/templates/template-body-editor.tsx but works on
 * a plain `<input>` or `<textarea>` referenced via a forwarded ref.
 * Inserts the merge-field token at the current cursor position, or
 * appends to the end if the input isn't focused.
 *
 * Used in the outreach modal (subject + body fields) and the outreach
 * templates editor.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { SUPPORTED_MERGE_FIELDS } from "@/lib/outreach/merge-fields";

interface InsertMergeFieldButtonProps {
  /** ref to the textarea or input whose value we mutate. */
  fieldRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  /** Called with the new value so React state stays in sync. */
  onInsert: (newValue: string) => void;
  /** Optional label; defaults to "Insert variable". */
  label?: string;
  /** Optional size — "sm" used inline next to a field label. */
  size?: "sm" | "md";
}

export function InsertMergeFieldButton({
  fieldRef,
  onInsert,
  label = "Insert variable",
  size = "sm",
}: InsertMergeFieldButtonProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!open) return;
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function insert(token: string) {
    const el = fieldRef.current;
    if (!el) {
      onInsert(token);
      setOpen(false);
      return;
    }
    const value = el.value ?? "";
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onInsert(next);
    setOpen(false);

    // Restore cursor position just after the inserted token.
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      try {
        el.setSelectionRange(pos, pos);
      } catch {
        // some input types don't support setSelectionRange; ignore.
      }
    });
  }

  const btnCls =
    size === "sm"
      ? "inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep border border-[var(--rule)] bg-white hover:bg-cream"
      : "inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold tracking-[1.5px] uppercase text-heritage-deep border border-[var(--rule-strong)] bg-white hover:bg-cream";

  return (
    <div ref={menuRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={btnCls}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Plus className="h-2.5 w-2.5" aria-hidden />
        {label}
        <ChevronDown className="h-2.5 w-2.5" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 z-30 min-w-[260px] max-w-[calc(100vw-2rem)] border border-[var(--rule-strong)] bg-white shadow-lg"
        >
          <ul className="py-1">
            {SUPPORTED_MERGE_FIELDS.map((f) => (
              <li key={f.token}>
                <button
                  type="button"
                  onClick={() => insert(f.token)}
                  className="w-full text-left px-3 py-2 hover:bg-cream"
                  role="menuitem"
                >
                  <div className="text-[12px] font-bold text-ink">
                    {f.label}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <code className="text-[10px] bg-cream px-1.5 py-0.5 rounded text-heritage-deep">
                      {f.token}
                    </code>
                    <span className="text-[10px] text-slate-meta">
                      e.g. {f.example}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
