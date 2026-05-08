"use client";

/**
 * HmRescopeButton — admin-only modal to re-assign which locations a
 * hiring manager can see (Phase 4.5.b).
 *
 * The `assignHmLocations` server action already exists; this just wires
 * up the UI that lets an owner/admin actually call it. The dialog mirrors
 * the invite-form's location multi-select pattern: checkboxes with name +
 * city/state subline, "select all" / "clear" helpers, and a
 * "no locations" warning that the HM will see nothing.
 *
 * State management is purely local — the modal opens, the user toggles
 * checkboxes, hits Save, the form submits via the existing server action,
 * which calls revalidatePath("/employer/team") so the next render shows
 * the updated badges.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Pencil, X, Check, AlertCircle } from "lucide-react";
import { assignHmLocations } from "./actions";
import type { LocationRow } from "./page";
import { HmScopePreviewBlock } from "./hm-scope-preview-block";

interface HmRescopeButtonProps {
  dsoUserId: string;
  hmName: string;
  initialLocationIds: string[];
  locations: LocationRow[];
}

export function HmRescopeButton({
  dsoUserId,
  hmName,
  initialLocationIds,
  locations,
}: HmRescopeButtonProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialLocationIds)
  );
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Reset selection whenever the modal re-opens (so a Cancel + reopen
  // doesn't carry forward stale toggles).
  useEffect(() => {
    if (open) setSelected(new Set(initialLocationIds));
  }, [open, initialLocationIds]);

  // Body scroll lock + Esc handler
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(locations.map((l) => l.id)));
  const clearAll = () => setSelected(new Set());

  // Stable array form fed into the preview block — useMemo so the
  // child's effect dep array doesn't churn on every parent re-render
  // when the underlying Set is structurally unchanged.
  const selectedIdsArray = useMemo(() => Array.from(selected), [selected]);

  const onSave = () => {
    const fd = new FormData();
    fd.set("dso_user_id", dsoUserId);
    for (const id of selected) fd.append("location_ids", id);
    startTransition(async () => {
      await assignHmLocations(fd);
      setOpen(false);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:bg-cream transition-colors"
        aria-label={`Edit locations for ${hmName}`}
      >
        <Pencil className="h-3 w-3" />
        Edit locations
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hm-rescope-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            className="bg-ivory border border-[var(--rule-strong)] w-full max-w-[560px] max-h-[85vh] overflow-y-auto"
          >
            <header className="sticky top-0 bg-ivory border-b border-[var(--rule)] px-6 py-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1">
                  Hiring Manager Scope
                </div>
                <h2
                  id="hm-rescope-title"
                  className="text-lg font-extrabold tracking-[-0.3px] text-ink"
                >
                  {hmName}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 text-slate-meta hover:text-ink hover:bg-cream transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="px-6 py-5">
              <p className="text-[14px] text-slate-body leading-relaxed mb-5">
                {hmName} can review applications at the practice locations
                checked below. Owners, admins, and recruiters always see
                every job — this only changes what {hmName.split(" ")[0]} sees.
              </p>

              {selected.size === 0 && (
                <div className="mb-4 flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 text-[13px] text-red-900">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  <span>
                    No locations selected — {hmName.split(" ")[0]} won&apos;t
                    see any jobs except corporate-scoped ones.
                  </span>
                </div>
              )}

              <div className="mb-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink transition-colors"
                >
                  Select all
                </button>
                <span className="text-slate-meta">·</span>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-body hover:text-red-700 transition-colors"
                >
                  Clear
                </button>
              </div>

              <div className="grid grid-cols-1 gap-px bg-[var(--rule)] border border-[var(--rule)]">
                {locations.length === 0 ? (
                  <div className="bg-white p-5 text-[14px] text-slate-meta italic text-center">
                    No locations yet. Add some in the Locations section.
                  </div>
                ) : (
                  locations.map((loc) => {
                    const checked = selected.has(loc.id);
                    return (
                      <label
                        key={loc.id}
                        className={`flex items-start gap-3 p-3 cursor-pointer transition-colors ${
                          checked ? "bg-cream" : "bg-white hover:bg-cream/60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-heritage flex-shrink-0"
                          checked={checked}
                          onChange={() => toggle(loc.id)}
                        />
                        <div className="min-w-0">
                          <div className="text-[14px] font-semibold text-ink">
                            {loc.name}
                          </div>
                          <div className="text-[12px] text-slate-meta">
                            {[loc.city, loc.state].filter(Boolean).join(", ") ||
                              "Address not set"}
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>

              <HmScopePreviewBlock
                selectedLocationIds={selectedIdsArray}
                variant="modal"
              />
            </div>

            <footer className="sticky bottom-0 bg-ivory border-t border-[var(--rule)] px-6 py-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-ink hover:bg-cream transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={pending}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-ink text-ivory text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-50"
              >
                {pending ? (
                  "Saving…"
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Save scope
                  </>
                )}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
